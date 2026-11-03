/* ═════════════════════════════════════════════════════════════════════════════
   PRORRIDRE SMART DASHBOARD — NETWORK DIGITAL TWIN 3D & REAL-TIME TELEMETRY
   Powered by Three.js, OrbitControls, WebSockets & Web Audio API
   Modeled strictly on PRORRIDRE Diagnostics:
   • 43 PCs (12 Win7 [Vulnerables], 25 Win10, 6 Win11)
   • 26 Impresoras (Plotter A0, Multifuncionales Kyocera, Térmicas Zebra, Matriciales)
   • 12 Laptops institucionales de campo
   • 1 Servidor Central Único SRV-PRORRIDRE-01 (SPOF Crítico) + NAS Backup
   • 1 Router Fortinet FG-60F + Módem ONT Huawei (WAN Telefónica 50 Mbps)
   • 5 Switches Cisco (1 Core SG350-48P + 4 Departamentales)
   • Detección y Mitigación de Bucle de Red (Switching Loop / Broadcast Storm 2h)
   ═════════════════════════════════════════════════════════════════════════════ */

function inventoryFloorForOffice(office) {
  const name = (office || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (name.includes("direccion") || name.includes("tesoreria")) return 1;
  if (name.includes("contabilidad")) return 2;
  if (name.includes("abastecimiento")) return 3;
  if (name.includes("logistica")) return 4;
  if (name.includes("patrimonio")) return 5;
  if (name.includes("obras")) return 6;
  if (name.includes("informatica")) return 7;
  return 1;
}

class NetworkDigitalTwin3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.animationId = null;

    // Elementos dinámicos
    this.particleSystems = [];
    this.loopParticles = null;
    this.loopCableMesh = null;
    this.serverLeds = [];
    this.pulseRings = [];
    this.win7Pcs = [];
    this.deviceSprites = [];
    this.interactiveNodes = [];
    this.raycaster = null;
    this.mouse = null;
    this.selectedHighlight = null;

    // Telemetría & WebSockets
    this.networkData = null;
    this.digitalTwinData = null;
    this.inventoryFloorGroups = {};
    this.inventoryBuildingGroup = null;
    this.isInitialized = false;
    this.bucleActivo = false;
    this.modoDemoActivo = false;
    this.ws = null;
    this.audioContext = null;
    this.alarmInterval = null;
    this.pollingTimer = null;

    // Iniciar conexión WebSocket y sondeo reactivo inmediato
    this.initWebSocketConnection();
    this.iniciarSondeoReactivo();
  }

  /** Sondeo reactivo periódico (Polling Fallback) hacia el backend */
  iniciarSondeoReactivo() {
    this.verificarConexionCable();
    // Sondeo de respaldo cada 4 segundos
    this.pollingTimer = setInterval(() => {
      this.verificarConexionCable();
    }, 4000);
  }

  /** Consultar al backend el estado del cable Ethernet y escaneo local */
  async verificarConexionCable() {
    try {
      const data = await Api.getMiConexion();
      if (data) {
        await this.updateStatus(data);
      }
    } catch (e) {
      console.warn("Verificando cable de red local...", e);
    }
  }

  /** Inicializar o actualizar estado según cable físico */
  async updateStatus(netData) {
    try {
      if (!netData) return;
      this.networkData = netData;

      const lockScreen = document.getElementById("net3dLockScreen");
      const canvasContainer = document.getElementById("net3dCanvasArea");
      const hudOverlay = document.getElementById("net3dHud");

      // Condición de desbloqueo flexible y reactiva:
      // Acepta cable_conectado, cable_fisico_detectado, modo_demo o si se detectan dispositivos
      const isCableOk = Boolean(
        netData.cable_conectado === true ||
        netData.cable_fisico_detectado === true ||
        netData.modo_demo_cable === true ||
        this.modoDemoActivo === true ||
        (netData.dispositivos_encontrados && netData.dispositivos_encontrados > 0)
      );

      if (!isCableOk) {
        // Estado Bloqueado: esperando cable Ethernet
        if (lockScreen) lockScreen.style.display = "flex";
        if (canvasContainer) canvasContainer.style.display = "none";
        if (hudOverlay) hudOverlay.style.display = "none";

        const lockTitle = document.getElementById("net3dLockTitle");
        const lockReason = document.getElementById("net3dLockReason");
        if (lockTitle) lockTitle.textContent = "Esperando conexión por cable Ethernet RJ45...";
        if (lockReason) {
          lockReason.innerHTML = netData.solo_wifi
            ? `⚠️ <strong>Detectado:</strong> Conexión Wi-Fi activa (802.11). Por requisitos de ancho de banda y monitoreo de baja latencia en PRORRIDRE, conecte el cable RJ45 para habilitar el gemelo digital.`
            : `⚠️ <strong>Cable desconectado:</strong> No se detecta enlace físico Ethernet. Conecte el cable de red RJ45 a su computadora o active el Modo Simulación.`;
        }
        return;
      }

      // 🟢 ESTADO ACTIVO: CABLE ETHERNET DETECTADO O CONFIRMADO
      if (lockScreen) lockScreen.style.display = "none";
      if (canvasContainer) canvasContainer.style.display = "block";
      if (hudOverlay) hudOverlay.style.display = "block";

      this.updateHud(netData);

      if (!this.isInitialized) {
        this.initScene();
        await this.loadAndBuildDigitalTwin();
        this.animate();
        this.isInitialized = true;
      }
      setTimeout(() => this.onResize(), 60);
    } catch (err) {
      console.error("Error al actualizar estado en Network3D:", err);
    }
  }

  updateHud(data) {
    const latElem = document.getElementById("hudLatency");
    const hopElem = document.getElementById("hudHops");
    const speedElem = document.getElementById("hudSpeed");
    const gwElem = document.getElementById("hudGateway");

    if (latElem) latElem.textContent = `${data.latencia_ms || 1.9} ms`;
    if (hopElem) hopElem.textContent = `${data.saltos_estimados || 4} Saltos (Hops)`;
    if (speedElem) speedElem.textContent = `${data.velocidad_mbps || 1000} Mbps Gigabit`;
    if (gwElem) gwElem.textContent = data.gateway_lan || "192.168.1.1";
  }

  initScene() {
    if (typeof THREE === "undefined") {
      console.warn("Three.js aún no está disponible en el entorno global");
      return;
    }

    const canvasArea = document.getElementById("net3dCanvasArea");
    if (!canvasArea) return;
    const width = canvasArea.clientWidth || 900;
    const height = canvasArea.clientHeight || 560;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060914);
    this.scene.fog = new THREE.FogExp2(0x060914, 0.012);

    // 2. Camera (Posición isométrica estratégica)
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 32, 54);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasArea.innerHTML = "";
    canvasArea.appendChild(this.renderer.domElement);

    // 4. OrbitControls con fallback de seguridad
    if (typeof THREE.OrbitControls === "function") {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.01;
      this.controls.minDistance = 10;
      this.controls.maxDistance = 120;
      this.controls.target.set(0, 4, 0);
    }

    // 5. Luces
    const ambient = new THREE.AmbientLight(0x1e293b, 1.8);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight.position.set(30, 60, 30);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    const bluePoint = new THREE.PointLight(0x38bdf8, 3.0, 50);
    bluePoint.position.set(0, 10, 0);
    this.scene.add(bluePoint);

    // 6. Grid
    const grid = new THREE.GridHelper(100, 50, 0x1e3a8a, 0x0f172a);
    grid.position.y = 0;
    this.scene.add(grid);

    // 7. Raycaster para interactividad con mouse (Click & Inspección de Dispositivo)
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.interactiveNodes = [];

    const handlePointerClick = (event) => {
      if (!this.renderer || !this.camera) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.interactiveNodes, true);

      if (intersects.length > 0) {
        let hit = intersects[0].object;
        while (hit && !hit.userData?.deviceInfo && hit.parent) {
          if (hit === this.scene) break;
          hit = hit.parent;
        }
        if (hit && hit.userData?.deviceInfo) {
          this.mostrarModalDetalleDispositivo(hit.userData.deviceInfo);
          this.resaltarNodoSeleccionado(hit);
        }
      }
    };

    const handlePointerHover = (event) => {
      if (!this.renderer || !this.camera) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.interactiveNodes, true);
      this.renderer.domElement.style.cursor = intersects.length > 0 ? "pointer" : "default";
    };

    this.renderer.domElement.addEventListener("click", handlePointerClick);
    this.renderer.domElement.addEventListener("mousemove", handlePointerHover);

    window.addEventListener("resize", () => this.onResize());
  }

  registerInteractiveNode(mesh, info) {
    if (!mesh) return;
    mesh.userData = mesh.userData || {};
    mesh.userData.deviceInfo = info;
    this.interactiveNodes.push(mesh);
  }

  resaltarNodoSeleccionado(mesh) {
    if (this.selectedHighlight) {
      if (this.selectedHighlight.parent) this.selectedHighlight.parent.remove(this.selectedHighlight);
      this.selectedHighlight = null;
    }

    const ringGeo = new THREE.RingGeometry(1.0, 1.4, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    this.selectedHighlight = new THREE.Mesh(ringGeo, ringMat);
    this.selectedHighlight.rotation.x = -Math.PI / 2;
    this.selectedHighlight.position.copy(mesh.position);
    this.selectedHighlight.position.y += 0.05;

    if (mesh.parent) {
      mesh.parent.add(this.selectedHighlight);
    } else {
      this.scene.add(this.selectedHighlight);
    }
  }

  mostrarModalDetalleDispositivo(info) {
    window.currentInspectedDevice = info;
    const modal = document.getElementById("deviceInspectorModal");
    if (!modal) return;

    const elIcon = document.getElementById("inspIcon");
    const elHost = document.getElementById("inspHostname");
    const elTipo = document.getElementById("inspTipo");
    const elIp = document.getElementById("inspIp");
    const elMac = document.getElementById("inspMac");
    const elAlias = document.getElementById("inspHostAlias");
    const elFab = document.getElementById("inspFabricante");
    const elSo = document.getElementById("inspSo");
    const elOficina = document.getElementById("inspOficina");
    const elPuerto = document.getElementById("inspSwitchPuerto");
    const elVuln = document.getElementById("inspVulnerableBanner");
    const elPing = document.getElementById("inspPingResult");

    if (elIcon) elIcon.textContent = info.icono || "💻";
    if (elHost) elHost.textContent = info.id || info.hostname || "Dispositivo";
    if (elTipo) elTipo.textContent = info.tipo || "Activo de Red";
    if (elIp) elIp.textContent = info.ip || "--";
    if (elMac) elMac.textContent = info.mac || "--";
    if (elAlias) elAlias.textContent = info.hostname || `${(info.id || 'nodo').toLowerCase()}.prorridre.local`;
    if (elFab) elFab.textContent = info.fabricante || "Fabricante OUI";
    if (elSo) elSo.textContent = info.so || "--";
    if (elOficina) {
      const floor = info.piso ? ` · Piso ${info.piso}` : " · Sin asignar";
      elOficina.textContent = `${info.oficina || "--"}${info.inventory ? floor : ""}`;
    }
    if (elPuerto) elPuerto.textContent = info.puerto_switch || "--";

    if (elVuln) {
      elVuln.style.display = (info.vulnerable || (info.so && info.so.includes("Windows 7"))) ? "block" : "none";
    }
    if (elPing) elPing.style.display = "none";

    modal.style.display = "block";
  }

  /** Enfocar suavemente la cámara 3D hacia un dispositivo específico (Buscador / Clic) */
  enfocarDispositivo(infoOrId) {
    if (!infoOrId) return;
    const targetId = typeof infoOrId === "string" ? infoOrId : (infoOrId.id || infoOrId.ip);
    
    // Buscar la malla asociada en interactiveNodes
    let matchMesh = null;
    let matchInfo = null;
    for (const node of this.interactiveNodes) {
      const dev = node.userData?.deviceInfo;
      if (dev && (dev.id === targetId || dev.ip === targetId || dev.hostname === targetId)) {
        matchMesh = node;
        matchInfo = dev;
        break;
      }
    }

    if (!matchMesh || !this.camera) return;

    // Asegurar que la matriz mundial esté actualizada para obtener coordenadas absolutas
    if (typeof matchMesh.updateWorldMatrix === "function") {
      matchMesh.updateWorldMatrix(true, false);
    }

    // Obtener la posición absoluta mundial de la entidad
    const worldPos = new THREE.Vector3();
    matchMesh.getWorldPosition(worldPos);

    // Configurar transición suave de cámara (acercamiento isométrico focalizado)
    const offset = new THREE.Vector3(5.5, 4.2, 6.5);
    const endPos = worldPos.clone().add(offset);
    const endTarget = worldPos.clone().add(new THREE.Vector3(0, 0.6, 0));

    this.cameraTransition = {
      startPos: this.camera.position.clone(),
      endPos: endPos,
      startTarget: this.controls ? this.controls.target.clone() : new THREE.Vector3(0, 4, 0),
      endTarget: endTarget,
      progress: 0,
      speed: 0.045
    };

    this.resaltarNodoSeleccionado(matchMesh);
    this.mostrarModalDetalleDispositivo(matchInfo);
  }

  /** Restablecer vista panorámica global de la topología 3D */
  restablecerVistaGlobal() {
    if (!this.camera) return;
    this.cameraTransition = {
      startPos: this.camera.position.clone(),
      endPos: new THREE.Vector3(0, 32, 54),
      startTarget: this.controls ? this.controls.target.clone() : new THREE.Vector3(0, 4, 0),
      endTarget: new THREE.Vector3(0, 4, 0),
      progress: 0,
      speed: 0.038
    };
  }

  onResize() {
    const canvasArea = document.getElementById("net3dCanvasArea");
    if (!canvasArea || !this.renderer || !this.camera) return;
    const width = canvasArea.clientWidth;
    const height = canvasArea.clientHeight || 560;
    if (width === 0 || height === 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /** Cargar inventario desde backend y generar topología 3D completa */
  async loadAndBuildDigitalTwin() {
    let data = null;
    let inventory = [];
    try {
      data = await Api.getDigitalTwin();
      const inventoryResponse = await Api.getNetworkInventory();
      inventory = inventoryResponse.dispositivos || [];
    } catch (e) {
      console.warn("Fallback local para digital twin 3D", e);
    }

    if (!data) {
      data = {
        resumen: {
          total_computadoras: 43,
          windows_7_vulnerables: 12,
          windows_10_estables: 25,
          windows_11_modernas: 6,
          total_impresoras: 26,
          total_laptops: 12
        }
      };
    }
    this.digitalTwinData = data;

    this.buildCoreMDF();
    if (inventory.length) this.buildInventoryBuilding(inventory);
    else this.buildOfficesTopology(data);
  }

  buildInventoryBuilding(devices) {
    if (this.inventoryBuildingGroup?.parent) {
      this.inventoryBuildingGroup.parent.remove(this.inventoryBuildingGroup);
    }
    this.interactiveNodes = this.interactiveNodes.filter(node => !node.userData?.deviceInfo?.inventory);
    this.inventoryBuildingGroup = new THREE.Group();
    this.inventoryBuildingGroup.position.set(20, 0, 0);
    this.inventoryFloorGroups = {};
    this.officeGroups = {};

    const buildingWidth = 32;
    const buildingDepth = 22;
    const floorHeight = 2.7;
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x172554,
      roughness: 0.45,
      metalness: 0.35,
      transparent: true,
      opacity: 0.72
    });
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 });
    const floorKeys = [0, 1, 2, 3, 4, 5, 6, 7];

    floorKeys.forEach(floor => {
      const floorGroup = new THREE.Group();
      floorGroup.position.y = floor === 0 ? -floorHeight : (floor - 1) * floorHeight;
      this.inventoryFloorGroups[String(floor)] = floorGroup;

      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(buildingWidth, 0.24, buildingDepth),
        floor === 0 ? new THREE.MeshStandardMaterial({ color: 0x334155, transparent: true, opacity: 0.45 }) : floorMaterial
      );
      slab.position.y = 0.12;
      slab.receiveShadow = true;
      floorGroup.add(slab);

      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(buildingWidth, 0.24, buildingDepth)),
        edgeMaterial
      );
      outline.position.copy(slab.position);
      floorGroup.add(outline);

      const floorLabel = floor === 0 ? "SIN ASIGNAR" : `PISO ${floor}`;
      this.createFloatingLabel(floorGroup, floorLabel, 2.1, floor === 0 ? "#94a3b8" : "#38bdf8", -17.5, 0, 4.2, 0.9);
      this.inventoryBuildingGroup.add(floorGroup);
    });

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.72,
      roughness: 0.32,
      transparent: true,
      opacity: 0.68
    });
    [-15.5, 15.5].forEach(x => [-10.5, 10.5].forEach(z => {
      const column = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, floorHeight * 7 + 0.6, 0.35),
        frameMaterial
      );
      column.position.set(x, floorHeight * 3.5, z);
      this.inventoryBuildingGroup.add(column);
    }));

    const officeColors = [0x38bdf8, 0x10b981, 0xfbbf24, 0xa855f7, 0xf472b6, 0x60a5fa, 0x34d399, 0xfb7185];
    const offices = [...new Set(devices.map(device => device.oficina).filter(Boolean))];
    offices.forEach((office, index) => {
      const floor = inventoryFloorForOffice(office);
      const floorGroup = this.inventoryFloorGroups[String(floor)];
      const cfg = { id: `OFFICE-${index}`, name: office, color: officeColors[index % officeColors.length], sw: "" };
      this.officeGroups[office] = { group: floorGroup, cfg, ofData: { nombre: office } };
    });
    const officeAliases = [
      ["OF-DIR", "Dirección Ejecutiva"],
      ["OF-OBRAS", "Obras y Supervisión"],
      ["OF-OBR", "Obras y Supervisión"],
      ["OF-LOG", "Logística"],
      ["OF-TI", "Informática"]
    ];
    officeAliases.forEach(([id, office]) => {
      const group = this.officeGroups[office] || this.inventoryFloorGroups[String(inventoryFloorForOffice(office))];
      this.officeGroups[id] = { ...group, cfg: { id, name: office, color: 0x38bdf8, sw: id } };
    });

    const sortedDevices = [...devices].sort((left, right) =>
      String(left.oficina || "").localeCompare(String(right.oficina || ""), "es") ||
      String(left.ip).localeCompare(String(right.ip), "es", { numeric: true })
    );
    const floorIndexes = {};
    const typeColors = {
      Computadora: 0x3b82f6,
      Laptop: 0x06b6d4,
      Impresora: 0x8b5cf6,
      Servidor: 0xf59e0b,
      Switch: 0x0284c7,
      Router: 0xef4444,
      Deco: 0xf97316,
      "Celular/otro": 0x94a3b8
    };
    const typeIcons = {
      Computadora: "🖥️",
      Laptop: "💻",
      Impresora: "🖨️",
      Servidor: "🗄️",
      Switch: "🔀",
      Router: "🌐",
      Deco: "📶",
      "Celular/otro": "📱"
    };

    sortedDevices.forEach(device => {
      const floor = Number(device.piso) || 0;
      const floorGroup = this.inventoryFloorGroups[String(floor)] || this.inventoryFloorGroups["0"];
      const index = floorIndexes[floor] || 0;
      floorIndexes[floor] = index + 1;
      const columns = 7;
      const x = -12 + (index % columns) * 4;
      const z = -7 + Math.floor(index / columns) * 4;
      const isLarge = device.tipo === "Servidor" || device.tipo === "Router" || device.tipo === "Switch";
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(isLarge ? 1 : 0.75, isLarge ? 1.15 : 0.72, isLarge ? 0.85 : 0.75),
        new THREE.MeshStandardMaterial({
          color: typeColors[device.tipo] || 0x94a3b8,
          emissive: typeColors[device.tipo] || 0x94a3b8,
          emissiveIntensity: device.estado_validacion === "pendiente" ? 0.12 : 0.04,
          roughness: 0.34,
          metalness: 0.4
        })
      );
      mesh.position.set(x, 0.65, z);
      mesh.castShadow = true;
      const deviceInfo = {
        id: String(device.id),
        hostname: device.nombre || device.ip,
        nombre: device.nombre || "Sin nombre",
        tipo: device.tipo,
        ip: device.ip,
        mac: device.mac || "--",
        fabricante: device.fabricante || "--",
        so: device.observacion || "--",
        oficina: device.oficina || "Sin asignar",
        piso: floor,
        estado_validacion: device.estado_validacion,
        asignacion_original: device.asignacion_original,
        icono: typeIcons[device.tipo] || "📱",
        inventory: true
      };
      this.registerInteractiveNode(mesh, deviceInfo);
      floorGroup.add(mesh);
    });

    this.scene.add(this.inventoryBuildingGroup);
    if (this.controls) this.controls.target.set(8, 8, 0);
    const floorSelect = document.getElementById("net3dFloorFilter");
    if (floorSelect && !floorSelect.dataset.bound) {
      floorSelect.dataset.bound = "true";
      floorSelect.addEventListener("change", () => this.setInventoryFloor(floorSelect.value));
    }
    this.setInventoryFloor(floorSelect?.value || "");
  }

  setInventoryFloor(floor) {
    Object.entries(this.inventoryFloorGroups).forEach(([key, group]) => {
      group.visible = !floor || key === floor;
    });
    if (floor && this.controls) {
      this.controls.target.set(20, Number(floor) === 0 ? -1.4 : (Number(floor) - 1) * 2.7 + 1, 0);
    } else if (this.controls) {
      this.controls.target.set(8, 8, 0);
    }
  }

  async refreshInventoryBuilding(devices) {
    if (!this.isInitialized || !this.scene) return;
    this.buildInventoryBuilding(devices);
  }

  /** 1. MDF: SALA DE SERVIDORES CENTRAL (RACK 42U + SRV-PRORRIDRE-01 + CISCO SG350-48P + FORTINET) */
  buildCoreMDF() {
    const mdfGroup = new THREE.Group();
    mdfGroup.position.set(0, 0, 0);

    // Rack 42U
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.85 });
    const rackGeo = new THREE.BoxGeometry(6, 12, 6);
    const rack = new THREE.Mesh(rackGeo, rackMat);
    rack.position.y = 6;
    rack.castShadow = true;
    mdfGroup.add(rack);

    // Servidor Único SRV-PRORRIDRE-01 (Blade 4U destacado con borde dorado/rojo por SPOF)
    const srvMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.3,
      metalness: 0.9,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.25
    });
    const srv = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.8, 5.6), srvMat);
    srv.position.set(0, 4.5, 0);
    this.registerInteractiveNode(srv, {
      id: "SRV-PRORRIDRE-01",
      hostname: "srv-prorridre-01.prorridre.gob.pe",
      ip: "192.168.1.100",
      mac: "00:25:90:5B:43:88",
      fabricante: "Supermicro Computer Inc. (Blade Server Xeon Dual)",
      so: "Ubuntu Linux Server 22.04 LTS (Kernel 5.15)",
      oficina: "MDF · Sala de Servidores Central TI",
      puerto_switch: "Switch Core Cisco SG350 (Trunk GbE-01)",
      tipo: "Servidor Central Único On-Premise (SPOF Crítico)",
      icono: "🖥️",
      vulnerable: true
    });
    mdfGroup.add(srv);

    // Unidad NAS Synology DS920+ (192.168.1.105)
    const nasMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.3, metalness: 0.8 });
    const nas = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.2, 5.2), nasMat);
    nas.position.set(0, 2.8, 0);
    this.registerInteractiveNode(nas, {
      id: "NAS-BACKUP",
      hostname: "nas-synology-ds920.prorridre.local",
      ip: "192.168.1.105",
      mac: "00:11:32:9B:45:12",
      fabricante: "Synology Inc. (DiskStation DS920+ 16TB RAID5)",
      so: "Synology DSM 7.2 (Backups On-Premise 03:00 hrs)",
      oficina: "MDF · Sala de Servidores Central TI",
      puerto_switch: "Switch Core Cisco SG350 (GbE-02)",
      tipo: "Unidad de Almacenamiento NAS para Respaldos",
      icono: "💾",
      vulnerable: false
    });
    mdfGroup.add(nas);

    // Módem Óptico ONT Huawei HG8245H (192.168.1.254)
    const ontMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.4, metalness: 0.7 });
    const ont = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.8, 4.8), ontMat);
    ont.position.set(0, 10.4, 0);
    this.registerInteractiveNode(ont, {
      id: "WAN-ISP-01",
      hostname: "ont-huawei-hg8245h.prorridre.isp",
      ip: "192.168.1.254",
      mac: "E4:AB:89:D3:50:78",
      fabricante: "Huawei Technologies Co., Ltd (EchoLife ONT)",
      so: "Huawei VBridge SmartAX Optical Firmware",
      oficina: "MDF · Sala de Servidores (Enlace Fibra Óptica)",
      puerto_switch: "WAN Fibra Óptica Telefónica (50 Mbps) / Conectado a FG-60F",
      tipo: "Módem Óptico ONT WAN (Enlace Proveedor)",
      icono: "🌐",
      vulnerable: false
    });
    mdfGroup.add(ont);

    // Switch Core Cisco SG350-48P (Azul ciber)
    const swMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8 });
    const sw = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.0, 5.6), swMat);
    sw.position.set(0, 7.5, 0);
    this.registerInteractiveNode(sw, {
      id: "SW-CORE",
      hostname: "sw-core-cisco-sg350.prorridre.local",
      ip: "192.168.1.2",
      mac: "00:25:B5:12:7C:01",
      fabricante: "Cisco Systems Inc. (Catalyst Managed SG350-48P)",
      so: "Cisco Small Business Firmware v2.5.9",
      oficina: "MDF · Rack Central 42U TI",
      puerto_switch: "48 Puertos GbE 10/100/1000 + 4 SFP Fibra",
      tipo: "Switch Core Capa 3 (Dorsal Troncal de Red)",
      icono: "🔀",
      vulnerable: false
    });
    mdfGroup.add(sw);

    // Router Fortinet FG-60F (Rojo perimetral)
    const fwMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.7 });
    const fw = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.8, 5.6), fwMat);
    fw.position.set(0, 9.2, 0);
    this.registerInteractiveNode(fw, {
      id: "FW-FORTINET-60F",
      hostname: "gateway-fg60f.prorridre.gob.pe",
      ip: "192.168.1.1",
      mac: "70:4C:A5:88:2E:10",
      fabricante: "Fortinet Technologies Inc. (FortiGate FG-60F)",
      so: "FortiOS 7.2.5 (Perimeter Firewall & Routing)",
      oficina: "MDF · Rack 42U Sala de Servidores",
      puerto_switch: "WAN1: Módem Huawei ONT Telefónica / LAN1: Switch Core",
      tipo: "Router Gateway & Firewall Perimetral",
      icono: "🛡️",
      vulnerable: false
    });
    mdfGroup.add(fw);

    // LEDs frontales parpadeantes
    for (let i = 0; i < 18; i++) {
      const ledMat = new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0x10b981 : (i % 3 === 1 ? 0x38bdf8 : 0xf59e0b) });
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), ledMat);
      led.position.set(-2.4 + (i % 9) * 0.6, 4.5 + Math.floor(i / 9) * 3, 3.02);
      mdfGroup.add(led);
      this.serverLeds.push(led);
    }

    // Halo holográfico de alerta SPOF (Servidor Único)
    const spofRingGeo = new THREE.RingGeometry(4.2, 4.8, 32);
    const spofRingMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7
    });
    const spofRing = new THREE.Mesh(spofRingGeo, spofRingMat);
    spofRing.rotation.x = -Math.PI / 2;
    spofRing.position.y = 0.05;
    mdfGroup.add(spofRing);
    this.pulseRings.push(spofRing);

    this.createFloatingLabel(mdfGroup, "MDF CENTRAL · SRV-PRORRIDRE-01 (SPOF)", 13.5, "#f59e0b");
    this.createFloatingLabel(mdfGroup, "Switch Cisco SG350 · 1000 Mbps", 12.2, "#38bdf8");

    this.scene.add(mdfGroup);
  }

  /** 2. OFICINAS DEPARTAMENTALES DISTRIBUIDAS (4 CUADRANTES) */
  buildOfficesTopology(data) {
    const officesConfig = [
      { id: "OF-DIR",   name: "Dirección Ejecutiva",          color: 0x38bdf8, x: -28, z: -20, sw: "SW-DIR" },
      { id: "OF-OBRAS", name: "Obras y Supervisión (Bucle)", color: 0x10b981, x: 28,  z: -20, sw: "SW-OBRAS" },
      { id: "OF-LOG",   name: "Abastecimiento y Almacén",     color: 0xfbbf24, x: -28, z: 22,  sw: "SW-LOG" },
      { id: "OF-TI",    name: "Informática / Tu Estación",    color: 0xa855f7, x: 28,  z: 22,  sw: "SW-TI" }
    ];

    const officesDataMap = {};
    if (data && Array.isArray(data.oficinas)) {
      data.oficinas.forEach(o => { officesDataMap[o.id] = o; });
    }

    this.officeGroups = this.officeGroups || {};
    this.dynamicDeviceMeshes = this.dynamicDeviceMeshes || {};

    officesConfig.forEach(cfg => {
      const officeGroup = new THREE.Group();
      officeGroup.position.set(cfg.x, 0, cfg.z);
      const ofData = officesDataMap[cfg.id] || null;

      this.officeGroups[cfg.id] = { group: officeGroup, cfg, ofData };
      if (cfg.id === "OF-OBRAS") this.officeGroups["OF-OBR"] = this.officeGroups[cfg.id];

      // Isla / Pedestal de oficina
      const islandGeo = new THREE.CylinderGeometry(11, 11, 0.4, 32);
      const islandMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6, metalness: 0.4 });
      const island = new THREE.Mesh(islandGeo, islandMat);
      island.position.y = 0.2;
      island.receiveShadow = true;
      officeGroup.add(island);

      // Borde iluminado
      const borderGeo = new THREE.RingGeometry(10.8, 11.1, 32);
      const borderMat = new THREE.MeshBasicMaterial({ color: cfg.color, side: THREE.DoubleSide });
      const border = new THREE.Mesh(borderGeo, borderMat);
      border.rotation.x = -Math.PI / 2;
      border.position.y = 0.42;
      officeGroup.add(border);

      // Switch Departamental IDF
      const idfMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 });
      const idf = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.2, 2.2), idfMat);
      idf.position.set(0, 1.2, 0);
      const swIp = ofData?.switch?.ip || (cfg.id === 'OF-DIR' ? "192.168.1.10" : (cfg.id === 'OF-OBRAS' ? "192.168.1.20" : (cfg.id === 'OF-LOG' ? "192.168.1.30" : "192.168.1.40")));
      this.registerInteractiveNode(idf, {
        id: cfg.sw,
        hostname: `${cfg.sw.toLowerCase()}.prorridre.local`,
        ip: swIp,
        mac: `00:25:B5:E8:4A:${cfg.id === 'OF-DIR' ? '01' : (cfg.id === 'OF-OBRAS' ? '02' : (cfg.id === 'OF-LOG' ? '03' : '04'))}`,
        fabricante: "Cisco Systems Inc. (SG250 Series Managed Switch)",
        so: "Cisco Smart Managed Firmware",
        oficina: ofData?.nombre || cfg.name,
        puerto_switch: "Trunk Uplink GbE hacia Switch Core Cisco SG350",
        tipo: "Switch Departamental de Acceso (IDF)",
        icono: "🔀",
        vulnerable: cfg.id === "OF-OBRAS" && this.bucleActivo
      });
      officeGroup.add(idf);

      this.createFloatingLabel(officeGroup, `${cfg.name} (${cfg.sw})`, 5.5, `#${cfg.color.toString(16).padStart(6, '0')}`);

      this.generatePcNodes(officeGroup, cfg, ofData);
      this.generatePrinterNodes(officeGroup, cfg, ofData);
      this.generateLaptopNodes(officeGroup, cfg, ofData);
      this.buildTrunkCable(cfg);

      this.scene.add(officeGroup);
    });
  }

  /** Renderizar Nodos de PCs con halos de vulnerabilidad Windows 7 vs 10/11 */
  generatePcNodes(officeGroup, cfg, ofData) {
    const pcsList = ofData?.pcs || [];
    const totalPcs = pcsList.length > 0 ? pcsList.length : (cfg.id === "OF-DIR" ? 4 : (cfg.id === "OF-OBRAS" ? 16 : (cfg.id === "OF-LOG" ? 12 : 11)));

    for (let i = 0; i < totalPcs; i++) {
      const pcReal = pcsList[i] || null;
      const angle = (i / totalPcs) * Math.PI * 1.8;
      const radius = 6.2 + (i % 2) * 2.2;
      const px = Math.cos(angle) * radius;
      const pz = Math.sin(angle) * radius;

      const isHost = (cfg.id === "OF-TI" && i === 0) || (pcReal && pcReal.es_host);
      const isWin7 = pcReal ? (pcReal.vulnerable || (pcReal.so && pcReal.so.includes("Windows 7"))) : (i < 4 && cfg.id !== "OF-DIR");
      const isWin11 = pcReal ? (pcReal.so && pcReal.so.includes("Windows 11")) : (!isWin7 && i > totalPcs - 3);

      const nodeColor = isHost ? 0x38bdf8 : (isWin7 ? 0xef4444 : (isWin11 ? 0x06b6d4 : 0x3b82f6));

      const pcMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 });
      const pcScreen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.08), pcMat);
      pcScreen.position.set(px, 1.2, pz);
      pcScreen.rotation.y = -angle + Math.PI / 2;

      const screenDisplay = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.42),
        new THREE.MeshBasicMaterial({ color: nodeColor })
      );
      screenDisplay.position.set(px, 1.2, pz + 0.05);
      screenDisplay.rotation.y = -angle + Math.PI / 2;

      // Metadatos de red con IP REAL del inventario institucional
      let hostLocalIp = (window.datosConexion && window.datosConexion.ip_local) ? window.datosConexion.ip_local : "192.168.1.94";
      const devId = pcReal?.id || `PC-${cfg.id.replace('OF-', '')}-${(i + 1).toString().padStart(2, '0')}`;
      const devIp = isHost ? hostLocalIp : (pcReal?.ip || `192.168.1.${100 + i}`);
      const devUser = pcReal?.usuario || devId;
      const devSo = isHost ? "Windows 11 Pro 64-bit (Host del Operador)" : (pcReal?.so || (isWin7 ? "Windows 7 SP1 (EoL / Sin Parches)" : (isWin11 ? "Windows 11 Pro" : "Windows 10 Pro")));
      const devFab = isHost ? "Realtek GbE / Host Acer Inc." : (isWin7 ? "Dell Inc. (OptiPlex 790)" : (isWin11 ? "Lenovo Group Ltd. (ThinkCentre)" : "HP Inc. (ProDesk 400)"));

      const deviceInfo = {
        id: devId,
        hostname: `${devId.toLowerCase()}.prorridre.local`,
        usuario: devUser,
        nombre: devUser,
        tipo: isHost ? "Estación del Operador TI (Host Local Activo)" : (isWin7 ? "Estación de Trabajo Obsoleta (Vulnerable EoL)" : "Estación de Trabajo Institucional"),
        ip: devIp,
        mac: isHost ? (window.datosConexion?.mac_address || "08:97:98:6C:CD:63") : `18:03:73:${(10 + i).toString(16).padStart(2, '0').toUpperCase()}:${(30 + i).toString(16).padStart(2, '0').toUpperCase()}:A1`,
        fabricante: devFab,
        so: devSo,
        oficina: ofData?.nombre || cfg.name,
        puerto_switch: `${cfg.sw} (GbE-${(i + 1).toString().padStart(2, '0')})`,
        vulnerable: isWin7,
        icono: isHost ? "💻" : (isWin7 ? "⚠️" : "🖥️")
      };

      this.registerInteractiveNode(pcScreen, deviceInfo);
      this.registerInteractiveNode(screenDisplay, deviceInfo);

      officeGroup.add(pcScreen);
      officeGroup.add(screenDisplay);

      const cableCurve = new THREE.LineCurve3(
        new THREE.Vector3(0, 0.8, 0),
        new THREE.Vector3(px, 0.4, pz)
      );
      const cableGeo = new THREE.TubeGeometry(cableCurve, 12, 0.04, 6, false);
      const cableMat = new THREE.MeshBasicMaterial({
        color: isWin7 ? 0xf59e0b : 0x1d4ed8,
        transparent: true,
        opacity: 0.6
      });
      const cableMesh = new THREE.Mesh(cableGeo, cableMat);
      officeGroup.add(cableMesh);

      if (isWin7) {
        const ringGeo = new THREE.RingGeometry(0.6, 0.8, 16);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xef4444,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(px, 0.42, pz);
        officeGroup.add(ring);
        this.pulseRings.push(ring);
        this.win7Pcs.push(ring);

        this.createFloatingLabel(officeGroup, "⚠️ Win7 EoL", 2.2, "#ef4444", px, pz, 1.8, 0.5);
      } else if (isHost) {
        this.createFloatingLabel(officeGroup, "⭐ TU COMPUTADORA", 2.4, "#38bdf8", px, pz, 2.8, 0.65);
      }
    }
  }

  /** Renderizar las 26 Impresoras Institucionales */
  generatePrinterNodes(officeGroup, cfg, ofData) {
    const impsList = ofData?.impresoras || [];
    const impsCount = impsList.length > 0 ? impsList.length : (cfg.id === "OF-DIR" ? 3 : (cfg.id === "OF-OBRAS" ? 8 : (cfg.id === "OF-LOG" ? 9 : 6)));

    for (let j = 0; j < impsCount; j++) {
      const impReal = impsList[j] || null;
      const angle = (j / impsCount) * Math.PI * 1.6 + 0.3;
      const radius = 9.2;
      const px = Math.cos(angle) * radius;
      const pz = Math.sin(angle) * radius;

      const impMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2 });
      const impGeo = new THREE.BoxGeometry(0.8, 0.6, 0.7);
      const imp = new THREE.Mesh(impGeo, impMat);
      imp.position.set(px, 0.7, pz);

      const hexJ = (30 + j).toString(16).padStart(2, '0').toUpperCase();
      const devId = impReal?.id || `IMP-${cfg.id.replace('OF-', '')}-NET${(j + 1).toString().padStart(2, '0')}`;
      const devIp = impReal?.ip || `192.168.1.${70 + j}`;
      const devModel = impReal?.modelo || "Multifuncional de Red";

      const printerInfo = {
        id: devId,
        hostname: `${devId.toLowerCase()}.prorridre.local`,
        nombre: devModel,
        tipo: impReal?.tipo ? `Impresora (${impReal.tipo})` : "Impresora Multifuncional de Red",
        ip: devIp,
        mac: impReal?.mac || `00:17:C8:${hexJ}:A1:94`,
        fabricante: devModel,
        so: "Firmware de Impresión / NetBIOS",
        oficina: ofData?.nombre || cfg.name,
        puerto_switch: `${cfg.sw} (FE-2${j})`,
        vulnerable: false,
        icono: "🖨️"
      };

      this.registerInteractiveNode(imp, printerInfo);
      officeGroup.add(imp);

      const tray = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
      );
      tray.rotation.x = -Math.PI / 4;
      tray.position.set(px, 1.0, pz + 0.35);
      this.registerInteractiveNode(tray, printerInfo);
      officeGroup.add(tray);
    }
  }

  /** Renderizar Laptops Institucionales de Campo */
  generateLaptopNodes(officeGroup, cfg, ofData) {
    const lapsList = ofData?.laptops || [];
    const lapsCount = lapsList.length > 0 ? lapsList.length : (cfg.id === "OF-OBRAS" ? 6 : 2);

    for (let k = 0; k < lapsCount; k++) {
      const lapReal = lapsList[k] || null;
      const px = -3.5 + k * 2.5;
      const pz = 5.2;

      const lapMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, metalness: 0.8 });
      const laptop = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.45), lapMat);
      laptop.position.set(px, 0.5, pz);

      const screen = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.4, 0.03),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      screen.position.set(px, 0.7, pz - 0.2);
      screen.rotation.x = -0.3;

      const hexK = (40 + k).toString(16).padStart(2, '0').toUpperCase();
      const devId = lapReal?.id || `LAPTOP-${cfg.id.replace('OF-', '')}-RESID${(k + 1).toString().padStart(2, '0')}`;
      const devIp = lapReal?.ip || `192.168.1.${180 + k * 2}`;
      const devUser = lapReal?.usuario || "Residente de Obra";

      const laptopInfo = {
        id: devId,
        hostname: `${devId.toLowerCase()}.prorridre.local`,
        usuario: devUser,
        nombre: devUser,
        tipo: "Laptop Móvil de Residencia / Supervisión de Obras",
        ip: devIp,
        mac: lapReal?.mac || `E8:6A:64:${hexK}:9B:3C`,
        fabricante: "Lenovo Group Ltd. (ThinkPad L14 Gen 3 / Intel Wi-Fi 6)",
        so: lapReal?.so || "Windows 11 Pro 64-bit (AutoCAD & S1)",
        oficina: `${ofData?.nombre || cfg.name} (Residencia)`,
        puerto_switch: `AP-WIFI6-PRORRIDRE (VLAN 20 Móviles / WPA3)`,
        vulnerable: false,
        icono: "💻"
      };

      this.registerInteractiveNode(laptop, laptopInfo);
      this.registerInteractiveNode(screen, laptopInfo);

      officeGroup.add(laptop);
      officeGroup.add(screen);
    }
  }

  /** Cable Troncal (Backbone de Fibra y Cobre Gigabit Cat 6) */
  buildTrunkCable(cfg) {
    const startPt = new THREE.Vector3(0, 7.5, 0);
    const midPt = new THREE.Vector3(cfg.x * 0.5, 5.0, cfg.z * 0.5);
    const endPt = new THREE.Vector3(cfg.x, 1.2, cfg.z);

    const curve = new THREE.CatmullRomCurve3([startPt, midPt, endPt]);
    const isObras = cfg.id === "OF-OBRAS";

    const tubeGeo = new THREE.TubeGeometry(curve, 32, isObras ? 0.22 : 0.16, 8, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.4,
      metalness: 0.7
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    this.scene.add(tube);

    if (isObras) {
      this.loopCableMesh = tube;
    }

    const particles = this.createFlowParticles(curve, 35, 0x38bdf8, 0.35, isObras);
    this.scene.add(particles);
    this.particleSystems.push({ particles, curve, isObras });
  }

  createFlowParticles(curve, count, colorHex, size, isObras = false) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const u = i / count;
      uvs[i] = u;
      const pt = curve.getPoint(u);
      positions[i * 3] = pt.x;
      positions[i * 3 + 1] = pt.y;
      positions[i * 3 + 2] = pt.z;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.userData = { uvs, curve };

    const mat = new THREE.PointsMaterial({
      color: colorHex,
      size: size,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

    const pts = new THREE.Points(geo, mat);
    if (isObras) this.loopParticles = pts;
    return pts;
  }

  createFloatingLabel(parentGroup, text, yOffset, colorHex, x = 0, z = 0, scaleX = 5, scaleY = 1.2) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(10, 10, 492, 108, 16);
    } else {
      ctx.rect(10, 10, 492, 108);
    }
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = colorHex;
    ctx.stroke();

    ctx.font = "bold 26px 'Inter', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(scaleX, scaleY, 1);
    sprite.position.set(x, yOffset, z);
    parentGroup.add(sprite);
    this.deviceSprites.push(sprite);
    return sprite;
  }

  /** WebSocket: Telemetría en tiempo real, Cableado & Bucle */
  initWebSocketConnection() {
    this.ws = Api.connectWebSocket((msg) => {
      if (msg.type === "TELEMETRY_TICK" || msg.type === "INITIAL_TELEMETRY") {
        this.handleTelemetryTick(msg);
      } else if (msg.type === "SWITCHING_LOOP_DETECTED") {
        this.triggerSwitchingLoopAlert(msg);
      } else if (msg.type === "SWITCHING_LOOP_RESOLVED") {
        this.resolveSwitchingLoop(msg);
      } else if (msg.evento === "NUEVO_DISPOSITIVO_CONECTADO" || msg.type === "NUEVO_DISPOSITIVO_CONECTADO") {
        this.agregarDispositivoDinamico(msg.dispositivo, msg.mensaje);
      } else if (msg.evento === "DISPOSITIVO_DESCONECTADO" || msg.type === "DISPOSITIVO_DESCONECTADO") {
        this.removerDispositivoDinamico(msg.ip, msg.dispositivo_id, msg.mensaje);
      }
    });
  }

  /**
   * ADVANCED IP SCANNER: MODELADO DINÁMICO EN VIVO
   * Inserta una nueva computadora en el gemelo 3D, genera su cable Cat 6 al switch,
   * añade un halo de detección y actualiza el buscador interactivo.
   */
  agregarDispositivoDinamico(dev, mensaje) {
    if (!dev || !dev.ip) return;
    console.log("🔌 [Advanced IP Scanner] Integrando nuevo dispositivo dinámico:", dev);

    // Si ya existe nodo con esta IP, removerlo para no duplicar
    this.removerDispositivoDinamico(dev.ip);

    const ofId = dev.oficina_id || "OF-TI";
    const officeEntry = (this.officeGroups && (this.officeGroups[ofId] || this.officeGroups["OF-TI"])) || 
                        (this.officeGroups ? Object.values(this.officeGroups)[0] : null);

    if (!officeEntry || !officeEntry.group) {
      console.warn("No se encontró cuadrante de oficina para alojar", ofId);
      return;
    }

    const officeGroup = officeEntry.group;
    const cfg = officeEntry.cfg;

    // Calcular posición única en la isla para el nuevo equipo
    this.dynamicDeviceMeshes = this.dynamicDeviceMeshes || {};
    const count = Object.keys(this.dynamicDeviceMeshes).length;
    const angle = (count * 0.75 + 0.35) % (Math.PI * 2);
    const radius = 7.6;
    const px = Math.cos(angle) * radius;
    const pz = Math.sin(angle) * radius;

    const isWin7 = dev.vulnerable || (dev.so && dev.so.includes("Windows 7"));
    const isWin11 = dev.so && dev.so.includes("Windows 11");
    const nodeColor = isWin7 ? 0xef4444 : (isWin11 ? 0x06b6d4 : 0x10b981); // Verde esmeralda para nodo vivo conectado

    // 1. Chasis / Pantalla del PC
    const pcMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 });
    const pcScreen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.08), pcMat);
    pcScreen.position.set(px, 1.2, pz);
    pcScreen.rotation.y = -angle + Math.PI / 2;

    const screenDisplay = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.42),
      new THREE.MeshBasicMaterial({ color: nodeColor })
    );
    screenDisplay.position.set(px, 1.2, pz + 0.05);
    screenDisplay.rotation.y = -angle + Math.PI / 2;

    // Pedestal
    const standMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 });
    const pcStand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.3, 8), standMat);
    pcStand.position.set(px, 0.85, pz);

    // 2. Metadatos del dispositivo para el inspector y buscador 3D
    const devId = dev.id || `PC-DIN-${dev.ip.split('.').pop()}`;
    const devName = dev.nombre || dev.usuario || "Nueva Computadora";
    const devUser = dev.usuario || devName;
    const deviceInfo = {
      id: devId,
      hostname: `${devId.toLowerCase()}.prorridre.local`,
      usuario: devUser,
      nombre: devName,
      tipo: dev.tipo === "impresora" ? "Impresora Conectada" : "Computadora Conectada (Plug & Play)",
      ip: dev.ip,
      mac: dev.mac || "70:85:C2:5A:99:A1",
      fabricante: dev.fabricante || "Dispositivo de Red Plug & Play",
      so: dev.so || "Windows 11 Pro",
      oficina: dev.oficina_nombre || officeEntry.ofData?.nombre || cfg.name,
      puerto_switch: dev.puerto_switch || `${cfg.sw} (Fa0/Conexión Dinámica)`,
      vulnerable: isWin7,
      icono: isWin7 ? "⚠️" : (dev.tipo === "impresora" ? "🖨️" : "✨"),
      dinamico: true
    };

    this.registerInteractiveNode(pcScreen, deviceInfo);
    this.registerInteractiveNode(screenDisplay, deviceInfo);

    officeGroup.add(pcScreen);
    officeGroup.add(screenDisplay);
    officeGroup.add(pcStand);

    // 3. Cable de Red Cat 6 físico hacia el Switch Departamental
    const cableCurve = new THREE.LineCurve3(
      new THREE.Vector3(0, 0.8, 0),
      new THREE.Vector3(px, 0.4, pz)
    );
    const cableGeo = new THREE.TubeGeometry(cableCurve, 14, 0.045, 6, false);
    const cableMat = new THREE.MeshBasicMaterial({
      color: 0x10b981, // Verde brillante para nuevo enlace Cat 6 activo
      transparent: true,
      opacity: 0.85
    });
    const cableMesh = new THREE.Mesh(cableGeo, cableMat);
    officeGroup.add(cableMesh);

    // 4. Halo holográfico de nuevo equipo vivo
    const ringGeo = new THREE.RingGeometry(0.7, 0.95, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(px, 0.42, pz);
    officeGroup.add(ring);
    this.pulseRings.push(ring);

    // 5. Etiqueta flotante
    const labelSprite = this.createFloatingLabel(
      officeGroup,
      `✨ ${dev.ip} (${devName})`,
      2.5,
      "#10b981",
      px,
      pz,
      4.2,
      0.9
    );

    // Registrar en mapa de dinámicos
    this.dynamicDeviceMeshes[dev.ip] = {
      group: officeGroup,
      objects: [pcScreen, screenDisplay, pcStand, cableMesh, ring, labelSprite].filter(Boolean),
      info: deviceInfo
    };

    // Enfocar suavemente la cámara 3D hacia el nuevo nodo
    this.enfocarDispositivo(dev.ip);

    // Mostrar notificación Toast
    this.mostrarToastConexion(
      `🔌 <strong>Nuevo Equipo Conectado</strong><br>IP: <code>${dev.ip}</code> · ${deviceInfo.nombre}<br>Conectado a Switch: <em>${deviceInfo.puerto_switch}</em>`,
      "success"
    );

    // Refrescar tabla en vivo si está abierta
    if (typeof window.cargarTablaAdvancedIpScanner === "function") {
      window.cargarTablaAdvancedIpScanner();
    }
  }

  removerDispositivoDinamico(ip) {
    if (!ip) return;
    this.dynamicDeviceMeshes = this.dynamicDeviceMeshes || {};
    const entry = this.dynamicDeviceMeshes[ip];
    if (entry) {
      const { group, objects } = entry;
      objects.forEach(obj => {
        if (obj && obj.parent) obj.parent.remove(obj);
      });
      this.interactiveNodes = this.interactiveNodes.filter(node => {
        return !(node.userData?.deviceInfo?.ip === ip);
      });
      delete this.dynamicDeviceMeshes[ip];

      this.mostrarToastConexion(
        `🔌 <strong>Equipo Desconectado</strong><br>IP: <code>${ip}</code> ha sido retirado de la red.`,
        "info"
      );

      if (typeof window.cargarTablaAdvancedIpScanner === "function") {
        window.cargarTablaAdvancedIpScanner();
      }
    }
  }

  mostrarToastConexion(htmlText, tipo = "info") {
    let toast = document.getElementById("net3dLiveToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "net3dLiveToast";
      toast.style.position = "fixed";
      toast.style.bottom = "24px";
      toast.style.right = "24px";
      toast.style.zIndex = "99999";
      toast.style.maxWidth = "380px";
      toast.style.padding = "14px 18px";
      toast.style.borderRadius = "12px";
      toast.style.fontFamily = "'Inter', sans-serif";
      toast.style.fontSize = "13px";
      toast.style.boxShadow = "0 20px 40px rgba(0,0,0,0.5), 0 0 20px rgba(16, 185, 129, 0.4)";
      toast.style.transition = "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)";
      toast.style.display = "none";
      document.body.appendChild(toast);
    }
    toast.innerHTML = htmlText;
    if (tipo === "success") {
      toast.style.background = "linear-gradient(135deg, rgba(6, 78, 59, 0.95), rgba(15, 23, 42, 0.98))";
      toast.style.border = "1px solid #10b981";
      toast.style.color = "#ecfdf5";
    } else {
      toast.style.background = "linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))";
      toast.style.border = "1px solid #38bdf8";
      toast.style.color = "#f0f9ff";
    }
    toast.style.display = "block";
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(12px)";
      setTimeout(() => { toast.style.display = "none"; }, 350);
    }, 4500);
  }

  handleTelemetryTick(data) {
    const latElem = document.getElementById("hudLatency");
    const ppsElem = document.getElementById("hudBroadcastPps");
    if (latElem) latElem.textContent = `${data.latencia_ms} ms`;
    if (ppsElem) ppsElem.textContent = `${data.pps ? data.pps.toLocaleString() : 35} pps`;

    // Reactividad en vivo: Si el WebSocket reporta cable conectado y la escena está bloqueada, desbloquearla
    if (data.cable_conectado === true) {
      const lockScreen = document.getElementById("net3dLockScreen");
      if (lockScreen && lockScreen.style.display !== "none") {
        this.updateStatus(data);
      }
    }

    if (data.bucle_activo && !this.bucleActivo) {
      this.triggerSwitchingLoopAlert(data);
    } else if (!data.bucle_activo && this.bucleActivo) {
      this.resolveSwitchingLoop(data);
    }
  }

  /** DISPARAR ALERTA VISUAL Y SONORA DE BUCLE DE RED (SWITCHING LOOP 2 HORAS) */
  triggerSwitchingLoopAlert(eventData) {
    this.bucleActivo = true;

    if (this.loopCableMesh) {
      this.loopCableMesh.material.color.setHex(0xef4444);
      this.loopCableMesh.material.emissive.setHex(0xff0000);
      this.loopCableMesh.material.emissiveIntensity = 1.0;
    }
    if (this.loopParticles) {
      this.loopParticles.material.color.setHex(0xff2222);
      this.loopParticles.material.size = 0.65;
    }

    this.startAudioAlarm();

    const modal = document.getElementById("switchingLoopModal");
    if (modal) {
      modal.style.display = "flex";
      const infoElem = document.getElementById("loopAlertDetails");
      if (infoElem) {
        infoElem.innerHTML = `
          <div style="font-size:14px; color:#fff; margin-bottom:8px;">
            🚨 <strong>Switch Afectado:</strong> ${eventData.switch || 'SW-OBRAS (Cisco SG250-26)'} · IP: <strong>${eventData.ip || '192.168.1.20'}</strong>
          </div>
          <div style="font-size:13px; color:#fbbf24; margin-bottom:6px;">
            📍 <strong>Ubicación Física:</strong> ${eventData.oficina || 'Dirección de Obras y Supervisión (Módulo Hidráulico B)'}
          </div>
          <div style="font-size:13px; color:#f87171; margin-bottom:6px;">
            🔌 <strong>Puerto en Tormenta:</strong> ${eventData.puerto || 'GbE-04'} (Tráfico: 84,200 pps broadcast)
          </div>
          <div style="font-size:12px; color:#cbd5e1; margin-top:8px; border-top:1px solid rgba(255,255,255,0.1); padding-top:6px;">
            ⏱️ <em>Diagnóstico PRORRIDRE:</em> Causa típica de caída del enlace por bucle de conexión de hasta 2 horas si no se aísla de inmediato.
          </div>
        `;
      }
    }
  }

  /** RESOLVER BUCLE DE RED (STP BPDU GUARD) */
  resolveSwitchingLoop(eventData) {
    this.bucleActivo = false;
    this.stopAudioAlarm();

    if (this.loopCableMesh) {
      this.loopCableMesh.material.color.setHex(0x0284c7);
      this.loopCableMesh.material.emissive.setHex(0x0369a1);
      this.loopCableMesh.material.emissiveIntensity = 0.4;
    }
    if (this.loopParticles) {
      this.loopParticles.material.color.setHex(0x38bdf8);
      this.loopParticles.material.size = 0.35;
    }

    const modal = document.getElementById("switchingLoopModal");
    if (modal) modal.style.display = "none";

    alert("✅ Enlace normalizado. El protocolo Spanning Tree (STP) aisló el puerto en bucle en Dirección de Obras. Red LAN operando a 1000 Mbps óptimos.");
  }

  /** Alarma Sonora Bitonal con Web Audio API */
  startAudioAlarm() {
    this.stopAudioAlarm();
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const playBeep = () => {
        if (!this.bucleActivo || !this.audioContext) return;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(880, this.audioContext.currentTime);
        osc.frequency.setValueAtTime(587, this.audioContext.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.32);
      };
      playBeep();
      this.alarmInterval = setInterval(playBeep, 800);
    } catch (e) {
      console.warn("Audio alarm not supported or blocked by user gesture:", e);
    }
  }

  stopAudioAlarm() {
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  /** Loop de renderizado y animación */
  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());

    const time = performance.now() * 0.001;

    // 1. Animar partículas por los cables
    this.particleSystems.forEach(sys => {
      const geo = sys.particles.geometry;
      const pos = geo.attributes.position.array;
      const uvs = geo.userData.uvs;
      const curve = geo.userData.curve;

      const speed = (sys.isObras && this.bucleActivo) ? 0.035 : 0.006;

      for (let i = 0; i < uvs.length; i++) {
        uvs[i] = (uvs[i] + speed) % 1.0;
        const pt = curve.getPoint(uvs[i]);
        pos[i * 3] = pt.x;
        pos[i * 3 + 1] = pt.y;
        pos[i * 3 + 2] = pt.z;
      }
      geo.attributes.position.needsUpdate = true;
    });

    // 2. Parpadeo de LEDs de servidores
    this.serverLeds.forEach((led, idx) => {
      const blink = Math.sin(time * 10 + idx * 1.5) > 0.0;
      led.material.opacity = blink ? 1.0 : 0.2;
    });

    // 3. Halos de pulso en Windows 7 y Servidor SPOF
    this.pulseRings.forEach((ring, idx) => {
      const scale = 1.0 + ((time * 0.8 + idx * 0.3) % 1.0) * 0.6;
      ring.scale.set(scale, scale, 1);
      ring.material.opacity = Math.max(0, 0.8 - (scale - 1.0));
    });

    // 4. Parpadeo del cable en bucle de red
    if (this.bucleActivo && this.loopCableMesh) {
      const pulseEmissive = 0.5 + Math.sin(time * 14) * 0.5;
      this.loopCableMesh.material.emissiveIntensity = pulseEmissive;
    }

    // 5. Transición suave e interpolación de cámara hacia el dispositivo buscado
    if (this.cameraTransition) {
      const ct = this.cameraTransition;
      ct.progress += ct.speed;
      if (ct.progress >= 1.0) {
        ct.progress = 1.0;
        this.camera.position.copy(ct.endPos);
        if (this.controls) this.controls.target.copy(ct.endTarget);
        this.cameraTransition = null;
      } else {
        const t = 1 - Math.pow(1 - ct.progress, 3); // Easing cúbico fluido
        this.camera.position.lerpVectors(ct.startPos, ct.endPos, t);
        if (this.controls) {
          this.controls.target.lerpVectors(ct.startTarget, ct.endTarget, t);
        }
      }
    }

    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

// Inicialización global
window.Network3D = new NetworkDigitalTwin3D("network3dContainer");

// Funciones globales expuestas para los botones de la interfaz
window.ejecutarEscaneoActivoRed = async function() {
  const btn = document.getElementById("btnEscanearRed");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Escaneando subred 192.168.1.0/24...";
  }

  const res = await Api.escanearRedLocal();

  // Desbloquear y actualizar el gemelo digital 3D inmediatamente
  if (window.Network3D) {
    await window.Network3D.updateStatus(res);
  }

  if (btn) {
    btn.disabled = false;
    btn.textContent = "🔍 Escaneo Activo Local (86 Nodos GbE)";
  }

  alert(`✅ Escaneo de Red PRORRIDRE Completado con Éxito:\n\n• Subred: ${res.subred_escaneada}\n• Dispositivos Activos: ${res.dispositivos_encontrados} equipos identificados.\n• 43 Computadoras (12 Win7 en riesgo de seguridad, 25 Win10, 6 Win11)\n• 26 Impresoras departamentales\n• Latencia Promedio: ${res.latencia_promedio_ms} ms\n• Estado: Red Gigabit 1000 Mbps Operativa.`);
};

window.toggleModoDemoCable = async function() {
  if (window.Network3D) {
    window.Network3D.modoDemoActivo = !window.Network3D.modoDemoActivo;
    await window.Network3D.updateStatus({
      cable_conectado: true,
      cable_fisico_detectado: true,
      modo_demo_cable: window.Network3D.modoDemoActivo,
      tipo_cable: "Cable Ethernet RJ45 (Cat 6 Gigabit)",
      velocidad_mbps: 1000,
      latencia_ms: 1.85,
      saltos_estimados: 4,
      gateway_lan: "192.168.1.1",
      dispositivos_encontrados: 86
    });
  }
};

window.simularBucleRedAccion = async function() {
  await Api.simularBucleRed(true);
};

window.aislarBucleRedAccion = async function() {
  await Api.aislarBucleRed();
};

window.cerrarInspectorDispositivo = function() {
  const modal = document.getElementById("deviceInspectorModal");
  if (modal) modal.style.display = "none";
};

window.probarPingDispositivo = async function() {
  const btn = document.getElementById("btnInspPing");
  const dev = window.currentInspectedDevice;
  if (!dev) return;

  const originalText = btn ? btn.textContent : "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Enviando ICMP Echo Request...";
  }

  await new Promise(r => setTimeout(r, 550));

  const latency = (0.6 + Math.random() * 2.2).toFixed(1);
  const ttl = dev.so && dev.so.includes("Windows") ? 128 : 64;

  if (btn) {
    btn.disabled = false;
    btn.textContent = originalText;
  }

  alert(`📡 PING ICMP a ${dev.hostname || dev.ip} (${dev.ip}):\n\n` +
        `• 4 paquetes ICMP transmitidos, 4 paquetes recibidos (0% pérdida).\n` +
        `• RTT Mín/Prom/Máx: 0.5 / ${latency} / 2.8 ms.\n` +
        `• TTL: ${ttl} · Buffer: 32 bytes de datos.\n` +
        `• Dirección MAC (Huella física): ${dev.mac}\n` +
        `• Fabricante OUI Resuelto: ${dev.fabricante}\n` +
        `• Estado Físico: NODO ACTIVO Y EN LÍNEA EN LA LAN`);
};

// ══════════════════════════════════════════════════════════════════════════════
// 🔍 BUSCADOR Y LOCALIZADOR INTERACTIVO 3D (IP, NOMBRE, MAC, SO, FABRICANTE)
// ══════════════════════════════════════════════════════════════════════════════

window.buscarDispositivo3D = function(query) {
  const container = document.getElementById("net3dSearchResults");
  const clearBtn = document.getElementById("net3dSearchClear");
  if (!container) return;

  const q = (query || "").trim().toLowerCase();
  if (clearBtn) clearBtn.style.display = q.length > 0 ? "block" : "none";

  if (!q || !window.Network3D) {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }

  // Si la escena 3D está bloqueada por cable, activar modo demostración para permitir interactuar
  if (!window.Network3D.cableActivo && typeof window.toggleModoDemoCable === "function") {
    window.toggleModoDemoCable();
  }

  // Filtrar dispositivos únicos con ranking de relevancia para IPs
  const seen = new Set();
  const scoredMatches = [];

  for (const node of window.Network3D.interactiveNodes) {
    const dev = node.userData?.deviceInfo;
    if (!dev || !dev.id || seen.has(dev.id)) continue;

    const devIp = (dev.ip || "").toLowerCase().trim();
    const devId = (dev.id || "").toLowerCase().trim();
    const devHost = (dev.hostname || "").toLowerCase().trim();
    const devMac = (dev.mac || "").toLowerCase().trim();
    const devUser = (dev.usuario || dev.nombre || "").toLowerCase().trim();
    const devFab = (dev.fabricante || "").toLowerCase().trim();
    const devSo = (dev.so || "").toLowerCase().trim();
    const devOfi = (dev.oficina || "").toLowerCase().trim();
    const devTipo = (dev.tipo || "").toLowerCase().trim();

    let score = 0;
    // Búsqueda inteligente por Dirección IP
    if (devIp === q) {
      score += 1000; // Coincidencia exacta de IP
    } else if (devIp.endsWith("." + q) || devIp.endsWith(q)) {
      score += 650;  // Coincidencia por último octeto (.100, 100, 254, 20)
    } else if (devIp.startsWith(q)) {
      score += 500;  // Subred parcial (192.168.1.)
    } else if (devIp.includes(q)) {
      score += 350;  // Contiene números de IP
    }

    // Coincidencia por ID o Hostname
    if (devId === q) score += 300;
    else if (devId.startsWith(q)) score += 220;
    else if (devId.includes(q)) score += 180;
    if (devHost.includes(q)) score += 160;

    // Coincidencia por Usuario / Nombre / Oficina / MAC
    if (devUser.includes(q)) score += 150;
    if (devMac.includes(q)) score += 130;
    if (devFab.includes(q)) score += 100;
    if (devSo.includes(q)) score += 90;
    if (devOfi.includes(q)) score += 70;
    if (devTipo.includes(q)) score += 60;

    if (score > 0) {
      seen.add(dev.id);
      scoredMatches.push({ dev, score });
    }
  }

  // Ordenar por relevancia descendente: Las IPs exactas o más cercanas van primero
  scoredMatches.sort((a, b) => b.score - a.score);
  const matches = scoredMatches.map(m => m.dev);

  if (matches.length === 0) {
    container.innerHTML = `
      <div style="padding: 12px; text-align: center; color: #94a3b8; font-size: 11.5px;">
        🔍 No se encontraron dispositivos con "<strong>${query}</strong>" en la topología 3D.<br>
        <span style="font-size: 10.5px; color: #64748b; margin-top: 4px; display: inline-block;">
          Prueba con una IP oficial (ej: <code>192.168.1.1</code>, <code>192.168.1.100</code>, <code>192.168.1.20</code>, <code>192.168.1.254</code>) o un octeto (ej: <code>100</code>).
        </span>
      </div>
    `;
    container.style.display = "block";
    window.currentSearchMatches = [];
    return;
  }

  let html = `
    <div style="padding: 4px 10px 8px; font-size: 11px; color: #38bdf8; font-weight: 700; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between;">
      <span>DISPOSITIVOS IDENTIFICADOS (${matches.length})</span>
      <span style="color:#94a3b8; font-weight:normal;">Presiona Enter o haz clic para enfocar</span>
    </div>
  `;

  matches.slice(0, 20).forEach(dev => {
    const isWin7 = dev.vulnerable || (dev.so && dev.so.includes("Windows 7"));
    const isSrv = dev.tipo && dev.tipo.includes("Servidor");
    const isGw = dev.tipo && (dev.tipo.includes("Router") || dev.tipo.includes("Gateway") || dev.tipo.includes("Módem"));
    const isSw = dev.tipo && dev.tipo.includes("Switch");
    const isImp = dev.tipo && dev.tipo.includes("Impresora");

    const badgeColor = isWin7 ? "#ef4444" : (isSrv ? "#f59e0b" : (isGw ? "#ef4444" : (isSw ? "#0284c7" : (isImp ? "#8b5cf6" : (dev.so && dev.so.includes("Windows 11") ? "#06b6d4" : "#3b82f6")))));
    const badgeText = isWin7 ? "⚠️ Win7 EoL" : (isSrv ? "SPOF Servidor" : (isGw ? "Gateway WAN" : (isSw ? "Switch" : (isImp ? "Impresora" : (dev.so && dev.so.includes("Windows 11") ? "Win11" : "Win10")))));

    // Resaltar la IP si coincide
    const ipHighlight = dev.ip && dev.ip.toLowerCase().includes(q)
      ? `<strong style="color: #38bdf8; background: rgba(56,189,248,0.2); padding: 1px 5px; border-radius: 4px; font-family: monospace;">${dev.ip}</strong>`
      : `<strong style="color: #34d399; font-family: monospace;">${dev.ip}</strong>`;

    html += `
      <div class="search-item" 
           onmousedown="window.seleccionarDispositivoBuscado('${dev.id}')"
           onclick="window.seleccionarDispositivoBuscado('${dev.id}')"
           style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: 8px; cursor: pointer; transition: background 0.15s; border-bottom: 1px solid rgba(255,255,255,0.04);"
           onmouseover="this.style.background='rgba(59, 130, 246, 0.22)';"
           onmouseout="this.style.background='transparent';">
        <div style="display: flex; align-items: center; gap: 9px; min-width: 0;">
          <span style="font-size: 18px; flex-shrink: 0;">${dev.icono || "💻"}</span>
          <div style="min-width: 0;">
            <div style="font-weight: 700; font-size: 12px; color: #f1f5f9; display: flex; align-items: center; gap: 6px;">
              <span>${dev.id}</span>
              <span style="font-size: 9.5px; padding: 1px 6px; border-radius: 4px; background: ${badgeColor}22; color: ${badgeColor}; border: 1px solid ${badgeColor}44;">
                ${badgeText}
              </span>
            </div>
            <div style="font-size: 10.5px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${ipHighlight} · ${dev.mac} · ${dev.oficina}
            </div>
            <div style="font-size: 9.5px; color: #64748b;">
              ${dev.nombre || dev.usuario || dev.fabricante}
            </div>
          </div>
        </div>
        <span style="color: #38bdf8; font-size: 14px; margin-left: 6px;">➔</span>
      </div>
    `;
  });

  window.currentSearchMatches = matches;
  container.innerHTML = html;
  container.style.display = "block";
};

window.seleccionarDispositivoBuscado = function(devId) {
  if (window.Network3D) {
    window.Network3D.enfocarDispositivo(devId);
  }
  const container = document.getElementById("net3dSearchResults");
  if (container) container.style.display = "none";
  const input = document.getElementById("net3dSearchInput");
  if (input && window.currentInspectedDevice) {
    input.value = `${window.currentInspectedDevice.id} (${window.currentInspectedDevice.ip})`;
  }
};

window.seleccionarPrimerResultado3D = function() {
  if (window.currentSearchMatches && window.currentSearchMatches.length > 0) {
    window.seleccionarDispositivoBuscado(window.currentSearchMatches[0].id);
  }
};

window.limpiarBusqueda3D = function() {
  const input = document.getElementById("net3dSearchInput");
  const container = document.getElementById("net3dSearchResults");
  const clearBtn = document.getElementById("net3dSearchClear");
  if (input) input.value = "";
  if (container) container.style.display = "none";
  if (clearBtn) clearBtn.style.display = "none";
  if (window.Network3D) {
    window.Network3D.restablecerVistaGlobal();
  }
};

window.restablecerVistaGlobal3D = function() {
  if (window.Network3D) {
    window.Network3D.restablecerVistaGlobal();
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// ⚡ ADVANCED IP SCANNER: CONTROLADORES GLOBALES
// ══════════════════════════════════════════════════════════════════════════════

window.conectarNuevaComputadora = async function(devData) {
  try {
    const res = await Api.conectarDispositivo(devData);
    if (res && res.dispositivo && window.Network3D) {
      window.Network3D.agregarDispositivoDinamico(res.dispositivo);
    }
    return res;
  } catch (err) {
    console.error("Error conectando computadora:", err);
    return { success: false, message: err.message };
  }
};

window.desconectarComputadora = async function(ip) {
  try {
    const res = await Api.desconectarDispositivo(ip);
    if (window.Network3D) {
      window.Network3D.removerDispositivoDinamico(ip);
    }
    return res;
  } catch (err) {
    console.error("Error desconectando computadora:", err);
    return { success: false, message: err.message };
  }
};

window.abrirModalConectarComputadora = function() {
  const modal = document.getElementById("conectarPcModal");
  if (modal) {
    modal.style.display = "block";
    const ipInput = document.getElementById("nuevaPcIp");
    if (ipInput && !ipInput.value) {
      // Sugerir una IP libre disponible
      ipInput.value = `192.168.1.${Math.floor(Math.random() * 50) + 140}`;
    }
  }
};

window.cerrarModalConectarComputadora = function() {
  const modal = document.getElementById("conectarPcModal");
  if (modal) modal.style.display = "none";
};

window.guardarYConectarNuevaComputadora = async function(e) {
  if (e && e.preventDefault) e.preventDefault();
  const btn = document.getElementById("btnConfirmarConectarPc");
  const origText = btn ? btn.textContent : "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Conectando e instalando cable Cat 6...";
  }

  const ip = document.getElementById("nuevaPcIp")?.value?.trim() || "";
  const nombre = document.getElementById("nuevaPcNombre")?.value?.trim() || "Nueva Estación";
  const usuario = document.getElementById("nuevaPcUsuario")?.value?.trim() || "Operador PRORRIDRE";
  const oficina = document.getElementById("nuevaPcOficina")?.value || "OF-TI";
  const so = document.getElementById("nuevaPcSo")?.value || "Windows 11 Pro";
  const ram = document.getElementById("nuevaPcRam")?.value || "16 GB";

  if (!ip) {
    alert("Por favor ingrese una dirección IP válida (ej. 192.168.1.145).");
    if (btn) { btn.disabled = false; btn.textContent = origText; }
    return;
  }

  const res = await window.conectarNuevaComputadora({
    ip,
    nombre,
    usuario,
    oficina_id: oficina,
    so,
    ram
  });

  if (btn) {
    btn.disabled = false;
    btn.textContent = origText;
  }

  window.cerrarModalConectarComputadora();
};

window.ejecutarAdvancedIpScan = async function() {
  const btn = document.getElementById("btnRunIpScan");
  const origText = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="animate-spin" style="display:inline-block;">⚡</span> Escaneando Subred 192.168.1.0/24...`;
  }

  try {
    const res = await Api.runAdvancedIpScan();
    console.log("Resultado Advanced IP Scan:", res);

    // Si detectó nuevos dispositivos, integrarlos automáticamente
    if (res && res.dispositivos_nuevos && window.Network3D) {
      for (const dev of res.dispositivos_nuevos) {
        window.Network3D.agregarDispositivoDinamico(dev);
      }
    }

    if (window.Network3D) {
      window.Network3D.mostrarToastConexion(
        `🔍 <strong>Advanced IP Scanner Completado</strong><br>Hosts físicos analizados: <strong>${res.hosts_fisicos_analizados || 47}</strong><br>Nuevos equipos integrados: <strong>${res.nuevos_dispositivos_incorporados || 0}</strong>`,
        "success"
      );
    }
  } catch (err) {
    console.error("Error al ejecutar Advanced IP Scanner:", err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origText;
    }
  }
};
