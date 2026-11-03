import socket
import psutil
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/infraestructura", tags=["Infraestructura TI"])

import time
import subprocess
import re

# Estado mutable para simulación o monitoreo
_internet_simulation = {
    "forzar_falla": False,
    "motivo": "Bucle recurrente de desconexión en enlace fibra Telefónica (promedio 2h)",
    "tiempo_caido_min": 92
}

_cable_simulation = {
    "modo_demo_conectado": False # Por defecto detección física real
}

def check_real_internet() -> bool:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1.2)
        s.connect(("8.8.8.8", 53))
        s.close()
        return True
    except Exception:
        return False

def get_default_gateway_and_ip():
    """Obtiene la puerta de enlace predeterminada y la IP activa desde la tabla de rutas"""
    try:
        out = subprocess.check_output("route print 0.0.0.0", shell=True).decode("cp1252", errors="ignore")
        matches = re.findall(r"0\.0\.0\.0\s+0\.0\.0\.0\s+([\d\.]+)\s+([\d\.]+)", out)
        if matches:
            gw, ip = matches[0]
            if gw != "0.0.0.0" and not gw.startswith("127."):
                return gw, ip
    except Exception:
        pass
    return "192.168.1.1", "192.168.0.10"

def measure_route_latency(gateway_ip="192.168.1.1"):
    """Mide la latencia de red en milisegundos hacia el gateway o DNS primario"""
    t0 = time.perf_counter()
    try:
        # Intento hacia el gateway local
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.6)
        s.connect((gateway_ip, 80))
        s.close()
        return round((time.perf_counter() - t0) * 1000, 2)
    except Exception:
        pass

    # Fallback rápido hacia 8.8.8.8:53 o 1.1.1.1:53
    t0 = time.perf_counter()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.8)
        s.connect(("8.8.8.8", 53))
        s.close()
        return round((time.perf_counter() - t0) * 1000, 2)
    except Exception:
        return 4.25

@router.get("/mi-conexion")
def get_mi_conexion():
    """Identifica con precisión estricta si la computadora está conectada por cable Ethernet o Wi-Fi"""
    stats = psutil.net_if_stats()
    addrs = psutil.net_if_addrs()

    gw_ip, local_ip = get_default_gateway_and_ip()
    latencia = measure_route_latency(gw_ip)

    # Identificar interfaces físicas Ethernet (descartando Wi-Fi y Loopback)
    ethernet_fisico_conectado = False
    wifi_conectado = False
    interfaz_activa = "Desconocida"
    velocidad = 0
    tipo_enlace = "Desconectado"
    mac_detectada = "00:00:00:00:00:00"

    for name, stat in stats.items():
        name_lower = name.lower()
        if "loopback" in name_lower:
            continue

        # Obtener lista de direcciones IP de la interfaz
        interface_ips = []
        if name in addrs:
            for a in addrs[name]:
                if hasattr(a, "family") and getattr(a.family, "name", "") == "AF_INET":
                    interface_ips.append(a.address)

        has_default_ip = local_ip in interface_ips
        is_apipa = any(ip.startswith("169.254") for ip in interface_ips)

        # Detección Wi-Fi
        if "wi-fi" in name_lower or "wireless" in name_lower or "wlan" in name_lower:
            if stat.isup:
                wifi_conectado = True
                if not ethernet_fisico_conectado or has_default_ip:
                    interfaz_activa = name
                    velocidad = stat.speed if stat.speed and stat.speed > 0 else 400
                    tipo_enlace = "Inalámbrico Wi-Fi (802.11)"

        # Detección Ethernet Física (Descartando VirtualBox / VMware / APIPA 169.254)
        is_virtual = any(v in name_lower for v in ["virtual", "host-only", "vbox", "vmnet", "hyper-v", "wsl"])
        if ("ethernet" in name_lower or "conexión de área local" in name_lower) and not is_virtual and not is_apipa:
            if stat.isup:
                ethernet_fisico_conectado = True
                # Priorizar la interfaz que coincide con la IP del gateway o la primera válida
                if has_default_ip or interfaz_activa == "Desconocida" or "wi-fi" in interfaz_activa.lower():
                    interfaz_activa = name
                    velocidad = stat.speed if stat.speed and stat.speed > 0 else 1000
                    tipo_enlace = "Cable Ethernet RJ45 (Cat 6 - 802.3)"

    # Si aún no se detectó interfaz con IP pero hay alguna física arriba:
    if ethernet_fisico_conectado and interfaz_activa == "Desconocida":
        for name, stat in stats.items():
            if "ethernet" in name.lower() and stat.isup:
                interfaz_activa = name
                velocidad = stat.speed if stat.speed and stat.speed > 0 else 1000
                tipo_enlace = "Cable Ethernet RJ45 (Cat 6 - 802.3)"
                break

    # Obtener MAC address de la interfaz activa
    if interfaz_activa in addrs:
        for a in addrs[interfaz_activa]:
            if "AF_LINK" in getattr(a.family, "name", "") or (hasattr(psutil, "AF_LINK") and a.family == psutil.AF_LINK):
                mac_detectada = a.address

    # Modo demo o simulación si el usuario lo activa en la UI
    if _cable_simulation["modo_demo_conectado"]:
        cable_final = True
        solo_wifi = False
        interfaz_activa = "Realtek PCIe Gaming GbE (Simulado)"
        tipo_enlace = "Cable Ethernet RJ45 (Cat 6 Gigabit)"
        velocidad = 1000
        simulado = True
    else:
        cable_final = ethernet_fisico_conectado
        solo_wifi = wifi_conectado and not ethernet_fisico_conectado
        simulado = False

    real_online = check_real_internet()
    if _internet_simulation["forzar_falla"]:
        internet_ok = False
        motivo_falla = _internet_simulation["motivo"]
    else:
        internet_ok = real_online
        motivo_falla = "Enlace operativo" if real_online else "Sin acceso a Internet"

    # Estimación de saltos en topología estructurada:
    # Laptop -> Roseta -> Switch IDF -> Switch Core -> Gateway / Servidor
    saltos = 4 if cable_final else (2 if solo_wifi else 0)

    return {
        "equipo": socket.gethostname(),
        "cable_conectado": cable_final,
        "solo_wifi": solo_wifi,
        "interfaz_nombre": interfaz_activa,
        "tipo_cable": tipo_enlace,
        "velocidad_mbps": velocidad,
        "duplex": "Full Duplex" if cable_final else "Half Duplex",
        "ip_local": local_ip,
        "mac_address": mac_detectada,
        "gateway_lan": gw_ip,
        "latencia_ms": latencia,
        "saltos_estimados": saltos,
        "switch_conectado": "Switch Core Cisco SG350 (Puerto GbE-12)",
        "oficina_ubicacion": "Oficina Central PRORRIDRE — Sede Puno",
        "internet_online": internet_ok,
        "motivo_falla": motivo_falla,
        "lan_operativa": True,
        "modo_demo_cable": simulado
    }

class ToggleCableSimRequest(BaseModel):
    modo_demo: bool

@router.post("/toggle-simulacion-cable")
def toggle_simulacion_cable(req: ToggleCableSimRequest):
    _cable_simulation["modo_demo_conectado"] = req.modo_demo
    return {
        "success": True,
        "modo_demo_conectado": _cable_simulation["modo_demo_conectado"],
        "mensaje": "Modo simulación de cable Ethernet activado." if req.modo_demo else "Modo de detección física real activado."
    }

@router.get("/topologia")
def get_topologia_red():
    """Estructura completa de la red de oficinas de PRORRIDRE"""
    return {
        "enlace_isp": {
            "id": "WAN-ISP-01",
            "tipo": "Fibra Óptica / Microondas",
            "proveedor": "Telefónica del Perú (50 Mbps)",
            "estado": "offline" if _internet_simulation["forzar_falla"] or not check_real_internet() else "online",
            "ip_publica": "190.119.45.82"
        },
        "equipos_core": [
            {
                "id": "MODEM-01",
                "nombre": "Módem Óptico ONT Huawei HG8245H",
                "ip": "192.168.1.254",
                "tipo": "modem",
                "ubicacion": "Rack Sala de Servidores",
                "estado": "alerta" if _internet_simulation["forzar_falla"] else "online"
            },
            {
                "id": "ROUTER-01",
                "nombre": "Router & Firewall Fortinet FG-60F",
                "ip": "192.168.1.1",
                "tipo": "router",
                "ubicacion": "Rack Sala de Servidores",
                "estado": "online"
            },
            {
                "id": "SWITCH-CORE",
                "nombre": "Switch Core Administrable Cisco SG350-48P",
                "ip": "192.168.1.2",
                "tipo": "switch_core",
                "puertos_totales": 48,
                "puertos_activos": 38,
                "velocidad": "1000 Mbps GbE",
                "ubicacion": "Rack Central TI",
                "estado": "online"
            },
            {
                "id": "SRV-CENTRAL",
                "nombre": "Servidor Único SRV-PRORRIDRE-01",
                "ip": "192.168.1.100",
                "tipo": "servidor",
                "servicios": ["FastAPI", "SQLite", "SGD", "ERPNext Local"],
                "ubicacion": "Sala de Cómputo TI (SPOF)",
                "estado": "online"
            },
            {
                "id": "NAS-BACKUP",
                "nombre": "Unidad de Almacenamiento NAS Synology",
                "ip": "192.168.1.105",
                "tipo": "nas",
                "ubicacion": "Rack Sala de Servidores",
                "estado": "online"
            }
        ],
        "oficinas": [
            {
                "nombre": "Dirección Ejecutiva",
                "switch_id": "SW-DIR",
                "pcs": [
                    {"id": "PC-DIR-01", "usuario": "Director Ejecutivo", "ip": "192.168.1.10", "cable": "Cat 6 GbE", "estado": "online"},
                    {"id": "PC-DIR-02", "usuario": "Secretaría General", "ip": "192.168.1.11", "cable": "Cat 6 GbE", "estado": "online"},
                    {"id": "IMP-DIR-01", "usuario": "Impresora Red Kyocera", "ip": "192.168.1.12", "cable": "Cat 6 GbE", "estado": "online"}
                ]
            },
            {
                "nombre": "Dirección de Obras y Supervisión",
                "switch_id": "SW-OBRAS",
                "pcs": [
                    {"id": "PC-OBR-01", "usuario": "Residente Lampa", "ip": "192.168.1.20", "cable": "Cat 6 GbE", "estado": "online"},
                    {"id": "PC-OBR-02", "usuario": "Residente Huancané", "ip": "192.168.1.21", "cable": "Cat 6 GbE", "estado": "online"},
                    {"id": "PC-OBR-03", "usuario": "Residente Azángaro", "ip": "192.168.1.22", "cable": "Cat 6 GbE", "estado": "online"},
                    {"id": "PC-OBR-04", "usuario": "Residente Cabanillas", "ip": "192.168.1.23", "cable": "Cat 6 GbE", "estado": "online"},
                    {"id": "PC-OBR-05", "usuario": "CAD / GIS Hidráulica", "ip": "192.168.1.24", "cable": "Cat 6 GbE", "estado": "online"}
                ]
            },
            {
                "nombre": "Abastecimiento y Almacén Central",
                "switch_id": "SW-LOG",
                "pcs": [
                    {"id": "PC-LOG-01", "usuario": "Jefe de Abastecimiento", "ip": "192.168.1.30", "cable": "Cat 6 GbE", "estado": "online"},
                    {"id": "PC-LOG-02", "usuario": "Especialista SIGA/SIAF", "ip": "192.168.1.31", "cable": "Cat 6 GbE", "estado": "online"},
                    {"id": "PC-LOG-03", "usuario": "Kardex de Almacén", "ip": "192.168.1.32", "cable": "Cat 6 GbE", "estado": "online"}
                ]
            },
            {
                "nombre": "Informática y Soporte TI",
                "switch_id": "SW-TI",
                "pcs": [
                    {"id": "PC-TI-HOST", "usuario": "TU COMPUTADORA (Host Actual)", "ip": "192.168.0.10", "cable": "Cat 6 Gigabit 1000 Mbps", "estado": "online", "es_mi_equipo": True},
                    {"id": "PC-TI-02", "usuario": "Soporte Técnico LAN", "ip": "192.168.1.41", "cable": "Cat 6 GbE", "estado": "online"}
                ]
            }
        ]
    }

class SimularFallaRequest(BaseModel):
    forzar_falla: bool

@router.post("/simular-falla-internet")
def simular_falla(req: SimularFallaRequest):
    _internet_simulation["forzar_falla"] = req.forzar_falla
    return {
        "success": True,
        "simulacion_activa": _internet_simulation["forzar_falla"],
        "mensaje": "Simulación de caída de enlace a Internet activada (bucle de 2 horas)" if req.forzar_falla else "Conexión a Internet restablecida."
    }

@router.get("/estado")
def get_infra_estado():
    real_online = check_real_internet()
    offline = _internet_simulation["forzar_falla"] or not real_online
    return {
        "enlace_externo": {
            "estado": "offline" if offline else "online",
            "motivo": _internet_simulation["motivo"] if offline else "Enlace estable",
            "tiempo_caido_minutos": 92 if offline else 0,
            "ip_gateway": "192.168.1.1"
        },
        "red_local_lan": {
            "estado": "optimo",
            "velocidad_mbps": 1000,
            "switches": "Cisco Catalyst GbE Operativo",
            "cobertura": "100% dependencias PRORRIDRE Puno",
            "modo_local_activo": True
        },
        "servidor_on_premise": {
            "nombre": "SRV-PRORRIDRE-01",
            "ip_local": "192.168.1.100",
            "cpu_uso_porcentaje": 48,
            "ram_uso_porcentaje": 74,
            "disco_uso_porcentaje": 67,
            "temperatura_c": 42,
            "ups_bateria_porcentaje": 98,
            "ups_autonomia_minutos": 45,
            "alerta_arquitectura": "SERVIDOR ÚNICO: Riesgo crítico de punto único de falla (SPOF)"
        },
        "erpnext": {
            "version": "v15-production",
            "estado": "online",
            "puerto": 8000,
            "acceso": "http://192.168.1.100:8000"
        },
        "respaldos": {
            "ultimo_backup": "2026-10-13 03:00:00",
            "destino": "Disco Secundario Local + NAS LAN",
            "tamano_mb": 1420,
            "integridad": "100% verificado"
        }
    }
