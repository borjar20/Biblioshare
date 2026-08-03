// Estrategia de caché del PWA. Regla de oro: aquí SOLO se cachea contenido
// inmutable, más el documento como salvavidas de offline. Nada que lleve datos
// del usuario se sirve de caché — ver docs/reactividad.md.
//
// v3 (2026-07-16): v2 cacheaba caché-primero TODA petición GET del mismo origen
// que no fuese una navegación. Eso incluía los payloads RSC que Next pide en
// cada navegación cliente, así que al cambiar de pestaña en una ficha el SW
// devolvía el árbol de la visita anterior: lo que acababas de registrar
// desaparecía hasta recargar a mano, y cualquier revalidatePath del servidor
// quedaba anulado. Subir el nombre del caché es PARTE del arreglo: `activate`
// borra los que no coincidan, y así se tira el v2 envenenado que los usuarios ya
// tienen en disco.
const CACHE_NAME = "biblioshare-v3";
const OFFLINE_URL = "/offline";

// Estáticos de Next: el nombre lleva el hash del contenido, así que la copia en
// caché no puede quedarse rancia.
const IMMUTABLE_PATH = /^\/_next\/static\//;
// Assets servidos desde /public (iconos, imágenes, fuentes).
const ASSET_EXT = /\.(?:css|js|mjs|woff2?|ttf|otf|png|jpe?g|gif|webp|avif|svg|ico)$/;

// Qué hacer con cada petición. PURA a propósito (solo lee `request`): es la
// lógica donde vivía el bug, así que se prueba en vitest cargando este mismo
// fichero en un vm — ver src/lib/pwa/sw-strategy.test.ts.
function swStrategy(request, origin) {
  if (request.method !== "GET") return "skip";

  const url = new URL(request.url);
  if (url.origin !== origin) return "skip";

  // Payload RSC: la carga útil de cada navegación cliente y de cada prefetch de
  // <Link>. JAMÁS se cachea ni se sirve de caché — lleva datos del usuario y es
  // justo lo que el servidor acaba de revalidar. Next las marca de dos formas y
  // se comprueban las dos, porque ninguna está garantizada por contrato: la
  // cabecera `RSC: 1` y el parámetro `?_rsc=<hash>`.
  if (request.headers.has("RSC") || url.searchParams.has("_rsc")) return "skip";

  // Rutas de servidor (push, webhooks, auth): siempre red.
  if (url.pathname.startsWith("/api/")) return "skip";

  // Documento completo (recarga, enlace externo, arranque de la PWA): red
  // primero, para que la página llegue fresca; la copia en caché solo se usa si
  // la red falla.
  if (request.mode === "navigate") return "network-first";

  if (IMMUTABLE_PATH.test(url.pathname) || ASSET_EXT.test(url.pathname)) {
    return "cache-first";
  }

  // Todo lo demás: a la red, sin intervenir. El defecto es NO cachear — el bug
  // de v2 nació justo del defecto contrario.
  return "skip";
}

// Solo para el test unitario (src/lib/pwa/sw-strategy.test.ts), que carga este
// fichero en un vm. En el navegador es una propiedad inerte.
self.swStrategy = swStrategy;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const strategy = swStrategy(request, self.location.origin);

  if (strategy === "skip") return;

  if (strategy === "network-first") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || (await caches.match(OFFLINE_URL));
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      });
    })
  );
});

self.addEventListener("push", (event) => {
  // .json() throws on a non-JSON payload (e.g. DevTools' synthetic "Push"
  // test button sends plain text) — fall back to treating it as the body
  // rather than letting the whole handler throw before showNotification.
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Biblioshare", {
      body: data.body,
      icon: "/icon-192",
      // Barra de estado de Android: monocromo aparte, porque solo se usa su
      // canal alfa (con /icon-192 saldría un cuadrado terracota macizo).
      badge: "/badge-96",
      data: { url: data.url ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) return existing.navigate(url).then((c) => c.focus());
      return self.clients.openWindow(url);
    })
  );
});
