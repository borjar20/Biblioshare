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
//
// v4 (2026-08-26, #680): v3 guardaba el HTML de TODA navegación con éxito,
// también las autenticadas, y nada lo purgaba al cerrar sesión: en un
// dispositivo compartido y sin red, otra persona podía recibir el HTML privado
// de la cuenta anterior. Ahora solo se guardan documentos que el servidor no
// marca como personales (ver swCacheableDocument) y el logout purga el caché.
// El bump a v4 tira las copias privadas que ya estén en disco.
//
// v5 (2026-08-30): Play es local-first (la partida vive en IndexedDB), pero sus
// pantallas no sobrevivían al modo avión: Next las sirve con `no-store` (llevan
// un boundary de sesión) y swCacheableDocument las rechazaba, así que sin red
// el SW caía a /offline. Ahora el documento de /partidas* y /partida/* se
// guarda aunque venga marcado personal (ver swOfflineShellRoute). No reabre
// #680: lo único por-usuario en ese HTML es el id de identidad que se pasa a
// las islas (el estado de juego se hidrata de IndexedDB en el cliente), y el
// purge de logout ya tira este caché entero, así que la copia muere con la
// sesión igual que el resto. El bump re-siembra en clientes viejos.
// v7 (2026-09-03): la bellota pasa de /pet/acorn.png a /pet/sheets/acorn.png.
// v8 (2026-09-04): los 18 sheets etapa×clase y la bellota se regeneraron a 64 px
// (antes 40-56); las rutas de los PNG no cambian y el SW los sirve caché-primero,
// así que el bump es lo único que fuerza a los clientes ya instalados a bajar los
// nuevos bytes en vez de seguir sirviendo los sprites antiguos desde disco.
const CACHE_NAME = "biblioshare-v8";
const OFFLINE_URL = "/offline";

// Shells de Play que se SIEMBRAN al instalar, sin esperar a una navegación
// dura: dentro de la app se llega al tablero por navegación BLANDA (cliente),
// así que el documento de /partida/activa podía no cachearse nunca y el
// primer modo avión caía a /offline con la partida sana en IndexedDB (visto
// en dispositivo real, 2026-08-31). Mismo argumento #680 que
// swOfflineShellRoute: solo el id de identidad viaja en ese HTML y el purge
// de logout tira el caché entero. Lista literal, no patrón: sembrar es un
// fetch real por URL y las rutas de Play son finitas y conocidas.
const PLAY_SHELL_URLS = [
  "/partidas",
  "/partidas/mtg",
  "/partidas/mtg/nueva",
  "/partidas/puntuacion",
  "/partidas/puntuacion/nueva",
  "/partida/activa",
];

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

// ¿Puede este documento guardarse como salvavidas offline? Solo si es un éxito
// y el servidor no lo marca como personal: Next sirve las páginas dinámicas
// (las que llevan sesión) con `Cache-Control: no-store` (o `private`), y esa
// cabecera es lo que separa «HTML igual para todos» de «HTML de una cuenta».
// PURA (estado + cabecera) por lo mismo que swStrategy: se prueba en vitest
// cargando este mismo fichero — ver src/lib/pwa/sw-strategy.test.ts.
function swCacheableDocument(ok, cacheControl) {
  if (!ok) return false;
  const directives = (cacheControl || "").toLowerCase();
  return !directives.includes("no-store") && !directives.includes("private");
}

// ¿Es esta ruta un shell de Play? Play funciona sin red a propósito (la partida
// vive en IndexedDB), así que su documento se guarda como salvavidas AUNQUE el
// servidor lo marque personal: lo único por-usuario del HTML es el id de
// identidad serializado hacia las islas, y el purge de logout (#680) ya tira
// este caché entero. PURA (solo pathname): se prueba en vitest — ver
// src/lib/pwa/sw-strategy.test.ts.
function swOfflineShellRoute(pathname) {
  return /^\/partida(s)?(\/|$)/.test(pathname);
}

// Solo para el test unitario (src/lib/pwa/sw-strategy.test.ts), que carga este
// fichero en un vm. En el navegador son propiedades inertes.
self.swStrategy = swStrategy;
self.swCacheableDocument = swCacheableDocument;
self.swOfflineShellRoute = swOfflineShellRoute;

// Siembra un shell de Play: fetch con credenciales (el documento se sirve por
// sesión) y put solo si el servidor respondió bien. Mejor esfuerzo: una ruta
// que falle no impide sembrar las demás ni instala el SW a medias.
function seedPlayShells(cache) {
  return Promise.allSettled(
    PLAY_SHELL_URLS.map((url) =>
      fetch(url, { credentials: "same-origin" }).then((response) => {
        if (response.ok) return cache.put(url, response);
      })
    )
  );
}
self.swSeedPlayShells = seedPlayShells; // inerte en el navegador; lo carga el test
self.PLAY_SHELL_URLS = PLAY_SHELL_URLS;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.all([cache.add(OFFLINE_URL), seedPlayShells(cache)]))
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
    const isPlayShell = swOfflineShellRoute(new URL(request.url).pathname);
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (
            swCacheableDocument(response.ok, response.headers.get("Cache-Control")) ||
            (response.ok && isPlayShell)
          ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          } else if (!isPlayShell) {
            // Si el documento es personal hoy, la copia pública de ayer para la
            // misma URL tampoco debe sobrevivir. Excepción: un shell de Play no
            // se borra por un error transitorio del servidor — perder el
            // salvavidas dejaría la partida (que está sana en IndexedDB) sin
            // pantalla en el próximo modo avión.
            caches.open(CACHE_NAME).then((cache) => cache.delete(request));
          }
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

// Purga al cerrar sesión (#680): la página avisa (logout-button) y se tira el
// caché entero — distinguir documentos de estáticos no compensa, los estáticos
// se re-cachean solos al siguiente uso. Se re-siembran /offline y los shells
// de Play (ya como anónimo: la petición viaja sin la sesión que acaba de
// morir) — sin re-siembra, tras un logout la navegación blanda volvería a
// dejar a Play sin salvavidas hasta el siguiente bump del SW.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "purge-caches") return;
  event.waitUntil(
    caches
      .delete(CACHE_NAME)
      .then(() => caches.open(CACHE_NAME))
      .then((cache) => Promise.all([cache.add(OFFLINE_URL), seedPlayShells(cache)]))
      .catch(() => {})
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
