// Registro de uso para el reporte del sistema de evaluación de inglés.
// - En el hotel (la app servida por el sistema de evaluación, http://…/apps/<app>/) valida el número
//   de colaborador con ese servidor y le manda la actividad directamente.
// - En la versión de internet (https, GitHub Pages) manda la actividad a la hoja de Google del
//   instructor (REMOTE_URL; código en scripts/google-apps-script/registro-uso.gs) y el sistema de
//   evaluación la importa al abrir el reporte. Ahí no se puede validar el número: el reporte señala
//   los que no corresponden a un colaborador activo.
// Abierta como archivo, o en cualquier otra dirección, no registra nada. La primera vez pide el
// número de colaborador y a partir de ahí guarda la actividad en el celular y la envía en bloques
// (si no hay señal, la conserva y la reintenta después).
const USO = (() => {
  const REMOTE_URL = "https://script.google.com/macros/s/AKfycbzlnwb8IPofNlymf5PvnaugWCvb9aPAe4-TITl8CQgaHPXrNnKpxeSg1pmprbtHMNxIVA/exec";
  const match = location.pathname.match(/\/apps\/([a-z]+)\//);
  const HOTEL = location.protocol.startsWith("http") && !!match;
  const REMOTE = !HOTEL && location.protocol === "https:" && !!REMOTE_URL;
  const APP = HOTEL ? match[1] : REMOTE ? "meseros" : null;
  const ACTIVE = HOTEL || REMOTE;
  const KEY_USER = "uso-colaborador";
  const KEY_QUEUE = "uso-pendientes";
  const load = (k, d) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  };
  const save = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  };
  const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // v: 2 = sesión iniciada con número + PIN. Las sesiones de antes del PIN lo piden una vez.
  let user = load(KEY_USER, null);
  if (user && user.v !== 2) user = null;
  let fallos = 0;
  let queue = load(KEY_QUEUE, []);
  let lastInteraction = Date.now();
  let sending = false;
  let knownWords = () => [];

  function track(event, data = {}) {
    if (!ACTIVE || !user) return;
    queue.push({ event, t: new Date().toISOString(), u: user.employee_no, ...data });
    if (queue.length > 3000) queue = queue.slice(-3000);
    save(KEY_QUEUE, queue);
  }

  async function flush(withKnown = false) {
    if (!ACTIVE || sending || (!queue.length && !(withKnown && user))) return;
    sending = true;
    // Cada evento lleva el número de quien lo generó (un celular puede ser compartido):
    // se envía el bloque de eventos seguidos del mismo colaborador.
    const owner = queue.length ? queue[0].u : user.employee_no;
    let n = 0;
    const max = REMOTE ? 150 : 400; // cada envío a la hoja de Google cabe en una celda (50 mil caracteres)
    while (n < queue.length && n < max && queue[n].u === owner) n++;
    const batch = queue.slice(0, n);
    const sendKnown = withKnown && user && user.employee_no === owner;
    try {
      const body = JSON.stringify({ app: APP, employee_no: owner, events: batch, known: sendKnown ? knownWords() : undefined });
      // A Google se manda como texto simple (sin encabezados propios) para que no haga falta permiso CORS previo.
      const res = REMOTE
        ? await fetch(REMOTE_URL, { method: "POST", body })
        : await fetch("/api/app-usage/events", { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true, body });
      const ok = res.ok && (!REMOTE || (await res.json()).ok === true);
      if (ok) {
        queue = queue.slice(batch.length);
        save(KEY_QUEUE, queue);
        // Si había pendientes de otro colega, las palabras del actual se mandan en el siguiente envío.
        if (withKnown && !sendKnown) setTimeout(() => flush(true), 0);
      }
    } catch {
      // sin conexión: se reintenta en el siguiente envío
    }
    sending = false;
  }

  // Huella PBKDF2 de "número:PIN", igual que scripts/generar_acceso.py.
  async function accesoValido(numero, pin) {
    if (typeof ACCESO === "undefined" || !(crypto && crypto.subtle)) return false;
    const enc = new TextEncoder();
    const clave = await crypto.subtle.importKey("raw", enc.encode(`${numero}:${pin}`), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(ACCESO.sal), iterations: ACCESO.iteraciones }, clave, 256);
    const hex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, ACCESO.largo);
    return ACCESO.huellas.includes(hex);
  }

  function askEmployeeNumber() {
    const box = document.createElement("div");
    box.className = "uso-overlay";
    box.innerHTML = `
      <form class="uso-card">
        <h2>¡Bienvenido!</h2>
        <p>Escribe tu <b>número de colaborador</b> y tu <b>PIN</b> para entrar.</p>
        <input name="employee_no" inputmode="numeric" autocomplete="off" placeholder="Número de colaborador" required>
        <input name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="PIN (4 dígitos)" required>
        <p class="uso-error" hidden></p>
        <button class="btn full" type="submit">Entrar</button>
        <p class="uso-note">¿No tienes tu PIN? Pídelo a tu instructor de inglés. Tu avance (palabras aprendidas, tiempo de estudio y resultados de práctica) se registra para el seguimiento de tu capacitación de inglés.</p>
      </form>`;
    document.body.appendChild(box);
    const form = box.querySelector("form");
    const error = box.querySelector(".uso-error");
    form.employee_no.focus();
    form.onsubmit = async (e) => {
      e.preventDefault();
      error.hidden = true;
      const fallar = (msg) => {
        error.textContent = msg;
        error.hidden = false;
      };
      const employeeNo = form.employee_no.value.trim();
      const pin = form.pin.value.trim();
      if (!/^[0-9A-Za-z-]{1,15}$/.test(employeeNo) || !/^\d{4}$/.test(pin)) return fallar("Escribe tu número de colaborador y tu PIN de 4 dígitos.");
      if (fallos >= 5) return fallar("Demasiados intentos. Cierra la app y vuelve a intentarlo más tarde.");
      if (REMOTE) {
        // Desde internet se compara con la lista cifrada de colaboradores activos (js/acceso.js).
        if (!(await accesoValido(employeeNo, pin))) {
          fallos++;
          return fallar("El número o el PIN no son correctos.");
        }
        user = { employee_no: employeeNo, full_name: null, v: 2 };
        save(KEY_USER, user);
        box.remove();
        track("open");
        flush(true);
        window.dispatchEvent(new Event("uso-login"));
        return;
      }
      try {
        const res = await fetch("/api/app-usage/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app: APP, employee_no: employeeNo, pin }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo validar el número.");
        user = { employee_no: data.employee_no, full_name: data.full_name, v: 2 };
        save(KEY_USER, user);
        box.remove();
        track("open");
        flush(true); // sube también las palabras que ya tenía marcadas en este celular
        window.dispatchEvent(new Event("uso-login"));
      } catch (err) {
        error.textContent = err.message === "Failed to fetch" ? "Sin conexión con el servidor. Intenta de nuevo." : err.message;
        error.hidden = false;
      }
    };
  }

  function start(options = {}) {
    if (!ACTIVE) return;
    if (options.knownWords) knownWords = options.knownWords;
    if (!user) askEmployeeNumber();
    else {
      track("open");
      flush();
    }
    ["pointerdown", "keydown", "scroll", "touchstart"].forEach((ev) =>
      window.addEventListener(ev, () => (lastInteraction = Date.now()), { passive: true })
    );
    // Un "ping" por minuto mientras la app está visible y en uso = minutos de estudio.
    setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastInteraction < 3 * 60 * 1000) track("ping");
    }, 60 * 1000);
    setInterval(flush, 20 * 1000);
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
  }

  // Nombre del colega en pantalla y botón para salir (cerrar su sesión; sirve también en celulares compartidos).
  function badge() {
    if (!ACTIVE || !user) return "";
    const who = user.full_name || `Colaborador ${user.employee_no}`;
    return `<div class="uso-badge"><span>👤 ${escape(who)}</span><button type="button" class="uso-exit" data-uso-logout>🚪 Salir</button></div>`;
  }

  // Salir: manda lo pendiente y vuelve a la pantalla de bienvenida (pide el número otra vez).
  document.addEventListener("click", async (e) => {
    if (!e.target.closest("[data-uso-logout]")) return;
    if (!confirm("¿Quieres salir de la app?\n\nTu avance queda guardado. La próxima vez escribe tu número de colaborador para entrar.")) return;
    await flush();
    user = null;
    save(KEY_USER, null);
    location.hash = "#/";
    askEmployeeNumber();
  });

  return { active: ACTIVE, hotel: HOTEL, track, start, badge };
})();
