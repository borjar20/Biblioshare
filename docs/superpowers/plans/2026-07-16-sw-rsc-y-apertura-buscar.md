# Estado rancio (service worker) y apertura lenta desde Buscar — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un cambio registrado se refleje al cambiar de pestaña en la ficha sin recargar, y que pulsar un resultado de Buscar responda al instante en vez de congelarse varios segundos.

**Architecture:** Dos causas independientes, ninguna de ellas de Next. (1) `public/sw.js` cachea **toda** petición GET del mismo origen con caché-primero, incluidos los payloads RSC de cada navegación cliente: el service worker devuelve el árbol de la visita anterior y se come cualquier `revalidatePath` del servidor hasta que recargas a mano. Se arregla acotando el SW a contenido inmutable + documento, y prohibiéndole tocar RSC. (2) `openCatalogItem` espera a `ensureBookHydrated` **antes** de redirigir, y esa función hace hasta dos llamadas a OpenLibrary con 5 s de timeout cada una (`work-detail.ts`): el clic puede quedarse hasta ~10 s con la pantalla de búsqueda congelada y sin más aviso que un `opacity-60`. Se arregla con un presupuesto de tiempo corto + `after()` para el resto, más feedback visible en la tarjeta.

**Tech Stack:** Next.js 16 (App Router, modelo de caché anterior — sin `cacheComponents`), React 19, service worker propio en `public/sw.js`, Vitest 4 (node, unit), Playwright (e2e), next-intl.

## Global Constraints

- **Node 22**: `fnm use` antes de `npx vitest` / `npx playwright test` (el shell arranca en 20.9).
- **Modelo de caché**: no introducir `cacheComponents`, `use cache` ni `revalidateTag` — `revalidatePath` es el primitivo correcto (lecturas dinámicas por usuario con RLS). Ver `docs/reactividad.md` §Modelo de caché.
- **Tests unitarios**: node-only, sin jsdom ni red, y solo se recogen los que casen con `src/**/*.test.ts` (`vitest.config.ts`).
- **i18n**: solo existe `messages/es.json`; toda copy nueva se lee con `useTranslations`, nunca literal en el JSX.
- **No tocar `src/components/detail/**` ni `src/app/{libro,pelicula,serie}/[id]/**`**: el plan 06 (fidelidad Paper · Ficha) está en vuelo en otra sesión y son sus ficheros. Este plan se arregla entero sin entrar ahí.
- **Comentarios**: el repo comenta el *porqué* (restricción, decisión), no el *qué*. Seguir ese registro, en español, como el código de alrededor.

## File Structure

| Fichero | Responsabilidad | Acción |
|---|---|---|
| `public/sw.js` | Estrategia de caché del PWA. Gana una función pura `swStrategy(request, origin)` con toda la decisión, y los handlers pasan a ser tontos. | Modificar |
| `src/lib/pwa/sw-strategy.test.ts` | Carga `public/sw.js` real en un `vm` y prueba su decisión petición a petición. Sin copiar la lógica (se desincronizaría). | Crear |
| `src/components/service-worker-register.tsx` | Registra el SW **solo** en producción; en desarrollo desregistra y vacía cachés. | Modificar |
| `src/lib/async/settled-within.ts` | Helper puro: "¿terminó esta promesa dentro del presupuesto?" sin cancelarla ni lanzar. | Crear |
| `src/lib/async/settled-within.test.ts` | Sus tres casos (a tiempo / se agota / revienta). | Crear |
| `src/app/buscar/actions.ts` | `openCatalogItem`: redirige con presupuesto acotado y cede la hidratación restante a `after()`. | Modificar |
| `src/app/buscar/open-result-button.tsx` | Feedback visible mientras la obra nace. | Modificar |
| `messages/es.json` | Clave `search.opening`. | Modificar |
| `e2e/sw-rsc.spec.ts` | E2E opt-in (`SW_E2E=1`, contra build de producción): ningún payload RSC lo sirve el SW. | Crear |
| `docs/reactividad.md` | La regla nueva: el SW no puede cachear datos del usuario. Es una invariante de la capa de verdad. | Modificar |

---

### Task 1: El service worker deja de cachear payloads RSC

**Files:**
- Modify: `public/sw.js`
- Test: `src/lib/pwa/sw-strategy.test.ts` (crear)

**Interfaces:**
- Produces: `self.swStrategy(request, origin) -> "skip" | "network-first" | "cache-first"`, expuesto en `public/sw.js` para que el test lo alcance. `request` solo necesita `{ method, url, mode, headers }`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/pwa/sw-strategy.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://biblioshare.example";

type Strategy = "skip" | "network-first" | "cache-first";
type FakeRequest = {
  method: string;
  url: string;
  mode?: string;
  headers: Headers;
};

// Carga el service worker REAL (public/sw.js) en un contexto de vm con los
// globales mínimos que necesita para evaluarse, y devuelve su función de
// decisión. Se prueba el fichero que se despliega, no una copia de su lógica:
// una copia se desincronizaría a la primera.
function loadStrategy(): (request: FakeRequest, origin: string) => Strategy {
  const code = readFileSync("public/sw.js", "utf8");
  const self: Record<string, unknown> = {
    addEventListener: () => {},
    skipWaiting: () => {},
    clients: { claim: () => {} },
    registration: {},
    location: { origin: ORIGIN },
  };
  const sandbox: Record<string, unknown> = {
    self,
    caches: {},
    URL,
    Headers,
    console,
    fetch: () => {},
  };
  sandbox.globalThis = sandbox;
  createContext(sandbox);
  runInContext(code, sandbox);

  const strategy = self.swStrategy;
  if (typeof strategy !== "function") {
    throw new Error("public/sw.js no expone self.swStrategy");
  }
  return strategy as (request: FakeRequest, origin: string) => Strategy;
}

function req(
  url: string,
  init: { method?: string; mode?: string; headers?: Record<string, string> } = {},
): FakeRequest {
  return {
    method: init.method ?? "GET",
    url,
    mode: init.mode,
    headers: new Headers(init.headers ?? {}),
  };
}

describe("swStrategy", () => {
  // EL bug: el payload de cada navegación cliente. Servirlo de caché repintaba
  // datos viejos al cambiar de pestaña en la ficha y anulaba revalidatePath.
  it("no toca un payload RSC marcado con la cabecera RSC", () => {
    const strategyFor = loadStrategy();
    expect(
      strategyFor(
        req(`${ORIGIN}/libro/abc?tab=community`, { headers: { RSC: "1" } }),
        ORIGIN,
      ),
    ).toBe("skip");
  });

  it("no toca un payload RSC marcado con ?_rsc= (prefetch de <Link>)", () => {
    const strategyFor = loadStrategy();
    expect(
      strategyFor(req(`${ORIGIN}/libro/abc?tab=community&_rsc=1a2b3`), ORIGIN),
    ).toBe("skip");
  });

  it("el documento va a la red primero (la caché es solo el salvavidas offline)", () => {
    const strategyFor = loadStrategy();
    expect(strategyFor(req(`${ORIGIN}/libro/abc`, { mode: "navigate" }), ORIGIN)).toBe(
      "network-first",
    );
  });

  it("los estáticos con hash de Next van de caché primero", () => {
    const strategyFor = loadStrategy();
    expect(strategyFor(req(`${ORIGIN}/_next/static/chunks/main-abc123.js`), ORIGIN)).toBe(
      "cache-first",
    );
  });

  it("los assets de /public van de caché primero", () => {
    const strategyFor = loadStrategy();
    expect(strategyFor(req(`${ORIGIN}/icon-192.png`), ORIGIN)).toBe("cache-first");
  });

  it("no toca otro origen (Supabase, portadas, APIs de catálogo)", () => {
    const strategyFor = loadStrategy();
    expect(strategyFor(req("https://xyz.supabase.co/rest/v1/books"), ORIGIN)).toBe("skip");
  });

  it("no toca mutaciones", () => {
    const strategyFor = loadStrategy();
    expect(strategyFor(req(`${ORIGIN}/libro/abc`, { method: "POST" }), ORIGIN)).toBe("skip");
  });

  it("no toca las rutas de servidor", () => {
    const strategyFor = loadStrategy();
    expect(strategyFor(req(`${ORIGIN}/api/push/subscribe`), ORIGIN)).toBe("skip");
  });

  // Red de seguridad: lo que no se reconozca NO se cachea. El bug nació justo de
  // lo contrario — un cajón de sastre que cacheaba todo lo que no era navegación.
  it("por defecto no cachea nada que no sea inmutable", () => {
    const strategyFor = loadStrategy();
    expect(strategyFor(req(`${ORIGIN}/coleccion`), ORIGIN)).toBe("skip");
  });
});
```

- [ ] **Step 2: Ejecutar el test y ver que falla**

```bash
fnm use && npx vitest run src/lib/pwa/sw-strategy.test.ts
```

Esperado: FAIL — `public/sw.js no expone self.swStrategy`.

- [ ] **Step 3: Reescribir la estrategia de `public/sw.js`**

Sustituir todo lo que hay **desde la primera línea hasta el final del listener de `fetch`** (los listeners de `push` y `notificationclick` se quedan **intactos, tal cual, debajo**):

```js
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
```

- [ ] **Step 4: Ejecutar el test y ver que pasa**

```bash
fnm use && npx vitest run src/lib/pwa/sw-strategy.test.ts
```

Esperado: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add public/sw.js src/lib/pwa/sw-strategy.test.ts
git commit -m "fix(pwa): el service worker deja de cachear payloads RSC"
```

---

### Task 2: Registrar el service worker solo en producción

**Files:**
- Modify: `src/components/service-worker-register.tsx`

**Interfaces:**
- Consumes: `public/sw.js` de la Task 1.
- Produces: nada nuevo; el componente sigue exportando `ServiceWorkerRegister()` sin props.

Sin test unitario: es un `useEffect` que solo habla con `navigator`, y vitest aquí es node-only sin jsdom (Global Constraints). Se verifica en el navegador, en este mismo paso, y la Task 5 lo cubre de forma automática en producción.

- [ ] **Step 1: Reescribir el componente**

```tsx
"use client";

import { useEffect } from "react";

// El service worker SOLO se registra en producción. En desarrollo estorba: los
// estáticos de `next dev` no llevan hash estable, así que cachearlos pisa al
// bundler y al HMR, y un SW instalado hace semanas sigue sirviendo código viejo
// en localhost sin que nadie lo sospeche. Por eso, además de no registrarlo, se
// DESREGISTRA y se vacían sus cachés: hasta hoy se registraba en todos los
// entornos, así que el SW envenenado de v2 está ya instalado en el navegador de
// cualquiera que haya abierto la app en local.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .catch(() => {});
      if ("caches" in window) {
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          .catch(() => {});
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js");
  }, []);

  return null;
}
```

- [ ] **Step 2: Verificar en desarrollo que se desregistra**

```bash
fnm use && npm run dev
```

En el navegador, sobre `http://localhost:3000`: DevTools → Application → Service Workers debe quedar **vacío** (si había uno, desaparece tras una recarga), y Application → Cache Storage sin entradas `biblioshare-*`.

- [ ] **Step 3: Verificar que el build de producción sí lo registra**

```bash
fnm use && npm run build && npm start
```

Sobre `http://localhost:3000`: Application → Service Workers muestra `sw.js` **activated and running**, y Cache Storage tiene `biblioshare-v3` (no `v2`).

- [ ] **Step 4: Commit**

```bash
git add src/components/service-worker-register.tsx
git commit -m "fix(pwa): registrar el service worker solo en produccion y limpiarlo en dev"
```

---

### Task 3: `openCatalogItem` redirige con presupuesto acotado

**Files:**
- Create: `src/lib/async/settled-within.ts`
- Test: `src/lib/async/settled-within.test.ts` (crear)
- Modify: `src/app/buscar/actions.ts:17-44` (`openCatalogItem`)

**Interfaces:**
- Produces: `settledWithin(promise: Promise<unknown>, ms: number): Promise<boolean>` — `true` si la promesa se asentó dentro del presupuesto, `false` si se agotó. Nunca lanza y **nunca cancela** la promesa.
- Consumes: `ensureBookHydrated` (`src/lib/catalog/hydrate-book.ts`), `after` (`next/server`).

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/async/settled-within.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { settledWithin } from "./settled-within";

describe("settledWithin", () => {
  it("devuelve true si la promesa termina dentro del presupuesto", async () => {
    await expect(settledWithin(Promise.resolve("ok"), 50)).resolves.toBe(true);
  });

  it("devuelve false si se agota el presupuesto", async () => {
    vi.useFakeTimers();
    try {
      const nunca = new Promise<void>(() => {});
      const result = settledWithin(nunca, 1000);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(result).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  // Una promesa que revienta ya no va a tardar más: cuenta como terminada, y su
  // error NO se propaga al llamador (que solo quiere saber si sigue esperando).
  it("una promesa rechazada cuenta como terminada y no propaga el error", async () => {
    await expect(
      settledWithin(Promise.reject(new Error("boom")), 50),
    ).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Ejecutar el test y ver que falla**

```bash
fnm use && npx vitest run src/lib/async/settled-within.test.ts
```

Esperado: FAIL — no se puede resolver `./settled-within`.

- [ ] **Step 3: Escribir el helper**

Crear `src/lib/async/settled-within.ts`:

```ts
// ¿Terminó esta promesa dentro del presupuesto? true = sí, false = se agotó el
// tiempo. Nunca lanza, y sobre todo NUNCA cancela la promesa: el trabajo sigue
// vivo y es el llamador quien decide qué hacer con él (p. ej. cedérselo a
// after() para que termine tras la respuesta).
export function settledWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    promise
      .then(
        () => {},
        () => {},
      )
      .finally(() => {
        clearTimeout(timer);
        resolve(true);
      });
  });
}
```

- [ ] **Step 4: Ejecutar el test y ver que pasa**

```bash
fnm use && npx vitest run src/lib/async/settled-within.test.ts
```

Esperado: PASS, 3 tests.

- [ ] **Step 5: Acotar la hidratación en `openCatalogItem`**

En `src/app/buscar/actions.ts`, añadir a los imports de cabecera:

```ts
import { after } from "next/server";
import { settledWithin } from "@/lib/async/settled-within";
```

Añadir la constante justo debajo del bloque de imports:

```ts
// Presupuesto de la hidratación antes de navegar. No es un timeout de la
// llamada: es cuánto está dispuesto el usuario a mirar una pantalla congelada.
const HYDRATION_BUDGET_MS = 1200;
```

Sustituir el bloque `if (result.itemType === "book") { ... }` de `openCatalogItem` (con su comentario actual, que ya no describe lo que pasa) por:

```ts
  if (result.itemType === "book") {
    // La hidratación pega a OpenLibrary, y sus DOS llamadas tienen 5 s de
    // timeout cada una (work-detail.ts): esperarla entera aquí dejaba el clic
    // en el resultado congelado hasta ~10 s, con la pantalla de búsqueda
    // intacta y sin más aviso que la tarjeta atenuada. Se le da un presupuesto
    // corto: si OpenLibrary responde rápido (lo normal), la ficha nace ya con
    // su sinopsis y sus géneros; si no, se navega igual y el trabajo sigue vivo
    // en after(), así que la ficha lo tendrá en el siguiente pintado. La red de
    // seguridad final es el curador de la propia ficha (after() en
    // libro/[id]/page.tsx), que rehidrata cualquier fila con hydrated_at null
    // la próxima vez que se abra.
    const hydration = ensureBookHydrated(supabase, {
      id: itemId,
      openlibrary_work_key: result.externalId,
      isbn: result.matchedIsbn ?? null,
      hydrated_at: null,
    });
    if (!(await settledWithin(hydration, HYDRATION_BUDGET_MS))) {
      after(() => hydration);
    }
  }
```

Y actualizar el comentario de cabecera de `openCatalogItem`, cuya última frase ("Al abrirla, la ficha la hidrata") describe el flujo viejo:

```ts
// Abrir la ficha de un resultado que TODAVÍA no está en el catálogo: la búsqueda
// ya no persiste nada (§7.32), así que un resultado de la API llega sin
// catalogId y no hay ficha a la que enlazar hasta que la obra existe. Aquí es
// donde nace: el usuario ha hecho clic, es decir, se ha comprometido con el
// libro. La hidratación se intenta aquí con un presupuesto corto y, si no llega
// a tiempo, se termina en segundo plano (ver HYDRATION_BUDGET_MS más abajo).
```

- [ ] **Step 6: Comprobar que compila y que la suite unitaria sigue verde**

```bash
fnm use && npx tsc --noEmit && npx vitest run
```

Esperado: sin errores de tipos; todos los tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/async/settled-within.ts src/lib/async/settled-within.test.ts src/app/buscar/actions.ts
git commit -m "perf(buscar): abrir un resultado deja de esperar a OpenLibrary para navegar"
```

---

### Task 4: Feedback visible al abrir un resultado

**Files:**
- Modify: `src/app/buscar/open-result-button.tsx`
- Modify: `messages/es.json` (namespace `search`)

**Interfaces:**
- Consumes: `openCatalogItem` (Task 3), clave i18n `search.opening`.

- [ ] **Step 1: Añadir la clave i18n**

En `messages/es.json`, dentro del objeto `search`, justo después de `"adding": "Añadiendo...",`:

```json
  "opening": "Abriendo...",
```

- [ ] **Step 2: Pintar el estado de carga en la tarjeta**

Reescribir `src/app/buscar/open-result-button.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { SearchResult } from "@/lib/catalog/types";
import { openCatalogItem } from "./actions";

// Un resultado que aún no está en el catálogo no tiene ficha a la que enlazar
// (la búsqueda ya no crea filas, §7.32), así que en vez de un <Link> se pinta un
// botón: al pulsarlo, la obra se crea y se redirige a su ficha recién nacida.
// Visualmente es la misma tarjeta; la diferencia es que no se puede abrir en una
// pestaña nueva, cosa que para un ítem que todavía no existe tampoco tendría
// mucho sentido.
export function OpenResultButton({
  result,
  children,
}: {
  result: SearchResult;
  children: ReactNode;
}) {
  const t = useTranslations("search");
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => openCatalogItem(result))}
      disabled={isPending}
      aria-busy={isPending}
      className="group relative flex w-full flex-col gap-2 rounded-lg text-left transition hover:-translate-y-0.5"
    >
      {children}
      {/* Abrir un resultado nuevo crea la obra en el catálogo: hay ida y vuelta
          al servidor de por medio, y con la tarjeta apenas atenuada el clic
          parecía no hacer nada. El overlay va por encima de la tarjeta entera
          (nada de un hueco nuevo) para no mover la rejilla de resultados. */}
      {isPending && (
        <span className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/70 backdrop-blur-[2px]">
          <span className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
            {t("opening")}
          </span>
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 3: Verificar en el navegador**

```bash
fnm use && npm run dev
```

Con sesión iniciada, ir a `http://localhost:3000/buscar?type=book&q=hyperion+dan+simmons` y pulsar un resultado que sea **botón** (obra aún sin crear): la tarjeta debe mostrar "ABRIENDO..." de inmediato, y la ficha debe abrirse sin quedarse congelada varios segundos.

- [ ] **Step 4: Commit**

```bash
git add src/app/buscar/open-result-button.tsx messages/es.json
git commit -m "fix(buscar): la tarjeta avisa mientras se abre el resultado"
```

---

### Task 5: E2E del service worker + la regla en la doc

**Files:**
- Create: `e2e/sw-rsc.spec.ts`
- Modify: `docs/reactividad.md`

**Interfaces:**
- Consumes: `public/sw.js` (Task 1) y el registro solo-en-producción (Task 2).

El e2e es **opt-in** (`SW_E2E=1`): el SW solo existe en producción, y la suite normal corre contra `next dev`. Como `playwright.config.ts` tiene `reuseExistingServer: true` sobre `http://localhost:3000`, basta con dejar ahí un `next start` para que Playwright lo reutilice en vez de arrancar `next dev`.

- [ ] **Step 1: Escribir el test**

Crear `e2e/sw-rsc.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;

// Opt-in: el service worker solo se registra en producción, así que este spec
// necesita un build real sirviendo en :3000 (Playwright lo reutiliza gracias a
// reuseExistingServer). Cómo correrlo:
//   npm run build && npm start          # en otra terminal, en :3000
//   SW_E2E=1 npx playwright test e2e/sw-rsc.spec.ts
test.describe("service worker y payloads RSC", () => {
  test.skip(process.env.SW_E2E !== "1", "requiere build de producción (ver cabecera)");
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  test.setTimeout(120_000);

  test("ningún payload RSC lo sirve el service worker", async ({ page }) => {
    // El bug: el SW servía de su caché los payloads de las navegaciones
    // cliente, así que la ficha repintaba datos de la visita anterior al
    // cambiar de pestaña y se comía la revalidación del servidor.
    const servedBySw: string[] = [];
    let rscSeen = 0;
    page.on("response", (response) => {
      if (!response.url().includes("_rsc=")) return;
      rscSeen += 1;
      if (response.fromServiceWorker()) servedBySw.push(response.url());
    });

    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    // Sin SW al mando el test no probaría nada: se espera a que tome el control.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
      timeout: 30_000,
    });

    await page.goto("/buscar?type=book&q=dune");
    const card = page
      .locator('a[href*="/libro/"]')
      .or(page.getByRole("button", { name: /ediciones/ }))
      .first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.click();
    await page.waitForURL(/\/libro\/[0-9a-f-]{36}/, { timeout: 30_000 });

    // Ida y vuelta entre pestañas dos veces: la segunda visita a "Comunidad" es
    // justo donde el SW devolvía su copia cacheada de la primera.
    for (const name of [/comunidad/i, /registro/i, /comunidad/i]) {
      await page.getByRole("button", { name }).click();
      await page.waitForTimeout(600);
    }

    expect(rscSeen).toBeGreaterThan(0);
    expect(servedBySw).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el e2e contra un build de producción**

```bash
fnm use && npm run build
```

En una terminal aparte: `npm start`. Después:

```bash
fnm use && SW_E2E=1 npx playwright test e2e/sw-rsc.spec.ts
```

Esperado: 1 passed. (Antes de la Task 1 este test fallaría con `servedBySw` no vacío — es la regresión que cubre.)

- [ ] **Step 3: Escribir la regla en `docs/reactividad.md`**

Añadir esta sección **justo antes** de `## Modelo de caché`:

```markdown
## El service worker no puede cachear datos del usuario

`public/sw.js` solo cachea contenido inmutable (`/_next/static`, assets de
`/public`) y el documento como salvavidas de offline. **Nunca** payloads RSC
(cabecera `RSC` o `?_rsc=`): son la carga útil de cada navegación cliente, y
servirlos de caché anula toda la capa de verdad de arriba — el servidor
revalida y el SW sigue entregando lo viejo hasta que recargas a mano. No es
teórico: la v2 del caché lo hacía, y por eso registrabas una sesión, cambiabas
de pestaña en la ficha y lo registrado desaparecía (arreglado 2026-07-16).

Si tocas la estrategia del SW, `src/lib/pwa/sw-strategy.test.ts` carga el
fichero real y fija la decisión para cada tipo de petición; el defecto es NO
cachear. El SW se registra **solo en producción**
(`service-worker-register.tsx`): en desarrollo se desregistra y se vacían sus
cachés. Verificación end-to-end en `e2e/sw-rsc.spec.ts` (opt-in, `SW_E2E=1`,
contra un build de producción).
```

- [ ] **Step 4: Commit**

```bash
git add e2e/sw-rsc.spec.ts docs/reactividad.md
git commit -m "test(pwa): e2e opt-in del service worker y la regla en la doc de reactividad"
```

---

### Task 6: Verificación de cierre

**Files:** ninguno (solo comprobaciones).

- [ ] **Step 1: Suite unitaria y tipos**

```bash
fnm use && npx tsc --noEmit && npx vitest run && npm run lint
```

Esperado: tipos limpios, todos los tests PASS, lint sin errores.

- [ ] **Step 2: El bug original, a mano, contra un build de producción**

```bash
fnm use && npm run build && npm start
```

Con sesión iniciada y **sin recargar en ningún momento**:
1. Abrir la ficha de un libro con un pase abierto y registrar una sesión.
2. Al volver a la ficha, cambiar a "Comunidad" y luego a "Mi registro".
3. La sesión registrada y el progreso deben seguir ahí, y "Comunidad" debe reflejar la nota nueva.

Antes del arreglo, el paso 3 mostraba el estado anterior hasta recargar a mano.

- [ ] **Step 3: Regresión de la escalera de hidratación**

```bash
fnm use && npx playwright test e2e/busqueda-hidratacion.spec.ts
```

Esperado: todos PASS. Vigilar en concreto "abrir un resultado nuevo crea la obra y la hidrata": comprueba que la ficha nace **con sinopsis y sin recargar**, que es justo lo que el presupuesto de la Task 3 podría haber roto. Si sale flaky por lentitud de OpenLibrary, **no** subir `HYDRATION_BUDGET_MS`: es señal de que toca la deuda anotada abajo (streaming de la sinopsis).

- [ ] **Step 4: Suite e2e completa**

```bash
fnm use && npx playwright test
```

Esperado: sin regresiones respecto a la corrida de referencia en `main`.

---

## Deuda anotada (fuera de alcance, decidida a propósito)

- **Streaming de la sinopsis en la ficha.** El arreglo *definitivo* de la latencia es que `openCatalogItem` redirija sin esperar nada y que la ficha resuelva la hidratación por streaming dentro de su `<Suspense>`, igual que ya hace `loadBookEditions` con las ediciones. No entra aquí porque toca `src/app/libro/[id]/page.tsx` y `src/components/detail/**`, que son del plan 06 en vuelo (Global Constraints). Con el presupuesto de la Task 3 el peor caso ya baja de ~10 s a ~1,2 s.
- **El documento cacheado lleva datos del usuario.** La rama `network-first` guarda el HTML renderizado para que offline muestre algo, y ese HTML es personalizado: en un dispositivo compartido, tras un logout, una navegación offline podría pintar la página del usuario anterior. Es preexistente y solo se manifiesta sin red; el arreglo (vaciar `biblioshare-v3` al cerrar sesión) es una tarea aparte.
- **Los `_rsc` ya no se cachean, así que la navegación cliente no funciona offline.** Antes "funcionaba" sirviendo datos rancios, que es el bug que este plan arregla. Las recargas completas siguen teniendo su fallback offline.

## Self-Review

- **Cobertura:** problema 1 (estado rancio) → Tasks 1, 2, 5; problema 2 (latencia al abrir) → Tasks 3, 4. Verificación de ambos → Task 6.
- **Sin placeholders:** todos los pasos que cambian código llevan el código entero; todos los comandos llevan su salida esperada.
- **Consistencia de tipos:** `swStrategy(request, origin)` devuelve las mismas tres cadenas en `public/sw.js` (Task 1), en su test (Task 1) y en el handler de `fetch` (Task 1). `settledWithin(promise, ms) -> Promise<boolean>` se define en la Task 3 Step 3 y se consume con esa firma en la Task 3 Step 5. La clave `search.opening` se crea en la Task 4 Step 1 y se lee con `t("opening")` bajo `useTranslations("search")` en el Step 2.
