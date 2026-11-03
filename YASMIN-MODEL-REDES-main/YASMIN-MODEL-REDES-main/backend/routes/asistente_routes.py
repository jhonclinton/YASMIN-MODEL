import re
from fastapi import APIRouter
from pydantic import BaseModel
from database import get_db

router = APIRouter(prefix="/api/asistente", tags=["Asistente Inteligente PRORRIDRE"])

class ChatQuery(BaseModel):
    pregunta: str
    usuario_rol: str | None = "Directivo"

@router.post("/consultar")
def consultar_asistente(query: ChatQuery):
    texto = query.pregunta.lower().strip()
    
    # Búsqueda especializada de direcciones IP en la infraestructura PRORRIDRE
    ip_match = re.search(r"\b(192\.168\.\d+\.\d+|\b\d+\.\d+\.\d+\.\d+)\b", texto)
    if not ip_match and ("ip" in texto or "direccion" in texto or "dirección" in texto):
        oct_match = re.search(r"\b(?:ip|octeto|nodo|equipo)\s*(?:nro|num|numero|n°|#)?\s*([0-9]{1,3})\b", texto)
        if oct_match:
            ip_candidate = f"192.168.1.{oct_match.group(1)}"
            ip_match = re.search(r"192\.168\.1\.\d+", ip_candidate)

    if ip_match:
        target_ip = ip_match.group(0)
        from routes.network_twin import buscar_dispositivo
        res = buscar_dispositivo(target_ip)
        resultados = res.get("resultados", [])
        if resultados:
            top = resultados[0]
            otros = [f"• `{r.get('id')}` ({r.get('ip')}): {r.get('nombre')}" for r in resultados[1:4]]
            otros_str = "\n" + "\n".join(otros) if otros else ""
            
            es_vulnerable = top.get("vulnerable", False)
            advertencia = "\n⚠️ **Alerta de Seguridad:** Estación obsoleta con Windows 7 EoL sin parches oficiales." if es_vulnerable else ""
            otros_bloque = f"\n\n*Otras coincidencias en la subred:*{otros_str}" if otros else ""
            
            respuesta = (
                f"🔍 **Dispositivo Identificado por IP ({top.get('ip')}):**\n\n"
                f"• **Identificador:** `{top.get('id')}`\n"
                f"• **Usuario / Responsable:** {top.get('nombre')}\n"
                f"• **Tipo de Equipo:** {top.get('tipo')} ({top.get('categoria', 'Red LAN')})\n"
                f"• **Oficina / Ubicación:** {top.get('oficina')}\n"
                f"• **Dirección MAC:** `{top.get('mac')}`\n"
                f"• **Sistema Operativo / Firmware:** {top.get('so')}\n"
                f"• **Segmento:** Red LAN Gigabit 1000 Mbps PRORRIDRE{advertencia}"
                f"{otros_bloque}"
            )
        else:
            respuesta = (
                f"🔍 **Diagnóstico de IP ({target_ip}):**\n\n"
                f"No se encontró un nodo estático registrado con la IP `{target_ip}` en la topología base.\n"
                f"• Rango institucional: `192.168.1.0/24` (Gateway: `192.168.1.1`, Servidor: `192.168.1.100`, Switches: `.10, .20, .30, .40`).\n"
                f"• Si es un equipo nuevo en la LAN física, pulsa 'Escaneo Activo Local' en Infraestructura TI para actualizar la tabla ARP en tiempo real."
            )
        return {
            "success": True,
            "pregunta": query.pregunta,
            "respuesta": respuesta,
            "fuente": "PRORRIDRE Network IP Resolver & Digital Twin"
        }

    # Contexto desde la base de datos
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM obras WHERE estado = 'En Ejecución'")
    obras_activas = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM expedientes WHERE prioridad = 'MU' AND estado != 'Aprobado'")
    exp_mu = cursor.fetchone()[0]
    conn.close()

    # Base de conocimiento especializada en PRORRIDRE GORE Puno
    if any(k in texto for k in ["pim", "presupuesto", "financiero", "cuanto", "dinero", "saldo"]):
        respuesta = (
            "📊 **Diagnóstico Presupuestal PRORRIDRE 2026:**\n\n"
            "• **Presupuesto PIM Total:** S/ 45,637,342 (PIM oficial GORE Puno).\n"
            "• **Ejecutado (Devengado):** S/ 28,745,210 (63.0% de avance).\n"
            "• **Comprometido:** S/ 5,230,100 (11.5%).\n"
            "• **Saldo por Ejecutar:** S/ 11,662,032.\n"
            "💡 *Recomendación:* Acelerar los devengados en el proyecto Azángaro-Asillo para asegurar la meta trimestral en SIAF."
        )
    elif any(k in texto for k in ["internet", "red", "caida", "caída", "desconexion", "bucle", "lan", "1000", "mbps"]):
        respuesta = (
            "🌐 **Diagnóstico de Conectividad y Red:**\n\n"
            "• **Estado Enlace Externo:** Intermitente/Caído con bucle recurrente de hasta 2 horas hacia servidores externos.\n"
            "• **Red Local LAN (1000 Mbps):** Totalmente operativa a Gigabit Ethernet (switches Cisco).\n"
            "• **Modo Local Activo:** El ERPNext y el Smart Dashboard operan al 100% On-Premise dentro de la sede sin necesidad de Internet.\n"
            "💡 *Solución Técnica:* Los trámites y almacén continúan registrándose en el servidor local. Se sincronizarán automáticamente con SIAF/SIGA central al reanudarse el enlace."
        )
    elif any(k in texto for k in ["servidor", "backup", "respaldo", "spof", "riesgo", "infraestructura", "hardware"]):
        respuesta = (
            "🖥️ **Diagnóstico de Infraestructura del Servidor:**\n\n"
            "• **Servidor Central:** SRV-PRORRIDRE-01 (192.168.1.100) aloja Base de Datos, ERPNext y SGD.\n"
            "• **Punto Crítico:** ⚠️ **SPOF (Single Point of Failure):** Servidor único físico con un solo operador de TI.\n"
            "• **Estado Físico:** CPU 48%, RAM 74%, Disco 67%, UPS con 45 min de autonomía.\n"
            "• **Último Respaldo:** Hoy a las 03:00 hrs verificado en disco secundario.\n"
            "💡 *Acción Prioritaria:* Adquirir una unidad NAS dedicada para réplica offline y configurar un servidor secundario de respaldo en caliente."
        )
    elif any(k in texto for k in ["obra", "proyecto", "lampa", "taraco", "azangaro", "cabanillas", "chucuito"]):
        respuesta = (
            f"🏗️ **Estado de Obras de Riego (Total 8 proyectos):**\n\n"
            f"• **En Ejecución:** {obras_activas} obras activas.\n"
            "• **Lampa Sector Norte:** 72% físico, ejecución normal.\n"
            "• **Taraco - Huancané:** 68% físico, 🔴 Valorización N° 06 vence en 48h.\n"
            "• **Azángaro - Asillo:** 32% físico, ⚠️ Paralizada temporalmente por combustible y lluvias.\n"
            "• **Cabanillas:** 78% físico, avance conforme a cronograma.\n"
            "💡 *Recomendación:* Priorizar la entrega de cemento y combustible para evitar penalidades de ampliación."
        )
    elif any(k in texto for k in ["expediente", "sgd", "tramite", "trámite", "mu", "urgente"]):
        respuesta = (
            f"📄 **Gestión Documentaria SGD:**\n\n"
            f"• **Expedientes Críticos (🔴 MU):** {exp_mu} expedientes requieren atención inmediata.\n"
            "• **Clasificación Automática Institucional:**\n"
            "  - 🔴 **MU (Muy Urgente):** Vencimiento legal < 48h o paralización de frente de obra.\n"
            "  - 🟡 **U (Urgente):** Requerimientos regulares y logística de materiales.\n"
            "  - 🟢 **N (Normal):** Informes mensuales y oficios informativos.\n"
            "💡 *Acción:* Puede usar el botón 'Simular Ingreso Diario (SGD)' para recibir los 15-20 trámites de la jornada."
        )
    elif any(k in texto for k in ["win7", "windows 7", "computadora", "pc", "seguridad"]):
        respuesta = (
            "💻 **Auditoría de Equipos y Ciberseguridad:**\n\n"
            "• Se detectaron **12 estaciones de trabajo operando con Windows 7** (sin soporte oficial).\n"
            "• 25 con Windows 10 y 6 con Windows 11.\n"
            "💡 *Recomendación TI:* Aislar las terminales Windows 7 en una VLAN separada y gestionar renovación en el Plan de Inversiones 2026."
        )
    else:
        respuesta = (
            f"🤖 **Asistente Inteligente PRORRIDRE:**\n\n"
            f"Puedo orientarle en tiempo real sobre:\n"
            f"1. **Presupuesto PIM S/ 45.6M:** Consulta devengados, compromisos y saldos.\n"
            f"2. **Conectividad:** Estado de la LAN 1000 Mbps y contingencia del bucle de Internet.\n"
            f"3. **8 Obras de Riego:** Avance físico/financiero (Lampa, Taraco, Azángaro, etc.).\n"
            f"4. **Expedientes SGD:** Priorización institucional (🔴 MU, 🟡 U, 🟢 N).\n"
            f"5. **Servidor y Backups:** Estado del servidor único y recomendaciones técnicas.\n\n"
            f"*¿En cuál de estos aspectos desea que profundice?*"
        )

    return {
        "success": True,
        "pregunta": query.pregunta,
        "respuesta": respuesta,
        "fuente": "PRORRIDRE Local Knowledge Engine v2.0 (On-Premise)"
    }
