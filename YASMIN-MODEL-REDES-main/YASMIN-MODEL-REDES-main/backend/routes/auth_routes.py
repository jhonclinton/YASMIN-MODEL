from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from database import get_db
from auth import create_access_token, verify_token

router = APIRouter(prefix="/api/auth", tags=["Autenticación"])

class LoginRequest(BaseModel):
    username: str
    password: str
    rol: str | None = None

class RegisterRequest(BaseModel):
    dni: str
    username: str
    password: str
    nombre: str
    cargo: str
    rol: str
    avatar: str | None = None

@router.post("/register")
def register(req: RegisterRequest):
    dni_clean = req.dni.strip()
    user_clean = req.username.strip()
    pass_clean = req.password.strip()
    nombre_clean = req.nombre.strip()
    cargo_clean = req.cargo.strip()
    rol_clean = req.rol.strip()

    if not dni_clean or not user_clean or not pass_clean or not nombre_clean:
        raise HTTPException(status_code=400, detail="DNI, usuario, contraseña y nombre son campos obligatorios.")

    valid_roles = ["Directivo", "Residente de Obra", "Abastecimiento", "TI Admin"]
    if rol_clean not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Rol no válido. Elija uno de: {', '.join(valid_roles)}.")

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM usuarios WHERE dni = ? OR username = ?", (dni_clean, user_clean))
    existing = cursor.fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=400, detail="Ya existe una cuenta registrada con este DNI o nombre de usuario.")

    avatar_val = req.avatar or "assets/avatar.jpg"
    cursor.execute("""
        INSERT INTO usuarios (dni, username, password, nombre, cargo, rol, avatar)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (dni_clean, user_clean, pass_clean, nombre_clean, cargo_clean, rol_clean, avatar_val))
    conn.commit()
    new_id = cursor.lastrowid

    cursor.execute("SELECT id, dni, username, nombre, cargo, rol, avatar FROM usuarios WHERE id = ?", (new_id,))
    user_row = cursor.fetchone()
    conn.close()

    user_dict = dict(user_row)
    token = create_access_token({
        "id": user_dict["id"],
        "username": user_dict["username"],
        "nombre": user_dict["nombre"],
        "rol": user_dict["rol"]
    })

    return {
        "success": True,
        "token": token,
        "session": user_dict,
        "message": "Usuario registrado exitosamente en el sistema."
    }

@router.post("/login")
def login(req: LoginRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, dni, username, password, nombre, cargo, rol, avatar
        FROM usuarios
        WHERE (username = ? OR dni = ?) AND password = ?
    """, (req.username, req.username, req.password))
    user = cursor.fetchone()
    conn.close()

    if not user:
        raise HTTPException(status_code=401, detail="DNI/Usuario o contraseña incorrectos.")

    user_dict = dict(user)

    if req.rol and req.rol.strip() and user_dict["rol"] != req.rol.strip():
        raise HTTPException(
            status_code=403,
            detail=f"El rol seleccionado '{req.rol}' no coincide con el perfil asignado ('{user_dict['rol']}')."
        )

    # Crear token
    token = create_access_token({
        "id": user_dict["id"],
        "username": user_dict["username"],
        "nombre": user_dict["nombre"],
        "rol": user_dict["rol"]
    })

    user_dict.pop("password", None)
    return {
        "success": True,
        "token": token,
        "session": user_dict
    }

@router.get("/me")
def get_current_user(token: str | None = None):
    if not token:
        raise HTTPException(status_code=401, detail="Token requerido.")
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, dni, username, nombre, cargo, rol, avatar
        FROM usuarios WHERE id = ?
    """, (payload["id"],))
    user = cursor.fetchone()
    conn.close()

    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    return dict(user)
