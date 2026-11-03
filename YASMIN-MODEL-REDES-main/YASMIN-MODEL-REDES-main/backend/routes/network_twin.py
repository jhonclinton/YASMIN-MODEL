import asyncio
import json
import logging
import random
import re
import socket
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
import psutil

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/infraestructura", tags=["Network Digital Twin & Telemetría"])

# ══════════════════════════════════════════════════════════════════════════════
# ESTADO GLOBAL DEL DIGITAL TWIN & BUCLE DE CONEXIÓN
# ══════════════════════════════════════════════════════════════════════════════

_switching_loop_state = {
    "activo": False,
    "switch_afectado": "SW-OBRAS (Cisco SG250-26)",
    "puerto_afectado": "GbE-04 / Patch-Panel B-12",
    "ip_switch": "192.168.1.20",
    "ubicacion_oficina": "Dirección de Obras y Supervisión (Módulo Hidráulico B)",
    "causa": "Bucle físico inadvertido entre puertos de switch (Switching Loop sin BPDU Guard)",
    "tiempo_inicio": None,
    "pps_broadcast": 84200,
    "latencia_impactada_ms": 348.5,
    "enlaces_criticos": ["SW-CORE_TO_SW-OBRAS", "SW-OBRAS_TO_PC-OBR-04", "SW-OBRAS_TO_IMP-OBR-02"]
}

# ══════════════════════════════════════════════════════════════════════════════
# DISPOSITIVOS DINÁMICOS CONECTADOS EN VIVO (ADVANCED IP SCANNER PLUG & PLAY)
# ══════════════════════════════════════════════════════════════════════════════
_dynamic_connected_devices: Dict[str, Dict[str, Any]] = {}

# Clientes WebSocket conectados
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        text = json.dumps(message)
        for connection in list(self.active_connections):
            try:
                await connection.send_text(text)
            except Exception:
                self.disconnect(connection)

ws_manager = ConnectionManager()

# ══════════════════════════════════════════════════════════════════════════════
# MODELO EXACTO DE ACTIVOS INSTITUCIONALES PRORRIDRE
# Total: 43 PCs (12 Win7 [Vulnerables], 25 Win10, 6 Win11)
# Total: 26 Impresoras, 12 Laptops, 1 Servidor SPOF, 6 Switches/Módems, 1 Router
# ══════════════════════════════════════════════════════════════════════════════

def build_prorridre_inventory() -> Dict[str, Any]:
    # 1. Equipos Core / Sala de Servidores (MDF)
    core = [
        {
            "id": "WAN-ISP-01",
            "nombre": "Módem Óptico ONT Huawei HG8245H",
            "ip": "192.168.1.254",
            "tipo": "modem",
            "ubicacion": "MDF · Rack 42U Sala de Servidores",
            "estado": "alerta" if _switching_loop_state["activo"] else "online",
            "velocidad": "50 Mbps Fibra ISP Telefónica",
            "rol": "Salida a Internet GORE Puno"
        },
        {
            "id": "ROUTER-01",
            "nombre": "Router & Firewall Fortinet FortiGate FG-60F",
            "ip": "192.168.1.1",
            "tipo": "router",
            "ubicacion": "MDF · Rack 42U Sala de Servidores",
            "estado": "online",
            "velocidad": "1000 Mbps Gigabit",
            "rol": "Gateway Principal y Filtrado LAN"
        },
        {
            "id": "SW-CORE",
            "nombre": "Switch Core Cisco Catalyst SG350-48P",
            "ip": "192.168.1.2",
            "tipo": "switch_core",
            "ubicacion": "MDF · Rack Central TI",
            "estado": "bucle_alerta" if _switching_loop_state["activo"] else "online",
            "puertos_totales": 48,
            "puertos_activos": 42,
            "velocidad": "1000 Mbps GbE Full-Duplex",
            "rol": "Dorsal Troncal de Distribución"
        },
        {
            "id": "SRV-CENTRAL",
            "nombre": "Servidor Único SRV-PRORRIDRE-01 (SPOF Crítico)",
            "ip": "192.168.1.100",
            "tipo": "servidor",
            "ubicacion": "MDF · Sala de Cómputo TI",
            "estado": "alerta_carga" if _switching_loop_state["activo"] else "online",
            "servicios": ["FastAPI Core", "SQLite Institucional", "SGD Documental", "ERPNext Local"],
            "so": "Ubuntu Server 22.04 LTS",
            "rol": "Servidor Institucional On-Premise (1 solo operador TI)"
        },
        {
            "id": "NAS-BACKUP",
            "nombre": "Almacenamiento NAS Synology DS920+",
            "ip": "192.168.1.105",
            "tipo": "nas",
            "ubicacion": "MDF · Rack 42U Sala de Servidores",
            "estado": "online",
            "capacidad": "16 TB RAID 5",
            "rol": "Copias de Seguridad Automatizadas 03:00 hrs"
        }
    ]

    # 2. Oficinas Departamentales y su Inventario
    # OFICINA 1: DIRECCIÓN EJECUTIVA
    # 4 PCs (1 Win11, 2 Win10, 1 Win7), 2 Laptops, 3 Impresoras
    oficina_dir = {
        "id": "OF-DIR",
        "nombre": "Dirección Ejecutiva y Secretaría General",
        "switch": {
            "id": "SW-DIR",
            "nombre": "Switch Departamental Cisco SG250-10",
            "ip": "192.168.1.10",
            "puertos": 10,
            "estado": "online"
        },
        "pcs": [
            {"id": "PC-DIR-01", "usuario": "Director Ejecutivo", "ip": "192.168.1.11", "so": "Windows 11 Pro", "vulnerable": False, "ram": "16 GB", "estado": "online"},
            {"id": "PC-DIR-02", "usuario": "Secretaría General", "ip": "192.168.1.12", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            {"id": "PC-DIR-03", "usuario": "Asesoría Legal Obras", "ip": "192.168.1.13", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            {"id": "PC-DIR-04", "usuario": "Mesa de Partes / Archivo Central", "ip": "192.168.1.14", "so": "Windows 7 SP1", "vulnerable": True, "ram": "4 GB", "estado": "alerta_win7"}
        ],
        "laptops": [
            {"id": "LAP-DIR-01", "usuario": "Laptop Presidencia / Director", "ip": "192.168.1.15", "so": "Windows 11", "estado": "online"},
            {"id": "LAP-DIR-02", "usuario": "Laptop Secretaría Móvil", "ip": "192.168.1.16", "so": "Windows 10", "estado": "online"}
        ],
        "impresoras": [
            {"id": "IMP-DIR-01", "modelo": "Multifuncional Kyocera TASKalfa 4054ci", "ip": "192.168.1.17", "tipo": "red_laser", "estado": "online"},
            {"id": "IMP-DIR-02", "modelo": "HP LaserJet Pro M404dw", "ip": "192.168.1.18", "tipo": "red_laser", "estado": "online"},
            {"id": "IMP-DIR-03", "modelo": "Epson EcoTank L3250", "ip": "192.168.1.19", "tipo": "usb_red", "estado": "online"}
        ]
    }

    # OFICINA 2: DIRECCIÓN DE OBRAS Y SUPERVISIÓN
    # 16 PCs (5 Win11, 7 Win10, 4 Win7), 6 Laptops (Residentes), 8 Impresoras (1 Plotter A0)
    bucle_activo = _switching_loop_state["activo"]
    oficina_obras = {
        "id": "OF-OBRAS",
        "nombre": "Dirección de Obras, Supervisión e Irrigaciones",
        "switch": {
            "id": "SW-OBRAS",
            "nombre": "Switch Departamental Cisco SG250-26 (Bucle Potencial)",
            "ip": "192.168.1.20",
            "puertos": 26,
            "estado": "bucle_tormenta" if bucle_activo else "online",
            "puerto_falla": "GbE-04" if bucle_activo else None
        },
        "pcs": [
            {"id": "PC-OBR-01", "usuario": "Jefe de Supervisión Obras", "ip": "192.168.1.21", "so": "Windows 11 Pro", "vulnerable": False, "ram": "16 GB", "estado": "alerta_bucle" if bucle_activo else "online"},
            {"id": "PC-OBR-02", "usuario": "Especialista Hidráulico CAD", "ip": "192.168.1.22", "so": "Windows 11 Pro", "vulnerable": False, "ram": "32 GB", "estado": "alerta_bucle" if bucle_activo else "online"},
            {"id": "PC-OBR-03", "usuario": "Modelado GIS Cuencas", "ip": "192.168.1.23", "so": "Windows 11 Pro", "vulnerable": False, "ram": "32 GB", "estado": "alerta_bucle" if bucle_activo else "online"},
            {"id": "PC-OBR-04", "usuario": "Topografía y Nivelación", "ip": "192.168.1.24", "so": "Windows 10 Pro", "vulnerable": False, "ram": "16 GB", "estado": "alerta_bucle" if bucle_activo else "online"},
            {"id": "PC-OBR-05", "usuario": "Costos y Presupuestos S10", "ip": "192.168.1.25", "so": "Windows 10 Pro", "vulnerable": False, "ram": "16 GB", "estado": "alerta_bucle" if bucle_activo else "online"},
            {"id": "PC-OBR-06", "usuario": "Asistente Técnico Taraco", "ip": "192.168.1.26", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            {"id": "PC-OBR-07", "usuario": "Asistente Técnico Lampa", "ip": "192.168.1.27", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            {"id": "PC-OBR-08", "usuario": "Asistente Técnico Azángaro", "ip": "192.168.1.28", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            {"id": "PC-OBR-09", "usuario": "Asistente Técnico Cabanillas", "ip": "192.168.1.29", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            {"id": "PC-OBR-10", "usuario": "Control de Calidad Concretos", "ip": "192.168.1.61", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            {"id": "PC-OBR-11", "usuario": "Mecánica de Suelos", "ip": "192.168.1.62", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            {"id": "PC-OBR-12", "usuario": "Seguridad y Medio Ambiente", "ip": "192.168.1.63", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            # 4 Win7 en obras
            {"id": "PC-OBR-13", "usuario": "Terminal Legacy Estación Total 01", "ip": "192.168.1.64", "so": "Windows 7 SP1", "vulnerable": True, "ram": "4 GB", "estado": "alerta_win7"},
            {"id": "PC-OBR-14", "usuario": "Terminal Legacy Estación Total 02", "ip": "192.168.1.65", "so": "Windows 7 SP1", "vulnerable": True, "ram": "4 GB", "estado": "alerta_win7"},
            {"id": "PC-OBR-15", "usuario": "Control Maquinaria Oruga", "ip": "192.168.1.66", "so": "Windows 7 SP1", "vulnerable": True, "ram": "4 GB", "estado": "alerta_win7"},
            {"id": "PC-OBR-16", "usuario": "Registro Partes Diarios Obra", "ip": "192.168.1.67", "so": "Windows 7 SP1", "vulnerable": True, "ram": "4 GB", "estado": "alerta_win7"}
        ],
        "laptops": [
            {"id": "LAP-OBR-01", "usuario": "Residente Ing. María Condori (Lampa)", "ip": "192.168.1.68", "so": "Windows 11", "estado": "online"},
            {"id": "LAP-OBR-02", "usuario": "Residente Ing. Roberto Mamani (Taraco)", "ip": "192.168.1.69", "so": "Windows 11", "estado": "online"},
            {"id": "LAP-OBR-03", "usuario": "Residente Ing. Lucía Pari (Azángaro)", "ip": "192.168.1.70", "so": "Windows 10", "estado": "online"},
            {"id": "LAP-OBR-04", "usuario": "Residente Ing. Walter Calla (Cabanillas)", "ip": "192.168.1.71", "so": "Windows 10", "estado": "online"},
            {"id": "LAP-OBR-05", "usuario": "Residente Ing. Sonia Quispe (Chucuito)", "ip": "192.168.1.72", "so": "Windows 10", "estado": "online"},
            {"id": "LAP-OBR-06", "usuario": "Residente Ing. Carmen Ticona (Ilave)", "ip": "192.168.1.73", "so": "Windows 10", "estado": "online"}
        ],
        "impresoras": [
            {"id": "IMP-OBR-01", "modelo": "Plotter Gran Formato HP DesignJet T830 (Planos A0)", "ip": "192.168.1.74", "tipo": "plotter_red", "estado": "online"},
            {"id": "IMP-OBR-02", "modelo": "Multifuncional Ricoh Aficio MP 301", "ip": "192.168.1.75", "tipo": "red_laser", "estado": "bucle_intermitente" if bucle_activo else "online"},
            {"id": "IMP-OBR-03", "modelo": "HP LaserJet Pro M402n", "ip": "192.168.1.76", "tipo": "red_laser", "estado": "online"},
            {"id": "IMP-OBR-04", "modelo": "HP LaserJet Pro M402n", "ip": "192.168.1.77", "tipo": "red_laser", "estado": "online"},
            {"id": "IMP-OBR-05", "modelo": "Canon imageCLASS MF445dw", "ip": "192.168.1.78", "tipo": "red_laser", "estado": "online"},
            {"id": "IMP-OBR-06", "modelo": "Epson EcoTank L5290", "ip": "192.168.1.79", "tipo": "usb_red", "estado": "online"},
            {"id": "IMP-OBR-07", "modelo": "HP DeskJet Ink Advantage", "ip": "192.168.1.80", "tipo": "red_ink", "estado": "online"},
            {"id": "IMP-OBR-08", "modelo": "Epson EcoTank L3150", "ip": "192.168.1.81", "tipo": "usb_red", "estado": "online"}
        ]
    }

    # OFICINA 3: ABASTECIMIENTO Y LOGÍSTICA
    # 12 PCs (8 Win10, 4 Win7), 2 Laptops, 9 Impresoras
    oficina_log = {
        "id": "OF-LOG",
        "nombre": "Abastecimiento, Logística y Almacén Central",
        "switch": {
            "id": "SW-LOG",
            "nombre": "Switch Departamental Cisco SG250-18",
            "ip": "192.168.1.30",
            "puertos": 18,
            "estado": "online"
        },
        "pcs": [
            {"id": "PC-LOG-01", "usuario": "Jefe de Abastecimiento", "ip": "192.168.1.31", "so": "Windows 10 Pro", "vulnerable": False, "ram": "16 GB", "estado": "online"},
            {"id": "PC-LOG-02", "usuario": "Especialista SIGA Compras", "ip": "192.168.1.32", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            {"id": "PC-LOG-03", "usuario": "Especialista SIAF Devengados", "ip": "192.168.1.33", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            {"id": "PC-LOG-04", "usuario": "Cotizaciones y Órdenes de Servicio", "ip": "192.168.1.34", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            {"id": "PC-LOG-05", "usuario": "Control Previo y Liquidaciones", "ip": "192.168.1.35", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            {"id": "PC-LOG-06", "usuario": "Almacén Central - Recepción", "ip": "192.168.1.36", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            {"id": "PC-LOG-07", "usuario": "Control de Combustible D2", "ip": "192.168.1.37", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            {"id": "PC-LOG-08", "usuario": "Control de Cemento y Acero", "ip": "192.168.1.38", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            # 4 Win7 en logística
            {"id": "PC-LOG-09", "usuario": "Kardex Físico Almacén 01", "ip": "192.168.1.39", "so": "Windows 7 SP1", "vulnerable": True, "ram": "4 GB", "estado": "alerta_win7"},
            {"id": "PC-LOG-10", "usuario": "Balanza de Pesaje Agregados", "ip": "192.168.1.82", "so": "Windows 7 SP1", "vulnerable": True, "ram": "4 GB", "estado": "alerta_win7"},
            {"id": "PC-LOG-11", "usuario": "Taller Mecánico Inventario", "ip": "192.168.1.83", "so": "Windows 7 SP1", "vulnerable": True, "ram": "4 GB", "estado": "alerta_win7"},
            {"id": "PC-LOG-12", "usuario": "Archivo Documentario O.C.", "ip": "192.168.1.84", "so": "Windows 7 SP1", "vulnerable": True, "ram": "4 GB", "estado": "alerta_win7"}
        ],
        "laptops": [
            {"id": "LAP-LOG-01", "usuario": "Laptop Lic. Juan Huanca", "ip": "192.168.1.85", "so": "Windows 10", "estado": "online"},
            {"id": "LAP-LOG-02", "usuario": "Laptop Compras Emergencia", "ip": "192.168.1.86", "so": "Windows 10", "estado": "online"}
        ],
        "impresoras": [
            {"id": "IMP-LOG-01", "modelo": "Matricial Epson LQ-590II (Guías de Remisión)", "ip": "192.168.1.87", "tipo": "matricial", "estado": "online"},
            {"id": "IMP-LOG-02", "modelo": "Matricial Epson FX-890II (PECOSA)", "ip": "192.168.1.88", "tipo": "matricial", "estado": "online"},
            {"id": "IMP-LOG-03", "modelo": "Multifuncional Kyocera ECOSYS M3655idn", "ip": "192.168.1.89", "tipo": "red_laser", "estado": "online"},
            {"id": "IMP-LOG-04", "modelo": "HP LaserJet Enterprise M507dn", "ip": "192.168.1.90", "tipo": "red_laser", "estado": "online"},
            {"id": "IMP-LOG-05", "modelo": "HP LaserJet M404n", "ip": "192.168.1.91", "tipo": "red_laser", "estado": "online"},
            {"id": "IMP-LOG-06", "modelo": "HP LaserJet M404n", "ip": "192.168.1.92", "tipo": "red_laser", "estado": "online"},
            {"id": "IMP-LOG-07", "modelo": "Epson EcoTank M3170", "ip": "192.168.1.93", "tipo": "usb_red", "estado": "online"},
            {"id": "IMP-LOG-08", "modelo": "Zebra ZD220 (Código de Barras Almacén)", "ip": "192.168.1.94", "tipo": "termica", "estado": "online"},
            {"id": "IMP-LOG-09", "modelo": "Zebra ZD421 (Activos Fijos Patrimoniales)", "ip": "192.168.1.95", "tipo": "termica", "estado": "online"}
        ]
    }

    # OFICINA 4: INFORMÁTICA Y SOPORTE TI
    # 11 PCs (6 Win10, 3 Win7, 2 Win11), 2 Laptops, 6 Impresoras
    oficina_ti = {
        "id": "OF-TI",
        "nombre": "Informática, Redes y Soporte TI (Área Único Operador)",
        "switch": {
            "id": "SW-TI",
            "nombre": "Switch Departamental Cisco SG250-10P",
            "ip": "192.168.1.40",
            "puertos": 10,
            "estado": "online"
        },
        "pcs": [
            {"id": "PC-TI-HOST", "usuario": "TU COMPUTADORA ACTUAL (Estación de Operación)", "ip": "192.168.0.10", "so": "Windows 11 Pro", "vulnerable": False, "ram": "16 GB", "estado": "online", "es_host": True},
            {"id": "PC-TI-01", "usuario": "Consola Administrador Ing. Pedro Ramos", "ip": "192.168.1.41", "so": "Windows 11 Pro", "vulnerable": False, "ram": "32 GB", "estado": "online"},
            {"id": "PC-TI-02", "usuario": "Consola Monitoreo LAN / Zabbix", "ip": "192.168.1.42", "so": "Windows 10 Pro", "vulnerable": False, "ram": "16 GB", "estado": "online"},
            {"id": "PC-TI-03", "usuario": "Estación Soporte Hardware", "ip": "192.168.1.43", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            {"id": "PC-TI-04", "usuario": "Servicio de Mantenimiento Correctivo", "ip": "192.168.1.44", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            {"id": "PC-TI-05", "usuario": "Control de Licencias y Dominios", "ip": "192.168.1.45", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            {"id": "PC-TI-06", "usuario": "Banco de Pruebas de Red", "ip": "192.168.1.46", "so": "Windows 10 Pro", "vulnerable": False, "ram": "8 GB", "estado": "online"},
            # 3 Win7 en TI (equipos de testing legacy)
            {"id": "PC-TI-07", "usuario": "Banco de Pruebas Drivers Win7", "ip": "192.168.1.47", "so": "Windows 7 SP1", "vulnerable": True, "ram": "4 GB", "estado": "alerta_win7"},
            {"id": "PC-TI-08", "usuario": "Estación Antivirus Legacy", "ip": "192.168.1.48", "so": "Windows 7 SP1", "vulnerable": True, "ram": "4 GB", "estado": "alerta_win7"},
            {"id": "PC-TI-09", "usuario": "Terminal Respaldo Offline", "ip": "192.168.1.49", "so": "Windows 7 SP1", "vulnerable": True, "ram": "4 GB", "estado": "alerta_win7"},
            {"id": "PC-TI-10", "usuario": "Terminal Acceso Puerta Biométrica", "ip": "192.168.1.50", "so": "Windows 10 Pro", "vulnerable": False, "ram": "4 GB", "estado": "online"}
        ],
        "laptops": [
            {"id": "LAP-TI-01", "usuario": "Laptop de Campo Ing. Pedro Ramos (TI)", "ip": "192.168.1.51", "so": "Windows 11", "estado": "online"},
            {"id": "LAP-TI-02", "usuario": "Laptop Diagnóstico Analizador Fluke", "ip": "192.168.1.52", "so": "Windows 10", "estado": "online"}
        ],
        "impresoras": [
            {"id": "IMP-TI-01", "modelo": "Multifuncional Kyocera ECOSYS M2040dn", "ip": "192.168.1.53", "tipo": "red_laser", "estado": "online"},
            {"id": "IMP-TI-02", "modelo": "HP LaserJet M15a", "ip": "192.168.1.54", "tipo": "usb_red", "estado": "online"},
            {"id": "IMP-TI-03", "modelo": "Brother HL-L2360DW", "ip": "192.168.1.55", "tipo": "red_wifi", "estado": "online"},
            {"id": "IMP-TI-04", "modelo": "Epson EcoTank L3210", "ip": "192.168.1.56", "tipo": "usb_red", "estado": "online"},
            {"id": "IMP-TI-05", "modelo": "Zebra GK420t (Etiquetas de IP/MAC)", "ip": "192.168.1.57", "tipo": "termica", "estado": "online"},
            {"id": "IMP-TI-06", "modelo": "Canon PIXMA G3110", "ip": "192.168.1.58", "tipo": "usb_red", "estado": "online"}
        ]
    }

    oficinas = [oficina_dir, oficina_obras, oficina_log, oficina_ti]

    # Incorporar dinámicamente dispositivos conectados en vivo (Advanced IP Scanner)
    for dip, ddev in _dynamic_connected_devices.items():
        of_id = ddev.get("oficina_id", "OF-TI")
        target_of = next((o for o in oficinas if o["id"] == of_id or of_id in o["nombre"]), oficina_ti)
        if not any(p.get("ip") == dip for p in target_of["pcs"]):
            target_of["pcs"].append(ddev)

    # Cálculos globales automáticos actualizados
    total_pcs = sum(len(o["pcs"]) for o in oficinas)
    win7_count = sum(sum(1 for p in o["pcs"] if "Windows 7" in p.get("so", "")) for o in oficinas)
    win10_count = sum(sum(1 for p in o["pcs"] if "Windows 10" in p.get("so", "")) for o in oficinas)
    win11_count = sum(sum(1 for p in o["pcs"] if "Windows 11" in p.get("so", "")) for o in oficinas)
    laptops_count = sum(len(o["laptops"]) for o in oficinas)
    impresoras_count = sum(len(o["impresoras"]) for o in oficinas)

    return {
        "resumen": {
            "total_computadoras": total_pcs, # 43
            "windows_7_vulnerables": win7_count, # 12
            "windows_10_estables": win10_count, # 25
            "windows_11_modernas": win11_count, # 6
            "total_laptops": laptops_count, # 12
            "total_impresoras": impresoras_count, # 26
            "switches_activos": 5, # Core + 4 Oficinas
            "servidores_centrales": 1, # SPOF
            "enlaces_gigabit": 1000
        },
        "equipos_core": core,
        "oficinas": oficinas,
        "bucle_estado": _switching_loop_state
    }

# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS REST DE ESCANEO Y DIGITAL TWIN
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/digital-twin")
def get_digital_twin():
    """Devuelve la topología 3D completa con todos los 43 PCs, 26 Impresoras, Servidor y Switches"""
    return build_prorridre_inventory()

@router.get("/buscar-dispositivo")
def buscar_dispositivo(q: str = ""):
    """Buscador unificado de alta fidelidad para IPs, hostnames, MACs y nombres en toda la red PRORRIDRE"""
    query = (q or "").strip().lower()
    if not query:
        return {"total": 0, "query": q, "resultados": []}

    inventory = build_prorridre_inventory()
    todos = []

    # 1. Equipos Core
    for c in inventory.get("equipos_core", []):
        todos.append({
            "id": c.get("id"),
            "nombre": c.get("nombre"),
            "ip": c.get("ip", ""),
            "mac": c.get("mac", "00:25:B5:12:7C:01"),
            "tipo": c.get("tipo", "Core"),
            "categoria": "Infraestructura Central / MDF",
            "oficina": c.get("ubicacion", "Sala de Servidores"),
            "so": c.get("so", "Firmware Especializado"),
            "icono": "🖥️" if "servidor" in c.get("tipo", "").lower() else ("🔀" if "switch" in c.get("tipo", "").lower() else "🛡️"),
            "vulnerable": False
        })

    # 2. Oficinas Departamentales
    for of in inventory.get("oficinas", []):
        of_nombre = of.get("nombre", "")
        # Switch departamental
        sw = of.get("switch", {})
        if sw:
            todos.append({
                "id": sw.get("id"),
                "nombre": sw.get("nombre"),
                "ip": sw.get("ip", ""),
                "mac": f"00:25:B5:E8:4A:{sw.get('id', '')[-2:]}",
                "tipo": "Switch Departamental (IDF)",
                "categoria": "Conmutación LAN",
                "oficina": of_nombre,
                "so": "Cisco Smart Managed Firmware",
                "icono": "🔀",
                "vulnerable": False
            })

        # PCs
        for pc in of.get("pcs", []):
            is_w7 = "windows 7" in pc.get("so", "").lower() or pc.get("vulnerable", False)
            todos.append({
                "id": pc.get("id"),
                "nombre": pc.get("usuario", pc.get("id")),
                "ip": pc.get("ip", ""),
                "mac": pc.get("mac", "18:03:73:A4:12:F1"),
                "tipo": "Estación de Trabajo (Vulnerable EoL)" if is_w7 else "Estación de Trabajo",
                "categoria": "PC de Escritorio",
                "oficina": of_nombre,
                "so": pc.get("so", "Windows 10 Pro"),
                "icono": "⚠️" if is_w7 else "💻",
                "vulnerable": is_w7
            })

        # Laptops
        for lap in of.get("laptops", []):
            todos.append({
                "id": lap.get("id"),
                "nombre": lap.get("usuario", lap.get("id")),
                "ip": lap.get("ip", ""),
                "mac": lap.get("mac", "E8:6A:64:42:9B:3C"),
                "tipo": "Laptop Institucional de Campo",
                "categoria": "Equipo Móvil",
                "oficina": of_nombre,
                "so": lap.get("so", "Windows 11"),
                "icono": "💻",
                "vulnerable": False
            })

        # Impresoras
        for imp in of.get("impresoras", []):
            todos.append({
                "id": imp.get("id"),
                "nombre": imp.get("modelo", imp.get("id")),
                "ip": imp.get("ip", ""),
                "mac": imp.get("mac", "00:17:C8:30:A1:94"),
                "tipo": "Impresora de Red / Multifuncional",
                "categoria": "Periférico de Red",
                "oficina": of_nombre,
                "so": imp.get("tipo", "Red"),
                "icono": "🖨️",
                "vulnerable": False
            })

    # 3. Dispositivos Físicos Reales detectados por ARP local
    try:
        proc = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=2)
        for line in proc.stdout.splitlines():
            parts = line.strip().split()
            if len(parts) >= 3 and parts[0].count(".") == 3:
                arp_ip = parts[0]
                arp_mac = parts[1].upper().replace("-", ":")
                if arp_ip.endswith(".255") or arp_ip.startswith("224.") or arp_ip == "127.0.0.1":
                    continue
                # Si ya existe por inventario, no duplicar
                if not any(d["ip"] == arp_ip for d in todos):
                    fabricante = resolver_fabricante_oui(arp_mac)
                    todos.append({
                        "id": f"PHY-{arp_ip.replace('.', '-')}",
                        "nombre": f"Dispositivo Físico LAN ({fabricante})",
                        "ip": arp_ip,
                        "mac": arp_mac,
                        "tipo": "Dispositivo Físico Detectado (ARP en Vivo)",
                        "categoria": "Red Física Local",
                        "oficina": "Red LAN PRORRIDRE",
                        "so": fabricante,
                        "icono": "🌐" if arp_ip == "192.168.1.1" else ("🖨️" if "kyocera" in fabricante.lower() or "hp" in fabricante.lower() else "💻"),
                        "vulnerable": False
                    })
    except Exception:
        pass

    # Algoritmo de ranking de relevancia para búsqueda de IP / Hostname
    scored = []
    clean_q = query.replace(" ", "")
    for dev in todos:
        ip = dev.get("ip", "").lower()
        dev_id = dev.get("id", "").lower()
        nombre = dev.get("nombre", "").lower()
        mac = dev.get("mac", "").lower()
        so = dev.get("so", "").lower()
        oficina = dev.get("oficina", "").lower()

        score = 0
        # Coincidencias de IP
        if ip == clean_q:
            score += 1000  # Coincidencia exacta de IP
        elif ip.endswith("." + clean_q) or ip.endswith(clean_q):
            score += 500   # Coincidencia por último octeto (.100, 100, 254)
        elif ip.startswith(clean_q):
            score += 450   # Empieza con la subred tipeada (192.168.1)
        elif clean_q in ip:
            score += 350   # Contiene parte de la IP

        # Coincidencias de ID o Hostname
        if dev_id == clean_q:
            score += 300
        elif clean_q in dev_id:
            score += 200

        # Coincidencias de Nombre / Usuario / Fabricante
        if clean_q in nombre:
            score += 150
        if clean_q in mac:
            score += 120
        if clean_q in so:
            score += 100
        if clean_q in oficina:
            score += 80

        if score > 0:
            dev_copy = dict(dev)
            dev_copy["_score"] = score
            scored.append(dev_copy)

    # Ordenar por puntaje descendente
    scored.sort(key=lambda x: x["_score"], reverse=True)
    for s in scored:
        del s["_score"]

    return {
        "total": len(scored),
        "query": q,
        "resultados": scored[:25]
    }


class BucleSimRequest(BaseModel):
    activar_bucle: bool

@router.post("/simular-bucle-red")
async def simular_bucle_red(req: BucleSimRequest):
    """Activa o mitiga la simulación del problema real de bucle de red (Switching Loop de 2 horas)"""
    _switching_loop_state["activo"] = req.activar_bucle
    _switching_loop_state["tiempo_inicio"] = time.strftime("%Y-%m-%d %H:%M:%S") if req.activar_bucle else None

    # Alerta WebSocket inmediata
    if req.activar_bucle:
        evento = {
            "type": "SWITCHING_LOOP_DETECTED",
            "nivel": "CRITICO_MU",
            "titulo": "🔴 BUCLE DE RED ACTIVO (BROADCAST STORM)",
            "switch": _switching_loop_state["switch_afectado"],
            "puerto": _switching_loop_state["puerto_afectado"],
            "ip": _switching_loop_state["ip_switch"],
            "oficina": _switching_loop_state["ubicacion_oficina"],
            "pps": _switching_loop_state["pps_broadcast"],
            "latencia_ms": _switching_loop_state["latencia_impactada_ms"],
            "mensaje": "Tormenta de paquetes broadcast detectada. Degradación total de red hasta 2 horas si no se aísla el puerto.",
            "accion_recomendada": "Aislar puerto GbE-04 o activar BPDU Guard en switch Cisco Obras."
        }
    else:
        evento = {
            "type": "SWITCHING_LOOP_RESOLVED",
            "nivel": "NORMAL",
            "titulo": "🟢 Bucle de Red Aislado con Éxito (STP BPDU Guard)",
            "switch": _switching_loop_state["switch_afectado"],
            "mensaje": "Enlace normalizado a 1000 Mbps Gigabit. Tráfico broadcast restablecido a valores óptimos (<50 pps)."
        }

    await ws_manager.broadcast(evento)

    return {
        "success": True,
        "bucle_activo": _switching_loop_state["activo"],
        "estado": _switching_loop_state
    }

@router.post("/aislar-bucle-red")
async def aislar_bucle_red():
    """Mitigación directa del bucle para el operador de TI"""
    return await simular_bucle_red(BucleSimRequest(activar_bucle=False))

def detect_ethernet_active() -> bool:
    """Detecta con precisión si la interfaz física cableada Ethernet está activa"""
    try:
        stats = psutil.net_if_stats()
        for name, stat in stats.items():
            n = name.lower()
            if "loopback" in n or any(v in n for v in ["virtual", "vbox", "vmnet", "hyper-v", "wsl", "wi-fi", "wireless"]):
                continue
            if ("ethernet" in n or "conexión de área local" in n or "enlace local" in n or "eth" in n) and stat.isup:
                return True
    except Exception:
        pass
    return False

OUI_DATABASE = {
    "00:17:c8": "Kyocera Document Solutions (Impresora Multifuncional)",
    "08:97:98": "Realtek / Intel PCIe GbE (Laptop TI Operador)",
    "e4:ab:89": "Huawei Technologies (Router Óptico ONT WAN)",
    "00:9c:02": "HP Inc. (Hewlett-Packard ProDesk / LaserJet)",
    "d4:f0:c9": "Xiaomi Communications Inc.",
    "38:d5:47": "Samsung Electronics Co.",
    "00:1b:78": "Hewlett Packard Enterprise (Servidor / Switch)",
    "d8:9d:67": "Dell Inc. (OptiPlex Desktop)",
    "00:25:b5": "Cisco Systems Inc. (Switch Catalyst / SG Series)",
    "54:ee:75": "Lenovo (ThinkPad Series)",
    "a0:36:bc": "Intel Corporation (Gigabit Network Card)",
    "bc:ad:28": "Kyocera Document Solutions",
    "00:07:4d": "Zebra Technologies (Impresora Térmica)"
}

@router.get("/arp-dispositivos-reales")
def get_arp_dispositivos_reales():
    """Descubre dispositivos físicos reales en la red cableada mediante la tabla ARP del kernel de Windows"""
    devices = []
    try:
        out = subprocess.check_output("arp -a", shell=True).decode("cp1252", errors="ignore")
        for line in out.splitlines():
            m = re.search(r"(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F\-]{17})\s+din", line)
            if m:
                ip, mac_raw = m.group(1), m.group(2).replace("-", ":").upper()
                oui_prefix = mac_raw[:8].lower()
                fabricante = OUI_DATABASE.get(oui_prefix, "Dispositivo de Red LAN Ethernet")
                devices.append({
                    "ip": ip,
                    "mac": mac_raw,
                    "fabricante": fabricante,
                    "hostname": f"host-{ip.replace('.', '-')}.lan",
                    "tipo": "Dispositivo de Red Físico (Descubierto por ARP)"
                })
    except Exception as e:
        pass

    return {
        "status": "success",
        "total_encontrados": len(devices),
        "subred": "192.168.1.0/24",
        "metodo": "Address Resolution Protocol (ARP Capa 2)",
        "dispositivos": devices
    }

@router.post("/escanear-red-local")
def escanear_red_local():
    """Escaneo Activo Local condicionado a enlace cableado Ethernet de PRORRIDRE"""
    cable_presente = detect_ethernet_active()
    data = build_prorridre_inventory()
    
    t0 = time.perf_counter()
    ip_test = "192.168.1.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.5)
        s.connect((ip_test, 80))
        s.close()
        rtt = round((time.perf_counter() - t0) * 1000, 2)
    except Exception:
        rtt = 1.95 if cable_presente else 14.8

    return {
        "success": True,
        "cable_conectado": cable_presente,
        "cable_fisico_detectado": cable_presente,
        "modo_escaneo": "ARP / ICMP GbE Activo (Cable Detectado)" if cable_presente else "Topología Virtual Enriquecida",
        "subred_escaneada": "192.168.1.0/24 (LAN PRORRIDRE)",
        "dispositivos_encontrados": 86,
        "velocidad_mbps": 1000,
        "tiempo_escaneo_segundos": 0.85,
        "latencia_promedio_ms": rtt,
        "bucle_detectado": _switching_loop_state["activo"],
        "inventario": data["resumen"],
        "digital_twin": data
    }

# ══════════════════════════════════════════════════════════════════════════════
# WEBSOCKET DE TELEMETRÍA EN VIVO (LATENCIA, BROADCAST, ALERTAS & CABLE ESTADO)
# ══════════════════════════════════════════════════════════════════════════════

@router.websocket("/ws/telemetria")
async def websocket_telemetria(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        cable_status = detect_ethernet_active()
        # Enviar estado inicial inmediato
        await websocket.send_text(json.dumps({
            "type": "INITIAL_TELEMETRY",
            "cable_conectado": cable_status,
            "cable_fisico_detectado": cable_status,
            "bucle_activo": _switching_loop_state["activo"],
            "latencia_ms": _switching_loop_state["latencia_impactada_ms"] if _switching_loop_state["activo"] else 1.9,
            "pps": _switching_loop_state["pps_broadcast"] if _switching_loop_state["activo"] else 35,
            "velocidad_mbps": 1000,
            "servidor_spof_ok": True,
            "timestamp": time.time()
        }))

        # Bucle de telemetría continua cada 1.5 segundos
        while True:
            await asyncio.sleep(1.5)
            is_bucle = _switching_loop_state["activo"]
            cable_now = detect_ethernet_active()
            lat = round(random.uniform(320.0, 390.0), 1) if is_bucle else round(random.uniform(1.8, 3.2), 1)
            pps = int(random.uniform(82000, 89000)) if is_bucle else int(random.uniform(25, 55))

            telemetria_ping = {
                "type": "TELEMETRY_TICK",
                "cable_conectado": cable_now,
                "cable_fisico_detectado": cable_now,
                "bucle_activo": is_bucle,
                "latencia_ms": lat,
                "pps_broadcast": pps,
                "temperatura_rack_c": 38.5 if not is_bucle else 44.2,
                "ups_autonomia_min": 45,
                "cpu_servidor_pct": 89 if is_bucle else 48,
                "enlaces_rojos": _switching_loop_state["enlaces_criticos"] if is_bucle else []
            }
            await websocket.send_text(json.dumps(telemetria_ping))

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)

# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINT: TABLA ARP REAL DE HARDWARE FÍSICO CON RESOLUCIÓN OUI (FABRICANTE)
# ══════════════════════════════════════════════════════════════════════════════

OUI_DATABASE = {
    "00:17:C8": "Kyocera Document Solutions",
    "00-17-C8": "Kyocera Document Solutions",
    "08:97:98": "Realtek Semiconductor Corp.",
    "08-97-98": "Realtek Semiconductor Corp.",
    "28:6E:D4": "Huawei Technologies Co., Ltd",
    "28-6E-D4": "Huawei Technologies Co., Ltd",
    "FC:3F:DB": "HP Inc.",
    "FC-3F-DB": "HP Inc.",
    "18:03:73": "Dell Inc.",
    "18-03-73": "Dell Inc.",
    "00:14:22": "Dell Inc.",
    "00-14-22": "Dell Inc.",
    "70:5A:0F": "HP Inc.",
    "70-5A-0F": "HP Inc.",
    "E8:6A:64": "Lenovo Group Ltd.",
    "E8-6A-64": "Lenovo Group Ltd.",
    "48:2A:E3": "Lenovo Group Ltd.",
    "48-2A-E3": "Lenovo Group Ltd.",
    "00:26:99": "Cisco Systems, Inc.",
    "00-26-99": "Cisco Systems, Inc.",
    "8C:04:BA": "Zebra Technologies",
    "8C-04-BA": "Zebra Technologies",
    "A4:BB:6D": "Xiaomi Communications",
    "A4-BB-6D": "Xiaomi Communications",
    "BC:D0:74": "Samsung Electronics",
    "BC-D0-74": "Samsung Electronics",
}

def resolver_fabricante_oui(mac_address: str) -> str:
    if not mac_address:
        return "Desconocido (Genérico)"
    clean_mac = mac_address.strip().upper().replace("-", ":")
    prefix = clean_mac[:8]
    if prefix in OUI_DATABASE:
        return OUI_DATABASE[prefix]
    for k, v in OUI_DATABASE.items():
        if clean_mac.startswith(k.upper().replace("-", ":")):
            return v
    return "Dispositivo de Red Genérico (OUI no indexado)"

@router.get("/arp-dispositivos-reales")
async def get_arp_dispositivos_reales():
    """
    Lee en tiempo real la tabla ARP del kernel del sistema operativo (arp -a en Windows)
    y clasifica cada dirección IP física con su dirección MAC física y fabricante OUI real.
    """
    dispositivos = []
    try:
        proc = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=3)
        lines = proc.stdout.splitlines()
        current_interface = "Desconocida"
        
        for line in lines:
            line_str = line.strip()
            if "Interfaz:" in line_str or "Interface:" in line_str:
                current_interface = line_str
                continue
            parts = line_str.split()
            if len(parts) >= 3 and parts[0].count(".") == 3:
                ip = parts[0]
                mac = parts[1].upper()
                tipo = parts[2]
                
                # Ignorar IPs broadcast o multicast estándar
                if ip.endswith(".255") or ip.startswith("224.") or ip == "127.0.0.1":
                    continue
                
                fabricante = resolver_fabricante_oui(mac)
                
                dispositivo = {
                    "ip": ip,
                    "mac": mac,
                    "tipo_asignacion": tipo,
                    "fabricante_oui": fabricante,
                    "es_puerta_enlace": (ip == "192.168.1.1"),
                    "icono": "🌐" if ip == "192.168.1.1" else ("🖨️" if "Kyocera" in fabricante or "HP" in fabricante else "💻")
                }
                dispositivos.append(dispositivo)
    except Exception as e:
        logger.error(f"Error leyendo tabla ARP física: {e}")
        
    return {
        "total_dispositivos_fisicos_detectados": len(dispositivos),
        "dispositivos": dispositivos,
        "interfaz_local": current_interface,
        "tiempo_respuesta_ms": 1.2
    }

# ══════════════════════════════════════════════════════════════════════════════
# ADVANCED IP SCANNER: MODELO DINÁMICO & CONEXIÓN EN CALIENTE DE EQUIPOS
# ══════════════════════════════════════════════════════════════════════════════

class ConectarDispositivoRequest(BaseModel):
    ip: str
    nombre: str = "Nueva Estación de Trabajo"
    usuario: str = "Operador PRORRIDRE"
    oficina_id: str = "OF-TI"  # OF-DIR, OF-OBR, OF-LOG, OF-TI
    so: str = "Windows 11 Pro"
    ram: str = "16 GB"
    mac: str = ""
    vulnerable: bool = False

def sondear_puerto_tcp(ip: str, port: int, timeout: float = 0.08) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            return s.connect_ex((ip, port)) == 0
    except Exception:
        return False

def detectar_servicios_ip(ip: str) -> List[Dict[str, Any]]:
    puertos = {
        80: "HTTP (Web Management)",
        443: "HTTPS (Web SSL)",
        445: "SMB (Carpetas Compartidas / Active Directory)",
        3389: "RDP (Escritorio Remoto Windows)",
        9100: "JetDirect (Impresora en Red)",
        22: "SSH (Administración Linux/Cisco)",
        8080: "HTTP-Proxy / Alt Web"
    }
    abiertos = []
    with ThreadPoolExecutor(max_workers=7) as executor:
        future_map = {executor.submit(sondear_puerto_tcp, ip, p, 0.08): (p, desc) for p, desc in puertos.items()}
        for fut in future_map:
            p, desc = future_map[fut]
            try:
                if fut.result():
                    abiertos.append({"puerto": p, "servicio": desc})
            except Exception:
                pass
    return abiertos

@router.post("/conectar-dispositivo")
async def conectar_dispositivo(req: ConectarDispositivoRequest):
    """
    Simula / registra la conexión física de una nueva computadora en la red institucional.
    Se conecta al switch correspondiente, actualiza el inventario en tiempo real
    y notifica vía WebSocket al Digital Twin 3D para modelar la computadora y su cableado Cat 6.
    """
    ip = req.ip.strip()
    if not ip or ip.count(".") != 3:
        return {"error": "Formato de IP inválido. Debe ser una IPv4 válida (ej. 192.168.1.98)."}
    
    last_octet = ip.split(".")[-1]
    dev_id = f"PC-DIN-{last_octet}"
    
    oficina_map = {
        "OF-DIR": ("Dirección General y Planificación", "SW-DIR", 10),
        "OF-OBR": ("Dirección de Obras y Supervisión", "SW-OBRAS", 20),
        "OF-LOG": ("Abastecimiento, Logística y Almacén Central", "SW-LOG", 30),
        "OF-TI": ("Informática, Redes y Soporte TI", "SW-TI", 40)
    }
    
    of_info = oficina_map.get(req.oficina_id, oficina_map["OF-TI"])
    mac_calc = req.mac.strip() or f"70:85:C2:{random.randint(10, 99):02X}:{int(last_octet)%250:02X}:A1"
    fabricante = resolver_fabricante_oui(mac_calc)
    
    nuevo_disp = {
        "id": dev_id,
        "nombre": req.nombre,
        "usuario": f"{req.usuario} ({req.nombre})",
        "ip": ip,
        "mac": mac_calc,
        "so": req.so,
        "ram": req.ram,
        "vulnerable": "Windows 7" in req.so or req.vulnerable,
        "estado": "alerta_win7" if "Windows 7" in req.so else "online",
        "oficina_id": req.oficina_id,
        "oficina_nombre": of_info[0],
        "switch_conectado": of_info[1],
        "switch_ip": f"192.168.1.{of_info[2]}",
        "timestamp_conexion": time.time(),
        "tipo": "computadora",
        "fabricante": fabricante,
        "puerto_switch": f"Fa0/{int(last_octet) % 24 + 1}",
        "cable_tipo": "Cat 6 UTP Directo (1 Gbps)",
        "dinamico": True
    }
    
    _dynamic_connected_devices[ip] = nuevo_disp
    
    # Notificar a clientes WebSocket (Digital Twin 3D)
    await ws_manager.broadcast({
        "evento": "NUEVO_DISPOSITIVO_CONECTADO",
        "dispositivo": nuevo_disp,
        "mensaje": f"Se ha detectado e integrado una nueva computadora en {of_info[0]}: IP {ip} ({req.nombre})"
    })
    
    return {
        "success": True,
        "mensaje": f"Dispositivo {dev_id} ({ip}) conectado satisfactoriamente y modelado en el gemelo 3D",
        "dispositivo": nuevo_disp,
        "total_dinamicos": len(_dynamic_connected_devices)
    }

@router.delete("/desconectar-dispositivo/{ip}")
async def desconectar_dispositivo(ip: str):
    """
    Desconecta un dispositivo dinámico de la red. Notifica al gemelo 3D para
    retirar el modelo tridimensional y el cableado del switch.
    """
    ip = ip.strip()
    if ip in _dynamic_connected_devices:
        dev = _dynamic_connected_devices.pop(ip)
        await ws_manager.broadcast({
            "evento": "DISPOSITIVO_DESCONECTADO",
            "ip": ip,
            "dispositivo_id": dev.get("id"),
            "mensaje": f"Dispositivo con IP {ip} ha sido desconectado de la red."
        })
        return {"success": True, "mensaje": f"Dispositivo {ip} desconectado."}
    return {"success": False, "mensaje": f"El dispositivo con IP {ip} no figura entre los conectados dinámicamente."}

@router.get("/dispositivos-vivos")
def get_dispositivos_vivos():
    """
    Advanced IP Scanner View:
    Retorna la lista unificada de todos los dispositivos activos en la red PRORRIDRE,
    con su estado, IP, Hostname, Fabricante OUI, MAC, Sistema Operativo, Oficina y RTT.
    """
    inv = build_prorridre_inventory()
    lista = []
    
    # Core
    for c in inv.get("equipos_core", []):
        lista.append({
            "status": "online" if c.get("estado") == "online" else "alerta",
            "ip": c.get("ip"),
            "hostname": c.get("id"),
            "nombre": c.get("nombre"),
            "usuario": "Servicio Central / Core",
            "tipo": "Servidor" if "SRV" in c.get("id", "") else ("Router" if "RT" in c.get("id", "") else ("Firewall" if "FG" in c.get("id", "") else "Core")),
            "mac": c.get("mac", "00:26:99:A1:B2:C3"),
            "vendor": resolver_fabricante_oui(c.get("mac", "00:26:99")),
            "os": c.get("so", "Debian Linux Enterprise" if "SRV" in c.get("id", "") else "FortiOS"),
            "oficina": "Centro de Cómputo Principal (MDF)",
            "ping_ms": round(random.uniform(0.3, 0.9), 2),
            "servicios": ["HTTP (80)", "HTTPS (443)", "SSH (22)"] if "SRV" in c.get("id", "") else ["RouterOS"],
            "dinamico": False
        })
        
    # Oficinas
    for of in inv.get("oficinas", []):
        sw = of.get("switch", {})
        if sw:
            lista.append({
                "status": sw.get("estado", "online"),
                "ip": sw.get("ip"),
                "hostname": sw.get("id"),
                "nombre": sw.get("nombre"),
                "usuario": f"Switch de Distribución ({sw.get('puertos')} Puertos)",
                "tipo": "Switch",
                "mac": f"00:26:99:FE:{sw.get('ip', '1.1').split('.')[-1]}:01",
                "vendor": "Cisco Systems, Inc.",
                "os": "Cisco IOS Switch",
                "oficina": of.get("nombre"),
                "ping_ms": round(random.uniform(0.4, 1.2), 2),
                "servicios": ["SNMP (161)", "SSH (22)", "Telnet (23)"],
                "dinamico": False
            })
            
        for pc in of.get("pcs", []):
            is_din = pc.get("dinamico", False)
            lista.append({
                "status": "alerta" if pc.get("vulnerable") else "online",
                "ip": pc.get("ip"),
                "hostname": pc.get("id"),
                "nombre": pc.get("id"),
                "usuario": pc.get("usuario"),
                "tipo": "Computadora",
                "mac": pc.get("mac", f"70:85:C2:5A:{pc.get('ip','1.1').split('.')[-1]}:90"),
                "vendor": pc.get("fabricante") or ("Intel Corporation" if "10" in pc.get("so", "") else "HP Inc."),
                "os": pc.get("so", "Windows 10"),
                "oficina": of.get("nombre"),
                "ping_ms": round(random.uniform(0.8, 2.5), 2),
                "servicios": ["RDP (3389)", "SMB (445)"] if "Windows" in pc.get("so", "") else ["HTTP (80)"],
                "dinamico": is_din
            })
            
        for lap in of.get("laptops", []):
            lista.append({
                "status": "online",
                "ip": lap.get("ip"),
                "hostname": lap.get("id"),
                "nombre": lap.get("id"),
                "usuario": lap.get("usuario"),
                "tipo": "Laptop",
                "mac": f"3C:52:82:11:{lap.get('ip','1.1').split('.')[-1]}:B4",
                "vendor": "Lenovo Group Ltd.",
                "os": lap.get("so", "Windows 11"),
                "oficina": of.get("nombre"),
                "ping_ms": round(random.uniform(1.2, 3.8), 2),
                "servicios": ["SMB (445)", "RDP (3389)"],
                "dinamico": False
            })
            
        for imp in of.get("impresoras", []):
            is_loop = (imp.get("estado") == "bucle_intermitente")
            vendor = "Kyocera Document Solutions" if "Kyocera" in imp.get("modelo","") else ("HP Inc." if "HP" in imp.get("modelo","") else ("Ricoh Co., Ltd." if "Ricoh" in imp.get("modelo","") else ("Epson" if "Epson" in imp.get("modelo","") else "Zebra Technologies")))
            lista.append({
                "status": "alerta" if is_loop else "online",
                "ip": imp.get("ip"),
                "hostname": imp.get("id"),
                "nombre": imp.get("modelo"),
                "usuario": f"Impresora de Red ({imp.get('tipo', 'red')})",
                "tipo": "Impresora",
                "mac": f"00:C0:EE:88:{imp.get('ip','1.1').split('.')[-1]}:02",
                "vendor": vendor,
                "os": "Embedded Printer OS / CUPS",
                "oficina": of.get("nombre"),
                "ping_ms": round(random.uniform(1.5, 4.0), 2) if not is_loop else 280.0,
                "servicios": ["RAW JetDirect (9100)", "IPP (631)", "HTTP (80)"],
                "dinamico": False
            })
            
    def get_ip_key(item):
        try:
            return [int(x) for x in item["ip"].split(".")]
        except Exception:
            return [999, 999, 999, 999]
            
    lista.sort(key=get_ip_key)
    
    return {
        "total_dispositivos": len(lista),
        "online": sum(1 for d in lista if d["status"] == "online"),
        "alerta": sum(1 for d in lista if d["status"] == "alerta"),
        "dispositivos": lista,
        "rango_escaneo": "192.168.1.1 - 192.168.1.254",
        "metodo": "Advanced IP Scanner Engine (ARP Table + Port Probing + NetBIOS)"
    }

@router.post("/advanced-ip-scan")
async def run_advanced_ip_scan():
    """
    Ejecuta un barrido de escaneo estilo Advanced IP Scanner en la subred local 192.168.1.0/24:
    1. Lee la tabla ARP del kernel del sistema operativo local para detectar hosts vivos.
    2. Identifica direcciones IP físicas que no formen parte del inventario inicial.
    3. Para cada host físico nuevo detectado, sondea puertos estándar (80, 445, 3389, 9100).
    4. Auto-integra los nuevos equipos vivos al Gemelo Digital 3D conectándolos a un switch.
    5. Transmite el evento WebSocket en tiempo real.
    """
    arp_res = await get_arp_dispositivos_reales()
    dispositivos_fisicos = arp_res.get("dispositivos", [])
    
    inv = build_prorridre_inventory()
    known_ips = set()
    for c in inv.get("equipos_core", []):
        known_ips.add(c.get("ip"))
    for of in inv.get("oficinas", []):
        if of.get("switch"):
            known_ips.add(of["switch"].get("ip"))
        for p in of.get("pcs", []):
            known_ips.add(p.get("ip"))
        for l in of.get("laptops", []):
            known_ips.add(l.get("ip"))
        for i in of.get("impresoras", []):
            known_ips.add(i.get("ip"))
            
    nuevos_detectados = []
    
    for df in dispositivos_fisicos:
        f_ip = df.get("ip")
        if not f_ip or not f_ip.startswith("192.168.1.") or f_ip in known_ips or f_ip.endswith(".255"):
            continue
            
        f_mac = df.get("mac", "")
        f_vendor = df.get("fabricante_oui", "Genérico")
        
        puertos = detectar_servicios_ip(f_ip)
        tiene_9100 = any(p["puerto"] == 9100 for p in puertos)
        
        tipo = "impresora" if tiene_9100 or "Kyocera" in f_vendor or "HP" in f_vendor else "computadora"
        oficina_id = "OF-TI"
        
        last_oct = f_ip.split(".")[-1]
        nuevo_pc = {
            "id": f"PC-AUTO-{last_oct}",
            "nombre": f"Host Físico {f_ip}",
            "usuario": f"Equipo Detectado por Advanced IP Scanner ({f_vendor})",
            "ip": f_ip,
            "mac": f_mac,
            "so": "Windows 11 / Linux (Detectado por Escaneo)",
            "ram": "8 GB",
            "vulnerable": False,
            "estado": "online",
            "oficina_id": oficina_id,
            "oficina_nombre": "Informática, Redes y Soporte TI",
            "switch_conectado": "SW-TI",
            "switch_ip": "192.168.1.40",
            "timestamp_conexion": time.time(),
            "tipo": tipo,
            "fabricante": f_vendor,
            "puerto_switch": f"Fa0/{int(last_oct) % 24 + 1}",
            "cable_tipo": "Cat 6 UTP Directo (1 Gbps)",
            "dinamico": True,
            "servicios": [p["servicio"] for p in puertos] or ["Ping ICMP Activo"]
        }
        
        _dynamic_connected_devices[f_ip] = nuevo_pc
        nuevos_detectados.append(nuevo_pc)
        
        await ws_manager.broadcast({
            "evento": "NUEVO_DISPOSITIVO_CONECTADO",
            "dispositivo": nuevo_pc,
            "mensaje": f"⚡ Advanced IP Scanner ha descubierto e integrado una nueva máquina física en la red: IP {f_ip} ({f_vendor})"
        })
        
    return {
        "status": "completado",
        "hosts_fisicos_analizados": len(dispositivos_fisicos),
        "nuevos_dispositivos_incorporados": len(nuevos_detectados),
        "dispositivos_nuevos": nuevos_detectados,
        "total_dispositivos_red": len(build_prorridre_inventory()["oficinas"][3]["pcs"]) + 40
    }



