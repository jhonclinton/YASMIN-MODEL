from fastapi import APIRouter
from database import get_db

router = APIRouter(prefix="/api/alertas", tags=["Alertas"])

@router.get("")
def list_alertas(tipo: str | None = None, nivel: str | None = None):
    conn = get_db()
    cursor = conn.cursor()
    query = "SELECT id, tipo, nivel, titulo, descripcion, origen, accion, fecha, atendida FROM alertas WHERE 1=1"
    params = []
    if tipo:
        query += " AND tipo = ?"
        params.append(tipo)
    if nivel:
        query += " AND nivel = ?"
        params.append(nivel)
    query += " ORDER BY CASE nivel WHEN 'MU' THEN 1 WHEN 'U' THEN 2 ELSE 3 END, id DESC"
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

@router.post("/resolver/{alerta_id}")
def resolver_alerta(alerta_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE alertas SET atendida = 1 WHERE id = ?", (alerta_id,))
    conn.commit()
    conn.close()
    return {"success": True, "id": alerta_id}
