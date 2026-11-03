/* ═══════════════════════════════════════════════════════════════
   PRORRIDRE SMART DASHBOARD — DATA LAYER (Mock)
   Programa Regional de Riego y Drenaje – GORE Puno
   ═══════════════════════════════════════════════════════════════ */

const MOCK_USERS = [
  {
    id: 1,
    dni: "70123456",
    username: "admin",
    password: "admin123",
    nombre: "Ing. Carlos Quispe Mamani",
    cargo: "Director Ejecutivo",
    rol: "Directivo",
    avatar: "assets/avatar.jpg"
  },
  {
    id: 2,
    dni: "70234567",
    username: "residente1",
    password: "residente123",
    nombre: "Ing. María Condori Apaza",
    cargo: "Residente de Obra - Proyecto Lampa",
    rol: "Residente de Obra",
    avatar: null
  },
  {
    id: 3,
    dni: "70345678",
    username: "logistica",
    password: "logistica123",
    nombre: "Lic. Juan Huanca Torres",
    cargo: "Jefe de Abastecimiento",
    rol: "Abastecimiento",
    avatar: null
  },
  {
    id: 4,
    dni: "70456789",
    username: "tiadmin",
    password: "tiadmin123",
    nombre: "Ing. Pedro Ramos Chura",
    cargo: "Responsable de TI",
    rol: "TI Admin",
    avatar: null
  }
];

const PIM_TOTAL = 45637342;

const MOCK_KPIS = {
  presupuesto: {
    pim: PIM_TOTAL,
    ejecutado: 28745210,
    comprometido: 5230100,
    porEjecutar: PIM_TOTAL - 28745210 - 5230100,
    avancePorcentaje: ((28745210 / PIM_TOTAL) * 100).toFixed(1)
  },
  expedientes: {
    recibidosHoy: 18,
    pendientes: 7,
    aprobados: 11,
    enTransito: 4,
    promedioSemanal: 85
  },
  obras: {
    total: 8,
    enEjecucion: 5,
    paralizadas: 1,
    finalizadas: 2
  },
  activos: {
    totalPCs: 43,
    win7: 12,
    win10: 25,
    win11: 6,
    maquinariaTotal: 15,
    maquinariaOperativa: 11
  }
};

const MOCK_PROYECTOS = [
  {
    id: "OBR-001",
    nombre: "Sistema de Riego Lampa - Sector Norte",
    ubicacion: "Provincia de Lampa",
    lat: -15.36,
    lng: -70.37,
    presupuesto: 8500000,
    ejecutado: 5950000,
    avanceFisico: 72,
    avanceFinanciero: 70,
    estado: "En Ejecución",
    residente: "Ing. María Condori Apaza",
    fechaInicio: "2026-03-15",
    fechaFin: "2027-06-30",
    prioridad: "normal",
    hitos: [
      { nombre: "Estudios preliminares", completado: true },
      { nombre: "Excavación de canales", completado: true },
      { nombre: "Instalación de tuberías", completado: false },
      { nombre: "Pruebas hidráulicas", completado: false }
    ]
  },
  {
    id: "OBR-002",
    nombre: "Drenaje Pluvial Juliaca - Fase II",
    ubicacion: "Provincia de San Román",
    lat: -15.50,
    lng: -70.13,
    presupuesto: 12300000,
    ejecutado: 3690000,
    avanceFisico: 30,
    avanceFinanciero: 30,
    estado: "En Ejecución",
    residente: "Ing. Roberto Flores Pari",
    fechaInicio: "2026-05-01",
    fechaFin: "2027-12-15",
    prioridad: "urgente",
    hitos: [
      { nombre: "Topografía y diseño", completado: true },
      { nombre: "Movimiento de tierras", completado: false },
      { nombre: "Construcción de alcantarillas", completado: false },
      { nombre: "Pavimentación", completado: false }
    ]
  },
  {
    id: "OBR-003",
    nombre: "Represa Chacamarca - Puno",
    ubicacion: "Provincia de Puno",
    lat: -15.84,
    lng: -70.02,
    presupuesto: 6200000,
    ejecutado: 5580000,
    avanceFisico: 92,
    avanceFinanciero: 90,
    estado: "En Ejecución",
    residente: "Ing. Luis Mamani Ccopa",
    fechaInicio: "2025-08-10",
    fechaFin: "2026-11-30",
    prioridad: "normal",
    hitos: [
      { nombre: "Cimentación", completado: true },
      { nombre: "Cuerpo de presa", completado: true },
      { nombre: "Vertedero", completado: true },
      { nombre: "Acabados y pruebas", completado: false }
    ]
  },
  {
    id: "OBR-004",
    nombre: "Canal de Irrigación Ayaviri",
    ubicacion: "Provincia de Melgar",
    lat: -14.88,
    lng: -70.59,
    presupuesto: 4800000,
    ejecutado: 0,
    avanceFisico: 0,
    avanceFinanciero: 0,
    estado: "Paralizada",
    residente: "Ing. Ana Ticona Vilca",
    fechaInicio: "2026-07-01",
    fechaFin: "2027-09-30",
    prioridad: "muy_urgente",
    motivoParalizacion: "Retraso en entrega de materiales de almacén",
    hitos: [
      { nombre: "Expediente técnico aprobado", completado: true },
      { nombre: "Movilización de equipos", completado: false },
      { nombre: "Excavación", completado: false },
      { nombre: "Revestimiento", completado: false }
    ]
  },
  {
    id: "OBR-005",
    nombre: "Mejoramiento Riego Ilave",
    ubicacion: "Provincia de El Collao",
    lat: -16.08,
    lng: -69.64,
    presupuesto: 3500000,
    ejecutado: 2450000,
    avanceFisico: 65,
    avanceFinanciero: 70,
    estado: "En Ejecución",
    residente: "Ing. Rosa Calla Huanca",
    fechaInicio: "2026-02-20",
    fechaFin: "2027-04-15",
    prioridad: "normal",
    hitos: [
      { nombre: "Estudios de campo", completado: true },
      { nombre: "Obras de captación", completado: true },
      { nombre: "Red de distribución", completado: false },
      { nombre: "Entrega a comunidad", completado: false }
    ]
  },
  {
    id: "OBR-006",
    nombre: "Presa Lagunillas - Ampliación",
    ubicacion: "Provincia de Lampa",
    lat: -15.62,
    lng: -70.65,
    presupuesto: 5200000,
    ejecutado: 5200000,
    avanceFisico: 100,
    avanceFinanciero: 100,
    estado: "Finalizada",
    residente: "Ing. Carlos Quispe Mamani",
    fechaInicio: "2025-01-10",
    fechaFin: "2026-06-30",
    prioridad: "normal",
    hitos: [
      { nombre: "Diseño estructural", completado: true },
      { nombre: "Construcción", completado: true },
      { nombre: "Pruebas de carga", completado: true },
      { nombre: "Liquidación", completado: true }
    ]
  },
  {
    id: "OBR-007",
    nombre: "Sistema de Riego Azángaro",
    ubicacion: "Provincia de Azángaro",
    lat: -14.91,
    lng: -70.19,
    presupuesto: 3100000,
    ejecutado: 3100000,
    avanceFisico: 100,
    avanceFinanciero: 100,
    estado: "Finalizada",
    residente: "Ing. Javier Puma Ramos",
    fechaInicio: "2025-04-01",
    fechaFin: "2026-08-20",
    prioridad: "normal",
    hitos: [
      { nombre: "Licitación", completado: true },
      { nombre: "Ejecución", completado: true },
      { nombre: "Supervisión final", completado: true },
      { nombre: "Cierre de proyecto", completado: true }
    ]
  },
  {
    id: "OBR-008",
    nombre: "Defensa Ribereña Río Coata",
    ubicacion: "Provincia de San Román",
    lat: -15.47,
    lng: -70.29,
    presupuesto: 2037342,
    ejecutado: 775000,
    avanceFisico: 38,
    avanceFinanciero: 38,
    estado: "En Ejecución",
    residente: "Ing. Sonia Apaza Coila",
    fechaInicio: "2026-06-15",
    fechaFin: "2027-05-30",
    prioridad: "urgente",
    hitos: [
      { nombre: "Estudios hidrológicos", completado: true },
      { nombre: "Enrocado de protección", completado: false },
      { nombre: "Gaviones", completado: false },
      { nombre: "Revegetación", completado: false }
    ]
  }
];

const MOCK_ALERTAS = [
  {
    id: "ALR-001",
    tipo: "muy_urgente",
    icono: "🔴",
    titulo: "Caída de Enlace a Internet",
    descripcion: "Enlace principal caído hace 1h 32m. Servicios web inaccesibles. ERPNext operando en modo LAN.",
    timestamp: "2026-10-13T08:34:00",
    modulo: "Infraestructura TI",
    accion: "Contactar proveedor ISP y activar enlace de contingencia"
  },
  {
    id: "ALR-002",
    tipo: "muy_urgente",
    icono: "🔴",
    titulo: "Obra Paralizada: Canal Irrigación Ayaviri",
    descripcion: "Proyecto OBR-004 detenido por 15 días. Materiales retenidos en almacén central.",
    timestamp: "2026-10-13T07:00:00",
    modulo: "Obras",
    accion: "Coordinación urgente con Jefe de Almacén"
  },
  {
    id: "ALR-003",
    tipo: "muy_urgente",
    icono: "🔴",
    titulo: "Servidor Principal sin Backup Reciente",
    descripcion: "Último backup exitoso: hace 72 horas. Riesgo de pérdida de datos críticos. UPS al 45% de capacidad.",
    timestamp: "2026-10-13T06:15:00",
    modulo: "Infraestructura TI",
    accion: "Ejecutar backup manual inmediato y revisar UPS"
  },
  {
    id: "ALR-004",
    tipo: "urgente",
    icono: "🟡",
    titulo: "7 Expedientes Pendientes de Firma Digital",
    descripcion: "Expedientes técnicos de obras requieren aprobación de Dirección. Tiempo promedio en espera: 3.2 días.",
    timestamp: "2026-10-13T09:00:00",
    modulo: "Gestión Documental",
    accion: "Revisar expedientes en SGD"
  },
  {
    id: "ALR-005",
    tipo: "urgente",
    icono: "🟡",
    titulo: "5 Órdenes de Compra Pendientes en SIGA",
    descripcion: "Requerimientos logísticos sin atender. Incluye materiales para obra OBR-002 y OBR-008.",
    timestamp: "2026-10-13T08:45:00",
    modulo: "Logística",
    accion: "Procesar órdenes en SIGA/ERPNext"
  },
  {
    id: "ALR-006",
    tipo: "urgente",
    icono: "🟡",
    titulo: "Retraso en Obra Drenaje Juliaca",
    descripcion: "Avance físico (30%) por debajo de lo programado (45%). Riesgo de incumplimiento de cronograma.",
    timestamp: "2026-10-13T07:30:00",
    modulo: "Obras",
    accion: "Reunión con Residente de Obra"
  },
  {
    id: "ALR-007",
    tipo: "normal",
    icono: "🟢",
    titulo: "Mantenimiento Programado: 43 Computadoras",
    descripcion: "Ciclo de mantenimiento preventivo trimestral. 12 equipos con Windows 7 requieren actualización.",
    timestamp: "2026-10-13T09:30:00",
    modulo: "Activos Fijos",
    accion: "Programar calendario de mantenimiento"
  },
  {
    id: "ALR-008",
    tipo: "normal",
    icono: "🟢",
    titulo: "Bitácora Semanal de Obras Actualizada",
    descripcion: "Reportes de avance semanal de 5 obras en ejecución recibidos. Pendiente consolidar resumen ejecutivo.",
    timestamp: "2026-10-13T10:00:00",
    modulo: "Obras",
    accion: "Generar resumen ejecutivo"
  },
  {
    id: "ALR-009",
    tipo: "normal",
    icono: "🟢",
    titulo: "Revisión de Maquinaria de Obra",
    descripcion: "4 de 15 maquinarias requieren servicio técnico este mes. 11 operativas actualmente.",
    timestamp: "2026-10-13T09:15:00",
    modulo: "Activos Fijos",
    accion: "Coordinar mantenimiento con proveedor"
  }
];

const MOCK_INFRAESTRUCTURA = {
  internet: {
    estado: "caido",
    proveedor: "Telefónica del Perú",
    velocidad: "50 Mbps",
    ultimaCaida: "2026-10-13T08:34:00",
    duracionCaida: "1h 32m"
  },
  servidorPrincipal: {
    estado: "activo",
    nombre: "SRV-PRORRIDRE-01",
    so: "Ubuntu Server 22.04 LTS",
    cpu: 67,
    ram: 78,
    disco: 62,
    uptime: "45 días",
    ultimoBackup: "2026-10-10T23:00:00",
    upsCapacidad: 45
  },
  redLan: {
    estado: "activo",
    velocidad: "1000 Mbps",
    dispositivosConectados: 38,
    switch: { modelo: "Cisco SG350", puertos: 48, activos: 38 },
    modem: { estado: "sin_internet", modelo: "Huawei HG8245H" }
  },
  backups: {
    nas: { estado: "advertencia", ultimoExitoso: "2026-10-10T23:00:00", espacio: "2.1 TB / 4 TB" },
    cloud: { estado: "inactivo", motivo: "Sin conexión a Internet", proveedor: "Google Workspace" }
  },
  erpnext: {
    estado: "activo_local",
    version: "14.x",
    url: "http://192.168.1.100:8000",
    modosAcceso: "Solo LAN (Internet caído)"
  }
};

const MOCK_ALMACEN = [
  { id: "MAT-001", material: "Tubería HDPE 6\"", stock: 450, unidad: "m", minimo: 200, estado: "ok", proyecto: "OBR-001" },
  { id: "MAT-002", material: "Cemento Portland Tipo I", stock: 85, unidad: "bolsas", minimo: 100, estado: "bajo", proyecto: "OBR-002" },
  { id: "MAT-003", material: "Fierro corrugado 1/2\"", stock: 320, unidad: "varillas", minimo: 150, estado: "ok", proyecto: "OBR-003" },
  { id: "MAT-004", material: "Geomembrana HDPE 1.5mm", stock: 0, unidad: "m²", minimo: 500, estado: "agotado", proyecto: "OBR-004" },
  { id: "MAT-005", material: "Agregado grueso", stock: 45, unidad: "m³", minimo: 30, estado: "ok", proyecto: "OBR-005" },
  { id: "MAT-006", material: "Gaviones 2x1x1m", stock: 25, unidad: "unid", minimo: 50, estado: "bajo", proyecto: "OBR-008" },
  { id: "MAT-007", material: "Válvulas compuerta 4\"", stock: 12, unidad: "unid", minimo: 8, estado: "ok", proyecto: "OBR-001" },
  { id: "MAT-008", material: "Diesel B5", stock: 580, unidad: "gal", minimo: 200, estado: "ok", proyecto: "General" }
];

const MOCK_ORDENES_COMPRA = [
  { id: "OC-2026-0145", descripcion: "Geomembrana HDPE para OBR-004", monto: 185000, estado: "pendiente", fechaSolicitud: "2026-09-28", proveedor: "Geosintéticos SAC" },
  { id: "OC-2026-0146", descripcion: "Cemento Portland para OBR-002", monto: 42500, estado: "pendiente", fechaSolicitud: "2026-10-01", proveedor: "UNACEM" },
  { id: "OC-2026-0147", descripcion: "Gaviones metálicos para OBR-008", monto: 67800, estado: "pendiente", fechaSolicitud: "2026-10-05", proveedor: "Prodac SAC" },
  { id: "OC-2026-0148", descripcion: "Repuestos maquinaria pesada", monto: 23400, estado: "aprobada", fechaSolicitud: "2026-10-02", proveedor: "Ferreyros SAA" },
  { id: "OC-2026-0149", descripcion: "Equipos de cómputo (reemplazo Win7)", monto: 96000, estado: "pendiente", fechaSolicitud: "2026-10-08", proveedor: "Dell Perú" }
];

const EXPEDIENTES_PENDIENTES = [
  { id: "EXP-2026-1234", asunto: "Aprobación Expediente Técnico OBR-008", area: "Dirección Ejecutiva", dias: 5, tipo: "Aprobación" },
  { id: "EXP-2026-1235", asunto: "Informe Mensual Avance Obras Oct-2026", area: "Supervisión", dias: 2, tipo: "Revisión" },
  { id: "EXP-2026-1236", asunto: "Conformidad de Servicio - Topografía", area: "Administración", dias: 4, tipo: "Firma" },
  { id: "EXP-2026-1237", asunto: "Solicitud de Ampliación Presupuestal", area: "Dirección Ejecutiva", dias: 7, tipo: "Aprobación" },
  { id: "EXP-2026-1238", asunto: "Resolución de Adicional OBR-003", area: "Asesoría Legal", dias: 3, tipo: "Revisión" },
  { id: "EXP-2026-1239", asunto: "Valorización Mensual OBR-001", area: "Supervisión", dias: 1, tipo: "Firma" },
  { id: "EXP-2026-1240", asunto: "TDR para Consultoría Ambiental", area: "Estudios", dias: 6, tipo: "Aprobación" }
];

/* Datos para gráficos de ejecución mensual */
const EJECUCION_MENSUAL = [
  { mes: "Ene", ejecutado: 1850000, programado: 2200000 },
  { mes: "Feb", ejecutado: 2100000, programado: 2500000 },
  { mes: "Mar", ejecutado: 3200000, programado: 3000000 },
  { mes: "Abr", ejecutado: 2800000, programado: 3200000 },
  { mes: "May", ejecutado: 3500000, programado: 3800000 },
  { mes: "Jun", ejecutado: 3100000, programado: 3500000 },
  { mes: "Jul", ejecutado: 3800000, programado: 4000000 },
  { mes: "Ago", ejecutado: 3200000, programado: 3900000 },
  { mes: "Sep", ejecutado: 2900000, programado: 3800000 },
  { mes: "Oct", ejecutado: 2295210, programado: 3800000 }
];

/* Utilidades de formato */
function formatSoles(n) {
  return "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function formatPct(n) {
  return parseFloat(n).toFixed(1) + "%";
}
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} día(s)`;
}
