from fastapi import APIRouter, HTTPException
from database import get_db

router = APIRouter(prefix="/api/obras", tags=["Obras"])

@router.get("")
def list_obras():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, nombre, ubicacion, lat, lng, presupuesto, ejecutado,
               avance_fisico AS avanceFisico, avance_financiero AS avanceFinanciero,
               estado, residente, fecha_inicio AS fechaInicio, fecha_fin AS fechaFin, prioridad
        FROM obras
        ORDER BY avance_fisico ASC
    """)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

@router.get("/{obra_id}")
def get_obra(obra_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM obras WHERE id = ?", (obra_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Obra no encontrada.")
    return dict(row)
