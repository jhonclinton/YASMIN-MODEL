/* ═══════════════════════════════════════════════════════════════
   PRORRIDRE SMART DASHBOARD — AUTHENTICATION MODULE
   ═══════════════════════════════════════════════════════════════ */

const Auth = {
  SESSION_KEY: "prorridre_session",
  TOKEN_KEY: "prorridre_token",
  USERS_KEY: "prorridre_custom_users",

  /** Get registered custom users from localStorage */
  getRegisteredUsers() {
    try {
      const raw = localStorage.getItem(this.USERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /** Authenticate user against local/mock data */
  login(identifier, password) {
    const localUsers = this.getRegisteredUsers();
    const allUsers = [...localUsers, ...MOCK_USERS];
    const user = allUsers.find(
      u => (u.dni === identifier || u.username === identifier) && u.password === password
    );
    if (!user) return { success: false, message: "DNI/Usuario o contraseña incorrectos." };
    const session = {
      id: user.id || ("USR-" + Date.now()),
      dni: user.dni,
      username: user.username,
      nombre: user.nombre,
      cargo: user.cargo || "Especialista PRORRIDRE",
      rol: user.rol,
      avatar: user.avatar || "assets/avatar.jpg",
      token: btoa((user.id || user.username) + ":" + Date.now()),
      loginTime: new Date().toISOString()
    };
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(this.TOKEN_KEY, session.token);
    return { success: true, session };
  },

  /** Register new user locally (fallback when offline) */
  register(userData) {
    const localUsers = this.getRegisteredUsers();
    const allUsers = [...localUsers, ...MOCK_USERS];
    
    if (allUsers.some(u => u.dni === userData.dni || u.username === userData.username)) {
      return { success: false, message: "Ya existe un usuario registrado con este DNI o nombre de usuario." };
    }

    const newUser = {
      id: "USR-" + (allUsers.length + 10).toString().padStart(3, "0"),
      dni: userData.dni,
      username: userData.username,
      password: userData.password,
      nombre: userData.nombre,
      cargo: userData.cargo || "Personal PRORRIDRE",
      rol: userData.rol,
      avatar: userData.avatar || "assets/avatar.jpg"
    };

    localUsers.push(newUser);
    localStorage.setItem(this.USERS_KEY, JSON.stringify(localUsers));

    const session = {
      id: newUser.id,
      dni: newUser.dni,
      username: newUser.username,
      nombre: newUser.nombre,
      cargo: newUser.cargo,
      rol: newUser.rol,
      avatar: newUser.avatar,
      token: btoa(newUser.id + ":" + Date.now()),
      loginTime: new Date().toISOString()
    };
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(this.TOKEN_KEY, session.token);
    return { success: true, session, message: "Usuario registrado con éxito." };
  },

  /** Get current session */
  getSession() {
    const raw = localStorage.getItem(this.SESSION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.nombre || parsed.username) && parsed.rol) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  },

  /** Check if user is authenticated */
  isAuthenticated() {
    return this.getSession() !== null;
  },

  /** Logout */
  logout() {
    localStorage.removeItem(this.SESSION_KEY);
    localStorage.removeItem(this.TOKEN_KEY);
    window.location.href = "index.html";
  },

  /** Protect route — redirect to login if not authenticated */
  protect() {
    if (!this.isAuthenticated()) {
      window.location.href = "index.html";
      return false;
    }
    return true;
  },

  /** Check if role has access to a module */
  hasAccess(module) {
    const session = this.getSession();
    if (!session) return false;
    const ACCESS_MAP = {
      "Directivo":        ["ejecutiva", "logistica", "infraestructura", "alertas", "reportes", "emulador", "asistente"],
      "Residente de Obra": ["logistica", "alertas", "reportes", "emulador", "asistente"],
      "Abastecimiento":   ["logistica", "alertas", "reportes", "emulador", "asistente"],
      "TI Admin":         ["ejecutiva", "logistica", "infraestructura", "alertas", "reportes", "emulador", "asistente"]
    };
    const allowed = ACCESS_MAP[session.rol] || ["ejecutiva", "logistica", "infraestructura", "alertas", "reportes", "emulador", "asistente"];
    return allowed.includes(module);
  }
};
