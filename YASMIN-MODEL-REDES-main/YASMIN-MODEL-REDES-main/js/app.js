/* ═══════════════════════════════════════════════════════════════
   PRORRIDRE SMART DASHBOARD — MAIN APPLICATION LOGIC
   ═══════════════════════════════════════════════════════════════ */

/* ── Route Protection ── */
if (!Auth.protect()) throw new Error("Not authenticated");

/* ── Session Load ── */
const session = Auth.getSession() || {
  nombre: "Usuario PRORRIDRE",
  rol: "Directivo",
  cargo: "Servidor Público"
};
const nombreVal = session.nombre || session.username || "Usuario PRORRIDRE";
const nameParts = nombreVal.split(" ").filter(Boolean);
document.getElementById("userName").textContent = nameParts.slice(0, 2).join(" ") || nombreVal;
document.getElementById("userRole").textContent = session.rol || "Directivo";

// Avatar
const placeholder = document.getElementById("userAvatarPlaceholder");
if (session.avatar && placeholder) {
  const img = document.createElement("img");
  img.src = session.avatar;
  img.alt = nombreVal;
  img.className = "sidebar-user-avatar";
  placeholder.replaceWith(img);
} else if (placeholder) {
  const initials = (nameParts.map(w => w[0] || "").join("").substring(0, 2) || "PR").toUpperCase();
  placeholder.textContent = initials;
}

/* ── Clock ── */
function updateClock() {
  const now = new Date();
  const str = now.toLocaleTimeString("es-PE", { hour12: false });
  document.getElementById("clockDisplay").textContent = str;
}
updateClock();
setInterval(updateClock, 1000);

/* ── RBAC: Hide sections the user can't access ── */
(function applyRBAC() {
  const navItems = document.querySelectorAll(".sidebar-nav a[data-view]");
  navItems.forEach(item => {
    const view = item.getAttribute("data-view");
    if (!Auth.hasAccess(view)) {
      item.style.opacity = "0.35";
      item.style.pointerEvents = "none";
      item.title = "Sin permisos para esta sección";
    }
  });

  // Si no tiene acceso a la vista ejecutiva por defecto, redirigir a su primer módulo autorizado
  if (!Auth.hasAccess("ejecutiva")) {
    const defaultViews = ["logistica", "infraestructura", "alertas", "reportes", "emulador", "asistente"];
    const firstAllowed = defaultViews.find(v => Auth.hasAccess(v));
    if (firstAllowed) {
      setTimeout(() => switchView(firstAllowed), 50);
    }
  }
})();

/* ══════════════════════════════════════
   NAVIGATION
   ══════════════════════════════════════ */

function switchView(viewId) {
  // Panels
  document.querySelectorAll(".view-panel").forEach(p => {
    if (p.id && p.id.startsWith("view-")) p.classList.remove("active");
  });
  const target = document.getElementById("view-" + viewId);
  if (target) target.classList.add("active");

  // Nav links
  document.querySelectorAll(".sidebar-nav a[data-view]").forEach(a => a.classList.remove("active"));
  const navLink = document.querySelector(`a[data-view="${viewId}"]`);
  if (navLink) navLink.classList.add("active");

  // Title
  const titles = {
    ejecutiva: "Vista Ejecutiva",
    logistica: "Logística y Proyectos",
    infraestructura: "Infraestructura TI",
    alertas: "Centro de Alertas",
    reportes: "Resumen Ejecutivo",
    emulador: "Emulador SGD / SIAF",
    asistente: "Asistente Inteligente On-Premise"
  };
  document.getElementById("pageTitle").textContent = titles[viewId] || viewId;
  document.getElementById("breadcrumb").textContent = titles[viewId] || viewId;

  // Close mobile sidebar
  document.getElementById("sidebar").classList.remove("open");

  // Lazy init charts or data for tabs
  if (viewId === "logistica") initLogisticaCharts();
  if (viewId === "emulador") renderTablaSGD();
  if (viewId === "infraestructura") {
    diagnosticarCableMiEquipo();
    if (window.Network3D) window.Network3D.verificarConexionCable();
  }
}

// Sidebar nav click
document.querySelectorAll(".sidebar-nav a[data-view]").forEach(a => {
  a.addEventListener("click", function(e) {
    e.preventDefault();
    const view = this.getAttribute("data-view");
    if (Auth.hasAccess(view)) switchView(view);
  });
});

/* Sub-tabs */
function switchSubTab(btn, parentView) {
  const subtab = btn.getAttribute("data-subtab");
  // Toggle tab buttons
  btn.closest(".view-tabs").querySelectorAll(".view-tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  // Toggle panels
  const parent = document.getElementById("view-" + parentView);
  parent.querySelectorAll("[id^='subtab-']").forEach(p => p.classList.remove("active"));
  const panel = document.getElementById("subtab-" + subtab);
  if (panel) panel.classList.add("active");
  // Init charts for activos
  if (subtab === "activos") initActivosCharts();
}

/* Mobile sidebar */
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
}

/* ══════════════════════════════════════
   RENDER: KPI CARDS
   ══════════════════════════════════════ */

function renderKPIs() {
  const k = MOCK_KPIS;
  const grid = document.getElementById("kpiGrid");
  grid.innerHTML = `
    <div class="kpi-card blue">
      <div class="kpi-icon">💰</div>
      <div class="kpi-label">Presupuesto PIM</div>
      <div class="kpi-value blue">${formatSoles(k.presupuesto.pim)}</div>
      <div class="kpi-sub">Año Fiscal 2026</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-icon">📈</div>
      <div class="kpi-label">Avance de Ejecución</div>
      <div class="kpi-value green">${k.presupuesto.avancePorcentaje}%</div>
      <div class="kpi-sub">${formatSoles(k.presupuesto.ejecutado)} ejecutados</div>
      <div class="progress-bar"><div class="progress-fill green" style="width:${k.presupuesto.avancePorcentaje}%"></div></div>
    </div>
    <div class="kpi-card amber">
      <div class="kpi-icon">📄</div>
      <div class="kpi-label">Expedientes Pendientes</div>
      <div class="kpi-value amber">${k.expedientes.pendientes}</div>
      <div class="kpi-sub">${k.expedientes.recibidosHoy} recibidos hoy</div>
    </div>
    <div class="kpi-card purple">
      <div class="kpi-icon">🏗️</div>
      <div class="kpi-label">Obras en Ejecución</div>
      <div class="kpi-value purple">${k.obras.enEjecucion} / ${k.obras.total}</div>
      <div class="kpi-sub">${k.obras.paralizadas} paralizada · ${k.obras.finalizadas} finalizadas</div>
    </div>
    <div class="kpi-card red">
      <div class="kpi-icon">🚨</div>
      <div class="kpi-label">Alertas Críticas</div>
      <div class="kpi-value red">${MOCK_ALERTAS.filter(a => a.tipo === 'muy_urgente').length}</div>
      <div class="kpi-sub">Requieren acción inmediata</div>
    </div>
  `;
}

/* ══════════════════════════════════════
   RENDER: ALERTS
   ══════════════════════════════════════ */

function renderAlertItem(a) {
  const tagClass = a.tipo === 'muy_urgente' ? 'tag-mu' : a.tipo === 'urgente' ? 'tag-u' : 'tag-n';
  const tagLabel = a.tipo === 'muy_urgente' ? 'MUY URGENTE' : a.tipo === 'urgente' ? 'URGENTE' : 'NORMAL';
  return `
    <div class="alert-item ${a.tipo}">
      <span class="alert-icon">${a.icono}</span>
      <div class="alert-body">
        <div class="alert-title">${a.titulo}</div>
        <div class="alert-desc">${a.descripcion}</div>
        <div class="alert-meta">
          <span class="alert-tag ${tagClass}">${tagLabel}</span>
          <span>📁 ${a.modulo}</span>
          <span>🕐 ${timeAgo(a.timestamp)}</span>
        </div>
      </div>
    </div>
  `;
}

function renderAlertPreview() {
  const top5 = MOCK_ALERTAS.slice(0, 5);
  document.getElementById("alertPreview").innerHTML = top5.map(renderAlertItem).join("");
}

function renderAlertFull(filter) {
  let filtered = MOCK_ALERTAS;
  if (filter && filter !== 'all') {
    filtered = MOCK_ALERTAS.filter(a => a.tipo === filter);
  }
  document.getElementById("alertFullList").innerHTML = filtered.map(renderAlertItem).join("");
}

function filterAlerts(type, btn) {
  btn.closest(".view-tabs").querySelectorAll(".view-tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  renderAlertFull(type);
}

/* ══════════════════════════════════════
   RENDER: OBRAS CARDS
   ══════════════════════════════════════ */

function renderObraCard(p) {
  const estadoClass = p.estado === 'En Ejecución' ? 'estado-ejecucion' :
                      p.estado === 'Paralizada' ? 'estado-paralizada' : 'estado-finalizada';
  const estadoIcon = p.estado === 'En Ejecución' ? '▶️' :
                     p.estado === 'Paralizada' ? '⏸️' : '✅';
  const progressColorFis = p.avanceFisico >= 80 ? 'green' : p.avanceFisico >= 40 ? 'amber' : 'red';
  const progressColorFin = p.avanceFinanciero >= 80 ? 'green' : p.avanceFinanciero >= 40 ? 'amber' : 'red';

  return `
    <div class="obra-card">
      <span class="estado-badge ${estadoClass}">${estadoIcon} ${p.estado}</span>
      <h4>${p.nombre}</h4>
      <div class="ubicacion">📍 ${p.ubicacion}</div>

      <div class="obra-progress-group">
        <div class="obra-progress-row">
          <span>Avance Físico</span>
          <span style="color:var(--c-accent-${progressColorFis})">${p.avanceFisico}%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill ${progressColorFis}" style="width:${p.avanceFisico}%"></div></div>
      </div>
      <div class="obra-progress-group">
        <div class="obra-progress-row">
          <span>Avance Financiero</span>
          <span style="color:var(--c-accent-${progressColorFin})">${p.avanceFinanciero}%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill ${progressColorFin}" style="width:${p.avanceFinanciero}%"></div></div>
      </div>

      <div class="hitos-list" title="Hitos del proyecto">
        ${p.hitos.map(h => `<div class="hito ${h.completado ? 'done' : ''}" title="${h.nombre}"></div>`).join("")}
      </div>

      <div class="obra-meta">
        <span>💰 ${formatSoles(p.presupuesto)}</span>
        <span>👷 ${p.residente.split(" ").slice(0,3).join(" ")}</span>
      </div>
      ${p.motivoParalizacion ? `<div style="margin-top:0.5rem;padding:0.4rem 0.6rem;background:rgba(239,68,68,0.08);border-radius:6px;font-size:0.72rem;color:var(--c-accent-red);">⚠️ ${p.motivoParalizacion}</div>` : ''}
    </div>
  `;
}

function renderObrasPreview() {
  // Show first 4 for preview
  document.getElementById("obrasPreview").innerHTML = MOCK_PROYECTOS.slice(0, 4).map(renderObraCard).join("");
}

function renderObrasFull() {
  document.getElementById("obrasFullGrid").innerHTML = MOCK_PROYECTOS.map(renderObraCard).join("");
}

/* ══════════════════════════════════════
   RENDER: EXPEDIENTES TABLE
   ══════════════════════════════════════ */

function renderExpedientes() {
  document.getElementById("expHoy").textContent = MOCK_KPIS.expedientes.recibidosHoy;
  const tbody = document.getElementById("expTableBody");
  tbody.innerHTML = EXPEDIENTES_PENDIENTES.map(e => `
    <tr>
      <td style="font-family:var(--font-mono);font-size:0.75rem;">${e.id}</td>
      <td>${e.asunto}</td>
      <td style="font-weight:700;color:${e.dias > 4 ? 'var(--c-accent-red)' : e.dias > 2 ? 'var(--c-accent-amber)' : 'var(--c-accent-green)'};">${e.dias}d</td>
      <td><span class="alert-tag ${e.tipo === 'Aprobación' ? 'tag-mu' : e.tipo === 'Firma' ? 'tag-u' : 'tag-n'}">${e.tipo}</span></td>
    </tr>
  `).join("");
}

/* ══════════════════════════════════════
   RENDER: ALMACÉN & COMPRAS
   ══════════════════════════════════════ */

function renderAlmacen() {
  document.getElementById("almacenTableBody").innerHTML = MOCK_ALMACEN.map(m => {
    const cls = m.estado === 'ok' ? 'stock-ok' : m.estado === 'bajo' ? 'stock-bajo' : 'stock-agotado';
    const label = m.estado === 'ok' ? '✅ OK' : m.estado === 'bajo' ? '⚠️ Bajo' : '🔴 Agotado';
    return `
      <tr>
        <td style="font-family:var(--font-mono);font-size:0.75rem;">${m.id}</td>
        <td>${m.material}</td>
        <td style="font-weight:700;">${m.stock} ${m.unidad}</td>
        <td>${m.minimo} ${m.unidad}</td>
        <td class="${cls}">${label}</td>
        <td>${m.proyecto}</td>
      </tr>
    `;
  }).join("");
}

function renderCompras() {
  document.getElementById("comprasTableBody").innerHTML = MOCK_ORDENES_COMPRA.map(o => {
    const estadoColor = o.estado === 'pendiente' ? 'tag-mu' : 'tag-n';
    const estadoLabel = o.estado === 'pendiente' ? 'PENDIENTE' : 'APROBADA';
    return `
      <tr>
        <td style="font-family:var(--font-mono);font-size:0.75rem;">${o.id}</td>
        <td>${o.descripcion}</td>
        <td style="font-weight:700;">${formatSoles(o.monto)}</td>
        <td><span class="alert-tag ${estadoColor}">${estadoLabel}</span></td>
        <td>${o.fechaSolicitud}</td>
        <td>${o.proveedor}</td>
      </tr>
    `;
  }).join("");
}

/* ══════════════════════════════════════
   CHARTS — Executive View
   ══════════════════════════════════════ */

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 16 }
    }
  },
  scales: {
    x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(148,163,184,0.06)' } },
    y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(148,163,184,0.06)' } }
  }
};

function initExecutiveCharts() {
  // Bar chart: monthly execution
  const ctxBar = document.getElementById("chartEjecucion").getContext("2d");
  new Chart(ctxBar, {
    type: 'bar',
    data: {
      labels: EJECUCION_MENSUAL.map(e => e.mes),
      datasets: [
        {
          label: 'Ejecutado',
          data: EJECUCION_MENSUAL.map(e => e.ejecutado),
          backgroundColor: 'rgba(59,130,246,0.7)',
          borderRadius: 6,
          borderSkipped: false
        },
        {
          label: 'Programado',
          data: EJECUCION_MENSUAL.map(e => e.programado),
          backgroundColor: 'rgba(148,163,184,0.2)',
          borderRadius: 6,
          borderSkipped: false
        }
      ]
    },
    options: {
      ...chartDefaults,
      plugins: {
        ...chartDefaults.plugins,
        tooltip: {
          callbacks: {
            label: ctx => ctx.dataset.label + ': ' + formatSoles(ctx.parsed.y)
          }
        }
      },
      scales: {
        ...chartDefaults.scales,
        y: {
          ...chartDefaults.scales.y,
          ticks: { ...chartDefaults.scales.y.ticks, callback: v => 'S/ ' + (v/1e6).toFixed(1) + 'M' }
        }
      }
    }
  });

  // Donut
  const k = MOCK_KPIS.presupuesto;
  const ctxDonut = document.getElementById("chartDonut").getContext("2d");
  new Chart(ctxDonut, {
    type: 'doughnut',
    data: {
      labels: ['Ejecutado', 'Comprometido', 'Por Ejecutar'],
      datasets: [{
        data: [k.ejecutado, k.comprometido, k.porEjecutar],
        backgroundColor: ['#3b82f6', '#f59e0b', 'rgba(148,163,184,0.15)'],
        borderWidth: 0,
        spacing: 3,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 16 }
        },
        tooltip: {
          callbacks: {
            label: ctx => ctx.label + ': ' + formatSoles(ctx.parsed) + ' (' + ((ctx.parsed / PIM_TOTAL) * 100).toFixed(1) + '%)'
          }
        }
      }
    }
  });
  document.getElementById("donutPct").textContent = k.avancePorcentaje + '%';

  // Funnel / Bar chart for expedientes
  const ctxFunnel = document.getElementById("chartFunnel").getContext("2d");
  const ek = MOCK_KPIS.expedientes;
  new Chart(ctxFunnel, {
    type: 'bar',
    data: {
      labels: ['Recibidos', 'En Tránsito', 'Aprobados', 'Pendientes'],
      datasets: [{
        data: [ek.recibidosHoy, ek.enTransito, ek.aprobados, ek.pendientes],
        backgroundColor: ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b'],
        borderRadius: 8,
        borderSkipped: false,
        barThickness: 36
      }]
    },
    options: {
      ...chartDefaults,
      indexAxis: 'y',
      plugins: {
        ...chartDefaults.plugins,
        legend: { display: false }
      }
    }
  });
}

/* ══════════════════════════════════════
   CHARTS — Logística (Activos)
   ══════════════════════════════════════ */

let activosChartsInit = false;
function initActivosCharts() {
  if (activosChartsInit) return;
  activosChartsInit = true;

  // PCs
  const ctxPC = document.getElementById("chartPCs").getContext("2d");
  const a = MOCK_KPIS.activos;
  new Chart(ctxPC, {
    type: 'doughnut',
    data: {
      labels: ['Windows 11', 'Windows 10', 'Windows 7 ⚠️'],
      datasets: [{
        data: [a.win11, a.win10, a.win7],
        backgroundColor: ['#10b981', '#3b82f6', '#ef4444'],
        borderWidth: 0,
        spacing: 3,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 12 }
        }
      }
    }
  });

  // Maquinaria
  const ctxMaq = document.getElementById("chartMaquinaria").getContext("2d");
  new Chart(ctxMaq, {
    type: 'doughnut',
    data: {
      labels: ['Operativas', 'En Mantenimiento'],
      datasets: [{
        data: [a.maquinariaOperativa, a.maquinariaTotal - a.maquinariaOperativa],
        backgroundColor: ['#10b981', '#f59e0b'],
        borderWidth: 0,
        spacing: 3,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 12 }
        }
      }
    }
  });
}

let logisticaInit = false;
function initLogisticaCharts() {
  if (logisticaInit) return;
  logisticaInit = true;
  // nothing extra needed for first subtab
}

/* ══════════════════════════════════════
   SUMMARY GENERATOR
   ══════════════════════════════════════ */

function generateSummary() {
  const k = MOCK_KPIS;
  const alertasCrit = MOCK_ALERTAS.filter(a => a.tipo === 'muy_urgente');
  const obrasParal = MOCK_PROYECTOS.filter(p => p.estado === 'Paralizada');
  const now = new Date().toLocaleDateString("es-PE", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const summary = `═══════════════════════════════════════════
RESUMEN EJECUTIVO — PRORRIDRE
Programa Regional de Riego y Drenaje
Gobierno Regional de Puno
Fecha: ${now}
═══════════════════════════════════════════

📊 INDICADORES CLAVE DE GESTIÓN
• Presupuesto PIM: ${formatSoles(k.presupuesto.pim)}
• Ejecutado: ${formatSoles(k.presupuesto.ejecutado)} (${k.presupuesto.avancePorcentaje}%)
• Comprometido: ${formatSoles(k.presupuesto.comprometido)}
• Saldo por ejecutar: ${formatSoles(k.presupuesto.porEjecutar)}

🏗️ ESTADO DE OBRAS
• Total: ${k.obras.total} obras | En ejecución: ${k.obras.enEjecucion} | Paralizadas: ${k.obras.paralizadas} | Finalizadas: ${k.obras.finalizadas}
${obrasParal.map(o => `• ⚠️ PARALIZADA: ${o.nombre} — ${o.motivoParalizacion}`).join('\n')}

📄 GESTIÓN DOCUMENTAL
• Expedientes hoy: ${k.expedientes.recibidosHoy} | Pendientes: ${k.expedientes.pendientes} | Promedio semanal: ${k.expedientes.promedioSemanal}

🚨 ALERTAS CRÍTICAS (${alertasCrit.length})
${alertasCrit.map(a => `• 🔴 ${a.titulo}: ${a.descripcion}`).join('\n')}

🖥️ INFRAESTRUCTURA TI
• Internet: CAÍDO (1h 32m) — Proveedor: Telefónica
• Servidor: Activo (CPU ${MOCK_INFRAESTRUCTURA.servidorPrincipal.cpu}%, RAM ${MOCK_INFRAESTRUCTURA.servidorPrincipal.ram}%)
• UPS: ${MOCK_INFRAESTRUCTURA.servidorPrincipal.upsCapacidad}% capacidad ⚠️
• Último backup: hace 72 horas ⚠️
• ERPNext: Operando en modo LAN

🤖 RECOMENDACIONES INTELIGENTES
1. Contratar enlace de contingencia 4G/5G (~S/ 350/mes)
2. Ejecutar backup inmediato del servidor
3. Renovar 12 PCs con Windows 7 (riesgo de seguridad)
4. Atender materiales pendientes para OBR-004 (obra paralizada)
5. Aprobar 7 expedientes pendientes de firma (>3 días promedio)

═══════════════════════════════════════════
Generado automáticamente por PRORRIDRE Smart Dashboard
`;

  // Typing effect
  const container = document.getElementById("summaryContent");
  container.innerHTML = '';
  let idx = 0;
  const cursor = document.createElement("span");
  cursor.className = "typing-cursor";

  function typeChar() {
    if (idx < summary.length) {
      container.textContent = summary.substring(0, idx + 1);
      container.appendChild(cursor);
      idx++;
      setTimeout(typeChar, idx < 60 ? 25 : 3);
    } else {
      cursor.remove();
    }
  }
  typeChar();
}

/* ══════════════════════════════════════
   EMULADOR SGD & SIAF / SIGA
   ══════════════════════════════════════ */

let filtroSgdActual = "";

async function renderTablaSGD() {
  const tbody = document.getElementById("tablaExpedientesSGD");
  if (!tbody) return;

  const expedientes = await Api.getExpedientes({ prioridad: filtroSgdActual });
  tbody.innerHTML = "";

  if (!expedientes || expedientes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 20px; color: var(--text-secondary);">No hay expedientes con este filtro.</td></tr>`;
    return;
  }

  expedientes.forEach(exp => {
    const tr = document.createElement("tr");

    let prioBadge = `<span class="badge" style="background: rgba(16,185,129,0.2); color: #34d399; font-weight:bold;">🟢 N (Normal)</span>`;
    if (exp.prioridad === "MU") {
      prioBadge = `<span class="badge" style="background: rgba(239,68,68,0.2); color: #f87171; font-weight:bold;">🔴 MU (Muy Urgente)</span>`;
    } else if (exp.prioridad === "U") {
      prioBadge = `<span class="badge" style="background: rgba(245,158,11,0.2); color: #fbbf24; font-weight:bold;">🟡 U (Urgente)</span>`;
    }

    let estadoBadge = `<span class="badge badge-warning">${exp.estado}</span>`;
    if (exp.estado === "Aprobado") estadoBadge = `<span class="badge badge-success">Aprobado</span>`;
    if (exp.estado === "Observado") estadoBadge = `<span class="badge badge-danger">Observado</span>`;

    tr.innerHTML = `
      <td style="font-weight:600; color: #93c5fd;">${exp.id}</td>
      <td>${prioBadge}</td>
      <td>
        <div style="font-weight: 500;">${exp.asunto}</div>
        ${exp.observacion ? `<small style="color: var(--text-secondary); font-size: 11px;">⚠️ ${exp.observacion}</small>` : ''}
      </td>
      <td>${exp.remitente}</td>
      <td>${exp.destinatario}</td>
      <td>${estadoBadge}</td>
      <td>${exp.diasTramite || 1}d</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="derivarExpedienteSGD('${exp.id}')" title="Aprobar / Derivar">
          ✓ Derivar
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filtrarExpedientesSGD(val) {
  filtroSgdActual = val;
  renderTablaSGD();
}

async function derivarExpedienteSGD(id) {
  alert(`Expediente ${id} derivado y sellado electrónicamente en SGD con firma digital.`);
  // Actualizar estado local
  const exp = MOCK_EXPEDIENTES.find(e => e.id === id);
  if (exp) exp.estado = "Aprobado";
  renderTablaSGD();
}

async function ejecutarSimulacionSGD() {
  const btn = document.getElementById("btnSimularSGD");
  btn.disabled = true;
  btn.textContent = "⏳ Generando 15 trámites diarios...";

  const resultado = await Api.simularIngresoSGD(15);

  const banner = document.getElementById("simuladorBanner");
  if (banner) {
    banner.style.display = "block";
    banner.style.background = "rgba(16, 185, 129, 0.2)";
    banner.style.border = "1px solid rgba(16, 185, 129, 0.4)";
    banner.style.color = "#34d399";
    banner.innerHTML = `<strong>✅ Simulación SGD Exitosa:</strong> Se incorporaron 15 nuevos expedientes con clasificación prioritaria automática. (Total en sistema: ${MOCK_EXPEDIENTES.length})`;
  }

  // Update counters
  MOCK_KPIS.expedientes.recibidosHoy += 15;
  MOCK_KPIS.expedientes.pendientes += 15;
  renderKPIs();
  renderTablaSGD();
  renderExpedientes();

  btn.disabled = false;
  btn.textContent = "📥 Simular Ingreso Diario (15 Expedientes SGD)";
}

function ejecutarSimulacionSIAF() {
  const devengadoSimulado = 350000;
  MOCK_KPIS.presupuesto.ejecutado += devengadoSimulado;
  MOCK_KPIS.presupuesto.porEjecutar -= devengadoSimulado;
  MOCK_KPIS.presupuesto.avancePorcentaje = ((MOCK_KPIS.presupuesto.ejecutado / MOCK_KPIS.presupuesto.pim) * 100).toFixed(1);

  renderKPIs();

  const banner = document.getElementById("simuladorBanner");
  if (banner) {
    banner.style.display = "block";
    banner.style.background = "rgba(59, 130, 246, 0.2)";
    banner.style.border = "1px solid rgba(59, 130, 246, 0.4)";
    banner.style.color = "#93c5fd";
    banner.innerHTML = `<strong>💰 Simulación SIAF:</strong> Se devengaron S/ 350,000 en partidas de cemento y combustible para OBR-001 y OBR-002. Avance financiero actualizado a ${MOCK_KPIS.presupuesto.avancePorcentaje}%.`;
  }
}

/* ══════════════════════════════════════
   ASISTENTE INTELIGENTE ON-PREMISE
   ══════════════════════════════════════ */

async function enviarConsultaAsistente() {
  const input = document.getElementById("chatInput");
  const msg = input.value.trim();
  if (!msg) return;

  const chat = document.getElementById("chatMessages");

  // User message
  const userDiv = document.createElement("div");
  userDiv.style.alignSelf = "flex-end";
  userDiv.style.background = "rgba(59, 130, 246, 0.25)";
  userDiv.style.border = "1px solid rgba(59, 130, 246, 0.4)";
  userDiv.style.padding = "10px 14px";
  userDiv.style.borderRadius = "8px";
  userDiv.style.maxWidth = "80%";
  userDiv.style.fontSize = "13.5px";
  userDiv.innerHTML = `<strong>Usted:</strong> ${msg}`;
  chat.appendChild(userDiv);

  input.value = "";
  chat.scrollTop = chat.scrollHeight;

  // Bot loading
  const botDiv = document.createElement("div");
  botDiv.style.alignSelf = "flex-start";
  botDiv.style.background = "rgba(30, 41, 59, 0.9)";
  botDiv.style.border = "1px solid var(--border-color)";
  botDiv.style.borderLeft = "3px solid #10b981";
  botDiv.style.padding = "12px 16px";
  botDiv.style.borderRadius = "8px";
  botDiv.style.maxWidth = "85%";
  botDiv.style.fontSize = "13.5px";
  botDiv.style.lineHeight = "1.5";
  botDiv.innerHTML = `<em>Consultando motor de conocimiento local de PRORRIDRE...</em>`;
  chat.appendChild(botDiv);
  chat.scrollTop = chat.scrollHeight;

  const session = Auth.getSession();
  const res = await Api.consultarAsistente(msg, session ? session.rol : "Directivo");

  // Format response with linebreaks
  const formatted = (res.respuesta || "").replace(/\n/g, "<br>");
  botDiv.innerHTML = `
    <div style="font-size: 11px; color: #10b981; font-weight:600; margin-bottom: 4px;">🤖 ASISTENTE INSTITUCIONAL PRORRIDRE</div>
    ${formatted}
    <div style="margin-top: 8px; font-size: 10.5px; color: var(--text-secondary); border-top: 1px solid rgba(255,255,255,0.08); padding-top: 4px;">
      Fuente: ${res.fuente || 'Base On-Premise'}
    </div>
  `;
  chat.scrollTop = chat.scrollHeight;
}

function preguntarRapido(texto) {
  const input = document.getElementById("chatInput");
  input.value = texto;
  enviarConsultaAsistente();
}

/* ══════════════════════════════════════
   INITIALIZE
   ══════════════════════════════════════ */

async function init() {
  renderKPIs();
  renderAlertPreview();
  renderAlertFull('all');
  renderObrasPreview();
  renderObrasFull();
  renderExpedientes();
  renderAlmacen();
  renderCompras();
  initExecutiveCharts();

  // Check backend and update indicators
  const isOnline = await Api.checkHealth();
  const modeBanner = document.getElementById("modeBanner");
  if (modeBanner) {
    if (isOnline) {
      modeBanner.innerHTML = "🟢 API FastAPI On-Premise En Línea (127.0.0.1:8000)";
      modeBanner.style.background = "rgba(16, 185, 129, 0.2)";
      modeBanner.style.color = "#34d399";
      modeBanner.style.borderColor = "rgba(16, 185, 129, 0.4)";
    } else {
      modeBanner.innerHTML = "⚡ Modo Local Activo (Red LAN 1000 Mbps)";
      modeBanner.style.background = "rgba(245, 158, 11, 0.2)";
      modeBanner.style.color = "#fbbf24";
      modeBanner.style.borderColor = "rgba(245, 158, 11, 0.4)";
    }
  }

  // Cargar diagnóstico real de cable de red y escaneo de IPs al iniciar
  diagnosticarCableMiEquipo();
  if (typeof window.cargarTablaAdvancedIpScanner === "function") {
    window.cargarTablaAdvancedIpScanner();
  }
}

/* ══════════════════════════════════════
   FLOATING AI AGENT CONTROLS
   ══════════════════════════════════════ */

function toggleFloatingAi() {
  const win = document.getElementById("floatingAiWindow");
  if (!win) return;
  win.classList.toggle("open");
  if (win.classList.contains("open")) {
    setTimeout(() => {
      const inp = document.getElementById("floatingChatInput");
      if (inp) inp.focus();
    }, 150);
  }
}

function preguntarFlotante(texto) {
  const input = document.getElementById("floatingChatInput");
  if (input) {
    input.value = texto;
    enviarConsultaFlotante();
  }
}

async function enviarConsultaFlotante() {
  const input = document.getElementById("floatingChatInput");
  const msg = input.value.trim();
  if (!msg) return;

  const chat = document.getElementById("floatingChatMessages");

  // User Bubble
  const userDiv = document.createElement("div");
  userDiv.style.alignSelf = "flex-end";
  userDiv.style.background = "rgba(37, 99, 235, 0.35)";
  userDiv.style.border = "1px solid rgba(59, 130, 246, 0.4)";
  userDiv.style.padding = "8px 12px";
  userDiv.style.borderRadius = "10px";
  userDiv.style.maxWidth = "85%";
  userDiv.style.fontSize = "12.5px";
  userDiv.innerHTML = `<strong>Tú:</strong> ${msg}`;
  chat.appendChild(userDiv);

  input.value = "";
  chat.scrollTop = chat.scrollHeight;

  // Bot loading
  const botDiv = document.createElement("div");
  botDiv.style.alignSelf = "flex-start";
  botDiv.style.background = "rgba(30, 41, 59, 0.9)";
  botDiv.style.border = "1px solid var(--c-border)";
  botDiv.style.borderLeft = "3px solid #10b981";
  botDiv.style.padding = "10px 14px";
  botDiv.style.borderRadius = "10px";
  botDiv.style.maxWidth = "90%";
  botDiv.style.fontSize = "12.5px";
  botDiv.style.lineHeight = "1.45";
  botDiv.innerHTML = `<em>Consultando motor de red y datos locales...</em>`;
  chat.appendChild(botDiv);
  chat.scrollTop = chat.scrollHeight;

  const session = Auth.getSession();
  const res = await Api.consultarAsistente(msg, session ? session.rol : "Directivo");

  const formatted = (res.respuesta || "").replace(/\n/g, "<br>");
  botDiv.innerHTML = `
    <div style="font-size: 11px; color: #10b981; font-weight:700; margin-bottom: 4px;">🤖 ASISTENTE INSTITUCIONAL</div>
    ${formatted}
    <div style="margin-top: 6px; font-size: 10px; color: var(--c-text-muted); border-top: 1px solid rgba(255,255,255,0.06); padding-top: 3px;">
      Fuente: ${res.fuente || 'Base On-Premise'}
    </div>
  `;
  chat.scrollTop = chat.scrollHeight;
}

/* ══════════════════════════════════════
   NETWORK CABLE & TOPOLOGY DIAGNOSTICS
   ══════════════════════════════════════ */

let isInternetFallaSimulada = false;

async function diagnosticarCableMiEquipo() {
  const btn = document.getElementById("btnDiagCable");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Analizando cable y ping...";
  }

  try {
    const datos = await Api.getMiConexion();

    // Actualizar tarjeta de diagnóstico del cable
    const elemInterfaz = document.getElementById("diagInterfaz");
    const elemTipo = document.getElementById("diagTipoCable");
    const elemVelocidad = document.getElementById("diagVelocidad");
    const elemIp = document.getElementById("diagIp");
    const elemSwitchPort = document.getElementById("diagSwitchPort");
    const elemInternet = document.getElementById("diagInternetStatus");
    const elemStatusText = document.getElementById("cableHostStatusText");
    const elemHostName = document.getElementById("topoHostName");
    const elemHostIp = document.getElementById("topoHostIp");

    if (elemInterfaz) elemInterfaz.textContent = datos.interfaz_nombre || "Ethernet GbE";
    if (elemTipo) elemTipo.textContent = datos.tipo_cable || "UTP Cat 6 / RJ45";
    if (elemVelocidad) elemVelocidad.textContent = (datos.velocidad_mbps || 1000) + " Mbps (Full Duplex)";
    if (elemIp) elemIp.textContent = datos.ip_local || "192.168.0.10";
    if (elemSwitchPort) elemSwitchPort.textContent = datos.switch_conectado || "Switch Core (GbE-12)";
    if (elemHostName) elemHostName.textContent = datos.equipo || "Mi Computadora";
    if (elemHostIp) elemHostIp.textContent = "IP: " + (datos.ip_local || "192.168.0.10");

    if (elemInternet) {
      if (datos.internet_online) {
        elemInternet.innerHTML = "🟢 Enlace Activo";
        elemInternet.style.color = "#34d399";
      } else {
        elemInternet.innerHTML = "🔴 Enlace Caído";
        elemInternet.style.color = "#f87171";
        if (datos.motivo_falla && datos.motivo_falla !== "Sin fallas reportadas") {
          mostrarAlertaRed(datos.motivo_falla);
        }
      }
    }

    if (elemStatusText) {
      elemStatusText.textContent = `${datos.tipo_cable} · ${datos.velocidad_mbps || 1000} Mbps Gigabit`;
    }

    // Desbloquear y alimentar de inmediato el Gemelo Digital 3D
    if (window.Network3D) {
      await window.Network3D.updateStatus(datos);
    }
  } catch (err) {
    console.error("Error en diagnosticarCableMiEquipo:", err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "⚡ Diagnosticar Cable y Ping";
    }
  }
}

async function toggleSimularFallaInternet() {
  isInternetFallaSimulada = !isInternetFallaSimulada;
  const btn = document.getElementById("btnToggleFalla");
  const trunk = document.getElementById("cableWanTrunk");
  const modem = document.getElementById("topoWanModem");
  const modemPort = document.getElementById("modemStatePort");
  const dotInternet = document.getElementById("infraDotInternet");
  const badgeInternet = document.getElementById("infraBadgeInternet");
  const textoCaida = document.getElementById("infraTextoCaida");
  const diagInternet = document.getElementById("diagInternetStatus");
  const statusInternet = document.getElementById("statusInternet");

  await Api.simularFallaInternet(isInternetFallaSimulada);

  if (isInternetFallaSimulada) {
    if (btn) {
      btn.textContent = "🟢 Restablecer Conexión Internet";
      btn.className = "btn btn-sm btn-success";
    }
    if (trunk) {
      trunk.style.borderColor = "#ef4444";
      trunk.style.color = "#f87171";
      trunk.textContent = "⚠️ ENLACE WAN CAÍDO (Bucle ISP 2h) — RED LAN 1000 Mbps OPERATIVA ⚠️";
    }
    if (modem) {
      modem.classList.add("device-offline");
    }
    if (modemPort) {
      modemPort.style.background = "rgba(239, 68, 68, 0.2)";
      modemPort.style.color = "#f87171";
      modemPort.textContent = "🔴 SIN SEÑAL WAN (Telefónica)";
    }
    if (dotInternet) dotInternet.className = "infra-status-dot dot-caido";
    if (badgeInternet) {
      badgeInternet.textContent = "CAÍDO";
      badgeInternet.className = "alert-tag tag-mu";
    }
    if (textoCaida) textoCaida.textContent = "⏱️ Tiempo de caída: Bucle activo (1h 32m). Modo LAN On-Premise activado.";
    if (diagInternet) {
      diagInternet.innerHTML = "🔴 Enlace Caído";
      diagInternet.style.color = "#f87171";
    }
    if (statusInternet) {
      statusInternet.className = "status-indicator status-offline";
      statusInternet.innerHTML = `<span class="dot"></span> Internet: Caído (Simulado)`;
    }

    mostrarAlertaRed("Se ha detectado una caída en el enlace a Internet (Telefónica del Perú). Tu cable de red Ethernet RJ45 sigue 100% conectado a 1000 Mbps a la LAN local.");
  } else {
    if (btn) {
      btn.textContent = "🚨 Simular Falla de Internet (Bucle 2h)";
      btn.className = "btn btn-sm btn-danger";
    }
    if (trunk) {
      trunk.style.borderColor = "rgba(59, 130, 246, 0.5)";
      trunk.style.color = "#60a5fa";
      trunk.textContent = "⬇️ Cable WAN Ethernet (RJ45 Cat 6) ⬇️";
    }
    if (modem) {
      modem.classList.remove("device-offline");
    }
    if (modemPort) {
      modemPort.style.background = "rgba(16, 185, 129, 0.15)";
      modemPort.style.color = "#34d399";
      modemPort.textContent = "IP: 190.119.45.82 · ONLINE";
    }
    if (dotInternet) dotInternet.className = "infra-status-dot dot-activo";
    if (badgeInternet) {
      badgeInternet.textContent = "EN LÍNEA";
      badgeInternet.className = "alert-tag tag-n";
    }
    if (textoCaida) textoCaida.textContent = "⏱️ Enlace estable a 50 Mbps con Telefónica del Perú.";
    if (diagInternet) {
      diagInternet.innerHTML = "🟢 Enlace Activo";
      diagInternet.style.color = "#34d399";
    }
    if (statusInternet) {
      statusInternet.className = "status-indicator status-online";
      statusInternet.innerHTML = `<span class="dot"></span> Internet: Conectado ✓`;
    }

    cerrarAlertaRed();
  }
}

function mostrarAlertaRed(descripcion) {
  const alertBox = document.getElementById("floatingNetworkAlert");
  const alertDesc = document.getElementById("alertNetDesc");
  if (alertBox) {
    if (alertDesc && descripcion) alertDesc.textContent = descripcion;
    alertBox.style.display = "flex";
  }
}

function cerrarAlertaRed() {
  const alertBox = document.getElementById("floatingNetworkAlert");
  if (alertBox) alertBox.style.display = "none";
}

// ══════════════════════════════════════════════════════════════════════════════
// ⚡ ADVANCED IP SCANNER: TABLA DE MONITOREO DE SUBRED Y DETECCIÓN EN VIVO
// ══════════════════════════════════════════════════════════════════════════════

let _cachedAdvancedIpDevices = [];

window.cargarTablaAdvancedIpScanner = async function() {
  const tbody = document.getElementById("tablaAdvancedIpScannerBody");
  const totalVivosElem = document.getElementById("scanTotalVivos");
  const totalAlertasElem = document.getElementById("scanTotalAlertas");
  if (!tbody) return;

  try {
    const data = await Api.getDispositivosVivos();
    if (!data || !data.dispositivos) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:18px; color:#f87171;">⚠️ No se pudo obtener la telemetría de subred. Conectando al backend...</td></tr>`;
      return;
    }

    _cachedAdvancedIpDevices = data.dispositivos;
    if (totalVivosElem) totalVivosElem.textContent = `${data.online} activos`;
    if (totalAlertasElem) totalAlertasElem.textContent = `${data.alerta} vulnerables`;

    window.renderFilasTablaAdvancedIpScanner(_cachedAdvancedIpDevices);
  } catch (err) {
    console.error("Error al cargar tabla Advanced IP Scanner:", err);
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:18px; color:#f87171;">Error al consultar Advanced IP Scanner: ${err.message}</td></tr>`;
  }
};

window.renderFilasTablaAdvancedIpScanner = function(lista) {
  const tbody = document.getElementById("tablaAdvancedIpScannerBody");
  if (!tbody) return;

  if (!lista || lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px; color:#94a3b8;">No se encontraron dispositivos con el filtro especificado.</td></tr>`;
    return;
  }

  let html = "";
  lista.forEach(dev => {
    const isOnline = dev.status === "online";
    const isDin = dev.dinamico === true;
    const badgeStatus = isOnline 
      ? `<span style="background:rgba(16,185,129,0.2); color:#34d399; border:1px solid rgba(16,185,129,0.4); padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700;">🟢 Online</span>`
      : `<span style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid rgba(239,68,68,0.4); padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700;">⚠️ Alerta</span>`;

    const serviciosPills = (dev.servicios || []).map(s => {
      const isRdp = s.includes("3389") || s.includes("RDP");
      const isSmb = s.includes("445") || s.includes("SMB");
      const isPrint = s.includes("9100") || s.includes("JetDirect");
      const color = isRdp ? "#38bdf8" : (isSmb ? "#a855f7" : (isPrint ? "#fbbf24" : "#10b981"));
      return `<span style="display:inline-block; margin:1px 3px 1px 0; padding:1px 6px; border-radius:4px; font-size:10px; background:rgba(30,41,59,0.9); border:1px solid ${color}; color:${color};">${s}</span>`;
    }).join("");

    const actionDesconectar = isDin 
      ? `<button class="btn btn-sm btn-ghost" onclick="window.desconectarComputadora('${dev.ip}')" title="Desconectar y retirar cable del modelo 3D" style="padding:3px 8px; color:#ef4444; border:1px solid rgba(239,68,68,0.3); font-size:11px; border-radius:6px; margin-left:4px;">✕ Desconectar</button>`
      : "";

    html += `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.05); transition:background 0.2s;" onmouseover="this.style.background='rgba(30,41,59,0.6)'" onmouseout="this.style.background='transparent'">
        <td style="padding:8px 12px; white-space:nowrap;">${badgeStatus}</td>
        <td style="padding:8px 12px; font-family:var(--font-mono); font-weight:700; color:#38bdf8; white-space:nowrap;">
          ${dev.ip}
          ${isDin ? '<span style="font-size:9.5px; background:#10b981; color:#fff; padding:1px 5px; border-radius:3px; margin-left:4px;">NUEVO</span>' : ''}
        </td>
        <td style="padding:8px 12px; font-weight:600; color:#f1f5f9; white-space:nowrap;">${dev.hostname || dev.nombre}</td>
        <td style="padding:8px 12px; color:#cbd5e1; font-size:11.5px; max-width:200px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${dev.usuario || '--'}</td>
        <td style="padding:8px 12px; font-family:var(--font-mono); font-size:11px; color:#fbbf24; white-space:nowrap;">${dev.mac || '--'}</td>
        <td style="padding:8px 12px; color:#94a3b8; font-size:11px; white-space:nowrap;">${dev.vendor || '--'}</td>
        <td style="padding:8px 12px; color:#cbd5e1; font-size:11px; white-space:nowrap;">
          ${(dev.os || '').includes('Windows 7') ? '<span style="color:#f87171; font-weight:700;">⚠️ ' + dev.os + '</span>' : dev.os}
        </td>
        <td style="padding:8px 12px; min-width:160px;">${serviciosPills || '<span style="color:#64748b; font-size:10px;">ICMP Ping</span>'}</td>
        <td style="padding:8px 12px; font-family:var(--font-mono); font-size:11px; color:#34d399; white-space:nowrap;">${dev.ping_ms} ms</td>
        <td style="padding:8px 12px; text-align:center; white-space:nowrap;">
          <button class="btn btn-sm btn-primary" onclick="window.buscarDispositivo3D('${dev.ip}'); window.seleccionarDispositivoBuscado('${dev.hostname || dev.ip}');" title="Centrar cámara 3D sobre el equipo" style="padding:3px 10px; font-size:11px; border-radius:6px;">
            🔍 Ver en 3D
          </button>
          ${actionDesconectar}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
};

window.filtrarTablaAdvancedIpScanner = function(q) {
  const query = (q || "").trim().toLowerCase();
  if (!query) {
    window.renderFilasTablaAdvancedIpScanner(_cachedAdvancedIpDevices);
    return;
  }
  const filtrados = _cachedAdvancedIpDevices.filter(d => {
    return (d.ip && d.ip.toLowerCase().includes(query)) ||
           (d.hostname && d.hostname.toLowerCase().includes(query)) ||
           (d.nombre && d.nombre.toLowerCase().includes(query)) ||
           (d.usuario && d.usuario.toLowerCase().includes(query)) ||
           (d.mac && d.mac.toLowerCase().includes(query)) ||
           (d.vendor && d.vendor.toLowerCase().includes(query)) ||
           (d.os && d.os.toLowerCase().includes(query));
  });
  window.renderFilasTablaAdvancedIpScanner(filtrados);
};

document.addEventListener("DOMContentLoaded", init);

