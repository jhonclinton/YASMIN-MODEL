/* ═══════════════════════════════════════════════════════════════
   PRORRIDRE SMART DASHBOARD — CLIENT API CONNECTOR
   Connects to FastAPI On-Premise (http://127.0.0.1:8000)
   With seamless Offline / Local Fallback for Network Disconnects
   ═══════════════════════════════════════════════════════════════ */

const API_BASE = "http://127.0.0.1:8000/api";

const Api = {
  isBackendOnline: false,

  /** Check if FastAPI backend is reachable */
  async checkHealth() {
    try {
      const res = await fetch("http://127.0.0.1:8000/", { method: "GET", mode: "cors", cache: "no-cache", signal: AbortSignal.timeout(1500) });
      this.isBackendOnline = res.ok;
    } catch (e) {
      this.isBackendOnline = false;
    }
    return this.isBackendOnline;
  },

  /** Login endpoint */
  async login(username, password, rol) {
    if (await this.checkHealth()) {
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, rol: rol || null })
        });
        const data = await res.json();
        if (!res.ok) {
          return { success: false, message: data.detail || "Error en autenticación" };
        }
        // Save session locally so dashboard immediately recognizes authenticated user
        if (data.session) {
          localStorage.setItem(Auth.SESSION_KEY, JSON.stringify(data.session));
        }
        if (data.token) {
          localStorage.setItem(Auth.TOKEN_KEY, data.token);
        }
        return { success: true, token: data.token, session: data.session, source: "FastAPI REST" };
      } catch (err) {
        console.warn("Backend error, falling back to local Auth:", err);
      }
    }
    // Fallback to local Auth
    return Auth.login(username, password);
  },

  /** Register endpoint */
  async register(userData) {
    if (await this.checkHealth()) {
      try {
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(userData)
        });
        const data = await res.json();
        if (!res.ok) {
          return { success: false, message: data.detail || "Error al registrar usuario." };
        }
        // Save session locally so user is immediately logged in
        if (data.session) {
          localStorage.setItem(Auth.SESSION_KEY, JSON.stringify(data.session));
        }
        if (data.token) {
          localStorage.setItem(Auth.TOKEN_KEY, data.token);
        }
        return { success: true, token: data.token, session: data.session, message: data.message, source: "FastAPI REST" };
      } catch (err) {
        console.warn("Backend error during register, falling back to local Auth:", err);
      }
    }
    // Fallback to local Auth registration
    return Auth.register(userData);
  },

  /** Get Metrics */
  async getMetricas() {
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE}/metricas`);
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback to mock metricas", e); }
    }
    return MOCK_KPIS;
  },

  /** Get Projects / Obras */
  async getObras() {
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE}/obras`);
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback to mock obras", e); }
    }
    return MOCK_PROYECTOS;
  },

  /** Get Expedientes SGD */
  async getExpedientes(filtros = {}) {
    if (this.isBackendOnline) {
      try {
        let url = `${API_BASE}/expedientes`;
        const params = new URLSearchParams();
        if (filtros.prioridad) params.append("prioridad", filtros.prioridad);
        if (filtros.estado) params.append("estado", filtros.estado);
        if (params.toString()) url += `?${params.toString()}`;

        const res = await fetch(url);
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback to mock expedientes", e); }
    }
    return MOCK_EXPEDIENTES;
  },

  /** Simular ingreso diario de 15-20 expedientes SGD */
  async simularIngresoSGD(cantidad = 15) {
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE}/expedientes/simular-ingreso?cantidad=${cantidad}`, { method: "POST" });
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback for SGD simulation", e); }
    }
    // Emulador local en navegador si backend está desconectado
    const generados = [];
    const hoy = new Date().toISOString().split("T")[0];
    const rems = ["Residencia Lampa", "Residencia Huancané", "Consorcio Supervisor", "Taller Mecánico", "Comunidad Campesina"];
    const asuntos = [
      "Requerimiento de geomembrana para reservorio R-3",
      "Adquisición de combustible Diésel B5 (1,000 gal)",
      "Valorización de obra N° 07 para trámite de pago",
      "Mantenimiento correctivo de cargador frontal CAT 950",
      "Informe técnico de avance por precipitación pluvial"
    ];
    for (let i = 0; i < cantidad; i++) {
      const prio = Math.random() < 0.35 ? "MU" : (Math.random() < 0.75 ? "U" : "N");
      const nuevo = {
        id: `EXP-2026-${(MOCK_EXPEDIENTES.length + i + 420).toString().padStart(4, "0")}`,
        asunto: asuntos[i % asuntos.length],
        remitente: rems[i % rems.length],
        destinatario: "Dirección de Obras / Abastecimiento",
        fechaIngreso: hoy,
        prioridad: prio,
        estado: "En Trámite",
        diasTramite: Math.floor(Math.random() * 3) + 1,
        observacion: prio === "MU" ? "Atención prioritaria requerida por riesgo de paralización" : "Trámite documentario regular"
      };
      MOCK_EXPEDIENTES.unshift(nuevo);
      generados.push(nuevo);
    }
    return {
      success: true,
      generados: generados.length,
      mensaje: `Simulador SGD: Se registraron ${generados.length} expedientes diarios (clasificados automáticamente).`,
      expedientes: generados
    };
  },

  /** Consultar Asistente Inteligente On-Premise */
  async consultarAsistente(pregunta, rol = "Directivo") {
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE}/asistente/consultar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pregunta, usuario_rol: rol })
        });
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback for AI Assistant", e); }
    }

    // Knowledge Engine Local integrado en el cliente
    const texto = (pregunta || "").toLowerCase();
    let respuesta = "";

    const ipMatch = texto.match(/\b(192\.168\.\d+\.\d+|\b\d+\.\d+\.\d+\.\d+)\b/);
    if (ipMatch) {
      const targetIp = ipMatch[0];
      respuesta = `🔍 **Dispositivo Identificado por IP (${targetIp}):**\n\n• Se ha consultado el inventario digital de red de PRORRIDRE.\n• Para enfocar la cámara y ver el rack/puesto en 3D, escribe **${targetIp}** en el buscador de la pestaña Infraestructura TI.\n• Segmento: Red LAN Gigabit 1000 Mbps On-Premise.`;
    } else if (texto.includes("pim") || texto.includes("presupuesto") || texto.includes("cuanto") || texto.includes("dinero")) {
      respuesta = `📊 **Diagnóstico Presupuestal PRORRIDRE 2026:**\n\n• **PIM Oficial:** S/ 45,637,342 (GORE Puno).\n• **Devengado Ejecutado:** S/ 28,745,210 (63.0%).\n• **Compromiso Anual:** S/ 5,230,100 (11.5%).\n• **Saldo Disponible:** S/ 11,662,032.\n💡 *Recomendación:* Priorizar devengados de obras en Huancané y Azángaro.`;
    } else if (texto.includes("internet") || texto.includes("red") || texto.includes("caida") || texto.includes("lan") || texto.includes("bucle")) {
      respuesta = `🌐 **Diagnóstico de Conectividad y Red:**\n\n• **Enlace Externo:** Intermitente con bucle de caída recurrente de hasta 2 horas.\n• **Red Local LAN (1000 Mbps):** 100% operativa a Gigabit Ethernet.\n• **Modo Local:** El Dashboard y ERPNext operan con total autonomía On-Premise sin detener las operaciones.`;
    } else if (texto.includes("servidor") || texto.includes("backup") || texto.includes("spof") || texto.includes("ti")) {
      respuesta = `🖥️ **Infraestructura y Servidor Único:**\n\n• **SRV-PRORRIDRE-01:** Aloja Base de Datos, SGD y ERPNext.\n• **Peligro Crítico:** Punto único de falla (SPOF) gestionado por 1 solo operador de TI.\n• **Respaldos:** Última copia validada a las 03:00 hrs. Se recomienda adquirir unidad NAS externa urgente.`;
    } else if (texto.includes("obra") || texto.includes("lampa") || texto.includes("taraco") || texto.includes("azangaro")) {
      respuesta = `🏗️ **Estado de Obras de Riego (8 Proyectos):**\n\n• **Lampa:** 72% físico, ejecución normal.\n• **Taraco-Huancané:** 68% físico, 🔴 Valorización N° 06 vence en 48h.\n• **Azángaro:** 32% físico, ⚠️ Paralizada temporalmente por abastecimiento y clima.\n• **Cabanillas:** 78% físico, conforme al cronograma.`;
    } else if (texto.includes("expediente") || texto.includes("sgd") || texto.includes("mu")) {
      respuesta = `📄 **SGD Institucional:**\n\n• Sistema clasifica automáticamente prioridades:\n  🔴 **MU:** Muy Urgente / Plazo de ley en riesgo.\n  🟡 **U:** Urgente / Trámite regular de obras.\n  🟢 **N:** Normal / Documentación de archivo.\n💡 *Simulador:* Puedes presionar "Simular Ingreso Diario" para cargar el flujo de 15 a 20 expedientes.`;
    } else {
      respuesta = `🤖 **Asistente Inteligente PRORRIDRE:**\nPuedo orientarte sobre:\n1. Presupuesto PIM S/ 45.6M y avance SIAF.\n2. Conectividad LAN 1000 Mbps y contingencia ante caídas de enlace.\n3. Obras de Riego (Lampa, Taraco, Azángaro, etc.).\n4. SGD (Expedientes y prioridades 🔴MU, 🟡U, 🟢N).\n5. Servidor On-Premise y copias de seguridad.`;
    }

    return {
      success: true,
      pregunta,
      respuesta,
      fuente: "PRORRIDRE Local Knowledge Engine (On-Premise)"
    };
  },

  /** Diagnóstico del cable de red y tarjeta de red del equipo actual */
  async getMiConexion() {
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE}/infraestructura/mi-conexion`);
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback for host connection", e); }
    }
    // Fallback local
    return {
      equipo: "ESTACION-LOCAL-PRORRIDRE",
      cable_conectado: true,
      interfaz_nombre: "Ethernet (Gigabit PCIe Controller)",
      tipo_cable: "Cable Ethernet RJ45 (Cat 6)",
      velocidad_mbps: 1000,
      duplex: "Full Duplex",
      ip_local: "192.168.0.10",
      mac_address: "B4:2E:99:A1:7C:1F",
      gateway_lan: "192.168.1.1",
      switch_conectado: "Switch Core Cisco SG350 (Puerto GbE-12)",
      oficina_ubicacion: "Oficina Central PRORRIDRE — Sede Puno",
      internet_online: true,
      motivo_falla: "Sin fallas reportadas",
      lan_operativa: true
    };
  },

  /** Obtener mapa de topología de red de todas las oficinas */
  async getTopologiaRed() {
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE}/infraestructura/topologia`);
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback for network topology", e); }
    }
    // Fallback local si backend no responde
    return {
      enlace_isp: { id: "WAN-ISP-01", tipo: "Fibra Óptica / Microondas", proveedor: "Telefónica del Perú (50 Mbps)", estado: "online", ip_publica: "190.119.45.82" },
      equipos_core: [
        { id: "MODEM-01", nombre: "Módem Óptico ONT Huawei HG8245H", ip: "192.168.1.254", tipo: "modem", ubicacion: "Rack Sala de Servidores", estado: "online" },
        { id: "ROUTER-01", nombre: "Router & Firewall Fortinet FG-60F", ip: "192.168.1.1", tipo: "router", ubicacion: "Rack Sala de Servidores", estado: "online" },
        { id: "SWITCH-CORE", nombre: "Switch Core Cisco SG350-48P", ip: "192.168.1.2", tipo: "switch_core", puertos_totales: 48, puertos_activos: 38, velocidad: "1000 Mbps GbE", ubicacion: "Rack Central TI", estado: "online" },
        { id: "SRV-CENTRAL", nombre: "Servidor Único SRV-PRORRIDRE-01", ip: "192.168.1.100", tipo: "servidor", servicios: ["FastAPI", "SQLite", "SGD", "ERPNext Local"], ubicacion: "Sala TI (SPOF)", estado: "online" },
        { id: "NAS-BACKUP", nombre: "Unidad NAS Synology", ip: "192.168.1.105", tipo: "nas", ubicacion: "Rack Sala de Servidores", estado: "online" }
      ],
      oficinas: [
        {
          nombre: "Dirección Ejecutiva",
          switch_id: "SW-DIR",
          pcs: [
            { id: "PC-DIR-01", usuario: "Director Ejecutivo", ip: "192.168.1.10", cable: "Cat 6 GbE", estado: "online" },
            { id: "PC-DIR-02", usuario: "Secretaría General", ip: "192.168.1.11", cable: "Cat 6 GbE", estado: "online" },
            { id: "IMP-DIR-01", usuario: "Impresora Red Kyocera", ip: "192.168.1.12", cable: "Cat 6 GbE", estado: "online" }
          ]
        },
        {
          nombre: "Dirección de Obras y Supervisión",
          switch_id: "SW-OBRAS",
          pcs: [
            { id: "PC-OBR-01", usuario: "Residente Lampa", ip: "192.168.1.20", cable: "Cat 6 GbE", estado: "online" },
            { id: "PC-OBR-02", usuario: "Residente Huancané", ip: "192.168.1.21", cable: "Cat 6 GbE", estado: "online" },
            { id: "PC-OBR-03", usuario: "Residente Azángaro", ip: "192.168.1.22", cable: "Cat 6 GbE", estado: "online" },
            { id: "PC-OBR-04", usuario: "Residente Cabanillas", ip: "192.168.1.23", cable: "Cat 6 GbE", estado: "online" },
            { id: "PC-OBR-05", usuario: "CAD / GIS Hidráulica", ip: "192.168.1.24", cable: "Cat 6 GbE", estado: "online" }
          ]
        },
        {
          nombre: "Abastecimiento y Almacén Central",
          switch_id: "SW-LOG",
          pcs: [
            { id: "PC-LOG-01", usuario: "Jefe de Abastecimiento", ip: "192.168.1.30", cable: "Cat 6 GbE", estado: "online" },
            { id: "PC-LOG-02", usuario: "Especialista SIGA/SIAF", ip: "192.168.1.31", cable: "Cat 6 GbE", estado: "online" },
            { id: "PC-LOG-03", usuario: "Kardex de Almacén", ip: "192.168.1.32", cable: "Cat 6 GbE", estado: "online" }
          ]
        },
        {
          nombre: "Informática y Soporte TI",
          switch_id: "SW-TI",
          pcs: [
            { id: "PC-TI-HOST", usuario: "TU COMPUTADORA (Host Actual)", ip: "192.168.0.10", cable: "Cat 6 Gigabit 1000 Mbps", estado: "online", es_mi_equipo: true },
            { id: "PC-TI-02", usuario: "Soporte Técnico LAN", ip: "192.168.1.41", cable: "Cat 6 GbE", estado: "online" }
          ]
        }
      ]
    };
  },

  /** Simular / alternar falla de enlace a Internet */
  async simularFallaInternet(forzar) {
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE}/infraestructura/simular-falla-internet`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forzar_falla: forzar })
        });
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback for failure simulation", e); }
    }
    return { success: true, simulacion_activa: forzar };
  },

  /** Obtener el Digital Twin Completo de PRORRIDRE (43 PCs, 26 Impresoras, Servidor SPOF, Switches) */
  async getDigitalTwin() {
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE}/infraestructura/digital-twin`);
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback for digital twin", e); }
    }
    return null;
  },

  /** Buscar dispositivos o IPs mediante el motor unificado de red */
  async buscarDispositivo(query) {
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE}/infraestructura/buscar-dispositivo?q=${encodeURIComponent(query)}`);
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback for device search", e); }
    }
    return { total: 0, query, resultados: [] };
  },

  /** Ejecutar Escaneo Activo Local en red PRORRIDRE */
  async escanearRedLocal() {
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE}/infraestructura/escanear-red-local`, { method: "POST" });
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback for network scan", e); }
    }
    return {
      success: true,
      cable_fisico_detectado: true,
      modo_escaneo: "Escaneo Emulado de Alta Fidelidad",
      subred_escaneada: "192.168.1.0/24 (LAN PRORRIDRE)",
      dispositivos_encontrados: 86,
      tiempo_escaneo_segundos: 1.25,
      latencia_promedio_ms: 3.4
    };
  },

  /** Obtener Dispositivos Reales por ARP y Fabricante OUI Físico */
  async obtenerArpDispositivosReales() {
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE}/infraestructura/arp-dispositivos-reales`);
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback for real ARP table", e); }
    }
    return { total_dispositivos_fisicos_detectados: 0, dispositivos: [] };
  },

  /** Simular Bucle de Red (Switching Loop / Broadcast Storm de hasta 2h) */
  async simularBucleRed(activar) {
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE}/infraestructura/simular-bucle-red`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activar_bucle: activar })
        });
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback for loop simulation", e); }
    }
    return { success: true, bucle_activo: activar };
  },

  /** Aislar Bucle de Red mediante protocolo STP BPDU Guard */
  async aislarBucleRed() {
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE}/infraestructura/aislar-bucle-red`, { method: "POST" });
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback for loop isolation", e); }
    }
    return { success: true, bucle_activo: false };
  },

  /** Advanced IP Scanner: Obtener lista completa de equipos vivos y servicios */
  async getDispositivosVivos() {
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE}/infraestructura/dispositivos-vivos`);
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback for live devices", e); }
    }
    return null;
  },

  /** Advanced IP Scanner: Conectar dinámicamente una nueva computadora a la red */
  async conectarDispositivo(devData) {
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE}/infraestructura/conectar-dispositivo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(devData)
        });
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback for connect device", e); }
    }
    return { success: false, message: "Backend offline" };
  },

  /** Advanced IP Scanner: Desconectar computadora dinámica */
  async desconectarDispositivo(ip) {
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE}/infraestructura/desconectar-dispositivo/${encodeURIComponent(ip)}`, {
          method: "DELETE"
        });
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback for disconnect device", e); }
    }
    return { success: false, message: "Backend offline" };
  },

  /** Advanced IP Scanner: Disparar escaneo de subred activo y auto-detección física */
  async runAdvancedIpScan() {
    if (this.isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE}/infraestructura/advanced-ip-scan`, { method: "POST" });
        if (res.ok) return await res.json();
      } catch (e) { console.warn("API fallback for advanced ip scan", e); }
    }
    return { status: "error", message: "Backend offline" };
  },

  async inventoryRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}/infraestructura/dispositivos${path}`, options);
    const data = await response.json();
    if (!response.ok) {
      const detail = data.detail;
      const error = new Error(typeof detail === "string" ? detail : detail?.message || "No se pudo guardar el cambio.");
      error.status = response.status;
      error.equipo = typeof detail === "object" ? detail?.equipo : null;
      throw error;
    }
    return data;
  },

  async getNetworkInventory() {
    return this.inventoryRequest("");
  },

  async createNetworkDevice(device) {
    return this.inventoryRequest("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(device)
    });
  },

  async updateNetworkDevice(id, changes) {
    return this.inventoryRequest(`/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes)
    });
  },

  async deleteNetworkDevice(id) {
    return this.inventoryRequest(`/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async getNetworkDeviceHistory(id) {
    return this.inventoryRequest(`/${encodeURIComponent(id)}/historial`);
  },

  async undoNetworkDeviceChange(id) {
    return this.inventoryRequest(`/${encodeURIComponent(id)}/deshacer`, { method: "POST" });
  },

  /** Conexión WebSocket en tiempo real para telemetría y alertas */
  connectWebSocket(onMessage, onOpen, onClose) {
    try {
      const wsUrl = "ws://127.0.0.1:8000/ws/telemetria";
      const ws = new WebSocket(wsUrl);

      ws.onopen = (evt) => {
        console.log("🟢 WebSocket de Telemetría conectado exitosamente");
        if (onOpen) onOpen(evt);
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (onMessage) onMessage(data);
        } catch (err) {
          console.error("Error al procesar mensaje de telemetría WebSocket:", err);
        }
      };

      ws.onerror = (err) => {
        console.warn("WebSocket telemetría error:", err);
      };

      ws.onclose = (evt) => {
        console.warn("WebSocket telemetría cerrado. Reconectando en 5s...");
        if (onClose) onClose(evt);
        setTimeout(() => this.connectWebSocket(onMessage, onOpen, onClose), 5000);
      };

      return ws;
    } catch (e) {
      console.warn("No se pudo iniciar WebSocket, operando con telemetría local:", e);
      return null;
    }
  }
};
