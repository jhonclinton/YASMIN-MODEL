import ipaddress
import json
import re
import unicodedata
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from openpyxl import load_workbook
from pydantic import BaseModel, ConfigDict, Field, field_validator

from database import get_db

router = APIRouter(prefix="/api/infraestructura", tags=["Inventario de red"])

DEVICE_TYPES = (
    "Computadora",
    "Laptop",
    "Impresora",
    "Servidor",
    "Switch",
    "Router",
    "Deco",
    "Celular/otro",
)
VALIDATION_STATES = ("validado", "corregido", "pendiente")
MAX_FLOOR = 7
WORKBOOK_PATH = Path(__file__).resolve().parents[2] / "inventario_red_PRORRIDRE.xlsx"
MAC_PATTERN = re.compile(r"^(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$")
OFFICE_FLOORS = {
    "direccion ejecutiva": 1,
    "tesoreria": 1,
    "contabilidad": 2,
    "abastecimiento": 3,
    "logistica": 4,
    "patrimonio": 5,
    "obras y supervision": 6,
    "informatica": 7,
}

EDITABLE_FIELDS = (
    "ip",
    "nombre",
    "mac",
    "tipo",
    "oficina",
    "piso",
    "estado_validacion",
    "fabricante",
    "observacion",
    "institucion",
    "asignacion_original",
    "tipo_fijado",
)


class DispositivoInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ip: str
    nombre: str = Field(default="", max_length=160)
    mac: str = ""
    tipo: Literal[
        "Computadora",
        "Laptop",
        "Impresora",
        "Servidor",
        "Switch",
        "Router",
        "Deco",
        "Celular/otro",
    ] = "Celular/otro"
    oficina: str = Field(default="", max_length=100)
    piso: int = Field(default=0, ge=0, le=MAX_FLOOR)
    estado_validacion: Literal["validado", "corregido", "pendiente"] = "pendiente"
    fabricante: str = Field(default="", max_length=120)
    observacion: str = Field(default="", max_length=500)
    institucion: str = Field(default="PRORRIDRE", max_length=100)
    asignacion_original: str = Field(default="", max_length=300)

    @field_validator("ip")
    @classmethod
    def validate_ip(cls, value: str) -> str:
        value = value.strip()
        try:
            return str(ipaddress.IPv4Address(value))
        except ipaddress.AddressValueError as exc:
            raise ValueError("La dirección debe ser una IPv4 válida.") from exc

    @field_validator("mac")
    @classmethod
    def validate_mac(cls, value: str) -> str:
        value = value.strip().upper().replace("-", ":")
        if value and not MAC_PATTERN.fullmatch(value):
            raise ValueError("La dirección MAC debe tener el formato XX:XX:XX:XX:XX:XX.")
        return value

    @field_validator("nombre", "oficina", "fabricante", "observacion", "institucion", "asignacion_original")
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip()


class DispositivoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ip: str | None = None
    nombre: str | None = Field(default=None, max_length=160)
    mac: str | None = None
    tipo: Literal[
        "Computadora",
        "Laptop",
        "Impresora",
        "Servidor",
        "Switch",
        "Router",
        "Deco",
        "Celular/otro",
    ] | None = None
    oficina: str | None = Field(default=None, max_length=100)
    piso: int | None = Field(default=None, ge=0, le=MAX_FLOOR)
    estado_validacion: Literal["validado", "corregido", "pendiente"] | None = None
    fabricante: str | None = Field(default=None, max_length=120)
    observacion: str | None = Field(default=None, max_length=500)
    institucion: str | None = Field(default=None, max_length=100)
    asignacion_original: str | None = Field(default=None, max_length=300)

    @field_validator("ip")
    @classmethod
    def validate_ip(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            return str(ipaddress.IPv4Address(value.strip()))
        except ipaddress.AddressValueError as exc:
            raise ValueError("La dirección debe ser una IPv4 válida.") from exc

    @field_validator("mac")
    @classmethod
    def validate_mac(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip().upper().replace("-", ":")
        if value and not MAC_PATTERN.fullmatch(value):
            raise ValueError("La dirección MAC debe tener el formato XX:XX:XX:XX:XX:XX.")
        return value

    @field_validator("nombre", "oficina", "fabricante", "observacion", "institucion", "asignacion_original")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


def _fold(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    return "".join(char for char in normalized if not unicodedata.combining(char)).lower().strip()


def classify_device(name: str, suggested_type: str = "") -> str:
    normalized_name = _fold(name)
    normalized_suggestion = _fold(suggested_type)

    if any(marker in normalized_name for marker in ("epson", "npi", "km", "canon")):
        return "Impresora"
    if "laptop" in normalized_name:
        return "Laptop"
    if "server" in normalized_name or "servidor" in normalized_name or "servidor" in normalized_suggestion:
        return "Servidor"
    if "deco" in normalized_name or "deco" in normalized_suggestion:
        return "Deco"
    if "router" in normalized_name or "gateway" in normalized_name or "router" in normalized_suggestion:
        return "Router"
    if "switch" in normalized_name or "switch" in normalized_suggestion:
        return "Switch"
    office_names = ("tesoreria", "contabilidad", "abastecimiento", "logistica", "patrimonio", "informatica", "obras", "direccion")
    if "desktop" in normalized_name or any(name_part in normalized_name for name_part in office_names):
        return "Computadora"
    if "impresora" in normalized_suggestion:
        return "Impresora"
    if "laptop" in normalized_suggestion:
        return "Laptop"
    if "pc" in normalized_suggestion:
        return "Computadora"
    if "celular" in normalized_suggestion or "otro" in normalized_suggestion:
        return "Celular/otro"
    return "Celular/otro"


def _floor_for_office(office: str, source_floor: object) -> int:
    normalized_office = _fold(office)
    for office_name, floor in OFFICE_FLOORS.items():
        if office_name in normalized_office:
            return floor
    try:
        source = int(source_floor)
    except (TypeError, ValueError):
        return 0
    return source if 1 <= source <= MAX_FLOOR else 0


def _get_device(conn, device_id: int):
    row = conn.execute("SELECT * FROM dispositivos_red WHERE id = ?", (device_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Equipo no encontrado.")
    return dict(row)


def _device_response(row: dict) -> dict:
    return {
        **row,
        "tipo_fijado": bool(row["tipo_fijado"]),
        "piso_nombre": f"Piso {row['piso']}" if row["piso"] else "Sin asignar",
        "subred": row["subred"],
    }


def ensure_inventory_seed() -> None:
    conn = get_db()
    try:
        if conn.execute("SELECT COUNT(*) FROM dispositivos_red").fetchone()[0]:
            return
        if not WORKBOOK_PATH.is_file():
            raise RuntimeError(f"No se encuentra el archivo de inventario requerido: {WORKBOOK_PATH}")

        workbook = load_workbook(WORKBOOK_PATH, read_only=True, data_only=True)
        if "Inventario" not in workbook.sheetnames:
            raise RuntimeError("El archivo de inventario no contiene la hoja 'Inventario'.")
        worksheet = workbook["Inventario"]
        rows = worksheet.iter_rows(values_only=True)
        next(rows, None)
        for row in rows:
            ip = str(row[0] or "").strip()
            if not ip:
                continue
            try:
                ip = str(ipaddress.IPv4Address(ip))
            except ipaddress.AddressValueError:
                continue

            name = str(row[2] or "").strip()
            if name == "(sin nombre)":
                name = ""
            mac = str(row[4] or "").strip().upper().replace("-", ":")
            if mac and not MAC_PATTERN.fullmatch(mac):
                mac = ""
            office = str(row[7] or "").strip()
            if office.lower() == "none":
                office = ""
            try:
                source_floor = int(row[8]) if row[8] is not None else 0
            except (TypeError, ValueError):
                source_floor = 0
            state = _fold(str(row[9] or "pendiente"))
            if state not in VALIDATION_STATES:
                state = "pendiente"
            suggested = str(row[6] or "")
            device_type = classify_device(name, suggested)
            subnet = str(row[1] or f"{ip.rsplit('.', 1)[0]}.0/24")
            original_assignment = str(row[12] or "").strip()
            if original_assignment.lower() == "none":
                original_assignment = ""

            conn.execute(
                """
                INSERT OR IGNORE INTO dispositivos_red
                    (ip, subred, nombre, mac, fabricante, tipo, tipo_fijado, oficina, piso,
                     estado_validacion, observacion, institucion, asignacion_original)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ip,
                    subnet,
                    name,
                    mac,
                    str(row[5] or "").strip(),
                    device_type,
                    office,
                    _floor_for_office(office, source_floor),
                    state,
                    str(row[10] or "").strip(),
                    str(row[11] or "PRORRIDRE").strip(),
                    original_assignment,
                ),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("/dispositivos")
def list_devices():
    ensure_inventory_seed()
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM dispositivos_red ORDER BY ip COLLATE NOCASE, id"
        ).fetchall()
        devices = [_device_response(dict(row)) for row in rows]
        counts = {device_type: sum(row["tipo"] == device_type for row in devices) for device_type in DEVICE_TYPES}
        floors = {
            str(floor): {
                "total": sum(row["piso"] == floor for row in devices),
                "validados": sum(row["piso"] == floor and row["estado_validacion"] == "validado" for row in devices),
            }
            for floor in range(1, MAX_FLOOR + 1)
        }
        floors["0"] = {
            "total": sum(row["piso"] == 0 for row in devices),
            "validados": sum(row["piso"] == 0 and row["estado_validacion"] == "validado" for row in devices),
        }
        return {
            "dispositivos": devices,
            "total": len(devices),
            "tipos": counts,
            "pisos": floors,
            "validacion": {
                "validado": sum(row["estado_validacion"] == "validado" for row in devices),
                "corregido": sum(row["estado_validacion"] == "corregido" for row in devices),
                "pendiente": sum(row["estado_validacion"] == "pendiente" for row in devices),
            },
            "oficinas": sorted({row["oficina"] for row in devices if row["oficina"]}),
            "subredes": sorted({row["subred"] for row in devices}),
        }
    finally:
        conn.close()


@router.post("/dispositivos")
def create_device(request: DispositivoInput):
    ensure_inventory_seed()
    data = request.model_dump()
    conn = get_db()
    try:
        duplicate = conn.execute(
            "SELECT id, nombre, ip FROM dispositivos_red WHERE ip = ? COLLATE NOCASE",
            (data["ip"],),
        ).fetchone()
        if duplicate:
            raise HTTPException(
                status_code=409,
                detail={"message": f"La IP ya está asignada a {duplicate['nombre'] or 'un equipo sin nombre'}.", "equipo": duplicate["nombre"]},
            )
        subnet = f"{data['ip'].rsplit('.', 1)[0]}.0/24"
        cursor = conn.execute(
            """
            INSERT INTO dispositivos_red
                (ip, subred, nombre, mac, tipo, tipo_fijado, oficina, piso, estado_validacion,
                 fabricante, observacion, institucion, asignacion_original)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["ip"], subnet, data["nombre"], data["mac"], data["tipo"], data["oficina"],
                data["piso"], data["estado_validacion"], data["fabricante"], data["observacion"],
                data["institucion"], data["asignacion_original"],
            ),
        )
        device_id = cursor.lastrowid
        new_values = _get_device(conn, device_id)
        conn.execute(
            "INSERT INTO historial_dispositivos (dispositivo_id, accion, valores_anteriores, valores_nuevos) VALUES (?, 'crear', '{}', ?)",
            (device_id, json.dumps(new_values, ensure_ascii=False)),
        )
        conn.commit()
        return _device_response(new_values)
    except HTTPException:
        conn.rollback()
        raise
    except Exception as exc:
        conn.rollback()
        if "UNIQUE constraint failed" in str(exc):
            duplicate = conn.execute(
                "SELECT nombre FROM dispositivos_red WHERE ip = ? COLLATE NOCASE", (data["ip"],)
            ).fetchone()
            existing_name = duplicate["nombre"] if duplicate else "otro equipo"
            raise HTTPException(status_code=409, detail={"message": f"La IP ya está asignada a {existing_name}.", "equipo": existing_name}) from exc
        raise
    finally:
        conn.close()


@router.put("/dispositivos/{device_id}")
def update_device(device_id: int, request: DispositivoUpdate):
    ensure_inventory_seed()
    changes = request.model_dump(exclude_unset=True, exclude_none=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No se recibieron campos para actualizar.")

    conn = get_db()
    try:
        current = _get_device(conn, device_id)
        if "ip" in changes:
            duplicate = conn.execute(
                "SELECT nombre FROM dispositivos_red WHERE ip = ? COLLATE NOCASE AND id != ?",
                (changes["ip"], device_id),
            ).fetchone()
            if duplicate:
                raise HTTPException(
                    status_code=409,
                    detail={"message": f"La IP ya está asignada a {duplicate['nombre'] or 'un equipo sin nombre'}.", "equipo": duplicate["nombre"]},
                )
            changes["subred"] = f"{changes['ip'].rsplit('.', 1)[0]}.0/24"

        assignment_changed = any(
            field in changes and changes[field] != current[field]
            for field in ("ip", "oficina", "piso")
        )
        if assignment_changed and current["estado_validacion"] == "validado":
            old_assignment = f"IP {current['ip']} · {current['oficina'] or 'Sin oficina'} · Piso {current['piso'] or 'Sin asignar'}"
            changes["estado_validacion"] = "corregido"
            changes.setdefault("asignacion_original", old_assignment)

        if "tipo" in changes:
            changes["tipo_fijado"] = 1
        elif "nombre" in changes and not current["tipo_fijado"]:
            changes["tipo"] = classify_device(changes["nombre"], current["tipo"])

        old_values = {field: current[field] for field in changes if field in current}
        fields = list(changes)
        assignments = ", ".join(f"{field} = ?" for field in fields)
        values = [int(value) if field == "tipo_fijado" else value for field, value in changes.items()]
        values.extend([device_id])
        conn.execute(
            f"UPDATE dispositivos_red SET {assignments}, actualizado_al = CURRENT_TIMESTAMP WHERE id = ?",
            values,
        )
        updated = _get_device(conn, device_id)
        new_values = {field: updated[field] for field in changes}
        conn.execute(
            "INSERT INTO historial_dispositivos (dispositivo_id, accion, valores_anteriores, valores_nuevos) VALUES (?, 'actualizar', ?, ?)",
            (
                device_id,
                json.dumps(old_values, ensure_ascii=False),
                json.dumps(new_values, ensure_ascii=False),
            ),
        )
        conn.commit()
        return _device_response(updated)
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.delete("/dispositivos/{device_id}")
def delete_device(device_id: int):
    ensure_inventory_seed()
    conn = get_db()
    try:
        device = _get_device(conn, device_id)
        snapshot = json.dumps(device, ensure_ascii=False)
        conn.execute(
            "INSERT INTO historial_dispositivos (dispositivo_id, accion, valores_anteriores, valores_nuevos) VALUES (?, 'eliminar', ?, '{}')",
            (device_id, snapshot),
        )
        conn.execute("DELETE FROM dispositivos_red WHERE id = ?", (device_id,))
        conn.commit()
        return {"success": True, "id": device_id}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("/dispositivos/{device_id}/historial")
def get_device_history(device_id: int):
    ensure_inventory_seed()
    conn = get_db()
    try:
        history = conn.execute(
            """
            SELECT id, dispositivo_id, accion, valores_anteriores, valores_nuevos, creado_al
            FROM historial_dispositivos WHERE dispositivo_id = ? ORDER BY id DESC
            """,
            (device_id,),
        ).fetchall()
        return [
            {
                **dict(row),
                "valores_anteriores": json.loads(row["valores_anteriores"]),
                "valores_nuevos": json.loads(row["valores_nuevos"]),
            }
            for row in history
        ]
    finally:
        conn.close()


@router.post("/dispositivos/{device_id}/deshacer")
def undo_device_change(device_id: int):
    ensure_inventory_seed()
    conn = get_db()
    try:
        history = conn.execute(
            "SELECT * FROM historial_dispositivos WHERE dispositivo_id = ? ORDER BY id DESC LIMIT 1",
            (device_id,),
        ).fetchone()
        if not history:
            raise HTTPException(status_code=404, detail="No hay cambios para deshacer.")

        if history["accion"] == "crear":
            conn.execute("DELETE FROM dispositivos_red WHERE id = ?", (device_id,))
            conn.execute(
                "INSERT INTO historial_dispositivos (dispositivo_id, accion, valores_anteriores, valores_nuevos) VALUES (?, 'deshacer_creacion', ?, '{}')",
                (device_id, history["valores_nuevos"]),
            )
            conn.commit()
            return {"success": True, "eliminado": True}

        if history["accion"] == "eliminar":
            snapshot = json.loads(history["valores_anteriores"])
            columns = [column for column in snapshot if column != "id"]
            conn.execute(
                f"INSERT INTO dispositivos_red (id, {', '.join(columns)}) VALUES (?, {', '.join('?' for _ in columns)})",
                [device_id, *(snapshot[column] for column in columns)],
            )
            restored = _get_device(conn, device_id)
            conn.execute(
                "INSERT INTO historial_dispositivos (dispositivo_id, accion, valores_anteriores, valores_nuevos) VALUES (?, 'deshacer_eliminacion', '{}', ?)",
                (device_id, json.dumps(restored, ensure_ascii=False)),
            )
            conn.commit()
            return {"success": True, "dispositivo": _device_response(restored)}

        old_values = json.loads(history["valores_anteriores"])
        if not old_values:
            raise HTTPException(status_code=400, detail="El último evento no contiene valores reversibles.")
        current = _get_device(conn, device_id)
        columns = list(old_values)
        assignments = ", ".join(f"{column} = ?" for column in columns)
        conn.execute(
            f"UPDATE dispositivos_red SET {assignments}, actualizado_al = CURRENT_TIMESTAMP WHERE id = ?",
            [*(old_values[column] for column in columns), device_id],
        )
        restored = _get_device(conn, device_id)
        conn.execute(
            "INSERT INTO historial_dispositivos (dispositivo_id, accion, valores_anteriores, valores_nuevos) VALUES (?, 'deshacer_actualizacion', ?, ?)",
            (
                device_id,
                json.dumps({field: current[field] for field in columns}, ensure_ascii=False),
                json.dumps({field: restored[field] for field in columns}, ensure_ascii=False),
            ),
        )
        conn.commit()
        return {"success": True, "dispositivo": _device_response(restored)}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()
