// Modo sin internet de la app publicada (solo funciona en https o en localhost).
// - La app (html, css, js) se guarda al instalar y se pide primero a internet, para que las
//   actualizaciones lleguen en cuanto haya señal.
// - Imágenes y audios se guardan la primera vez que se usan y desde ahí salen del celular.
// scripts/publicar.py cambia VERSION en cada publicación para renovar lo guardado.
const VERSION = "20261018-1257-a5b2bca";
const SHELL_CACHE = `app-${VERSION}`;
const MEDIA_CACHE = `media-${VERSION}`;
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/styles.css",
  "js/data.js",
  "js/hotel-data.js",
  "js/images.js",
  "js/service-script.js",
  "js/script-icons.js",
  "js/audio-base.js",
  "js/audio-hotel.js",
  "js/acceso.js",
  "js/uso.js",
  "js/app.js",
  "images/app/icon-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== MEDIA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/api/")) return;
  if (/\/(audio|images)\//.test(url.pathname)) e.respondWith(media(req));
  else e.respondWith(shell(req));
});

async function shell(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("index.html")) || Response.error();
  }
}

async function media(req) {
  const cache = await caches.open(MEDIA_CACHE);
  const key = new Request(req.url); // sin el encabezado Range, para guardar el archivo completo
  let res = await cache.match(key);
  if (!res) {
    try {
      res = await fetch(key);
      if (res.ok) await cache.put(key, res.clone());
    } catch {
      return Response.error();
    }
  }
  return req.headers.has("range") ? partial(req, res) : res;
}

// iPhone pide los audios por partes (Range) y solo los reproduce si recibe una respuesta 206.
async function partial(req, res) {
  const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
  const start = m && m[1] ? Number(m[1]) : 0;
  const end = m && m[2] ? Math.min(Number(m[2]), buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "audio/mp4",
      "Content-Range": `bytes ${start}-${end}/${buf.byteLength}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}
