const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------- Progreso (se guarda en el celular de cada mesero) ----------
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};
let known = new Set(store.get("known", []));
const toggleKnown = (en) => {
  known.has(en) ? known.delete(en) : known.add(en);
  store.set("known", [...known]);
  USO.track(known.has(en) ? "learned" : "unlearned", { item: en, category: categoryOf(en) });
};
// Categoría de una palabra, para el reporte de uso.
const categoryOf = (en) => (VOCAB.find((c) => c.words.some((w) => w.en === en)) || {}).title;

// ---------- Voz en inglés ----------
// Voces de efectos o muy robóticas que traen macOS/iOS; nunca se eligen solas.
const NOVELTY_VOICES = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Fred|Good News|Jester|Junior|Kathy|Organ|Superstar|Ralph|Trinoids|Whisper|Zarvox|Grandma|Grandpa|Rocko|Eddy|Flo|Reed|Sandy|Shelley)\b/i;
const GOOD_VOICES = /^(Ava|Samantha|Allison|Susan|Zoe|Evan|Nathan|Tom|Joelle|Noelle|Serena|Daniel|Karen|Moira|Tessa)\b/i;

function voiceScore(v) {
  let score = 0;
  if (NOVELTY_VOICES.test(v.name)) score -= 1000;
  if (/natural|neural|online/i.test(v.name)) score += 100; // Microsoft Edge
  if (/google/i.test(v.name)) score += 90; // Chrome
  if (/premium/i.test(v.name)) score += 80;
  if (/enhanced|mejorada/i.test(v.name)) score += 70;
  if (GOOD_VOICES.test(v.name)) score += 50;
  if (v.lang.replace("_", "-") === "en-US") score += 10;
  return score;
}

let englishVoices = [];
let englishVoice = null;
function loadVoices() {
  if (!("speechSynthesis" in window)) return;
  englishVoices = speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("en"))
    .sort((a, b) => voiceScore(b) - voiceScore(a));
  const saved = store.get("voice", null);
  englishVoice = englishVoices.find((v) => v.voiceURI === saved) || englishVoices[0] || null;
}
if ("speechSynthesis" in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

// Audios pregrabados con la voz Ava (Premium); los genera scripts/generar_audios.py.
const RECORDED = typeof AUDIO_FILES !== "undefined" ? AUDIO_FILES : {};
const HAS_RECORDED = Object.keys(RECORDED).length > 0;
// Todos los audios usan la voz grabada de Ava; la voz del dispositivo solo suena si un texto no tiene grabación.
const useRecorded = HAS_RECORDED;
let currentAudio = null;

// Hash FNV-1a del texto: es el nombre del archivo de audio (scripts/generar_audios.py usa esta misma función).
function audioKey(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
const spokenText = (text) => text.replace(/\s*\/\s*/g, ", ");

let playlistId = 0; // cambia cada vez que se reproduce algo nuevo, para cortar un diálogo en curso

function speak(text, slow = false, onDone = null, keepPlaylist = false) {
  if (!keepPlaylist) playlistId++;
  if (text) USO.track("audio", { item: text.slice(0, 120) });
  const clean = spokenText(text);
  if (currentAudio) currentAudio.pause();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  const key = audioKey(clean);
  if (useRecorded && RECORDED[key]) {
    currentAudio = new Audio(`audio/${RECORDED[key]}/${key}.m4a`);
    currentAudio.playbackRate = slow ? 0.7 : 1;
    if (onDone) currentAudio.onended = onDone;
    currentAudio.play().catch(() => speakWithDevice(clean, slow, onDone));
    return;
  }
  speakWithDevice(clean, slow, onDone);
}

function speakWithDevice(text, slow, onDone = null) {
  if (!("speechSynthesis" in window)) {
    alert("Este navegador no puede leer en voz alta.");
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  if (englishVoice) u.voice = englishVoice;
  u.rate = slow ? 0.65 : 0.95;
  if (onDone) u.onend = onDone;
  speechSynthesis.speak(u);
}

// Reproduce varios textos seguidos, con una pausa breve entre ellos.
function stopAudio() {
  playlistId++;
  if (currentAudio) currentAudio.pause();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

function speakAll(texts) {
  stopAudio();
  const id = playlistId;
  const next = (i) => {
    if (i >= texts.length || id !== playlistId) return;
    speak(texts[i], false, () => setTimeout(() => next(i + 1), 500), true);
  };
  next(0);
}

const speakButtons = (text) => `
  <button class="icon-btn" data-speak="${esc(text)}" aria-label="Escuchar">🔊</button>
  <button class="icon-btn" data-speak="${esc(text)}" data-slow aria-label="Escuchar despacio">🐢</button>`;

// ---------- Fotos del vocabulario (scripts/descargar_imagenes.py) ----------
const PHOTOS = typeof IMAGES !== "undefined" ? IMAGES : {};
const photoCredit = (p) =>
  `<a class="credit" href="${esc(p.url)}" target="_blank" rel="noopener">Foto: ${esc(p.creator)} · ${esc(p.license)}</a>`;

// ---------- Datos combinados para practicar ----------
const ALL_WORDS = VOCAB.flatMap((c) => c.words);
const ALL_PHRASES = PHRASES.flatMap((s) => s.items);
const POOLS = {
  words: { label: "Todo el vocabulario", items: ALL_WORDS },
  phrases: { label: "Frases de servicio", items: ALL_PHRASES },
};
VOCAB.forEach((c) => (POOLS[c.id] = { label: `${c.icon} ${c.title}`, items: c.words, group: c.group || "servicio" }));

const VOCAB_GROUPS = [
  { id: "servicio", title: "Servicio" },
  { id: "alimentos", title: "Alimentos y bebidas" },
];
const vocabGroup = (id) => VOCAB.filter((c) => (c.group || "servicio") === id);

// ---------- Colores e íconos de los menús ----------
const PALETTE = [
  ["#c2410c", "#f59e0b"], ["#159a8c", "#3cc3a4"], ["#1864ab", "#4dabf7"], ["#862e9c", "#cc5de8"], ["#2b8a3e", "#69c06e"],
  ["#c92a2a", "#ff8787"], ["#e67700", "#fcc419"], ["#364fc7", "#748ffc"], ["#a61e4d", "#f06595"], ["#0b7285", "#3bc9db"],
  ["#5c940d", "#a9d24b"], ["#8a4b2e", "#c9823f"], ["#495057", "#adb5bd"], ["#9c36b5", "#e599f7"],
];
const paint = (i) => `--c1:${PALETTE[i % PALETTE.length][0]};--c2:${PALETTE[i % PALETTE.length][1]}`;
const svgIcon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const MENU_ICONS = {
  vocab: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5zM11 19h2"/>',
  alimentos: '<path d="M12 7c-1.5-2-6-2.5-7 1.5S6.5 20 9 20c1.3 0 1.8-.6 3-.6s1.7.6 3 .6c2.5 0 5-7.5 4-11.5S13.5 5 12 7z"/><path d="M12 7c0-2 1-3.5 2.5-4"/>',
  frases: '<path d="M4 5h11v8H8l-4 3.5zM15 9h5v8h-1v3l-3.5-3H10v-4"/>',
  menu: '<path d="M6 3h12v18H6z"/><path d="M9 7.5h6M9 11h6M9 14.5h4"/>',
  vinos: '<path d="M8 3h8c0 4.5-1.5 8-4 8s-4-3.5-4-8zM12 11v9M8.5 21h7M8.3 6.5h7.4"/>',
  script: '<path d="M7 3h10v4H7zM5 7h14v14H5z"/><path d="M8.5 11.5h7M8.5 14.5h7M8.5 17.5h4"/>',
  practicar: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  cards: '<rect x="3" y="6" width="12" height="15" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v13"/>',
  quiz: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l2.7 2.7L16.5 9"/>',
  listen: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
};
// Recuadro de color con franja degradada (mismo estilo que Menús y Service Script).
const colorTile = ({ href, i, icon, title, sub = "", meta = "", attrs = "" }) => `
  <${href ? `a href="${href}"` : "button type=\"button\""} class="rest-tile" style="${paint(i)}" ${attrs}>
    <span class="rest-top"><span class="rest-icon">${svgIcon(icon)}</span></span>
    <span class="rest-body">
      <span class="rest-name">${title}</span>
      ${sub ? `<span class="rest-cuisine">${sub}</span>` : ""}
      ${meta ? `<span class="rest-meta">${meta}</span>` : ""}
    </span>
  </${href ? "a" : "button"}>`;

// ---------- Vistas ----------
function viewHome() {
  const tip = ALL_PHRASES[Math.floor(Math.random() * ALL_PHRASES.length)];
  const pct = Math.round((known.size / ALL_WORDS.length) * 100);
  const best = store.get("bestQuiz", null);
  return `
    ${USO.badge()}
    <section class="hero">
      <h1>English for Waiters</h1>
      <p>Estudia a tu ritmo el inglés que usas en el servicio.</p>
    </section>

    <section class="card">
      <h2>Tu progreso</h2>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <p class="muted">${known.size} de ${ALL_WORDS.length} palabras marcadas como aprendidas${best !== null ? ` · Mejor quiz: ${best}/10` : ""}</p>
    </section>

    <section class="card tip">
      <h2>Frase del día</h2>
      <p class="en big">${esc(tip.en)}</p>
      <p class="muted">${esc(tip.es)}</p>
      <div class="row">${speakButtons(tip.en)}</div>
    </section>

    <nav class="rest-grid home-grid">
      ${[
        ["#/vocab", "vocab", "Vocabulario", "Palabras con audio e imagen"],
        ["#/alimentos", "alimentos", "Alimentos y bebidas", "Frutas, carnes, bebidas…"],
        ["#/frases", "frases", "Frases de servicio", "Por etapa del servicio"],
        ["#/menu", "menu", "Menús", "Restaurantes del hotel"],
        ["#/vinos", "vinos", "Carta de vinos", "Uva, maridaje y venta"],
        ["#/script", "script", "Service Script", "Diálogos con estándares AAA"],
        ["#/practicar", "practicar", "Practicar", "Tarjetas, quiz y escucha"],
      ]
        .map(([href, key, title, sub], i) => colorTile({ href, i, icon: MENU_ICONS[key], title, sub }))
        .join("")}
    </nav>`;
}

let currentWords = [];

// Tarjetas de categoría: foto representativa, nombre y avance de palabras aprendidas.
function categoryCards(cats, activeId = null) {
  return `<div class="cat-grid">${cats
    .map((c) => {
      const learned = c.words.filter((w) => known.has(w.en)).length;
      const pct = Math.round((learned / c.words.length) * 100);
      const photos = c.words.map((w) => PHOTOS[w.en]).filter(Boolean);
      const photo = photos.find((ph) => ph.source === "canva") || photos[0]; // primero las imágenes de Canva
      return `
      <a class="cat-card ${c.id === activeId ? "active" : ""}" href="#/vocab/${c.id}" style="${paint(VOCAB.indexOf(c))}">
        <span class="cat-photo" ${photo ? `style="background-image:url('${esc(photo.src)}')"` : ""}>${photo ? "" : c.icon}</span>
        <span class="cat-body">
          <span class="cat-name">${c.icon} ${esc(c.title)}</span>
          <span class="cat-count">${learned}/${c.words.length} aprendidas</span>
          <span class="cat-bar"><span style="width:${pct}%"></span></span>
        </span>
      </a>`;
    })
    .join("")}</div>`;
}

function viewVocab(catId) {
  const cat = VOCAB.find((c) => c.id === catId) || VOCAB[0];
  currentWords = cat.words;
  const groups = VOCAB_GROUPS.map(
    (g) => `
    <p class="chips-label">${g.title}</p>
    ${categoryCards(vocabGroup(g.id), cat.id)}`
  ).join("");
  return `
    <h1>Vocabulario</h1>
    <input id="search" class="search" type="search" placeholder="Buscar en inglés o español…" autocomplete="off">
    ${groups}
    <h2 class="section-title" id="words-start">${cat.icon} ${esc(cat.title)}</h2>
    <div id="word-list">${wordList(cat.words)}</div>
    <button class="btn ghost full" data-back-cats>← Volver a las categorías</button>
    <button class="float-back" data-back-cats aria-label="Volver a las categorías">← Categorías</button>`;
}

// Resalta en la frase la palabra estudiada (acepta plurales y formas como allergy → allergies).
function highlight(sentence, word) {
  const terms = word
    .split("/")
    .map((t) => t.replace(/\(.*?\)/g, "").trim().replace(/^to /i, ""))
    .filter(Boolean);
  const LINKING = /^(con|para|por|sin|del|las|los|the|and|with|for)$/i;
  const words = [...terms, ...terms.flatMap((t) => t.split(/\s+/).filter((x) => x.length >= 3 && !LINKING.test(x)))];
  const tries = [...words, ...words.filter((t) => t.length >= 4 && /s$/i.test(t)).map((t) => t.slice(0, -1))];
  for (const t of tries) {
    const stem = t
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/y$/i, "(?:y|ie)")
      .replace(/o$/i, "(?:o|a)"); // salado → salada, asado → asadas
    const m = sentence.match(new RegExp(`(^|[^\\p{L}])(${stem}(?:s|es|ed|d)?)(?=[^\\p{L}]|$)`, "iu"));
    if (m) {
      const i = m.index + m[1].length;
      return `${esc(sentence.slice(0, i))}<mark>${esc(m[2])}</mark>${esc(sentence.slice(i + m[2].length))}`;
    }
  }
  return esc(sentence);
}

function wordList(words) {
  if (!words.length) return `<p class="muted">No se encontraron palabras.</p>`;
  return words
    .map(
      (w) => `
    <article class="word ${known.has(w.en) ? "is-known" : ""}">
      ${PHOTOS[w.en] ? `<img class="thumb" src="${esc(PHOTOS[w.en].src)}" alt="${esc(w.en)}" loading="lazy" data-zoom="${esc(w.en)}">` : ""}
      <div class="word-text">
        <p class="en">${esc(w.en)}</p>
        <p class="pron">/${esc(w.pron)}/</p>
        <p class="es">${esc(w.es)}</p>
      </div>
      <div class="word-actions">
        ${speakButtons(w.en)}
        <button class="icon-btn known-btn" data-known="${esc(w.en)}" aria-label="Marcar como aprendida">${known.has(w.en) ? "✅" : "⬜"}</button>
      </div>
      ${
        w.ex
          ? `<div class="example">
          <div>
            <p class="en">${highlight(w.ex, w.en)}</p>
            <p class="es">${highlight(w.exEs, w.es)}</p>
          </div>
          <div class="row">${speakButtons(w.ex)}</div>
        </div>`
          : ""
      }
    </article>`
    )
    .join("");
}

function viewFood() {
  return `
    <h1>Alimentos y bebidas</h1>
    <p class="muted">Ingredientes y bebidas en inglés. Elige una categoría para estudiarla o practicarla.</p>
    ${categoryCards(vocabGroup("alimentos"))}
    <a class="btn full center" href="#/practicar">🎯 Practicar estas categorías</a>`;
}

function viewPhrases() {
  return `
    <h1>Frases de servicio</h1>
    <p class="muted">Ordenadas según las etapas del servicio. Toca 🔊 para escuchar y 🐢 para escuchar despacio.</p>
    ${PHRASES.map(
      (s, i) => `
      <details class="card phrase-group" ${i === 0 ? "open" : ""} style="${paint(i)}">
        <summary><span class="pg-icon">${s.icon}</span><span>${esc(s.title)}</span><span class="pg-count">${s.items.length}</span></summary>
        ${s.items
          .map(
            (p) => `
          <div class="phrase">
            <div>
              <p class="en">${esc(p.en)}</p>
              <p class="es">${esc(p.es)}</p>
            </div>
            <div class="row">${speakButtons(p.en)}</div>
          </div>`
          )
          .join("")}
      </details>`
    ).join("")}`;
}

// ---------- Menús ----------
const HAS_HOTEL_DATA = typeof HOTEL_DATA !== "undefined";
const andList = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0] || "");

// Ícono y tipo de cocina de un restaurante, según palabras genéricas de su cocina o nombre.
const CUISINE_ICONS = [
  { re: /italian|italiano/i, es: "Cocina italiana", svg: '<path d="M4 20c4-1 12-1 16 0M6 20c0-6 2.5-11 6-14 3.5 3 6 8 6 14"/><path d="M9 13c1 1 2 1 3 0s2-1 3 0"/>' },
  { re: /french|franc/i, es: "Cocina francesa", svg: '<path d="M8 3h8c0 4.5-1.5 8-4 8s-4-3.5-4-8zM12 11v9M8.5 21h7"/><path d="M17 15l3-1.5M4 13.5 7 15"/>' },
  { re: /oriental|asian|asiá|japan|sushi/i, es: "Cocina oriental", svg: '<path d="M4 12h16a8 8 0 0 1-16 0z"/><path d="M6 20h12M9 4l5 6M14 3l3 7"/>' },
  { re: /grill|steak|parrilla/i, es: "Parrilla y cortes", svg: '<path d="M4 9h16l-1.5 5.5h-13zM7 14.5 5.5 20M17 14.5l1.5 5.5M8 9V6M12 9V4.5M16 9V6"/>' },
  { re: /buffet|bufé/i, es: "Bufé internacional", svg: '<path d="M3 17h18M5 17a7 7 0 0 1 14 0M12 10V8M2.5 20h19"/><path d="M7 5h3M14 5h3"/>' },
  { re: /mexic|picante/i, es: "Cocina mexicana", svg: '<path d="M14 6c3 0 6 3 6 6.5S16 20 10 20 4 17 4 15s2-1.5 4-3 3-6 6-6z"/><path d="M14 6c0-1.5 1-2.5 2.5-3"/>' },
  { re: /room service|habitaci/i, es: "Servicio a la habitación", svg: '<path d="M3 16h18M5 16a7 7 0 0 1 14 0M12 9V7.5M2.5 19h19"/>' },
  { re: /.*/, es: "A la carta", svg: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="3"/><path d="M2.5 5v14M21.5 5v14"/>' },
];
// Color propio de cada restaurante (degradado de dos tonos), según su orden en la lista.
const REST_COLORS = [
  ["#e8604c", "#f29a5b"], ["#159a8c", "#3cc3a4"], ["#e08a1e", "#f2c14e"], ["#c23b3b", "#e8774a"],
  ["#4b5bd6", "#8a7cf0"], ["#8a4b2e", "#c9823f"], ["#8e2a5a", "#cf5a8a"], ["#2f9e44", "#8cc63f"], ["#25507f", "#4f9bd6"],
];
const restColor = (r) => {
  const i = Math.max(0, HOTEL_DATA.restaurants.indexOf(r));
  const [c1, c2] = REST_COLORS[i % REST_COLORS.length];
  return `--c1:${c1};--c2:${c2}`;
};
const PERIOD_ES = { Breakfast: "Desayuno", Lunch: "Comida", Dinner: "Cena" };
const cuisineOf = (r) => CUISINE_ICONS.find((c) => c.re.test(`${r.cuisine || ""} ${r.name}`));

// Menú de inicio: un recuadro por restaurante.
function restaurantGrid(rests) {
  return `
    <h1>Menús</h1>
    <p class="muted">Los menús de los restaurantes del hotel en inglés y español. Elige un restaurante.</p>
    <div class="rest-grid">
      ${rests
        .map((r) => {
          const c = cuisineOf(r);
          const dishes = r.menus.reduce((n, m) => n + m.sections.reduce((k, sec) => k + sec.items.length, 0), 0);
          const periods = [...new Set(r.hours.map((h) => PERIOD_ES[h.period] || h.period))].join(" · ");
          return `
        <a class="rest-tile" href="#/menu/${r.id}" style="${restColor(r)}">
          <span class="rest-top"><span class="rest-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${c.svg}</svg></span></span>
          <span class="rest-body">
            <span class="rest-name">${esc(r.name)}</span>
            <span class="rest-cuisine">${esc(c.es)}</span>
            <span class="rest-meta"><b>${dishes}</b> platillos${periods ? ` · ${esc(periods)}` : ""}</span>
          </span>
        </a>`;
        })
        .join("")}
    </div>`;
}

function viewMenu(restId, menuIdx) {
  if (!HAS_HOTEL_DATA) return sampleMenu();
  const rests = HOTEL_DATA.restaurants;
  const rest = rests.find((r) => r.id === restId);
  if (!rest) return restaurantGrid(rests);
  const menu = rest.menus[Number(menuIdx) || 0] || rest.menus[0];
  const menuChips =
    rest.menus.length > 1
      ? `<div class="chips">${rest.menus
          .map((m, i) => `<a class="chip small ${m === menu ? "active" : ""}" href="#/menu/${rest.id}/${i}">${esc(m.label)}${m.labelEs && m.labelEs !== m.label ? ` · ${esc(m.labelEs)}` : ""}</a>`)
          .join("")}</div>`
      : "";
  const info = rest.hours.length
    ? `<div class="rest-hours">${rest.hours
        .map((h) => `<span>🕒 ${esc(PERIOD_ES[h.period] || h.period)}: ${esc(h.time)} · ${esc(h.dress)}</span>`)
        .join("")}</div>`
    : "";

  let lastGroup = null;
  const sections = menu.sections
    .map((sec) => {
      const groupTitle =
        sec.group && sec.group !== lastGroup
          ? `<h2 class="group-title">${esc(sec.group)}</h2>${sec.groupEs ? `<p class="muted">${esc(sec.groupEs)}</p>` : ""}`
          : "";
      lastGroup = sec.group;
      return `
        ${groupTitle}
        <div class="section-head">
          <div>
            <h2 class="section-title">${esc(sec.title)}</h2>
            ${sec.titleEs ? `<p class="muted">${esc(sec.titleEs)}</p>` : ""}
          </div>
          <button class="icon-btn" data-speak="${esc(sec.title)}" aria-label="Escuchar sección">🔊</button>
        </div>
        <div class="card list">
          ${sec.items
            .map(
              (d) => `
            <div class="phrase">
              <div>
                <p class="en">${esc(d.name)}</p>
                ${d.desc ? `<p class="desc">${esc(d.desc)}</p>` : ""}
                ${d.nameEs ? `<p class="es">${esc(d.nameEs)}${d.descEs ? `: ${esc(d.descEs)}` : ""}</p>` : ""}
              </div>
              <div class="row">${speakButtons(d.desc ? `${d.name}. ${d.desc}` : d.name)}</div>
            </div>`
            )
            .join("")}
        </div>`;
    })
    .join("");

  return `
    <div class="rest-page" style="${restColor(rest)}">
    <a class="back" href="#/menu">← Todos los restaurantes</a>
    <section class="rest-hero">
      <span class="rest-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${cuisineOf(rest).svg}</svg></span>
      <div>
        <h1>${esc(rest.name)}</h1>
        <p>${esc(cuisineOf(rest).es)}</p>
        ${info}
      </div>
    </section>
    <p class="muted">🔊 escuchar el platillo completo · 🐢 escucharlo despacio</p>
    ${menuChips}
    ${sections}
    </div>`;
}

function sampleMenu() {
  return `
    <h1>Menú en inglés</h1>
    <p class="muted">Menú de ejemplo. Para ver los menús del hotel, ejecuta <code>scripts/importar_contenido_hotel.py</code>.</p>
    ${MENU.map(
      (sec) => `
      <h2 class="section-title">${esc(sec.section)}</h2>
      ${sec.items
        .map(
          (d) => `
        <article class="card dish">
          <div class="dish-head">
            <div>
              <p class="en big">${esc(d.name)}</p>
              <p class="muted">${esc(d.es)}</p>
            </div>
            <div class="row">${speakButtons(d.name)}</div>
          </div>
          <p class="en">${esc(d.desc)}</p>
          <p class="es">${esc(d.descEs)}</p>
          <div class="row between">
            <div class="tags">${
              d.allergens.length
                ? d.allergens.map((a) => `<span class="tag">⚠️ ${esc(ALLERGEN_LABELS[a] || a)}</span>`).join("")
                : `<span class="tag ok">Sin alérgenos principales</span>`
            }</div>
            <button class="btn small" data-speak="${esc(d.desc)}">🔊 Escuchar descripción</button>
          </div>
        </article>`
        )
        .join("")}`
    ).join("")}`;
}

// ---------- Vinos ----------
const WINE_CATEGORIES = [
  { id: "tinto", match: "Tinto", label: "Tintos", en: "red", es: "tinto" },
  { id: "blanco", match: "Blanco", label: "Blancos", en: "white", es: "blanco" },
  { id: "rosado", match: "Rosado", label: "Rosados", en: "rosé", es: "rosado" },
  { id: "espumoso", match: "Espumoso", label: "Espumosos", en: "sparkling", es: "espumoso" },
  { id: "dulce", match: "Dulce", label: "Dulces", en: "dessert", es: "dulce" },
];
const COUNTRY_EN = {
  España: "Spain", Francia: "France", Italia: "Italy", "Estados Unidos": "the United States", México: "Mexico",
  "Nueva Zelanda": "New Zealand", Argentina: "Argentina", Australia: "Australia", Chile: "Chile", Uruguay: "Uruguay",
};
const wineCategory = (w) => WINE_CATEGORIES.find((c) => w.category.startsWith(c.match)) || WINE_CATEGORIES[0];

function wineRecommendation(w) {
  const cat = wineCategory(w);
  const grapes = w.grapes ? w.grapes.split(",").map((g) => g.trim().replace("Cabernet-Sauvignon", "Cabernet Sauvignon")) : [];
  let en = `I recommend the ${w.name}. It's a ${cat.en} wine from ${COUNTRY_EN[w.country] || w.country}`;
  let es = `Le recomiendo el ${w.name}. Es un vino ${cat.es} de ${w.country}`;
  if (grapes.length) {
    en += `, made with ${andList(grapes)}`;
    es += `, de uva ${grapes.join(", ")}`;
  }
  en += `. It pairs well with ${w.pairingEn}.`;
  es += `. Marida muy bien con ${w.pairingEs}.`;
  return { en, es };
}

// Bloque bilingüe de la ficha: título, texto en inglés con audio y su traducción.
function wineBlock(title, en, es, extra = "") {
  if (!en && !es) return "";
  return `
    <div class="wine-block">
      <p class="label">${title}${extra}</p>
      <div class="phrase">
        <div>
          ${en ? `<p class="en">${esc(en)}</p>` : ""}
          ${es ? `<p class="es">${esc(es)}</p>` : ""}
        </div>
        ${en ? `<div class="row"><button class="icon-btn" data-speak="${esc(en)}" aria-label="Escuchar">🔊</button></div>` : ""}
      </div>
    </div>`;
}

let wineState = { cat: "tinto", query: "" };

function viewWines(catId) {
  if (!HAS_HOTEL_DATA) {
    return `<h1>Vinos</h1><p class="muted">No hay carta de vinos cargada. Ejecuta <code>scripts/importar_contenido_hotel.py</code>.</p>`;
  }
  if (catId) wineState = { cat: catId, query: "" };
  const WINE_COLORS = { tinto: ["#7f1d3a", "#c2385b"], blanco: ["#b58a12", "#e9c84a"], rosado: ["#d6457a", "#f7a1bd"],
    espumoso: ["#a07b2d", "#e6cf8a"], dulce: ["#b4561a", "#f0a24a"] };
  const chips = WINE_CATEGORIES.map((c) => {
    const n = HOTEL_DATA.wines.filter((w) => wineCategory(w) === c).length;
    const [c1, c2] = WINE_COLORS[c.id] || PALETTE[0];
    return `<a class="wine-tile ${c.id === wineState.cat ? "active" : ""}" href="#/vinos/${c.id}" style="--c1:${c1};--c2:${c2}">
      ${svgIcon(MENU_ICONS.vinos)}<span><b>${c.label}</b><small>${n} vinos</small></span></a>`;
  }).join("");
  return `
    <h1>Carta de vinos</h1>
    <p class="muted">Cada vino incluye una frase lista para recomendarlo en inglés.</p>
    <input id="wine-search" class="search" type="search" placeholder="Buscar por nombre, uva, país o maridaje…" autocomplete="off">
    <div class="wine-tiles">${chips}</div>
    <div id="wine-list">${wineList()}</div>`;
}

function wineList() {
  const q = wineState.query.toLowerCase();
  const wines = HOTEL_DATA.wines.filter((w) =>
    q
      ? [w.name, w.grapes, w.country, COUNTRY_EN[w.country], w.region, w.pairingEn, w.pairingEs].some((f) => f && f.toLowerCase().includes(q))
      : wineCategory(w).id === wineState.cat
  );
  if (!wines.length) return `<p class="muted">No se encontraron vinos.</p>`;
  return wines
    .map((w) => {
      const cat = wineCategory(w);
      const rec = wineRecommendation(w);
      const details = [
        ["Region · Región", w.region],
        ["Grapes · Uvas", w.grapes],
        ["Price · Precio", [w.price, w.format].filter(Boolean).join(" · ")],
      ].filter(([, v]) => v);
      const source =
        w.pairingSource === "carta"
          ? ` <span class="tag ok">De la carta</span>`
          : ` <span class="tag">Sugerido</span>`;
      return `
      <article class="card wine">
        <div class="dish-head">
          <div>
            <p class="en big noflag">${esc(w.name)}</p>
            <p class="muted">${esc(cat.en[0].toUpperCase() + cat.en.slice(1))} wine · ${esc(COUNTRY_EN[w.country] || w.country)}</p>
            <p class="muted">Vino ${esc(cat.es)} · ${esc(w.country)}${w.levelEn ? ` · <span class="tag">${esc(w.levelEn)}</span>` : ""}</p>
          </div>
          <div class="row">${speakButtons(w.name)}</div>
        </div>
        <dl class="details">${details.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
        ${wineBlock("Profile · Perfil", w.profileEn, w.profile)}
        ${wineBlock("Food pairing · Maridaje", `It pairs well with ${w.pairingEn}.`, `Marida con ${w.pairingEs}.`, source)}
        ${wineBlock("Sales tip · Sugerencia de venta", w.tipEn, w.tipEs)}
        <div class="say">
          <p class="label">How to recommend it · Cómo recomendarlo</p>
          <p class="en">${esc(rec.en)}</p>
          <p class="es">${esc(rec.es)}</p>
          <div class="row">${speakButtons(rec.en)}</div>
        </div>
      </article>`;
    })
    .join("");
}

// ---------- Service Script ----------
let practiceScript = false;

// Ícono dibujado de una etapa (js/script-icons.js) o, si no tiene, su emoji.
function stageIcon(st) {
  const svg = typeof STAGE_ICONS !== "undefined" && STAGE_ICONS[st.id];
  return `<span class="stage-icon">${svg ? `<svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg>` : st.icon}</span>`;
}

// Color de cada etapa del Service Script (degradado), recorriendo el arcoíris de la bienvenida a la despedida.
const STAGE_COLORS = [
  ["#c2410c", "#f59e0b"], ["#d9480f", "#f7a046"], ["#e67700", "#fcc419"], ["#5c940d", "#a9d24b"], ["#2b8a3e", "#69c06e"],
  ["#0b7285", "#3bc9db"], ["#1864ab", "#4dabf7"], ["#862e9c", "#cc5de8"], ["#a61e4d", "#f06595"], ["#c92a2a", "#ff8787"],
  ["#9c36b5", "#e599f7"], ["#364fc7", "#748ffc"], ["#1c3d6e", "#5c7cfa"], ["#495057", "#adb5bd"], ["#212529", "#868e96"],
];
const stageColor = (n) => {
  const [c1, c2] = STAGE_COLORS[n % STAGE_COLORS.length];
  return `--c1:${c1};--c2:${c2}`;
};

// Menú de inicio del Service Script: un recuadro por etapa.
function scriptMenu(stages) {
  const seen = new Set(store.get("scriptSeen", []));
  const roles = (st) => {
    const who = new Set(st.lines.map((l) => l.who));
    return [who.has("host") && "Hostess", who.has("server") && "Mesero"].filter(Boolean).join(" · ");
  };
  return `
    <h1>Service Script</h1>
    <p class="muted">Guion formal de servicio con estándares AAA, de la bienvenida a la despedida. Elige una etapa.</p>
    <p class="muted">${seen.size} de ${stages.length} etapas revisadas</p>
    <div class="rest-grid">
      ${stages
        .map(
          (st, n) => `
        <a class="rest-tile ${seen.has(st.id) ? "is-seen" : ""}" href="#/script/${st.id}" style="${stageColor(n)}">
          <span class="rest-top">
            <span class="rest-icon">${stageIcon(st).replace(/^<span class="stage-icon">|<\/span>$/g, "")}</span>
            <span class="stage-badge">${n + 1}</span>
            ${seen.has(st.id) ? `<span class="seen-badge">✓</span>` : ""}
          </span>
          <span class="rest-body">
            <span class="rest-name">${esc(st.titleEs)}</span>
            <span class="rest-cuisine">${esc(st.title)}</span>
            <span class="rest-meta">${roles(st)}${seen.has(st.id) ? " · Revisada" : ""}</span>
          </span>
        </a>`
        )
        .join("")}
    </div>`;
}

function viewScript(stageId) {
  const stages = typeof SERVICE_SCRIPT !== "undefined" ? SERVICE_SCRIPT : [];
  if (!stages.length) return `<h1>Service Script</h1><p class="muted">No se encontró el guion.</p>`;
  if (!stageId || !stages.some((st) => st.id === stageId)) return scriptMenu(stages);
  const i = stages.findIndex((st) => st.id === stageId);
  const st = stages[i];
  store.set("scriptSeen", [...new Set([...store.get("scriptSeen", []), st.id])]);
  const lines = st.lines
    .map(
      (l) => `
      <div class="line ${l.who}">
        <p class="who">${{ guest: "Guest · Huésped", host: "Hostess", server: "Server · Mesero" }[l.who]}</p>
        ${l.avoid ? `<p class="avoid">✗ ${esc(l.avoid)}</p>` : ""}
        <p class="en reveal">${l.avoid ? "✓ " : ""}${esc(l.en)}</p>
        <p class="es">${esc(l.es)}</p>
        <div class="row">${speakButtons(l.en)}</div>
      </div>`
    )
    .join("");
  const prev = stages[i - 1], next = stages[i + 1];
  return `
    <div class="rest-page" style="${stageColor(i)}">
    <a class="back" href="#/script">← Todas las etapas</a>
    <section class="rest-hero">
      <span class="rest-icon">${stageIcon(st).replace(/^<span class="stage-icon">|<\/span>$/g, "")}</span>
      <div>
        <p class="hero-step">Etapa ${i + 1} de ${stages.length}</p>
        <h1>${esc(st.titleEs)}</h1>
        <p>${esc(st.title)}</p>
      </div>
    </section>
    <section class="card">
      <div class="standards">
        <p class="label">⭐ Estándares AAA</p>
        <ul>${st.standards.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      </div>
    </section>
    <div class="row between">
      <button class="btn small" id="play-stage">▶ Escuchar todo el diálogo</button>
      <label class="toggle"><input type="checkbox" id="practice-toggle" ${practiceScript ? "checked" : ""}> Modo práctica (ocultar inglés)</label>
    </div>
    <div class="dialogue ${practiceScript ? "practice" : ""}">${lines}</div>
    <div class="row between stage-nav">
      ${prev ? `<a class="btn ghost small" href="#/script/${prev.id}">← ${esc(prev.titleEs)}</a>` : "<span></span>"}
      ${next ? `<a class="btn small" href="#/script/${next.id}">${esc(next.titleEs)} →</a>` : ""}
    </div>
    </div>`;
}

// ---------- Práctica ----------
let session = null;

function viewPractice() {
  return `
    <h1>Practicar</h1>
    <label class="field">Practicar con
      <select id="pool">
        <option value="words">${POOLS.words.label}</option>
        <option value="phrases">${POOLS.phrases.label}</option>
        ${VOCAB_GROUPS.map(
          (g) => `<optgroup label="${g.title}">${vocabGroup(g.id)
            .map((c) => `<option value="${c.id}">${esc(POOLS[c.id].label)}</option>`)
            .join("")}</optgroup>`
        ).join("")}
      </select>
    </label>
    <div class="rest-grid">
      ${colorTile({ i: 1, icon: MENU_ICONS.cards, title: "Tarjetas", sub: "Recuerda la palabra", attrs: 'data-mode="cards"' })}
      ${colorTile({ i: 3, icon: MENU_ICONS.quiz, title: "Quiz", sub: "Elige la traducción", attrs: 'data-mode="quiz"' })}
      ${colorTile({ i: 0, icon: MENU_ICONS.listen, title: "Escucha", sub: "Oye y elige el significado", attrs: 'data-mode="listen"' })}
    </div>
    <p class="muted">
      <b>Tarjetas:</b> ves la palabra en español y recuerdas el inglés.<br>
      <b>Quiz:</b> eliges la traducción correcta.<br>
      <b>Escucha:</b> oyes la frase en inglés y eliges qué significa.
    </p>`;
}

function startSession(mode, poolKey) {
  const items = POOLS[poolKey].items;
  // En tarjetas priorizamos lo que aún no se marca como aprendido.
  const ordered = mode === "cards" ? [...shuffle(items.filter((i) => !known.has(i.en))), ...shuffle(items.filter((i) => known.has(i.en)))] : shuffle(items);
  session = { mode, poolKey, items, deck: ordered.slice(0, 10), index: 0, score: 0, flipped: false, answered: null };
  renderSession();
}

function currentOptions() {
  const q = session.deck[session.index];
  if (!session.options) {
    const others = shuffle(session.items.filter((i) => i.es !== q.es)).slice(0, 3);
    session.options = shuffle([q, ...others]);
  }
  return session.options;
}

function renderSession() {
  const s = session;
  const app = $("#app");
  if (s.index >= s.deck.length) {
    if (!s.tracked) {
      s.tracked = true;
      USO.track("quiz", { category: POOLS[s.poolKey].label, item: s.mode, score: s.mode === "cards" ? null : s.score, total: s.deck.length });
    }
    let msg = `Terminaste ${s.deck.length} tarjetas.`;
    if (s.mode !== "cards") {
      msg = `Obtuviste ${s.score} de ${s.deck.length}.`;
      if (s.mode === "quiz" && s.score > store.get("bestQuiz", -1)) store.set("bestQuiz", s.score);
    }
    app.innerHTML = `
      <section class="card center">
        <p class="big">🎉</p>
        <h2>${msg}</h2>
        <div class="row center">
          <button class="btn" id="again">Otra ronda</button>
          <a class="btn ghost" href="#/practicar">Cambiar modo</a>
        </div>
      </section>`;
    $("#again").onclick = () => startSession(s.mode, s.poolKey);
    return;
  }

  const q = s.deck[s.index];
  const counter = `<p class="muted center">${s.index + 1} / ${s.deck.length}${s.mode !== "cards" ? ` · Puntos: ${s.score}` : ""}</p>`;

  if (s.mode === "cards") {
    app.innerHTML = `
      ${counter}
      <button class="flashcard ${s.flipped ? "flipped" : ""}" id="card">
        ${PHOTOS[q.en] ? `<img class="card-photo" src="${esc(PHOTOS[q.en].src)}" alt="">` : ""}
        <span class="es big">${esc(q.es)}</span>
        ${s.flipped ? `<span class="en big">${esc(q.en)}</span>${q.pron ? `<span class="pron">/${esc(q.pron)}/</span>` : ""}${q.ex ? `<span class="card-example">🇺🇸 ${highlight(q.ex, q.en)}<br><small>🇲🇽 ${highlight(q.exEs, q.es)}</small></span>` : ""}` : `<span class="muted">Toca para ver en inglés</span>`}
      </button>
      ${PHOTOS[q.en] && PHOTOS[q.en].url ? `<p class="center">${photoCredit(PHOTOS[q.en])}</p>` : ""}
      ${
        s.flipped
          ? `<div class="row center">${speakButtons(q.en)}${q.ex ? `<button class="btn ghost small" data-speak="${esc(q.ex)}">🔊 Escuchar la frase</button>` : ""}</div>
             <div class="row center">
               <button class="btn ghost" id="again-card">🔁 Repasar</button>
               <button class="btn" id="got-it">👍 Me la sé</button>
             </div>`
          : ""
      }`;
    $("#card").onclick = () => {
      s.flipped = !s.flipped;
      if (s.flipped) speak(q.en);
      renderSession();
    };
    if (s.flipped) {
      const next = (learned) => {
        if (learned && !known.has(q.en)) toggleKnown(q.en);
        if (!learned && known.has(q.en)) toggleKnown(q.en);
        s.index++;
        s.flipped = false;
        renderSession();
      };
      $("#got-it").onclick = () => next(true);
      $("#again-card").onclick = () => next(false);
    }
    return;
  }

  const opts = currentOptions();
  const prompt =
    s.mode === "quiz"
      ? `<p class="en big center">${esc(q.en)}</p><div class="row center">${speakButtons(q.en)}</div>`
      : `<div class="row center"><button class="btn big-btn" data-speak="${esc(q.en)}">🔊 Escuchar</button><button class="btn ghost" data-speak="${esc(q.en)}" data-slow>🐢 Despacio</button></div>
         ${s.answered !== null ? `<p class="en center">${esc(q.en)}</p>` : ""}`;

  app.innerHTML = `
    ${counter}
    <section class="card">
      <p class="muted center">${s.mode === "quiz" ? "¿Qué significa?" : "Escucha y elige el significado"}</p>
      ${prompt}
    </section>
    <div class="options">
      ${opts
        .map((o, i) => {
          let cls = "";
          if (s.answered !== null) {
            if (o === q) cls = "correct";
            else if (i === s.answered) cls = "wrong";
          }
          return `<button class="option ${cls}" data-opt="${i}" ${s.answered !== null ? "disabled" : ""}>${esc(o.es)}</button>`;
        })
        .join("")}
    </div>
    ${s.answered !== null ? `<button class="btn full" id="next">Siguiente →</button>` : ""}`;

  if (s.mode === "listen" && s.answered === null && !s.played) {
    s.played = true;
    setTimeout(() => speak(q.en), 250);
  }

  app.querySelectorAll("[data-opt]").forEach((b) => {
    b.onclick = () => {
      const i = Number(b.dataset.opt);
      s.answered = i;
      if (opts[i] === q) s.score++;
      else USO.track("miss", { item: q.en, category: POOLS[s.poolKey].label });
      renderSession();
    };
  });
  if (s.answered !== null) {
    $("#next").onclick = () => {
      s.index++;
      s.answered = null;
      s.options = null;
      s.played = false;
      renderSession();
    };
  }
}

// ---------- Router ----------
const ROUTES = {
  "": viewHome,
  vocab: viewVocab,
  alimentos: viewFood,
  frases: viewPhrases,
  menu: viewMenu,
  vinos: viewWines,
  script: viewScript,
  practicar: viewPractice,
};

// Qué sección abrió el colega, para el reporte de uso.
function trackView(route, p0, p1) {
  if (route === "vocab") {
    const cat = VOCAB.find((c) => c.id === p0) || VOCAB[0];
    USO.track("category", { category: cat.title });
  } else if (route === "script") {
    const stages = typeof SERVICE_SCRIPT !== "undefined" ? SERVICE_SCRIPT : [];
    const st = stages.find((x) => x.id === p0);
    USO.track(st ? "script" : "category", { category: st ? `Service Script: ${st.titleEs}` : "Service Script" });
  } else if (route === "menu" && HAS_HOTEL_DATA) {
    const rest = HOTEL_DATA.restaurants.find((r) => r.id === p0);
    USO.track("category", { category: rest ? `Menú: ${rest.name}` : "Menús" });
  } else if (route) {
    const names = { frases: "Frases de servicio", vinos: "Carta de vinos", practicar: "Practicar", alimentos: "Alimentos y bebidas" };
    if (names[route]) USO.track("category", { category: names[route] });
  }
}

function render() {
  const [route = "", ...params] = location.hash.replace(/^#\/?/, "").split("/");
  const view = ROUTES[route] || viewHome;
  session = null;
  const param0 = params[0] && decodeURIComponent(params[0]);
  $("#app").innerHTML = view(...params.map(decodeURIComponent));
  trackView(route, param0, params[1]);
  document.querySelectorAll(".tabbar a").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === `#/${route}`);
  });
  const wordsStart = route === "vocab" && params[0] ? $("#words-start") : null;
  if (wordsStart) wordsStart.scrollIntoView();
  else window.scrollTo(0, 0);

  const search = $("#search");
  if (search) {
    search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      const matches = q ? ALL_WORDS.filter((w) => w.en.toLowerCase().includes(q) || w.es.toLowerCase().includes(q)) : currentWords;
      $("#word-list").innerHTML = wordList(matches);
    };
  }

  const playStage = $("#play-stage");
  if (playStage) {
    const st = SERVICE_SCRIPT.find((x) => x.id === param0) || SERVICE_SCRIPT[0];
    playStage.onclick = () => speakAll(st.lines.map((l) => l.en));
    $("#practice-toggle").onchange = (e) => {
      practiceScript = e.target.checked;
      $(".dialogue").classList.toggle("practice", practiceScript);
    };
  }

  const wineSearch = $("#wine-search");
  if (wineSearch) {
    wineSearch.value = wineState.query;
    wineSearch.oninput = () => {
      wineState.query = wineSearch.value.trim();
      $("#wine-list").innerHTML = wineList();
    };
  }
}

// Clics delegados para los botones que se repiten en todas las vistas
document.addEventListener("click", (e) => {
  const speakBtn = e.target.closest("[data-speak]");
  if (speakBtn) return speak(speakBtn.dataset.speak, speakBtn.hasAttribute("data-slow"));

  const hidden = e.target.closest(".practice .line");
  if (hidden && !e.target.closest("button")) hidden.classList.toggle("revealed");

  if (e.target.closest("[data-back-cats]")) return window.scrollTo({ top: 0, behavior: "smooth" });

  const zoom = e.target.closest("[data-zoom]");
  if (zoom) {
    const w = ALL_WORDS.find((x) => x.en === zoom.dataset.zoom);
    const box = document.createElement("div");
    box.className = "lightbox";
    box.innerHTML = `<img src="${esc(PHOTOS[w.en].src)}" alt=""><p>🇺🇸 ${esc(w.en)}</p><p class="es">${esc(w.es)}</p>`;
    box.onclick = () => box.remove();
    document.body.appendChild(box);
    speak(w.en);
    return;
  }

  const knownBtn = e.target.closest("[data-known]");
  if (knownBtn) {
    toggleKnown(knownBtn.dataset.known);
    const isKnown = known.has(knownBtn.dataset.known);
    knownBtn.textContent = isKnown ? "✅" : "⬜";
    knownBtn.closest(".word").classList.toggle("is-known", isKnown);
    return;
  }

  const modeBtn = e.target.closest("[data-mode]");
  if (modeBtn) startSession(modeBtn.dataset.mode, $("#pool").value);
});


// El botón flotante para volver a las categorías aparece al bajar por la lista de palabras.
window.addEventListener("scroll", () => {
  const btn = $(".float-back");
  const nearEnd = window.scrollY + window.innerHeight > document.body.scrollHeight - 160; // ahí ya se ve el botón del final
  if (btn) btn.classList.toggle("show", window.scrollY > 500 && !nearEnd);
});

window.addEventListener("hashchange", render);
// Modo sin internet de la versión publicada (sw.js).
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
USO.start({ knownWords: () => [...known].map((en) => ({ item: en, category: categoryOf(en) })) });
window.addEventListener("uso-login", render); // muestra el nombre del colega en cuanto entra
render();
