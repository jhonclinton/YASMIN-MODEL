import uvicorn
import sys
import os

import socket

# Asegurar path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.8)
        return s.connect_ex((host, port)) == 0

if __name__ == "__main__":
    if is_port_in_use(8000):
        print("=========================================================================")
        print(" [INFO] El servidor Backend PRORRIDRE ya se encuentra activo en ejecucion.")
        print(" Acceso Local: http://127.0.0.1:8000")
        print(" Documentacion Swagger API: http://127.0.0.1:8000/docs")
        print("=========================================================================")
        sys.exit(0)

    print("Iniciando Servidor Backend PRORRIDRE (FastAPI + SQLite)...")
    print("Acceso Local: http://127.0.0.1:8000")
    print("Documentacion Swagger API: http://127.0.0.1:8000/docs")
    try:
        uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
    except Exception as e:
        print(f"[AVISO] No se pudo vincular el puerto: {e}")
        sys.exit(0)
