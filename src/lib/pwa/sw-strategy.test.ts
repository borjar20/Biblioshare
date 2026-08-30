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
// globales mínimos que necesita para evaluarse, y devuelve su `self` con las
// funciones puras expuestas. Se prueba el fichero que se despliega, no una
// copia de su lógica: una copia se desincronizaría a la primera.
function loadSw(): Record<string, unknown> {
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
  return self;
}

function loadStrategy(): (request: FakeRequest, origin: string) => Strategy {
  const strategy = loadSw().swStrategy;
  if (typeof strategy !== "function") {
    throw new Error("public/sw.js no expone self.swStrategy");
  }
  return strategy as (request: FakeRequest, origin: string) => Strategy;
}

function loadCacheableDocument(): (ok: boolean, cacheControl: string | null) => boolean {
  const cacheable = loadSw().swCacheableDocument;
  if (typeof cacheable !== "function") {
    throw new Error("public/sw.js no expone self.swCacheableDocument");
  }
  return cacheable as (ok: boolean, cacheControl: string | null) => boolean;
}

function loadOfflineShellRoute(): (pathname: string) => boolean {
  const shell = loadSw().swOfflineShellRoute;
  if (typeof shell !== "function") {
    throw new Error("public/sw.js no expone self.swOfflineShellRoute");
  }
  return shell as (pathname: string) => boolean;
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

describe("swCacheableDocument", () => {
  // EL bug de #680: el HTML de una navegación autenticada acababa en Cache
  // Storage y sobrevivía al logout. Next marca las páginas dinámicas (las que
  // llevan sesión) con `no-store`; esa cabecera es la línea roja.
  it("no guarda un documento marcado no-store (página con sesión)", () => {
    const cacheable = loadCacheableDocument();
    expect(cacheable(true, "no-store, must-revalidate")).toBe(false);
  });

  it("no guarda un documento marcado private", () => {
    const cacheable = loadCacheableDocument();
    expect(cacheable(true, "private, max-age=0")).toBe(false);
  });

  it("no guarda respuestas de error (un 500 offline no es un salvavidas)", () => {
    const cacheable = loadCacheableDocument();
    expect(cacheable(false, "public, max-age=300")).toBe(false);
  });

  it("guarda un documento público cacheable", () => {
    const cacheable = loadCacheableDocument();
    expect(cacheable(true, "public, s-maxage=31536000")).toBe(true);
  });

  it("guarda un documento sin cabecera Cache-Control", () => {
    const cacheable = loadCacheableDocument();
    expect(cacheable(true, null)).toBe(true);
  });
});

describe("swOfflineShellRoute", () => {
  // Play es local-first: su shell se guarda aunque Next lo marque no-store
  // (lleva un boundary de sesión). No reabre #680 porque lo único por-usuario
  // del HTML es el id de identidad, y el purge de logout tira el caché entero.
  it.each([
    "/partidas",
    "/partidas/mtg",
    "/partidas/mtg/nueva",
    "/partidas/puntuacion",
    "/partidas/puntuacion/nueva",
    "/partida/activa",
  ])("reconoce %s como shell de Play", (pathname) => {
    expect(loadOfflineShellRoute()(pathname)).toBe(true);
  });

  it.each(["/", "/coleccion", "/partidario", "/partidas2", "/libro/abc"])(
    "no confunde %s con un shell de Play",
    (pathname) => {
      expect(loadOfflineShellRoute()(pathname)).toBe(false);
    },
  );

  // El payload RSC de una ruta de Play sigue sin tocarse: la excepción es solo
  // para el DOCUMENTO. Offline, Next cae a navegación completa y esa sí la
  // sirve el caché.
  it("un payload RSC de /partidas sigue siendo skip", () => {
    const strategyFor = loadStrategy();
    expect(strategyFor(req(`${ORIGIN}/partidas?_rsc=1a2b3`), ORIGIN)).toBe("skip");
  });
});
