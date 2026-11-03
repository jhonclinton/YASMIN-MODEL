from fastapi import APIRouter
from database import get_db

router = APIRouter(prefix="/api/metricas", tags=["Métricas"])

PIM_TOTAL = 45637342

@router.get("")
def get_metricas():
    conn = get_db()
    cursor = conn.cursor()

    # Obras counts
    cursor.execute("SELECT COUNT(*) FROM obras")
    total_obras = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM obras WHERE estado = 'En Ejecución'")
    ejecucion_obras = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM obras WHERE estado = 'Paralizada'")
    paralizadas_obras = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM obras WHERE estado = 'Finalizada'")
    finalizadas_obras = cursor.fetchone()[0]

    # Presupuesto total ejecutado en obras
    cursor.execute("SELECT SUM(ejecutado), SUM(presupuesto) FROM obras")
    row = cursor.fetchone()
    ejecutado_obras = row[0] or 28745210
    comprometido = 5230100
    por_ejecutar = PIM_TOTAL - ejecutado_obras - comprometido

    # Expedientes counts
    cursor.execute("SELECT COUNT(*) FROM expedientes")
    total_exp = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM expedientes WHERE estado = 'En Trámite'")
    pendientes_exp = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM expedientes WHERE estado = 'Aprobado'")
    aprobados_exp = cursor.fetchone()[0]

    # Alertas
    cursor.execute("SELECT COUNT(*) FROM alertas WHERE atendida = 0")
    alertas_activas = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM alertas WHERE nivel = 'MU' AND atendida = 0")
    alertas_criticas = cursor.fetchone()[0]

    conn.close()

    return {
        "presupuesto": {
            "pim": PIM_TOTAL,
            "ejecutado": ejecutado_obras,
            "comprometido": comprometido,
            "porEjecutar": por_ejecutar,
            "avancePorcentaje": round((ejecutado_obras / PIM_TOTAL) * 100, 1)
        },
        "obras": {
            "total": total_obras,
            "enEjecucion": ejecucion_obras,
            "paralizadas": paralizadas_obras,
            "finalizadas": finalizadas_obras
        },
        "expedientes": {
            "total": total_exp,
            "pendientes": pendientes_exp,
            "aprobados": aprobados_exp,
            "recibidosHoy": 18,
            "promedioSemanal": 85
        },
        "alertas": {
            "activas": alertas_activas,
            "criticas": alertas_criticas
        },
        "activos": {
            "totalPCs": 43,
            "win7": 12,
            "win10": 25,
            "win11": 6,
            "maquinariaTotal": 15,
            "maquinariaOperativa": 11
        }
    }
