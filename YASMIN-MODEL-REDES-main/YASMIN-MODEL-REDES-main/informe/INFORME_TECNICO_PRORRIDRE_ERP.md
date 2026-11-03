# INFORME TÉCNICO Y ACADÉMICO: SISTEMA INTEGRADO PRORRIDRE SMART ERP & DASHBOARD

**Universidad Nacional del Altiplano — Puno**  
**Facultad de Ingeniería Mecánica Eléctrica, Electrónica y Sistemas**  
**Escuela Profesional de Ingeniería de Sistemas (X Semestre)**  
**Curso:** Tópicos en Sistemas de Información II (Enfoque ERP)  
**Proyecto:** PRORRIDRE SRP (Smart Resource Planning & Network Digital Twin)  
**Entidad de Aplicación:** Programa Regional de Riego y Drenaje (PRORRIDRE — GORE Puno)  
**Versión del Sistema:** 2.1.0 Enterprise Edition  
**Ubicación del PDF Generado:** `f:/IS X SEMESTRE/5. TOPICOS EN SISTEMAS DE INFORMACIÓN II (e)/PROYECTO/PRORRIDRE SRP/informe/INFORME_TECNICO_PRORRIDRE_ERP.pdf`

---

## 1. Resumen Ejecutivo e Introducción

El presente informe describe la concepción, arquitectura técnica, funcionalidades y fundamentación teórica del sistema **PRORRIDRE Smart Dashboard & Network Digital Twin**.

El **Programa Regional de Riego y Drenaje (PRORRIDRE)** del Gobierno Regional de Puno tiene a su cargo la formulación, ejecución y supervisión de la infraestructura de riego y drenaje en las 13 provincias del departamento de Puno. Históricamente, la entidad ha enfrentado tres debilidades críticas:
1. **Desarticulación de Procesos (Silos de Información):** Falta de sincronización entre el avance físico reportado en obra y el devengado presupuestal registrado en el SIAF.
2. **Cuellos de Botella Logísticos y Documentarios:** Retrasos en la adquisición de materiales críticos (cemento, combustible, tuberías HDPE) y demoras en el trámite de valorizaciones en el SGD.
3. **Vulnerabilidad de Infraestructura TI y Conectividad:** Frecuentes caídas del enlace de Internet comercial provisto en Puno, las cuales paralizan las aplicaciones basadas exclusivamente en la nube.

Para resolver esta problemática se desarrolló una solución integral que opera como un **ERP (Enterprise Resource Planning)** gubernamental con capacidad de alta disponibilidad en **Red LAN local (1000 Mbps Gigabit)**, asegurando continuidad operativa ininterrumpida.

---

## 2. Fundamentación: ¿Cómo y por qué el Sistema está basado en un ERP?

Un **ERP (Enterprise Resource Planning)** es un sistema de software integral, modular y articulado alrededor de una base de datos centralizada, diseñado para planificar y optimizar los recursos corporativos e institucionales.

El sistema PRORRIDRE implementa la arquitectura y filosofía de un ERP en los siguientes ejes:

### 2.1. Integración de Recursos y Procesos Cruzados
En lugar de operar con sistemas aislados, el sistema conecta en tiempo real:
* **Presupuesto (Finanzas):** Control del Presupuesto Institucional Modificado (**PIM 2026: S/ 45,637,342**), monitoreo del devengado (63.2% ejecutado), compromisos (21.8%) y saldos por devengar.
* **Proyectos y Obras (Project Management):** Trazabilidad de las 8 obras activas de irrigación, contrastando el % de avance físico real frente al % de avance financiero.
* **Cadena de Suministro (Supply Chain & Kardex):** Control de existencias en almacén central con alertas de reposición por stock mínimo y emisión de Órdenes de Compra vinculadas a proyectos.
* **Gestión de Activos Fijos (Enterprise Asset Management - EAM):** Control del parque informático (43 computadoras) y maquinaria pesada de movimiento de tierras (15 unidades) con programación de mantenimiento preventivo.
* **Gestión Documentaria y Workflows (SGD):** Tramitación de expedientes categorizados por severidad (**MU** = Muy Urgente, **U** = Urgente, **N** = Normal).

### 2.2. Unicidad del Dato y Eliminación de Redundancia
Todos los módulos consumen y actualizan el mismo repositorio relacional (`prorridre.db`). Cuando se simula o registra un devengado en el módulo financiero, automáticamente se actualizan los indicadores de la Vista Ejecutiva, los saldos de las obras vinculadas y las órdenes de compra.

### 2.3. Resiliencia ERP On-Premise ("Local-First")
Un principio fundamental de los sistemas ERP de misión crítica es la **tolerancia a fallos**. Dado que el PRORRIDRE no puede detener la supervisión de obras ante caídas de enlace a Internet, el backend FastAPI y la base de datos residen en el servidor central de la sede (`SRV-PRORRIDRE-01`). Al caer Internet, el sistema conmuta automáticamente al **Modo Local LAN**, garantizando que los usuarios continúen emitiendo órdenes, revisando expedientes y consultando obras a velocidad Gigabit.

---

## 3. Arquitectura Tecnológica del Sistema

La solución adopta una arquitectura desacoplada de 3 capas:

```
[ CAPA DE PRESENTACIÓN / CLIENTE ]
├── Single Page Dashboard (HTML5 / Vanilla CSS3 Glassmorphism)
├── Visualización de Datos BI (Chart.js On-Premise)
└── Gemelo Digital 3D de Red (Three.js WebGL + OrbitControls)
           ▲
           │ HTTP RESTful (JSON) & WebSockets (/ws/telemetria)
           ▼
[ CAPA DE APLICACIÓN Y LÓGICA DE NEGOCIO (BACKEND) ]
├── FastAPI Core (Python 3.10 Asincrónico)
├── Módulo RBAC de Seguridad y Autenticación
├── Controladores de Métricas, Obras, Almacén, SGD y TI
└── Asistente Inteligente On-Premise (Motor NLP de Conocimiento Local)
           ▲
           │ SQLite API / SQL Transaccional ACID
           ▼
[ CAPA DE PERSISTENCIA ]
├── Base de Datos Relacional: prorridre.db
└── Unidad de Respaldo: Servidor NAS Synology (Copias automáticas)
```

### Justificación de Tecnologías:
* **FastAPI (Python):** Brinda tiempos de respuesta de milisegundos y soporte nativo para WebSockets bidireccionales de baja latencia.
* **SQLite Relacional:** Solución zero-configuration, robusta y portable, ideal para entornos On-Premise institucionales.
* **Vanilla JavaScript & CSS:** Sin sobrecargas de frameworks pesados, garantizando arranque instantáneo y compatibilidad con equipos de diferentes generaciones.
* **Three.js (WebGL):** Permite modelar el Gemelo Digital 3D del cableado estructurado y hardware de telecomunicaciones.

---

## 4. Desglose y Funcionamiento de los Módulos del Dashboard

### 4.1. Módulo de Autenticación y Control de Acceso (RBAC)
* Implementa segregación de funciones según perfiles: **Directivo**, **Residente de Obra**, **Abastecimiento** y **TI Admin**.
* Dispone de autocompletado y botones de acceso rápido para pruebas institucionales.

### 4.2. Vista Ejecutiva (Business Intelligence)
* **Tarjetas de KPIs:** Presupuesto PIM (S/ 45.6M), Avance Ejecutado (63.2%), Obras Activas (8 proyectos) y Trámites del Día (18 expedientes).
* **Gráfica de Ejecución Mensual:** Curva acumulada de inversión pública mes a mes.
* **Donut de Distribución Presupuestal:** Proporción de fondos ejecutados, comprometidos y saldo disponible.
* **Semáforo de Obras y Alertas:** Identificación visual de obras en riesgo o paralizadas (ej. Azángaro - Asillo).

### 4.3. Logística y Proyectos
Dividido en 4 subpestañas operativas:
1. **Proyectos / Obras:** Ficha técnica de 8 obras (Lampa, Huancané, Azángaro, Cabanillas, Chucuito-Juli, Ayaviri, Macusani, El Collao), con % físico vs. % financiero.
2. **Almacén y Stock:** Kardex en tiempo real con banderas de stock crítico (bolsas de cemento, aditivos, tuberías).
3. **Órdenes de Compra:** Seguimiento de adquisiciones valorizadas y estados (Pendiente, Aprobada, En Tránsito, Entregada).
4. **Activos Fijos (EAM):** Auditoría del parque informático (12 PCs Windows 7 vulnerables, 25 Win10, 6 Win11) y control de maquinaria pesada por horómetro.

### 4.4. Infraestructura TI & Network Digital Twin 3D
* **Diagnóstico de Cable Ethernet RJ45:** Detecta si la estación del usuario está conectada por cable Gigabit Cat 6 o mediante Wi-Fi.
* **Gemelo Digital 3D (Three.js):** Recrea el Data Center institucional (Rack 42U, Servidor, Switch Cisco 48 puertos) y las 43 PCs de las oficinas.
* **Simulador de Bucle de Red (Switching Loop):** Simula bucles de broadcast y permite activar el aislamiento de puertos (STP).
* **Mapa Topológico de Red LAN:** Diagrama interactivo de niveles (Módem ONT -> Firewall -> Switch Core -> Oficinas).

### 4.5. Centro de Alertas Inteligentes
* Clasificación de alertas institucionales por severidad: **Muy Urgentes (MU)**, **Urgentes (U)** y **Normales (N)**.
* Notificaciones automáticas de quiebres de inventario, vencimiento de plazos legales de valorizaciones y caídas de enlace de telecomunicaciones.

### 4.6. Emulador de Flujo Institucional (SGD & SIAF)
* Permite inyectar lotes sintéticos de 15 a 20 expedientes para probar el flujo de trámite documentario.
* Simula devengados presupuestales actualizando de forma inmediata las estadísticas del ERP.

### 4.7. Asistente Inteligente On-Premise (IA Local)
* Agente conversacional que responde dudas operativas, normativas y presupuestales sin requerir conexión a Internet.
* Proporciona respuestas inmediatas sobre saldos de proyectos, planes de contingencia y auditoría de hardware.

### 4.8. Generador de Resumen Ejecutivo
* Genera con 1 solo clic un informe ejecutivo consolidado en formato estándar para elevarlo a la Dirección Ejecutiva del GORE Puno.

---

## 5. Matriz Comparativa: Gestión Tradicional vs. Sistema ERP PRORRIDRE

| Dimensión | Gestión Tradicional (Silos de Información) | Con Sistema PRORRIDRE Smart ERP |
|---|---|---|
| **Presupuesto y Finanzas** | Conciliación manual cada 30 días con desfase respecto a campo. | Actualización en tiempo real del PIM, devengados y saldos. |
| **Control de Obras** | Cuadernos físicos y hojas Excel dispersas; retraso en alertas. | Semáforo de obras, contraste de avance físico vs. financiero. |
| **Abastecimiento y Almacén** | Quiebres de stock imprevistos en frentes de obra. | Alertas tempranas por stock mínimo enlazadas a Órdenes de Compra. |
| **Trámite Documentario** | Expedientes traspapelados o con plazos de ley vencidos. | Priorización algorítmica (MU/U/N) y trazabilidad de días. |
| **Conectividad y Red** | Parálisis total ante caídas del enlace de Internet del ISP. | Operación 100% continua en Red LAN local a 1000 Mbps. |

---

## 6. Conclusiones y Valor Académico

1. **Alineación con la Teoría de Sistemas ERP:** El proyecto demuestra de manera práctica cómo los principios de modularidad, integración horizontal y repositorio unificado resuelven la ineficiencia del sector público regional.
2. **Alta Resiliencia y Disponibilidad:** La arquitectura *Local-First* garantiza soberanía operativa e independencia frente a la inestabilidad de las redes de telecomunicaciones en zonas altoandinas.
3. **Escalabilidad y Modernidad:** El desarrollo sienta las bases para incorporar módulos avanzados de Business Intelligence predictivo y sincronización automática bidireccional con las bases de datos nacionales (MEF / OSCE).
