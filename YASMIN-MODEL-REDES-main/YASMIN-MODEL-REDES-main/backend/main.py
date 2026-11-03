import os
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from database import init_db
from routes.auth_routes import router as auth_router
from routes.metricas_routes import router as metricas_router
from routes.obras_routes import router as obras_router
from routes.expedientes_routes import router as expedientes_router
from routes.alertas_routes import router as alertas_router
from routes.infra_routes import router as infra_router
from routes.asistente_routes import router as asistente_router
from routes.network_twin import router as network_twin_router, websocket_telemetria
from routes.inventory_routes import router as inventory_router, ensure_inventory_seed

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

app = FastAPI(
    title="PRORRIDRE Smart API & Web App",
    description="Sistema Integrado de Monitoreo Inteligente y Digital Twin de PRORRIDRE (GORE Puno)",
    version="2.1.0"
)

# CORS para comunicación fluida
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()
    ensure_inventory_seed()

# Montaje de routers REST
app.include_router(auth_router)
app.include_router(metricas_router)
app.include_router(obras_router)
app.include_router(expedientes_router)
app.include_router(alertas_router)
app.include_router(infra_router)
app.include_router(asistente_router)
app.include_router(network_twin_router)
app.include_router(inventory_router)

# WebSocket raíz para telemetría
@app.websocket("/ws/telemetria")
async def root_websocket_telemetria(websocket: WebSocket):
    await websocket_telemetria(websocket)

# Montaje de archivos estáticos (CSS, JS, Assets)
css_dir = os.path.join(BASE_DIR, "css")
js_dir = os.path.join(BASE_DIR, "js")
assets_dir = os.path.join(BASE_DIR, "assets")

if os.path.exists(css_dir):
    app.mount("/css", StaticFiles(directory=css_dir), name="css")
if os.path.exists(js_dir):
    app.mount("/js", StaticFiles(directory=js_dir), name="js")
if os.path.exists(assets_dir):
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

# Servir Frontend Web
@app.get("/")
def serve_index():
    index_path = os.path.join(BASE_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "PRORRIDRE API Activa"}

@app.get("/dashboard.html")
def serve_dashboard():
    dash_path = os.path.join(BASE_DIR, "dashboard.html")
    if os.path.exists(dash_path):
        return FileResponse(dash_path)
    return {"message": "Dashboard no encontrado"}

@app.get("/api/info")
def get_info():
    return {
        "entidad": "PRORRIDRE - GORE Puno",
        "sistema": "Smart Dashboard ERP/CRM & Network Digital Twin Core",
        "version": "2.1.0",
        "estado": "En línea en Red LAN 1000 Mbps Gigabit",
        "docs": "/docs",
        "websocket": "/ws/telemetria"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
