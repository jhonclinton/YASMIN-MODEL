import random
from datetime import datetime
from fastapi import APIRouter
from database import get_db

router = APIRouter(prefix="/api/expedientes", tags=["Expedientes SGD"])

ASUNTOS_SIMULADOS = [
    ("Requerimiento de geomembrana para reservorio R-3", "Residencia Huancané", "Abastecimiento", "MU", "Riesgo de filtración en canal lateral"),
    ("Adquisición de combustible Diésel B5 para maquinaria pesada", "Taller Central", "Abastecimiento", "MU", "Existencia para sólo 48 horas de trabajo"),
    ("Informe mensual de valorización de obra N° 07", "Consorcio Supervisor Altiplano", "Dirección de Obras", "MU", "Plazo contractual de aprobación en curso"),
    ("Solicitud de mantenimiento de camión volquete Volvo FMX", "Residencia Lampa", "Logística", "U", "Falla en sistema hidráulico de tolva"),
    ("Requerimiento de cemento Portland Tipo IP (400 bolsas)", "Residencia Cabanillas", "Almacén Central", "U", "Programado para vaciado de bocatoma"),
    ("Informe de control de calidad de probetas de concreto", "Laboratorio de Suelos", "Dirección de Obras", "N", "Resultados conformes f'c=210 kg/cm2"),
    ("Acta de entrega de terreno para canal secundario", "Comunidad Campesina de Taraco", "Residencia de Obra", "U", "Conformidad de directiva comunal"),
    ("Solicitud de viáticos para inspección técnica en frentes", "Ing. Pedro Ramos", "Administración", "N", "Comisión de servicio aprobada"),
    ("Requerimiento de repuestos para bomba centrífuga 4 HP", "Residencia Chucuito", "Abastecimiento", "U", "Equipo de bombeo auxiliar en parada"),
    ("Oficio de coordinación interinstitucional con ALA Ilave", "Autoridad Local del Agua", "Dirección Ejecutiva", "N", "Revisión de derechos de uso hídrico"),
    ("Ampliación de plazo por precipitaciones pluviales extraordinarias", "Residencia Azángaro", "Asesoría Jurídica", "MU", "Sustentado con reporte SENAMHI"),
    ("Pedido de útiles de oficina y consumibles de impresión", "Oficina de Planificación", "Abastecimiento", "N", "Consumo regular de almacén")
]

@router.get("")
def list_expedientes(prioridad: str | None = None, estado: str | None = None):
    conn = get_db()
    cursor = conn.cursor()
    query = """
        SELECT id, asunto, remitente, destinatario, fecha_ingreso AS fechaIngreso,
               prioridad, estado, dias_tramite AS diasTramite, observacion
        FROM expedientes
        WHERE 1=1
    """
    params = []
    if prioridad:
        query += " AND prioridad = ?"
        params.append(prioridad)
    if estado:
        query += " AND estado = ?"
        params.append(estado)
    query += " ORDER BY CASE prioridad WHEN 'MU' THEN 1 WHEN 'U' THEN 2 ELSE 3 END, id DESC"

    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

@router.post("/simular-ingreso")
def simular_ingreso_sgd(cantidad: int = 15):
    """Simula el flujo diario institucional de 15 a 20 expedientes SGD clasificando prioridades MU, U, N"""
    conn = get_db()
    cursor = conn.cursor()

    hoy = datetime.now().strftime("%Y-%m-%d")
    cursor.execute("SELECT COUNT(*) FROM expedientes")
    count_actual = cursor.fetchone()[0]

    nuevos = []
    for i in range(cantidad):
        num = count_actual + i + 1
        exp_id = f"EXP-2026-{num:04d}"
        plantilla = random.choice(ASUNTOS_SIMULADOS)
        asunto, rem, dest, prio_sug, obs = plantilla

        # Distribución estadística realista: ~35% MU, ~45% U, ~20% N
        r = random.random()
        if r < 0.35:
            prio = "MU"
        elif r < 0.80:
            prio = "U"
        else:
            prio = "N"

        estado = "En Trámite"
        dias = random.randint(1, 3)

        cursor.execute("""
            INSERT INTO expedientes (id, asunto, remitente, destinatario, fecha_ingreso, prioridad, estado, dias_tramite, observacion)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (exp_id, asunto, rem, dest, hoy, prio, estado, dias, obs))

        nuevos.append({
            "id": exp_id,
            "asunto": asunto,
            "remitente": rem,
            "destinatario": dest,
            "prioridad": prio,
            "estado": estado,
            "diasTramite": dias
        })

    conn.commit()
    conn.close()

    return {
        "success": True,
        "generados": len(nuevos),
        "mensaje": f"Se han procesado e ingresado exitosamente {len(nuevos)} nuevos expedientes al SGD institucional.",
        "expedientes": nuevos
    }

@router.post("/procesar/{exp_id}")
def procesar_expediente(exp_id: str, nuevo_estado: str = "Aprobado"):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE expedientes SET estado = ? WHERE id = ?", (nuevo_estado, exp_id))
    conn.commit()
    conn.close()
    return {"success": True, "id": exp_id, "estado": nuevo_estado}
