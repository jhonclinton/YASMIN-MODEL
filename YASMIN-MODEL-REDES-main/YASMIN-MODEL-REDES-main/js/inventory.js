const InventoryUI = {
  devices: [],
  filtered: [],
  page: 1,
  pageSize: 25,
  sortField: "ip",
  sortDirection: 1,
  selectedFloor: "",
  toastTimer: null,

  types: [
    ["Computadora", "🖥️"],
    ["Laptop", "💻"],
    ["Impresora", "🖨️"],
    ["Servidor", "🗄️"],
    ["Switch", "🔀"],
    ["Router", "🌐"],
    ["Deco", "📶"],
    ["Celular/otro", "📱"]
  ],

  floors: [
    ["0", "Sin asignar"],
    ["1", "Piso 1"],
    ["2", "Piso 2"],
    ["3", "Piso 3"],
    ["4", "Piso 4"],
    ["5", "Piso 5"],
    ["6", "Piso 6"],
    ["7", "Piso 7"]
  ],

  escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  },

  async load() {
    const body = document.getElementById("networkInventoryBody");
    if (!body) return;
    try {
      const result = await Api.getNetworkInventory();
      this.devices = result.dispositivos;
      this.renderSummary(result);
      this.renderFilterOptions(result);
      this.page = 1;
      this.render();
    } catch (error) {
      body.innerHTML = `<tr><td colspan="8" class="inventory-empty inventory-error">${this.escape(error.message)}</td></tr>`;
      this.showToast(`No se pudo cargar el inventario: ${error.message}`, true);
    }
  },

  renderSummary(result) {
    const cards = document.getElementById("inventoryTypeCards");
    const cardTypes = [
      ["Computadora", "Computadoras", "🖥️"],
      ["Laptop", "Laptops", "💻"],
      ["Impresora", "Impresoras", "🖨️"]
    ];
    cards.innerHTML = cardTypes.map(([key, label, icon]) =>
      `<article class="inventory-type-card"><span aria-hidden="true">${icon}</span><div><strong>${result.tipos[key] || 0}</strong><small>${label}</small></div></article>`
    ).join("");

    const progress = result.total ? Math.round(result.validacion.validado / result.total * 100) : 0;
    document.getElementById("inventoryProgress").value = progress;
    document.getElementById("inventoryProgressLabel").textContent =
      `${result.validacion.validado} de ${result.total} validados (${progress}%) · ${result.validacion.corregido} corregidos · ${result.validacion.pendiente} pendientes`;

    document.getElementById("inventoryFloorProgress").innerHTML =
      Array.from({ length: 7 }, (_, index) => {
        const floor = index + 1;
        const counts = result.pisos[String(floor)] || { total: 0, validados: 0 };
        const percent = counts.total ? Math.round(counts.validados / counts.total * 100) : 0;
        return `<div class="inventory-floor-progress-item"><span>Piso ${floor}</span><progress max="100" value="${percent}" aria-label="Validación del piso ${floor}"></progress><small>${counts.validados}/${counts.total}</small></div>`;
      }).join("");

    const floorTabs = document.getElementById("inventoryFloorTabs");
    const floorCounts = result.pisos;
    floorTabs.innerHTML = [
      `<button type="button" data-inventory-floor="" aria-pressed="${this.selectedFloor === ""}">Todos <span>${result.total}</span></button>`,
      ...Array.from({ length: 7 }, (_, index) => {
        const floor = String(index + 1);
        return `<button type="button" data-inventory-floor="${floor}" aria-pressed="${this.selectedFloor === floor}">Piso ${floor} <span>${floorCounts[floor]?.total || 0}</span></button>`;
      })
    ].join("");
  },

  renderFilterOptions(result) {
    const fill = (id, values, firstLabel) => {
      const select = document.getElementById(id);
      const current = select.value;
      select.innerHTML = `<option value="">${firstLabel}</option>` +
        values.map(value => `<option value="${this.escape(value)}">${this.escape(value)}</option>`).join("");
      if (values.includes(current)) select.value = current;
    };
    fill("inventorySubnetFilter", result.subredes, "Todas");
    fill("inventoryOfficeFilter", result.oficinas, "Todas");
  },

  getFiltered() {
    const query = document.getElementById("inventorySearch").value.trim().toLocaleLowerCase();
    const subnet = document.getElementById("inventorySubnetFilter").value;
    const office = document.getElementById("inventoryOfficeFilter").value;
    const floor = document.getElementById("inventoryFloorFilter").value;
    const type = document.getElementById("inventoryTypeFilter").value;
    const status = document.getElementById("inventoryStatusFilter").value;

    return this.devices.filter(device => {
      const matchesQuery = !query || [device.ip, device.nombre, device.mac]
        .some(value => String(value || "").toLocaleLowerCase().includes(query));
      return matchesQuery &&
        (!subnet || device.subred === subnet) &&
        (!office || device.oficina === office) &&
        (floor === "" || String(device.piso) === floor) &&
        (type === "" || device.tipo === type) &&
        (status === "" || device.estado_validacion === status) &&
        (this.selectedFloor === "" || String(device.piso) === this.selectedFloor);
    }).sort((left, right) => {
      const first = left[this.sortField];
      const second = right[this.sortField];
      const comparison = typeof first === "number" && typeof second === "number"
        ? first - second
        : String(first ?? "").localeCompare(String(second ?? ""), "es", { numeric: true, sensitivity: "base" });
      return comparison * this.sortDirection;
    });
  },

  render() {
    const body = document.getElementById("networkInventoryBody");
    if (!body) return;
    this.filtered = this.getFiltered();
    const pages = Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
    this.page = Math.min(this.page, pages);
    const start = (this.page - 1) * this.pageSize;
    const pageDevices = this.filtered.slice(start, start + this.pageSize);
    document.getElementById("inventoryResultsCount").textContent =
      `${this.filtered.length} resultado${this.filtered.length === 1 ? "" : "s"} de ${this.devices.length} equipos`;
    document.getElementById("inventoryPageLabel").textContent = `Página ${this.page} de ${pages}`;
    document.getElementById("inventoryPrevPage").disabled = this.page <= 1;
    document.getElementById("inventoryNextPage").disabled = this.page >= pages;

    if (!pageDevices.length) {
      body.innerHTML = `<tr><td colspan="8" class="inventory-empty">No hay equipos que coincidan con estos filtros.</td></tr>`;
      return;
    }

    body.innerHTML = pageDevices.map(device => {
      const typeIcon = this.types.find(([type]) => type === device.tipo)?.[1] || "📱";
      const floorName = device.piso ? `Piso ${device.piso}` : "Sin asignar";
      const statusName = device.estado_validacion === "validado" ? "Validado" :
        device.estado_validacion === "corregido" ? "Corregido" : "Pendiente";
      return `<tr data-device-row="${device.id}">
        <td><button type="button" class="inventory-edit-cell" data-action="edit" data-id="${device.id}" data-field="estado_validacion" aria-label="Editar estado de validación: ${statusName}"><span class="inventory-status-chip status-${this.escape(device.estado_validacion)}">${statusName}</span></button></td>
        ${this.editableCell(device, "ip", device.ip, "mono")}
        ${this.editableCell(device, "nombre", device.nombre || "Sin nombre")}
        ${this.editableCell(device, "mac", device.mac || "Sin MAC", "mono")}
        ${this.editableCell(device, "tipo", `${typeIcon} ${device.tipo}`)}
        ${this.editableCell(device, "oficina", device.oficina || "Sin asignar")}
        ${this.editableCell(device, "piso", floorName)}
        <td class="inventory-actions">
          <button type="button" class="inventory-action" data-action="history" data-id="${device.id}" aria-label="Ver historial de ${this.escape(device.nombre || device.ip)}">Historial</button>
          <button type="button" class="inventory-action" data-action="undo" data-id="${device.id}" aria-label="Deshacer último cambio de ${this.escape(device.nombre || device.ip)}">Deshacer</button>
          <button type="button" class="inventory-action inventory-delete" data-action="delete" data-id="${device.id}" aria-label="Eliminar ${this.escape(device.nombre || device.ip)}">Eliminar</button>
        </td>
      </tr>`;
    }).join("");
  },

  editableCell(device, field, label, extraClass = "") {
    return `<td><button type="button" class="inventory-edit-cell ${extraClass}" data-action="edit" data-id="${device.id}" data-field="${field}" aria-label="Editar ${field}: ${this.escape(label)}">${this.escape(label)}</button></td>`;
  },

  showToast(message, isError = false) {
    let toast = document.getElementById("inventoryToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "inventoryToast";
      toast.className = "inventory-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.toggle("inventory-toast-error", isError);
    toast.classList.add("visible");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
  },

  async saveField(device, field, value, editor) {
    if (editor.dataset.saving === "true") return;
    editor.dataset.saving = "true";
    try {
      await Api.updateNetworkDevice(device.id, { [field]: field === "piso" ? Number(value) : value });
      await this.load();
      await window.Network3D?.refreshInventoryBuilding(this.devices);
      this.showToast("Cambio guardado");
    } catch (error) {
      this.render();
      const message = error.equipo
        ? `Esa IP ya la usa ${error.equipo}. No se guardó el cambio.`
        : `${error.message} No se guardó el cambio.`;
      this.showToast(message, true);
    }
  },

  startEdit(button) {
    const device = this.devices.find(item => String(item.id) === button.dataset.id);
    if (!device) return;
    const field = button.dataset.field;
    const cell = button.closest("td");
    const initial = field === "piso" ? String(device.piso) : String(device[field] ?? "");
    let editor;
    if (field === "tipo" || field === "piso" || field === "estado_validacion") {
      editor = document.createElement("select");
      const choices = field === "tipo" ? this.types.map(([value, icon]) => [value, `${icon} ${value}`]) :
        field === "piso" ? this.floors : [
          ["validado", "Validado"], ["corregido", "Corregido"], ["pendiente", "Pendiente"]
        ];
      choices.forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        editor.appendChild(option);
      });
    } else {
      editor = document.createElement("input");
      editor.type = "text";
      editor.maxLength = field === "ip" ? 15 : field === "mac" ? 17 : 160;
      editor.autocomplete = "off";
      editor.className = field === "ip" || field === "mac" ? "font-mono" : "";
    }
    editor.classList.add("inventory-inline-editor");
    editor.setAttribute("aria-label", `Editar ${field} de ${device.nombre || device.ip}`);
    editor.value = initial;
    cell.replaceChildren(editor);
    editor.focus();
    if (editor.select) editor.select();

    let completed = false;
    const cancel = () => {
      if (completed) return;
      completed = true;
      this.render();
    };
    const commit = () => {
      if (completed) return;
      completed = true;
      const next = editor.value.trim();
      if (next === initial) {
        this.render();
        return;
      }
      this.saveField(device, field, next, editor);
    };
    editor.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      } else if (event.key === "Enter") {
        event.preventDefault();
        commit();
      }
    });
    editor.addEventListener("blur", commit);
    editor.addEventListener("change", () => {
      if (editor.tagName === "SELECT") commit();
    });
  },

  setModal(modal, open) {
    modal.hidden = !open;
    if (open) {
      modal.querySelector("input, select, button")?.focus();
      document.body.classList.add("inventory-modal-open");
    } else if (!document.querySelector(".inventory-modal:not([hidden])")) {
      document.body.classList.remove("inventory-modal-open");
    }
  },

  async showHistory(id) {
    const modal = document.getElementById("inventoryHistoryModal");
    const content = document.getElementById("inventoryHistoryContent");
    content.textContent = "Cargando historial…";
    this.setModal(modal, true);
    try {
      const history = await Api.getNetworkDeviceHistory(id);
      if (!history.length) {
        content.textContent = "Este equipo no tiene cambios registrados.";
        return;
      }
      content.innerHTML = history.map(event => {
        const previous = this.escape(JSON.stringify(event.valores_anteriores, null, 2));
        const next = this.escape(JSON.stringify(event.valores_nuevos, null, 2));
        return `<article class="inventory-history-event"><strong>${this.escape(event.accion)}</strong><time>${this.escape(event.creado_al)}</time><details><summary>Ver valores registrados</summary><pre>${previous}\n→\n${next}</pre></details></article>`;
      }).join("");
    } catch (error) {
      content.textContent = `No se pudo cargar el historial: ${error.message}`;
    }
  },

  async handleAction(button) {
    const id = Number(button.dataset.id);
    if (button.dataset.action === "edit") {
      this.startEdit(button);
      return;
    }
    if (button.dataset.action === "history") {
      await this.showHistory(id);
      return;
    }
    if (button.dataset.action === "undo") {
      if (!window.confirm("¿Deshacer el último cambio registrado para este equipo?")) return;
      try {
        const result = await Api.undoNetworkDeviceChange(id);
        if (result.eliminado) this.devices = this.devices.filter(device => device.id !== id);
        else this.devices = this.devices.map(device => device.id === id ? result.dispositivo : device);
        await this.load();
        await window.Network3D?.refreshInventoryBuilding(this.devices);
        this.showToast("Último cambio deshecho");
      } catch (error) {
        this.showToast(error.message, true);
      }
      return;
    }
    if (button.dataset.action === "delete") {
      const device = this.devices.find(item => item.id === id);
      if (!window.confirm(`¿Eliminar ${device?.nombre || device?.ip || "este equipo"}?`)) return;
      try {
        await Api.deleteNetworkDevice(id);
        await this.load();
        await window.Network3D?.refreshInventoryBuilding(this.devices);
        this.showToast("Equipo eliminado");
      } catch (error) {
        this.showToast(error.message, true);
      }
    }
  },

  async addDevice(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errorBox = document.getElementById("inventoryFormError");
    const submit = document.getElementById("inventorySaveButton");
    errorBox.textContent = "";
    submit.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      data.piso = Number(data.piso);
      await Api.createNetworkDevice(data);
      this.setModal(document.getElementById("inventoryDeviceModal"), false);
      form.reset();
      await this.load();
      await window.Network3D?.refreshInventoryBuilding(this.devices);
      this.showToast("Equipo agregado");
    } catch (error) {
      errorBox.textContent = error.equipo
        ? `La IP ya está registrada en ${error.equipo}.`
        : error.message;
    } finally {
      submit.disabled = false;
    }
  },

  exportCsv() {
    const columns = ["ip", "subred", "nombre", "mac", "tipo", "oficina", "piso_nombre", "estado_validacion"];
    const rows = [columns, ...this.filtered.map(device =>
      columns.map(column => column === "piso_nombre" ? device.piso_nombre : device[column] ?? "")
    )];
    const csv = "\uFEFF" + rows.map(row =>
      row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")
    ).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventario-red.csv";
    link.click();
    URL.revokeObjectURL(url);
  },

  initialize() {
    const body = document.getElementById("networkInventoryBody");
    if (!body) return;
    this.load();
    document.getElementById("inventoryAddButton").addEventListener("click", () =>
      this.setModal(document.getElementById("inventoryDeviceModal"), true));
    document.getElementById("inventoryDeviceForm").addEventListener("submit", event => this.addDevice(event));
    window.abrirModalNuevoDispositivo = () => this.setModal(document.getElementById("inventoryDeviceModal"), true);
    document.querySelectorAll("[data-close-inventory-modal]").forEach(button => button.addEventListener("click", () =>
      this.setModal(button.closest(".inventory-modal"), false)));
    document.querySelectorAll(".inventory-modal").forEach(modal => modal.addEventListener("click", event => {
      if (event.target === modal) this.setModal(modal, false);
      if (event.key === "Escape") this.setModal(modal, false);
    }));
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        document.querySelectorAll(".inventory-modal:not([hidden])").forEach(modal => this.setModal(modal, false));
      }
    });
    body.addEventListener("click", event => {
      const button = event.target.closest("button[data-action]");
      if (button) this.handleAction(button);
    });
    body.addEventListener("keydown", event => {
      if (!["ArrowDown", "ArrowUp"].includes(event.key) || !event.target.matches("button.inventory-edit-cell")) return;
      const rows = [...body.querySelectorAll("tr[data-device-row]")];
      const currentRow = rows.indexOf(event.target.closest("tr"));
      const column = [...event.target.closest("tr").querySelectorAll("button.inventory-edit-cell")].indexOf(event.target);
      const nextRow = rows[currentRow + (event.key === "ArrowDown" ? 1 : -1)];
      if (nextRow) {
        event.preventDefault();
        nextRow.querySelectorAll("button.inventory-edit-cell")[column]?.focus();
      }
    });
    document.getElementById("inventoryFloorTabs").addEventListener("click", event => {
      const tab = event.target.closest("button[data-inventory-floor]");
      if (!tab) return;
      this.selectedFloor = tab.dataset.inventoryFloor;
      this.renderSummary({
        total: this.devices.length,
        tipos: Object.fromEntries(this.types.map(([type]) => [type, this.devices.filter(device => device.tipo === type).length])),
        validacion: {
          validado: this.devices.filter(device => device.estado_validacion === "validado").length,
          corregido: this.devices.filter(device => device.estado_validacion === "corregido").length,
          pendiente: this.devices.filter(device => device.estado_validacion === "pendiente").length
        },
        pisos: Object.fromEntries(this.floors.map(([floor]) => [floor, {
          total: this.devices.filter(device => String(device.piso) === floor).length,
          validados: this.devices.filter(device => String(device.piso) === floor && device.estado_validacion === "validado").length
        }]))
      });
      this.page = 1;
      this.render();
    });
    ["inventorySearch", "inventorySubnetFilter", "inventoryOfficeFilter", "inventoryFloorFilter", "inventoryTypeFilter", "inventoryStatusFilter"]
      .forEach(id => document.getElementById(id).addEventListener("input", () => {
        this.page = 1;
        this.render();
      }));
    document.getElementById("inventoryClearFilters").addEventListener("click", () => {
      ["inventorySearch", "inventorySubnetFilter", "inventoryOfficeFilter", "inventoryFloorFilter", "inventoryTypeFilter", "inventoryStatusFilter"]
        .forEach(id => { document.getElementById(id).value = ""; });
      this.selectedFloor = "";
      this.renderSummary({
        total: this.devices.length,
        tipos: Object.fromEntries(this.types.map(([type]) => [type, this.devices.filter(device => device.tipo === type).length])),
        validacion: {
          validado: this.devices.filter(device => device.estado_validacion === "validado").length,
          corregido: this.devices.filter(device => device.estado_validacion === "corregido").length,
          pendiente: this.devices.filter(device => device.estado_validacion === "pendiente").length
        },
        pisos: Object.fromEntries(this.floors.map(([floor]) => [floor, {
          total: this.devices.filter(device => String(device.piso) === floor).length,
          validados: this.devices.filter(device => String(device.piso) === floor && device.estado_validacion === "validado").length
        }]))
      });
      this.page = 1;
      this.render();
    });
    document.getElementById("inventoryExportCsv").addEventListener("click", () => this.exportCsv());
    document.getElementById("inventoryPrevPage").addEventListener("click", () => {
      this.page--;
      this.render();
    });
    document.getElementById("inventoryNextPage").addEventListener("click", () => {
      this.page++;
      this.render();
    });
    document.querySelector(".inventory-table thead").addEventListener("click", event => {
      const button = event.target.closest("button[data-sort]");
      if (!button) return;
      this.sortDirection = this.sortField === button.dataset.sort ? -this.sortDirection : 1;
      this.sortField = button.dataset.sort;
      this.render();
    });
  }
};

window.cargarTablaAdvancedIpScanner = () => InventoryUI.load();
document.addEventListener("DOMContentLoaded", () => InventoryUI.initialize());
