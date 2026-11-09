# La ficha como cartel propio de cada obra — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada ficha (`/libro/[id]`, `/pelicula/[id]`, `/serie/[id]`) sea un cartel con la imagen y el color de su obra, y que sus pestañas respeten el tema del usuario teñido de ese color.

**Architecture:** Lógica pura en `src/lib/catalog/` (tono, forma del cartel, tamaño del título) más una función de servidor cacheada que extrae el tono de la portada. Un envoltorio `WorkScope` redefine los tokens de la app dentro de la ficha, así que los componentes de las pestañas cambian sin tocarlos. `ItemShell` pasa a ser cartel + cabecera + pestañas, con el cartel como columna `sticky` desde `xl`.

**Tech Stack:** Next.js 16 (App Router, `cacheComponents`, `use cache`), React 19, `sharp`, `next/font`, Tailwind v4 (`@theme inline`), CSS modules, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-ficha-cartel-design.md`

## Global Constraints

- **No cambian** las server actions ni el esquema.
- **Regla #437:** `getWorkHue` es la única función nueva con `use cache`. Recibe solo una URL (escalar), no usa Supabase, `cookies()`, `headers()` ni `searchParams`. Ninguna lectura dependiente del usuario entra en caché.
- **Se conservan:** `ItemDetailTabs`, sus slots y `<Suspense>`, `?tab=`, los `data-testid`, un único `PassCard` por ficha, `StickyPassCta`, el zoom de portada (`ImageZoom`) y el `<h1>` con el título.
- **Las hojas `ritualScope`** (sesión y cierre) no se tocan.
- **`--status-*` y `--type-*` no se tiñen.**
- **Contraste AA** de los tokens teñidos en los 360 tonos y los dos temas; el test manda sobre los valores de partida.
- **El título va siempre sobre el degradado**, nunca directamente sobre la foto.
- **Copy:** en español; ningún texto de usuario cambia.
- **Entorno (Windows, PowerShell):**
  - Rama: `claude/ficha-cartel`.
  - `node_modules` no existe en este worktree. Créalo una vez antes de empezar y no lo borres: `New-Item -ItemType Junction -Path node_modules -Target D:\Proyectos\Personal\Biblioshare\node_modules`.
  - Prefijo de cada comando de Node: `fnm env | Out-String | Invoke-Expression; fnm use 22;`. Encadena con `;`.
  - `next dev` y `next build` necesitan `--webpack` (Turbopack no arranca con el junction).
  - Un solo servidor en el puerto 3000; mátalo al terminar.
  - Escribe ficheros con las herramientas de edición (UTF-8), no con `Set-Content`.
  - Next: lee `node_modules/next/dist/docs/` antes de usar una API suya.
- **Commits:** cada mensaje termina con una línea en blanco y `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/lib/catalog/work-hue-core.ts` (+ test) | Crear | Tono desde píxeles, hash del título |
| `src/lib/catalog/poster-art.ts` (+ test) | Crear | Forma del cartel y tamaño del título |
| `src/lib/catalog/work-hue.ts` (+ test) | Crear | `getWorkHue` (cacheada) y `resolveWorkHue` |
| `src/components/detail/work-scope.module.css` | Crear | Tokens teñidos y títulos de sección |
| `src/components/detail/work-scope.tsx` | Crear | Envoltorio con tono y letra |
| `src/components/detail/work-scope-contrast.test.ts` | Crear | AA en 360 tonos y dos temas |
| `src/components/detail/poster-font.ts` | Crear | Anton con `next/font` |
| `src/components/detail/poster-art-view.tsx` (+ test) | Crear | Pinta las tres formas y cae a `type` |
| `src/components/detail/item-hero.tsx`, `item-shell.tsx`, `item-shell-skeleton.tsx` | Modificar | Cartel + cabecera + pestañas |
| `src/components/detail/hero-background.ts` (+ test) | Borrar | La sustituye `poster-art.ts` |
| `src/app/{libro,pelicula,serie}/[id]/page.tsx` | Modificar | Pasan `workHue` |
| `src/components/detail/item-detail-tabs.tsx`, `info-layout.tsx`, `community-panel.tsx`, `detail-container.ts` | Modificar | Acento de la obra y dos columnas desde `xl` |
| `e2e/ficha-cartel.spec.ts` | Crear | Casos de imagen, temas y axe |
| `e2e/ficha-cinematica.spec.ts`, otros | Modificar | Geometría nueva |
| Docs | Modificar | `decisiones.md`, backlog, grafo |

---

### Task 1: Lógica pura

**Files:**
- Create: `src/lib/catalog/work-hue-core.ts`, `src/lib/catalog/work-hue-core.test.ts`
- Create: `src/lib/catalog/poster-art.ts`, `src/lib/catalog/poster-art.test.ts`

**Interfaces:**
- Produces:
  - `hueFromPixels(data: Uint8Array | Buffer): number | null` (RGB, 3 bytes por píxel)
  - `hashTitleHue(title: string): number`
  - `type PosterArt = { kind: "bleed"; src: string } | { kind: "atmosphere"; src: string } | { kind: "type" }`
  - `pickPosterArt({ coverUrl }: { coverUrl: string | null }): PosterArt`
  - `posterTitleClass(title: string): string`

- [ ] **Step 1: Escribe los tests**

```ts
// src/lib/catalog/work-hue-core.test.ts
import { describe, expect, it } from "vitest";
import { hashTitleHue, hueFromPixels } from "./work-hue-core";

function solid(r: number, g: number, b: number, n = 864) {
  const d = new Uint8Array(n * 3);
  for (let i = 0; i < d.length; i += 3) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
  return d;
}

describe("hueFromPixels", () => {
  it("devuelve un tono en la familia del color dominante", () => {
    const red = hueFromPixels(solid(190, 30, 30))!;
    expect(red).toBeGreaterThanOrEqual(15);
    expect(red).toBeLessThanOrEqual(40);
    const blue = hueFromPixels(solid(30, 60, 200))!;
    expect(blue).toBeGreaterThanOrEqual(255);
    expect(blue).toBeLessThanOrEqual(280);
  });
  it("una portada gris, negra o blanca no tiene tono fiable", () => {
    expect(hueFromPixels(solid(128, 128, 128))).toBeNull();
    expect(hueFromPixels(solid(5, 5, 5))).toBeNull();
    expect(hueFromPixels(solid(252, 252, 252))).toBeNull();
  });
  it("muy poco color sobre un fondo gris tampoco cuenta", () => {
    const d = solid(120, 120, 120);
    for (let i = 0; i < 12; i += 3) { d[i] = 200; d[i + 1] = 20; d[i + 2] = 20; }
    expect(hueFromPixels(d)).toBeNull();
  });
  it("gana el tono con más presencia, no el primero", () => {
    const d = solid(30, 60, 200);
    for (let i = 0; i < 300; i += 3) { d[i] = 190; d[i + 1] = 30; d[i + 2] = 30; }
    expect(hueFromPixels(d)!).toBeGreaterThanOrEqual(255);
  });
});

describe("hashTitleHue", () => {
  it("es estable y está en 0–359", () => {
    expect(hashTitleHue("Tress")).toBe(hashTitleHue("Tress"));
    for (const t of ["Tress", "", "חוק ומסג", "Dune"]) {
      const h = hashTitleHue(t);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
      expect(Number.isInteger(h)).toBe(true);
    }
  });
  it("ignora mayúsculas y espacios de los extremos", () => {
    expect(hashTitleHue(" dune ")).toBe(hashTitleHue("Dune"));
  });
  it("títulos distintos reparten tonos distintos", () => {
    const hues = new Set(["Dune", "Tress", "Rayuela", "Elantris", "Mitosis"].map(hashTitleHue));
    expect(hues.size).toBeGreaterThan(3);
  });
});
```

```ts
// src/lib/catalog/poster-art.test.ts
import { describe, expect, it } from "vitest";
import { pickPosterArt, posterTitleClass } from "./poster-art";

describe("pickPosterArt", () => {
  it("TMDB va a sangre y en 780 px", () => {
    expect(pickPosterArt({ coverUrl: "https://image.tmdb.org/t/p/w342/a.jpg" }))
      .toEqual({ kind: "bleed", src: "https://image.tmdb.org/t/p/w780/a.jpg" });
  });
  it("otros orígenes van sobre su atmósfera y no cambian de URL", () => {
    const ol = "https://covers.openlibrary.org/b/id/1-L.jpg";
    expect(pickPosterArt({ coverUrl: ol })).toEqual({ kind: "atmosphere", src: ol });
    const g = "https://books.google.com/books/content?id=x&img=1&zoom=2";
    expect(pickPosterArt({ coverUrl: g }).kind).toBe("atmosphere");
    const s = "https://abc.supabase.co/storage/v1/object/public/c/1.jpg";
    expect(pickPosterArt({ coverUrl: s }).kind).toBe("atmosphere");
  });
  it("sin portada es tipográfico", () => {
    expect(pickPosterArt({ coverUrl: null })).toEqual({ kind: "type" });
    expect(pickPosterArt({ coverUrl: "" })).toEqual({ kind: "type" });
  });
});

describe("posterTitleClass", () => {
  const size = (n: number) => posterTitleClass("x".repeat(n));
  it("baja por tramos, incluidos sus límites", () => {
    expect(size(20)).toContain("text-[64px]");
    expect(size(21)).toContain("text-[50px]");
    expect(size(45)).toContain("text-[50px]");
    expect(size(46)).toContain("text-[38px]");
    expect(size(80)).toContain("text-[38px]");
    expect(size(81)).toContain("text-[30px]");
  });
  it("incluye su tamaño de escritorio", () => {
    expect(size(20)).toContain("xl:text-[88px]");
    expect(size(81)).toContain("xl:text-[38px]");
  });
});
```

- [ ] **Step 2: Comprueba que fallan**

Run: `npx vitest run src/lib/catalog/work-hue-core.test.ts src/lib/catalog/poster-art.test.ts`
Expected: FAIL; los módulos no existen.

- [ ] **Step 3: Implementa**

```ts
// src/lib/catalog/work-hue-core.ts
// Tono de una obra a partir de los píxeles de su portada (spec 2026-11-09). Puro.

const BINS = 24;
const BIN_DEG = 360 / BINS;
// Media de croma sobre TODOS los píxeles por debajo de la cual no hay color
// fiable. Medido: El silencio de los corderos 0,0156; Juego de tronos 0,0004.
const MIN_COLORFUL = 0.01;

const linear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

function toOklch(r8: number, g8: number, b8: number) {
  const r = linear(r8), g = linear(g8), b = linear(b8);
  const l = Math.cbrt(0.4122 * r + 0.5363 * g + 0.0514 * b);
  const m = Math.cbrt(0.2119 * r + 0.6807 * g + 0.1074 * b);
  const s = Math.cbrt(0.0883 * r + 0.2817 * g + 0.63 * b);
  const A = 1.9779 * l - 2.4286 * m + 0.4506 * s;
  const B = 0.0259 * l + 0.7828 * m - 0.8087 * s;
  return {
    L: 0.2104 * l + 0.7936 * m - 0.004 * s,
    C: Math.hypot(A, B),
    H: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  };
}

// Histograma de tonos ponderado por C², descartando sombras, luces y grises.
// Devuelve el centro del tramo mayor, o null si la portada no tiene color.
export function hueFromPixels(data: Uint8Array | Buffer): number | null {
  const bins = new Array<number>(BINS).fill(0);
  const pixels = Math.floor(data.length / 3);
  if (pixels === 0) return null;
  let chromaSum = 0;
  for (let i = 0; i + 2 < data.length; i += 3) {
    const { L, C, H } = toOklch(data[i], data[i + 1], data[i + 2]);
    if (L < 0.12 || L > 0.95 || C < 0.03) continue;
    bins[Math.min(BINS - 1, Math.floor(H / BIN_DEG))] += C * C;
    chromaSum += C;
  }
  if (chromaSum / pixels < MIN_COLORFUL) return null;
  let best = 0;
  bins.forEach((v, i) => { if (v > bins[best]) best = i; });
  return best * BIN_DEG + BIN_DEG / 2;
}

// Tono de respaldo: siempre el mismo para la misma obra.
export function hashTitleHue(title: string): number {
  const text = title.trim().toLowerCase().normalize("NFC");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}
```

```ts
// src/lib/catalog/poster-art.ts
// Forma del cartel de la ficha (spec 2026-11-09). Se decide por el origen, sin
// medir cada imagen: las portadas de libros rondan 180–340 px y no aguantan a
// toda pantalla; los pósters de TMDB sí, pedidos en 780.
export type PosterArt =
  | { kind: "bleed"; src: string }
  | { kind: "atmosphere"; src: string }
  | { kind: "type" };

const TMDB_POSTER = /^(https:\/\/image\.tmdb\.org\/t\/p\/)w\d+(\/.+)$/;

export function pickPosterArt({ coverUrl }: { coverUrl: string | null }): PosterArt {
  if (!coverUrl) return { kind: "type" };
  const tmdb = TMDB_POSTER.exec(coverUrl);
  if (tmdb) return { kind: "bleed", src: `${tmdb[1]}w780${tmdb[2]}` };
  return { kind: "atmosphere", src: coverUrl };
}

export function posterTitleClass(title: string): string {
  const length = Array.from(title).length;
  if (length <= 20) return "text-[64px] xl:text-[88px]";
  if (length <= 45) return "text-[50px] xl:text-[66px]";
  if (length <= 80) return "text-[38px] xl:text-[50px]";
  return "text-[30px] xl:text-[38px]";
}
```

- [ ] **Step 4: Comprueba que pasan**

Run: `npx vitest run src/lib/catalog/work-hue-core.test.ts src/lib/catalog/poster-art.test.ts; npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/work-hue-core.ts src/lib/catalog/work-hue-core.test.ts src/lib/catalog/poster-art.ts src/lib/catalog/poster-art.test.ts
git commit -m "feat(ficha): tono de la obra, forma del cartel y tamaño del título"
```

---

### Task 2: Extraer el tono en servidor

**Files:**
- Create: `src/lib/catalog/work-hue.ts`, `src/lib/catalog/work-hue.test.ts`

**Interfaces:**
- Consumes: `hueFromPixels`, `hashTitleHue` (Task 1).
- Produces:
  - `getWorkHue(coverUrl: string): Promise<number | null>` (`null` = portada sin color, cacheable; un fallo **lanza**)
  - `resolveWorkHue({ coverUrl, title }: { coverUrl: string | null; title: string }): Promise<number>` (nunca falla)

- [ ] **Step 1: Lee la guía de `use cache`**

Lee `node_modules/next/dist/docs/` (busca `use-cache` y `cacheLife`). Confirma que un error lanzado dentro de una función con `use cache` no se guarda en caché. Si la guía dice otra cosa, para y repórtalo.

- [ ] **Step 2: Escribe el test**

```ts
// src/lib/catalog/work-hue.test.ts
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
import { getWorkHue, resolveWorkHue, smallCoverUrl } from "./work-hue";
import { hashTitleHue } from "./work-hue-core";

const png = (r: number, g: number, b: number) =>
  sharp({ create: { width: 40, height: 60, channels: 3, background: { r, g, b } } }).png().toBuffer();
const ok = (buf: Buffer) => new Response(new Uint8Array(buf), { status: 200 });
const TMDB = "https://image.tmdb.org/t/p/w342/a.jpg";

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("smallCoverUrl", () => {
  it("pide la variante pequeña", () => {
    expect(smallCoverUrl(TMDB)).toBe("https://image.tmdb.org/t/p/w92/a.jpg");
    expect(smallCoverUrl("https://covers.openlibrary.org/b/id/1-L.jpg"))
      .toBe("https://covers.openlibrary.org/b/id/1-S.jpg");
  });
  it("deja igual los demás orígenes", () => {
    const g = "https://books.google.com/books/content?id=x";
    expect(smallCoverUrl(g)).toBe(g);
  });
});

describe("getWorkHue", () => {
  it("extrae el tono de una portada con color", async () => {
    vi.mocked(fetch).mockResolvedValue(ok(await png(190, 30, 30)));
    const hue = await getWorkHue(TMDB);
    expect(hue).toBeGreaterThanOrEqual(15);
    expect(hue).toBeLessThanOrEqual(40);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("https://image.tmdb.org/t/p/w92/a.jpg");
  });
  it("devuelve null con una portada sin color", async () => {
    vi.mocked(fetch).mockResolvedValue(ok(await png(128, 128, 128)));
    await expect(getWorkHue(TMDB)).resolves.toBeNull();
  });
  it("rechaza orígenes no permitidos sin descargar nada", async () => {
    await expect(getWorkHue("https://evil.example/a.jpg")).rejects.toThrow();
    await expect(getWorkHue("http://image.tmdb.org/t/p/w342/a.jpg")).rejects.toThrow();
    await expect(getWorkHue("https://abc.supabase.co/rest/v1/secret")).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("admite portadas de Storage", async () => {
    vi.mocked(fetch).mockResolvedValue(ok(await png(190, 30, 30)));
    await expect(getWorkHue("https://abc.supabase.co/storage/v1/object/public/c/1.png")).resolves.not.toBeNull();
  });
  it("lanza si la respuesta falla, para no cachear el fallo", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 500 }));
    await expect(getWorkHue(TMDB)).rejects.toThrow();
  });
  it("lanza si la imagen no se puede leer", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("no soy una imagen", { status: 200 }));
    await expect(getWorkHue(TMDB)).rejects.toThrow();
  });
});

describe("resolveWorkHue", () => {
  const silence = () => vi.spyOn(console, "error").mockImplementation(() => {});
  it("usa el tono de la portada si lo hay", async () => {
    vi.mocked(fetch).mockResolvedValue(ok(await png(30, 60, 200)));
    expect(await resolveWorkHue({ coverUrl: TMDB, title: "Dune" })).not.toBe(hashTitleHue("Dune"));
  });
  it("sin portada usa el hash y no descarga", async () => {
    expect(await resolveWorkHue({ coverUrl: null, title: "Tress" })).toBe(hashTitleHue("Tress"));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("portada sin color: hash", async () => {
    vi.mocked(fetch).mockResolvedValue(ok(await png(128, 128, 128)));
    expect(await resolveWorkHue({ coverUrl: TMDB, title: "Rayuela" })).toBe(hashTitleHue("Rayuela"));
  });
  it("si falla, hash y registra el error", async () => {
    const spy = silence();
    vi.mocked(fetch).mockRejectedValue(new Error("red"));
    expect(await resolveWorkHue({ coverUrl: TMDB, title: "Dune" })).toBe(hashTitleHue("Dune"));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 3: Comprueba que falla**

Run: `npx vitest run src/lib/catalog/work-hue.test.ts`
Expected: FAIL; el módulo no existe.

- [ ] **Step 4: Implementa**

```ts
// src/lib/catalog/work-hue.ts
import { cacheLife } from "next/cache";
import sharp from "sharp";
import { hashTitleHue, hueFromPixels } from "./work-hue-core";

const TIMEOUT_MS = 2000;
const MAX_BYTES = 2_000_000;

// Solo los orígenes de images.remotePatterns: la URL sale del catálogo y el
// servidor no debe descargar de cualquier sitio.
function isAllowedCover(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  if (["image.tmdb.org", "covers.openlibrary.org", "books.google.com", "books.googleusercontent.com"].includes(url.hostname)) {
    return true;
  }
  return url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/storage/v1/object/public/");
}

export function smallCoverUrl(coverUrl: string): string {
  return coverUrl
    .replace(/^(https:\/\/image\.tmdb\.org\/t\/p\/)w\d+\//, "$1w92/")
    .replace(/^(https:\/\/covers\.openlibrary\.org\/[ab]\/id\/\d+)-[SML]\.jpg$/, "$1-S.jpg");
}

// El tono depende solo de la imagen: igual para un anónimo, el dueño y un tercero
// (regla #437). `null` es un resultado válido (portada sin color). Un fallo LANZA:
// así no se guarda en caché y la siguiente visita lo reintenta.
export async function getWorkHue(coverUrl: string): Promise<number | null> {
  "use cache";
  cacheLife("max");

  const url = new URL(coverUrl);
  if (!isAllowedCover(url)) throw new Error(`getWorkHue: origen no permitido ${url.hostname}`);

  const res = await fetch(smallCoverUrl(coverUrl), {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "error",
  });
  if (!res.ok) throw new Error(`getWorkHue: HTTP ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  if (input.length > MAX_BYTES) throw new Error("getWorkHue: imagen demasiado grande");

  const pixels = await sharp(input).resize(24, 36, { fit: "fill" }).removeAlpha().raw().toBuffer();
  return hueFromPixels(pixels);
}

export async function resolveWorkHue({
  coverUrl,
  title,
}: {
  coverUrl: string | null;
  title: string;
}): Promise<number> {
  if (!coverUrl) return hashTitleHue(title);
  try {
    return (await getWorkHue(coverUrl)) ?? hashTitleHue(title);
  } catch (error) {
    console.error("resolveWorkHue", error);
    return hashTitleHue(title);
  }
}
```

Algunas portadas de Google redirigen. Si `redirect: "error"` falla con portadas reales de `books.google.com`, cámbialo por `"follow"` y comprueba `isAllowedCover(new URL(res.url))` tras la respuesta, con su test.

- [ ] **Step 5: Comprueba que pasa**

Run: `npx vitest run src/lib/catalog; npx tsc --noEmit; npm run lint`
Expected: PASS y 0 errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalog/work-hue.ts src/lib/catalog/work-hue.test.ts
git commit -m "feat(ficha): extraer el tono de la portada en servidor con caché"
```

---

### Task 3: Tokens teñidos y letra

**Files:**
- Create: `src/components/detail/work-scope.module.css`, `src/components/detail/work-scope.tsx`, `src/components/detail/poster-font.ts`, `src/components/detail/work-scope-contrast.test.ts`

**Interfaces:**
- Produces:
  - `WorkScope({ hue, children }: { hue: number; children: ReactNode })`
  - `posterFont` (`next/font`, variable `--font-poster`)
  - Tokens en el ámbito: los de la app más `--work-title`.

- [ ] **Step 1: Escribe el test**

```ts
// src/components/detail/work-scope-contrast.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Lee el CSS REAL: copiar aquí los valores dejaría que el test y el color divergieran.
const css = readFileSync(join(__dirname, "work-scope.module.css"), "utf8");

function block(selector: string) {
  const start = css.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}
function tokens(text: string) {
  const out: Record<string, [number, number]> = {};
  for (const m of text.matchAll(/(--[\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+var\(--work-hue\)\)/g)) {
    out[m[1]] = [Number(m[2]), Number(m[3])];
  }
  return out;
}

function srgbLuminance(L: number, C: number, H: number) {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const r = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}
function ratio(a: [number, number], b: [number, number], h: number) {
  const x = srgbLuminance(a[0], a[1], h), y = srgbLuminance(b[0], b[1], h);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const TEXT = ["--foreground", "--foreground-soft", "--muted-foreground", "--work-title", "--accent-ink"];
const SURFACES = ["--background", "--surface", "--surface-muted"];

describe.each([
  ["claro", tokens(block(".scope {"))],
  ["oscuro", tokens(block(":global(.dark) .scope {"))],
])("tema %s", (_name, t) => {
  it("define todos los tokens", () => {
    for (const k of [...TEXT, ...SURFACES, "--accent", "--accent-foreground"]) expect(t[k], k).toBeDefined();
  });
  it("texto sobre superficies: AA en los 360 tonos", () => {
    for (let h = 0; h < 360; h++) for (const fg of TEXT) for (const bg of SURFACES) {
      expect(ratio(t[fg], t[bg], h), `${fg} sobre ${bg} en ${h}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("texto sobre el acento: AA en los 360 tonos", () => {
    for (let h = 0; h < 360; h++) {
      expect(ratio(t["--accent-foreground"], t["--accent"], h), `acento en ${h}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
```

- [ ] **Step 2: Comprueba que falla**

Run: `npx vitest run src/components/detail/work-scope-contrast.test.ts`
Expected: FAIL; el CSS no existe.

- [ ] **Step 3: Implementa**

```css
/* src/components/detail/work-scope.module.css */
/* El tema del usuario teñido por la obra (spec 2026-11-09). Redefine los tokens
   de la app en este ámbito: Tailwind v4 los lee como variables, así que las
   pestañas cambian sin tocarlas. Solo varía el tono: luminosidad y croma son
   fijos por tema y el test de contraste los defiende en los 360 tonos. */
.scope {
  --background: oklch(0.945 0.018 var(--work-hue));
  --surface: oklch(0.975 0.01 var(--work-hue));
  --surface-muted: oklch(0.92 0.02 var(--work-hue));
  --surface-3: oklch(0.89 0.025 var(--work-hue));
  --foreground: oklch(0.27 0.03 var(--work-hue));
  --foreground-soft: oklch(0.36 0.03 var(--work-hue));
  --muted-foreground: oklch(0.42 0.03 var(--work-hue));
  --foreground-faint: oklch(0.62 0.03 var(--work-hue));
  --accent: oklch(0.52 0.16 var(--work-hue));
  --accent-hover: oklch(0.46 0.16 var(--work-hue));
  --accent-foreground: oklch(0.99 0.005 var(--work-hue));
  --accent-ink: oklch(0.42 0.14 var(--work-hue));
  --work-title: oklch(0.36 0.12 var(--work-hue));
  --border: oklch(0.36 0.12 var(--work-hue) / 0.18);
  background: var(--background);
  color: var(--foreground);
}
:global(.dark) .scope {
  --background: oklch(0.2 0.028 var(--work-hue));
  --surface: oklch(0.25 0.03 var(--work-hue));
  --surface-muted: oklch(0.29 0.03 var(--work-hue));
  --surface-3: oklch(0.33 0.03 var(--work-hue));
  --foreground: oklch(0.88 0.02 var(--work-hue));
  --foreground-soft: oklch(0.82 0.02 var(--work-hue));
  --muted-foreground: oklch(0.76 0.02 var(--work-hue));
  --foreground-faint: oklch(0.5 0.02 var(--work-hue));
  --accent: oklch(0.72 0.14 var(--work-hue));
  --accent-hover: oklch(0.78 0.14 var(--work-hue));
  --accent-foreground: oklch(0.18 0.02 var(--work-hue));
  --accent-ink: oklch(0.8 0.12 var(--work-hue));
  --work-title: oklch(0.9 0.07 var(--work-hue));
  --border: oklch(0.9 0.07 var(--work-hue) / 0.18);
}
/* Títulos de sección de las pestañas, en la letra de cartel. */
.scope :global([role="tabpanel"] h2) {
  font-family: var(--font-poster), var(--font-geist-sans), sans-serif;
  font-size: 22px;
  font-weight: 400;
  line-height: 1.05;
  letter-spacing: 0.015em;
  text-transform: uppercase;
  color: var(--work-title);
}
```

```ts
// src/components/detail/poster-font.ts
import { Anton } from "next/font/google";

// Solo la ficha la usa: se instancia aquí para no cargarla en toda la app.
export const posterFont = Anton({
  weight: "400",
  subsets: ["latin", "latin-ext"],
  variable: "--font-poster",
  display: "swap",
});
```

```tsx
// src/components/detail/work-scope.tsx
import type { CSSProperties, ReactNode } from "react";
import { posterFont } from "./poster-font";
import styles from "./work-scope.module.css";

export function WorkScope({ hue, children }: { hue: number; children: ReactNode }) {
  return (
    <div
      data-testid="work-scope"
      className={`${styles.scope} ${posterFont.variable} w-full flex-1`}
      style={{ "--work-hue": hue } as CSSProperties}
    >
      {children}
    </div>
  );
}
```

Si `npm run lint` o la build rechazan el selector `.scope :global([role="tabpanel"] h2)`, usa `.scope [role="tabpanel"] :global(h2)`. Si el test falla en algún tono, ajusta **solo** la luminosidad del token que falla, en este CSS.

- [ ] **Step 4: Comprueba que pasa**

Run: `npx vitest run src/components/detail/work-scope-contrast.test.ts; npx tsc --noEmit; npm run lint`
Expected: PASS y 0 errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/detail/work-scope.module.css src/components/detail/work-scope.tsx src/components/detail/poster-font.ts src/components/detail/work-scope-contrast.test.ts
git commit -m "feat(ficha): tema teñido por la obra y letra de cartel"
```

---

### Task 4: El cartel y la estructura de la ficha

**Files:**
- Create: `src/components/detail/poster-art-view.tsx`, `src/components/detail/poster-art-view.test.tsx`
- Modify: `src/components/detail/item-hero.tsx`, `src/components/detail/item-shell.tsx`, `src/components/detail/item-shell-skeleton.tsx`
- Modify: `src/app/libro/[id]/page.tsx`, `src/app/pelicula/[id]/page.tsx`, `src/app/serie/[id]/page.tsx`
- Delete: `src/components/detail/hero-background.ts`, `src/components/detail/hero-background.test.ts`

**Interfaces:**
- Consumes: `pickPosterArt`, `posterTitleClass` (Task 1); `resolveWorkHue` (Task 2); `WorkScope` (Task 3); `ImageZoom`.
- Produces:
  - `PosterArtView({ art, title }: { art: PosterArt; title: string })`
  - `ItemShell` con la prop nueva `workHue: number` y sin `backdropUrl`.
  - `ItemHero` exporta la cabecera (`design-sync-shims/entry.ts` la reexporta: mantén el nombre).

- [ ] **Step 1: Escribe el test del cartel**

```tsx
// src/components/detail/poster-art-view.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ alt, src, onError }: { alt: string; src: string; onError?: () => void }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} onError={onError} />
  ),
}));
vi.mock("@/components/ui/image-zoom", () => ({
  ImageZoom: ({ children }: { children: React.ReactNode }) => <div data-testid="zoom">{children}</div>,
}));
import { PosterArtView } from "./poster-art-view";
afterEach(cleanup);

describe("PosterArtView", () => {
  it("bleed: una imagen con zoom", () => {
    const { container } = render(<PosterArtView art={{ kind: "bleed", src: "/a.jpg" }} title="X" />);
    expect(screen.getByAltText("X")).toBeTruthy();
    expect(screen.getByTestId("zoom")).toBeTruthy();
    expect(container.querySelector('[data-poster="bleed"]')).toBeTruthy();
  });
  it("atmosphere: fondo difuminado decorativo y portada nítida", () => {
    const { container } = render(<PosterArtView art={{ kind: "atmosphere", src: "/a.jpg" }} title="X" />);
    expect(screen.getByAltText("X")).toBeTruthy();
    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(container.querySelector('[data-poster="atmosphere"]')).toBeTruthy();
  });
  it("type: el título como imagen, oculto al lector de pantalla", () => {
    const { container } = render(<PosterArtView art={{ kind: "type" }} title="Tress" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[data-poster="type"]')?.getAttribute("aria-hidden")).toBe("true");
    expect(container.textContent).toContain("Tress");
  });
  it("si la imagen falla pasa a type", () => {
    const { container } = render(<PosterArtView art={{ kind: "bleed", src: "/a.jpg" }} title="X" />);
    fireEvent.error(screen.getByAltText("X"));
    expect(container.querySelector('[data-poster="type"]')).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });
  it("si cambia la imagen vuelve a intentarlo", () => {
    const { container, rerender } = render(<PosterArtView art={{ kind: "bleed", src: "/a.jpg" }} title="X" />);
    fireEvent.error(screen.getByAltText("X"));
    rerender(<PosterArtView art={{ kind: "bleed", src: "/b.jpg" }} title="X" />);
    expect(container.querySelector('[data-poster="bleed"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Comprueba que falla**

Run: `npx vitest run src/components/detail/poster-art-view.test.tsx`
Expected: FAIL; el módulo no existe.

- [ ] **Step 3: Implementa `PosterArtView`**

```tsx
// src/components/detail/poster-art-view.tsx
"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageZoom } from "@/components/ui/image-zoom";
import type { PosterArt } from "@/lib/catalog/poster-art";

// Las tres formas del cartel (spec 2026-11-09). Llena su contenedor, que es
// quien fija el tamaño. Si la imagen falla, cae a la forma tipográfica.
export function PosterArtView({ art, title }: { art: PosterArt; title: string }) {
  const src = art.kind === "type" ? null : art.src;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = src !== null && failedSrc === src;
  const onError = () => setFailedSrc(src);

  if (art.kind === "type" || failed) {
    return (
      <div
        data-poster="type"
        aria-hidden
        className="absolute inset-0 overflow-hidden"
        style={{
          background:
            "radial-gradient(120% 70% at 75% 8%, oklch(0.55 0.12 var(--work-hue)) 0, transparent 62%), radial-gradient(90% 60% at 10% 35%, oklch(0.45 0.1 calc(var(--work-hue) + 40)) 0, transparent 60%), var(--background)",
        }}
      >
        <span
          className="absolute top-10 -left-3 whitespace-nowrap uppercase opacity-20"
          style={{ fontFamily: "var(--font-poster), sans-serif", fontSize: "clamp(180px, 34vw, 320px)", lineHeight: 0.82, color: "var(--work-title)" }}
        >
          {title}
        </span>
      </div>
    );
  }

  if (art.kind === "bleed") {
    return (
      <div data-poster="bleed" className="absolute inset-0">
        <ImageZoom src={art.src} alt={title} className="absolute inset-0">
          <Image src={art.src} alt={title} fill loading="eager" fetchPriority="high" sizes="(min-width: 1280px) 520px, 100vw" onError={onError} className="object-cover object-top" />
        </ImageZoom>
      </div>
    );
  }

  return (
    <div data-poster="atmosphere" className="absolute inset-0 overflow-hidden">
      <Image src={art.src} alt="" fill aria-hidden sizes="180px" className="scale-125 object-cover opacity-90 blur-3xl saturate-[1.3]" />
      <div className="absolute top-[12%] left-1/2 h-[256px] w-[178px] -translate-x-1/2 xl:top-[18%]">
        <ImageZoom src={art.src} alt={title} className="relative block h-full w-full overflow-hidden rounded-[3px] shadow-[0_26px_40px_-16px_rgba(0,0,0,0.85)]">
          <Image src={art.src} alt={title} fill loading="eager" fetchPriority="high" sizes="178px" onError={onError} className="object-cover" />
        </ImageZoom>
      </div>
    </div>
  );
}
```

Lee `src/components/ui/image-zoom.tsx` antes: adapta las props y `className` a su API real sin cambiarla. `aria-hidden` debe llegar al `<img>` decorativo.

- [ ] **Step 4: Reestructura la ficha**

`src/components/detail/item-shell.tsx`, sustituye el `return` y añade `workHue` (quita `backdropUrl`):

```tsx
return (
  <WorkScope hue={workHue}>
    <div className="xl:grid xl:grid-cols-[min(33%,520px)_minmax(0,1fr)]">
      <div className="relative h-[min(68svh,560px)] overflow-hidden xl:sticky xl:top-[var(--topbar-h)] xl:h-[calc(100dvh-var(--topbar-h))]">
        <PosterArtView art={pickPosterArt({ coverUrl })} title={title} />
        {/* El título nunca va sobre la foto: el degradado llega al fondo antes. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-30% via-background/85 via-60% to-background to-[82%] xl:bg-gradient-to-r xl:from-transparent xl:from-[70%] xl:via-transparent xl:to-background xl:to-100%" />
      </div>
      <div className="relative min-w-0">
        <ItemHero
          itemType={itemType}
          mediaLabel={mediaLabel}
          title={title}
          byline={byline}
          genres={genres}
          avgRating={avgRating}
          ratingsLabel={ratingsLabel}
          backLabel={backLabel}
          menuSlot={menuSlot}
          passCard={passCard}
        />
        {tabs}
      </div>
    </div>
  </WorkScope>
);
```

`src/components/detail/item-hero.tsx`: quita `HeroBackdrop`, `coverUrl`, `backdropUrl`, `pickHeroBackground`, `ImageZoom` y la rejilla `[portada | título | tarjeta]`. El nuevo cuerpo, conservando los textos, `GenreTag`, `RatingDots` y `formatDots` actuales:

```tsx
<div className={`relative ${DETAIL_CONTAINER} -mt-[clamp(110px,20svh,170px)] pb-5 xl:mt-0 xl:pt-10 xl:pb-8`}>
  {/* la barra ← · tipo · ⋯ de móvil, igual que hoy, pero fija arriba del cartel:
      absolute con top negativo no sirve aquí; colócala en ItemShell si hace falta */}
  <div className="flex flex-wrap items-center gap-1.5">{/* tipo y GenreTag, como hoy */}</div>
  <h1
    className={`mt-2 uppercase [overflow-wrap:anywhere] leading-[0.97] ${posterTitleClass(title)}`}
    style={{ fontFamily: "var(--font-poster), var(--font-geist-sans), sans-serif", color: "var(--work-title)" }}
  >
    {title}
  </h1>
  {/* byline y nota, como hoy */}
  <div className="mt-4 max-w-[420px]">{passCard}</div>
</div>
```

La barra de móvil (`BackButton`, tipo, `menuSlot`, solo `< lg`) va en `ItemShell`, posicionada `absolute top-3.5 inset-x-4 z-10` sobre el cartel, con `bg-background/70 backdrop-blur` en cada control para que se lea sobre cualquier imagen. No debe aparecer dos veces.

`src/components/detail/item-shell-skeleton.tsx`: replica las mismas alturas (cartel `h-[min(68svh,560px)]`, columna desde `xl`, la cabecera con el mismo `-mt`), para que no salte al llegar la ficha.

Borra `hero-background.ts` y su test (la de sagas, `src/components/saga/ficha/hero-background.ts`, es otra y no se toca).

- [ ] **Step 5: Conecta las páginas**

En `BookDetail` de `src/app/libro/[id]/page.tsx`, justo antes del `return` con `<ItemShell`:

```tsx
const workHue = await resolveWorkHue({ coverUrl: book.cover_url, title: book.title });
```

Pasa `workHue={workHue}` y quita `backdropUrl={null}`. Haz lo mismo en película y serie con sus variables (`backdropUrl` desaparece también de ahí; si la consulta solo lee `backdrop_url` para esto, déjala como está: no amplíes el alcance).

- [ ] **Step 6: Verifica**

Run: `npx vitest run src/components/detail src/lib/catalog; npx tsc --noEmit; npm run lint`
Expected: PASS y 0 errores.

Luego arranca `npx next dev --webpack -p 3000` y captura `/pelicula/[id]`, `/libro/[id]` con y sin portada, a 412 y 1440 px, con un spec temporal `e2e/zz-tmp-*.spec.ts` que no se commitea. Comprueba: título legible sobre el degradado, ningún control duplicado, la barra de móvil sobre el cartel, columna fija en escritorio, sin scroll horizontal, sin errores en consola. Corrige lo que salga, borra el temporal y para el servidor.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/detail src/app/libro src/app/pelicula src/app/serie
git commit -m "feat(ficha): cartel a sangre, atmósfera o tipográfico y columna en escritorio"
```

---

### Task 5: Las pestañas dentro del cartel

**Files:**
- Modify: `src/components/detail/item-detail-tabs.tsx`, `src/components/detail/detail-container.ts`, `src/components/detail/info-layout.tsx`, `src/components/detail/info-layout.test.tsx`, `src/components/detail/community-panel.tsx`, `src/components/detail/item-tabs-skeleton.tsx`
- Modify: los hijos de `InfoLayout` con `lg:order-none` en `src/app/{libro,pelicula,serie}/[id]/page.tsx` y `src/components/detail/`

**Interfaces:**
- Consumes: tokens de `WorkScope` (Task 3).

- [ ] **Step 1: Actualiza el test**

En `info-layout.test.tsx`, cambia las clases `lg:order-none` del fixture por `xl:order-none` y añade:

```tsx
it("las dos columnas empiezan en xl, no en lg", () => {
  render(<InfoLayout main={<p>a</p>} aside={<p>b</p>} />);
  const root = screen.getByTestId("info-main").parentElement!;
  expect(root.className).toContain("xl:grid-cols-[minmax(0,1fr)_280px]");
  expect(root.className).not.toContain("lg:grid");
});
```

Run: `npx vitest run src/components/detail/info-layout.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Implementa**

- `item-detail-tabs.tsx`: el subrayado de la pestaña activa usa `bg-accent` en lugar de `accent.bg` (quita `MEDIA_ACCENT`/`accent` si queda sin uso).
- `detail-container.ts`:
  - `DETAIL_CONTAINER = "mx-auto w-full max-w-[1320px] px-4 sm:px-6 xl:px-10"`.
  - `DETAIL_ASIDE_STICKY = "xl:sticky xl:top-[calc(var(--topbar-h)+73px)]"`.
  - Actualiza su comentario.
- `info-layout.tsx`: cambia todos los `lg:` de layout por `xl:`, con `xl:grid-cols-[minmax(0,1fr)_280px]` y `xl:gap-x-8`.
- `community-panel.tsx:144`: igual, `xl:grid xl:grid-cols-[minmax(0,1fr)_280px]`, y los `lg:order-none`/`lg:mb-0` de ese layout pasan a `xl:`.
- Hijos de `InfoLayout`: localiza con `grep -rn "lg:order-none" src/app/libro src/app/pelicula src/app/serie src/components/detail` y cambia a `xl:order-none`, para conservar el orden móvil hasta 1279 px.
- Títulos de sección: `grep -n "<h2\|<h3\|label-section" src/components/detail/*.tsx`. Cada título de sección de las pestañas debe ser un `<h2>` dentro del `tabpanel` para que le aplique la letra de cartel. Si alguno es otra etiqueta y no romperá la jerarquía, cámbialo a `h2`. `label-section` fija sus propios estilos con una clase: asegúrate de que el selector de `work-scope.module.css` gana, o amplíalo. Los títulos de tarjeta (por ejemplo «1.º visionado») no son de sección y no cambian.
- Episodios: comprueba `episode-panel.tsx` a 1280 y 1440 px con el cartel al lado. Si las tres columnas no caben, sube su breakpoint de dos a tres columnas (por ejemplo de `xl:` a `2xl:`) sin cambiar comportamiento, y ajusta `e2e/ficha-cinematica.spec.ts` en la Task 6 con el viewport que corresponda.

- [ ] **Step 3: Verifica**

Run: `npx vitest run src/components/detail; npx tsc --noEmit; npm run lint`
Expected: PASS y 0 errores.

- [ ] **Step 4: Commit**

```bash
git add -A src/components/detail src/app/libro src/app/pelicula src/app/serie
git commit -m "feat(ficha): pestañas con el acento y los títulos de la obra"
```

---

### Task 6: e2e

**Files:**
- Create: `e2e/ficha-cartel.spec.ts`
- Modify: `e2e/ficha-cinematica.spec.ts`, `e2e/ci/detail-title-wrap.spec.ts` y los que fallen por la geometría nueva

- [ ] **Step 1: Crea `e2e/ficha-cartel.spec.ts`**

Copia de `e2e/cierre-ritual.spec.ts` su helper `rest` (no importes un `.spec.ts`; la convención del repo es copiarlo). Usa `AxeBuilder` como `e2e/a11y-landmark-main.spec.ts` u otro spec que ya lo use.

```ts
const cases = [
  { name: "película con TMDB", table: "movies", query: "cover_url=like.*tmdb*", path: "/pelicula/", kind: "bleed" },
  { name: "libro con portada pequeña", table: "books", query: "cover_url=like.*openlibrary*", path: "/libro/", kind: "atmosphere" },
  { name: "libro sin portada", table: "books", query: "cover_url=is.null", path: "/libro/", kind: "type" },
] as const;

for (const c of cases) {
  for (const [label, viewport] of [["móvil", { width: 412, height: 915 }], ["escritorio", { width: 1440, height: 900 }]] as const) {
    for (const scheme of ["light", "dark"] as const) {
      test(`${c.name} · ${label} · ${scheme}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: scheme });
        const [row] = await rest(`${c.table}?select=id&${c.query}&limit=1`);
        await page.goto(`${c.path}${row.id}`);
        await expect(page.locator(`[data-poster="${c.kind}"]`)).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const hue = await page.getByTestId("work-scope").evaluate((el) => (el as HTMLElement).style.getPropertyValue("--work-hue"));
        expect(Number(hue)).toBeGreaterThanOrEqual(0);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
}

test("?tab= sigue abriendo la pestaña", async ({ page }) => {
  const [row] = await rest("movies?select=id&cover_url=like.*tmdb*&limit=1");
  await page.goto(`/pelicula/${row.id}?tab=community`);
  await expect(page.locator("#item-tabpanel-community")).toBeVisible();
});

test("en escritorio la columna de cartel se queda fija al hacer scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const [row] = await rest("movies?select=id&cover_url=like.*tmdb*&limit=1");
  await page.goto(`/pelicula/${row.id}`);
  const poster = page.locator('[data-poster="bleed"]');
  const before = await poster.boundingBox();
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(300);
  expect((await poster.boundingBox())!.y).toBeCloseTo(before!.y, 0);
});

test("axe: sin problemas de contraste en la ficha", async ({ page }) => {
  const [row] = await rest("movies?select=id&cover_url=like.*tmdb*&limit=1");
  await page.goto(`/pelicula/${row.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).include('[data-testid="work-scope"]').withRules(["color-contrast"]).analyze();
  expect(violations).toEqual([]);
});
```

Comprueba el identificador real de la pestaña Comunidad en `tab-visibility.ts` antes de escribir `?tab=` y `#item-tabpanel-…`. Si el modo oscuro de la app no sigue a `emulateMedia`, fija el tema como hagan los specs existentes (`grep -rn "dark" e2e --include=*.ts -l`).

- [ ] **Step 2: Corre contra build de producción**

1. `npx next build --webpack`
2. Con el puerto 3000 libre, `npm run start` en segundo plano; espera con `curl --retry 90 --retry-delay 2 --retry-all-errors -s -o /dev/null http://localhost:3000/`.
3. `npx playwright test e2e/ficha-cartel.spec.ts e2e/ficha-cinematica.spec.ts e2e/ci/detail-title-wrap.spec.ts e2e/ci/image-zoom-loading.spec.ts e2e/pase-hub.spec.ts e2e/cierre-ritual.spec.ts e2e/registrar-sesion-v2.spec.ts e2e/notas-captura.spec.ts`
4. Corrige según lo siguiente y para el servidor.

Ajustes esperados:

| Spec | Qué cambia |
|---|---|
| `ficha-cinematica` «el cuerpo usa el ancho (> 1100px)» | El cuerpo ahora comparte fila con el cartel: comprueba que ocupa toda la columna derecha |
| `ficha-cinematica` «una sola tarjeta, a la derecha del título» | Una sola tarjeta, **debajo** del título |
| `ficha-cinematica` móvil | La tarjeta sigue antes de las pestañas |
| `detail-title-wrap` | Selectores de portada y columna según la estructura nueva |

Solo ajusta lo que la spec cambia a propósito. Conocidos sin relación con esta rama: `registrar-sesion-v2:509` (#1605), `notas-captura:309` y `pase-hub:321` (intermitentes). Cualquier otro fallo se investiga y se reporta.

- [ ] **Step 3: Commit**

```bash
git add e2e
git commit -m "test(ficha): e2e del cartel, sus casos de imagen y el contraste"
```

---

### Task 7: Documentación

**Files:**
- Modify: `docs/requirements/decisiones.md` (al final), `docs/requirements/backlog.md`, `docs/architecture/graph.json` (+ `node docs/architecture/sync.mjs`)

- [ ] **Step 1: `decisiones.md`**

Añade al final:

```markdown
## 2026-11-09 — La ficha como cartel propio de cada obra

- Cada ficha es un cartel con la imagen y el color de su obra; sin juego ni pasos nuevos.
- **Forma por origen de la imagen:** TMDB a sangre (780 px); el resto, portada nítida sobre su
  atmósfera (las portadas de libros rondan 180–340 px y no aguantan a toda pantalla); sin imagen o si
  falla, cartel tipográfico.
- **Tema teñido:** `WorkScope` redefine los tokens de la app en la ficha con OKLCH (solo varía el
  tono); un test defiende AA en los 360 tonos y los dos temas.
- **Color en servidor con caché:** `getWorkHue` lleva `use cache` porque el dato depende solo de la
  imagen, igual para cualquiera que mire (regla #437). Solo descarga de los orígenes permitidos y un
  fallo no se cachea. Portada sin color o sin portada: hash del título.
- **Escritorio:** columna de cartel desde `xl`; `backdrop_url` deja de usarse en la ficha.
- **Una letra de cartel (Anton)**, cargada solo en la ficha.
- Spec: `docs/superpowers/specs/2026-11-09-ficha-cartel-design.md`.
```

- [ ] **Step 2: Backlog y grafo**

- Añade `- [x] Ficha como cartel propio de cada obra (spec 2026-11-09)` junto a los ítems de ficha o de los reworks recientes.
- Sigue `docs/architecture/README.md`: añade los ficheros nuevos a los nodos de detalle, extiende `meta.verifiedAgainst`, y ejecuta `node docs/architecture/sync.mjs` y `node docs/architecture/sync.mjs --check`.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs(ficha): decisión, backlog y grafo del cartel"
```

---

## Self-review (hecho al escribir el plan)

| Sección de la spec | Task |
|---|---|
| Tres formas del cartel | 1, 4 |
| Móvil y escritorio | 4, 5 |
| Pestañas teñidas y títulos | 3, 5 |
| Tramos del título | 1, 4 |
| `getWorkHue`, orígenes, fallo no cacheado | 2 |
| Tono de respaldo | 1, 2 |
| `WorkScope` y contraste | 3 |
| Letra solo en la ficha | 3 |
| Errores | 2, 4 |
| Pruebas | 1–6 |
| Lo que se mantiene | Global Constraints, 4, 5, 6 |

**Riesgo a vigilar:** la Task 4 cambia la geometría más usada de la app. Si el cartel de móvil tapa contenido con títulos largos, ajusta el `-mt` y las paradas del degradado, no los tramos del título.

**Comprobación manual final:** preview de Vercel (Turbopack) de las tres fichas.
