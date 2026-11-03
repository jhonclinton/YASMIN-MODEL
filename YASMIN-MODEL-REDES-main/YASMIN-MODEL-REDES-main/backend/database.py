import sqlite3
import os
import json

DB_PATH = os.path.join(os.path.dirname(__file__), "prorridre.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Tabla de Usuarios
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dni TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        nombre TEXT NOT NULL,
        cargo TEXT NOT NULL,
        rol TEXT NOT NULL,
        avatar TEXT
    )
    """)

    # Tabla de Métricas institucionales
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS kpis (
        clave TEXT PRIMARY KEY,
        valor_json TEXT NOT NULL,
        actualizado_al TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Tabla de Obras / Proyectos
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS obras (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        ubicacion TEXT NOT NULL,
        lat REAL,
        lng REAL,
        presupuesto REAL NOT NULL,
        ejecutado REAL NOT NULL,
        avance_fisico REAL NOT NULL,
        avance_financiero REAL NOT NULL,
        estado TEXT NOT NULL,
        residente TEXT NOT NULL,
        fecha_inicio TEXT,
        fecha_fin TEXT,
        prioridad TEXT DEFAULT 'normal'
    )
    """)

    # Tabla de Expedientes (SGD)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS expedientes (
        id TEXT PRIMARY KEY,
        asunto TEXT NOT NULL,
        remitente TEXT NOT NULL,
        destinatario TEXT NOT NULL,
        fecha_ingreso TEXT NOT NULL,
        prioridad TEXT NOT NULL, -- MU, U, N
        estado TEXT NOT NULL,    -- En Trámite, Aprobado, Observado, En Revisión
        dias_tramite INTEGER DEFAULT 1,
        observacion TEXT
    )
    """)

    # Tabla de Alertas
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS alertas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL, -- infra, logistica, presupuesto, gd
        nivel TEXT NOT NULL, -- MU, U, N
        titulo TEXT NOT NULL,
        descripcion TEXT NOT NULL,
        origen TEXT NOT NULL,
        accion TEXT,
        fecha TEXT NOT NULL,
        atendida INTEGER DEFAULT 0
    )
    """)

    # Tabla de Órdenes de Compra y Almacén (SIGA / SIAF)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ordenes_compra (
        id TEXT PRIMARY KEY,
        concepto TEXT NOT NULL,
        obra_id TEXT,
        monto REAL NOT NULL,
        proveedor TEXT NOT NULL,
        estado TEXT NOT NULL,
        fecha TEXT NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dispositivos_red (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL COLLATE NOCASE UNIQUE,
        subred TEXT NOT NULL,
        nombre TEXT NOT NULL DEFAULT '',
        mac TEXT NOT NULL DEFAULT '',
        fabricante TEXT NOT NULL DEFAULT '',
        tipo TEXT NOT NULL,
        tipo_fijado INTEGER NOT NULL DEFAULT 0,
        oficina TEXT NOT NULL DEFAULT '',
        piso INTEGER NOT NULL DEFAULT 0,
        estado_validacion TEXT NOT NULL DEFAULT 'pendiente',
        observacion TEXT NOT NULL DEFAULT '',
        institucion TEXT NOT NULL DEFAULT 'PRORRIDRE',
        asignacion_original TEXT NOT NULL DEFAULT '',
        actualizado_al TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS historial_dispositivos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dispositivo_id INTEGER NOT NULL,
        accion TEXT NOT NULL,
        valores_anteriores TEXT NOT NULL,
        valores_nuevos TEXT NOT NULL,
        creado_al TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()

    # Seed inicial si está vacía
    cursor.execute("SELECT COUNT(*) FROM usuarios")
    if cursor.fetchone()[0] == 0:
        seed_initial_data(conn)

    conn.close()

def seed_initial_data(conn):
    cursor = conn.cursor()

    # Usuarios demo
    users = [
        ("70123456", "admin", "admin123", "Ing. Carlos Quispe Mamani", "Director Ejecutivo", "Directivo", "assets/avatar.jpg"),
        ("70234567", "residente1", "residente123", "Ing. María Condori Apaza", "Residente de Obra - Lampa", "Residente de Obra", None),
        ("70345678", "logistica", "logistica123", "Lic. Juan Huanca Torres", "Jefe de Abastecimiento", "Abastecimiento", None),
        ("70456789", "tiadmin", "tiadmin123", "Ing. Pedro Ramos Chura", "Responsable de TI", "TI Admin", None),
    ]
    cursor.executemany("""
        INSERT INTO usuarios (dni, username, password, nombre, cargo, rol, avatar)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, users)

    # Obras
    obras = [
        ("OBR-001", "Sistema de Riego Lampa - Sector Norte", "Provincia de Lampa", -15.36, -70.37, 8500000, 5950000, 72.0, 70.0, "En Ejecución", "Ing. María Condori Apaza", "2026-03-15", "2027-06-30", "normal"),
        ("OBR-002", "Irrigación Taraco - Huancané Tramo II", "Huancané", -15.20, -69.75, 12300000, 8610000, 68.0, 70.0, "En Ejecución", "Ing. Roberto Mamani", "2025-08-01", "2027-12-15", "critica"),
        ("OBR-003", "Riego Tecnificado Azángaro - Asillo", "Azángaro", -14.91, -70.19, 6400000, 2240000, 32.0, 35.0, "Paralizada", "Ing. Lucía Pari Flores", "2026-01-10", "2027-04-20", "alerta"),
        ("OBR-004", "Presa y Sistema de Riego San Román - Cabanillas", "San Román", -15.49, -70.13, 9800000, 7350000, 78.0, 75.0, "En Ejecución", "Ing. Walter Calla", "2025-11-20", "2027-08-30", "normal"),
        ("OBR-005", "Drenaje Agrícola y Riego Chucuito - Juli", "Chucuito", -16.21, -69.45, 4200000, 3990000, 95.0, 95.0, "En Ejecución", "Ing. Sonia Quispe", "2025-05-10", "2026-11-15", "normal"),
        ("OBR-006", "Riego por Aspersión Melgar - Ayaviri", "Melgar", -14.88, -70.59, 5100000, 4845000, 98.0, 95.0, "Finalizada", "Ing. David Vilca", "2024-09-01", "2026-08-30", "normal"),
        ("OBR-007", "Canal Matriz Carabaya - Macusani", "Carabaya", -14.07, -70.43, 3900000, 3705000, 100.0, 95.0, "Finalizada", "Ing. Elmer Ramos", "2024-06-15", "2026-05-30", "normal"),
        ("OBR-008", "Defensa Ribereña y Riego Ilave - El Collao", "El Collao", -16.08, -69.64, 7600000, 3040000, 41.0, 40.0, "En Ejecución", "Ing. Carmen Ticona", "2026-02-01", "2027-10-30", "normal"),
    ]
    cursor.executemany("""
        INSERT INTO obras (id, nombre, ubicacion, lat, lng, presupuesto, ejecutado, avance_fisico, avance_financiero, estado, residente, fecha_inicio, fecha_fin, prioridad)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, obras)

    # Expedientes SGD (Simulación base institucional)
    expedientes = [
        ("EXP-2026-0412", "Adquisición de tuberías HDPE 200mm para Sistema Lampa", "Residencia Obra Lampa", "Abastecimiento", "2026-10-13", "MU", "En Trámite", 3, "Riesgo de retraso crítico en vaciado"),
        ("EXP-2026-0411", "Valorización N° 06 - Irrigación Taraco Tramo II", "Consorcio Supervisor Altiplano", "Dirección de Obras", "2026-10-13", "MU", "En Revisión", 2, "Plazo de ley vence en 48h"),
        ("EXP-2026-0410", "Mantenimiento correctivo de Retroexcavadora CAT 420F (PE-4521)", "Taller Mecánico Central", "Logística y Activos", "2026-10-12", "U", "En Trámite", 5, "Repuestos en almacén central"),
        ("EXP-2026-0409", "Requerimiento de combustible D2 para frentes Azángaro", "Residencia Azángaro", "Abastecimiento", "2026-10-12", "MU", "Observado", 4, "Falta firma de supervisión"),
        ("EXP-2026-0408", "Informe técnico mensual de avance físico Cabanillas", "Ing. Walter Calla", "Dirección Ejecutiva", "2026-10-11", "N", "Aprobado", 1, "Conforme según cronograma"),
        ("EXP-2026-0407", "Solicitud de ampliación de plazo N° 02 Chucuito - Juli", "Residente Sonia Quispe", "Asesoría Legal", "2026-10-10", "U", "En Trámite", 6, "Por precipitaciones fluviales"),
        ("EXP-2026-0406", "Plan de contingencia por desconexión de enlace GORE Puno", "Responsable de TI", "Dirección Ejecutiva", "2026-10-09", "MU", "Aprobado", 2, "Implementado en red LAN 1000 Mbps"),
    ]
    cursor.executemany("""
        INSERT INTO expedientes (id, asunto, remitente, destinatario, fecha_ingreso, prioridad, estado, dias_tramite, observacion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, expedientes)

    # Alertas institucionales
    alertas = [
        ("infra", "MU", "Desconexión de Enlace Principal a Internet", "Bucle de caída frecuente (1h 32m). Operación garantizada en Red LAN 1000 Mbps.", "Firewall / Gateway", "Monitorear enlace alternativo 4G", "2026-10-13 09:15", 0),
        ("infra", "MU", "Servidor Central Único Sin Clúster ni Replicación", "Un solo servidor físico soporta ERPNext, Base de Datos y Archivos. Alto riesgo de indisponibilidad.", "Auditoría TI", "Activar backup nocturno a NAS externo", "2026-10-13 08:00", 0),
        ("logistica", "MU", "Material Crítico Agotado: Cemento Portland Tipo IP", "Stock 0 bolsas en almacén central. Obras Lampa y Cabanillas en riesgo de paralización.", "Kardex Almacén", "Generar orden de compra de emergencia", "2026-10-13 07:45", 0),
        ("presupuesto", "U", "Retraso en Devengado Proyecto Azángaro", "Ejecución financiera al 35% frente al 58% programado al III Trimestre.", "SIAF / Consulta Amigable", "Convocar a reunión con Residencia de Obra", "2026-10-12 16:30", 0),
        ("gd", "MU", "Expediente EXP-2026-0411 por vencer plazo de ley", "Valorización de Taraco vence en 48 horas. Posibles intereses a favor del contratista.", "SGD GORE Puno", "Priorizar revisión en Dirección de Obras", "2026-10-13 10:00", 0),
        ("infra", "U", "12 Estaciones de Trabajo operando con Windows 7", "Equipos vulnerables sin parches de seguridad oficial conectados a red interna.", "Inventario TI", "Priorizar migración en Plan Operativo TI", "2026-10-11 11:20", 0),
    ]
    cursor.executemany("""
        INSERT INTO alertas (tipo, nivel, titulo, descripcion, origen, accion, fecha, atendida)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, alertas)

    # Órdenes de compra / SIGA
    ordenes = [
        ("OC-2026-089", "500 Bolsas de Cemento Tipo IP", "OBR-001", 14500.0, "Distribuidora Andina SRL", "Pendiente", "2026-10-13"),
        ("OC-2026-088", "1,200 Galones de Diesel D2", "OBR-003", 21600.0, "Petroperú Estación Juliaca", "Aprobada", "2026-10-12"),
        ("OC-2026-087", "Tubería PVC Unión Rápida 160mm", "OBR-002", 48900.0, "Tuboplast Puno SAC", "En Tránsito", "2026-10-11"),
        ("OC-2026-086", "Mantenimiento Oruga D6T", "OBR-004", 18200.0, "Maquinarias del Sur EIRL", "Entregada", "2026-10-08"),
    ]
    cursor.executemany("""
        INSERT INTO ordenes_compra (id, concepto, obra_id, monto, proveedor, estado, fecha)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, ordenes)

    conn.commit()
