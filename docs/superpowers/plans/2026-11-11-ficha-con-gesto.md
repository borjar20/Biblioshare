# Ficha con gesto — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dentro de la ficha de obra, la nota toma el tinte de la obra y la tarjeta del pase responde con gestos (pastilla deslizante, barra que se llena, puntos que saltan, botón que se hunde, histograma que crece).

**Architecture:** El tinte es un alias de tokens dentro de `WorkScope` (`--type-*` → `--accent`), sin tocar componentes. Los gestos son CSS modules junto a cada componente, activados por atributos `data-*` que el componente pone; `RatingDots` y `RatingHistogram` los ofrecen tras una prop que solo enciende la ficha.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, CSS modules, Vitest (+ Testing Library, jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-ficha-con-gesto-design.md`. Prototipo con los valores de animación: `.superpowers/brainstorm/2026-11-11/ficha-con-gesto.html`.

## Global Constraints

- Solo CSS: sin librerías de animación, sin textos nuevos (no se toca `messages/`), sin esquema, sin `use cache`.
- Toda animación va dentro de `@media (prefers-reduced-motion: no-preference)`. Con movimiento reducido la ficha queda como hoy.
- No cambian roles, `aria-*`, etiquetas ni `data-testid` existentes. Los e2e actuales de la ficha deben pasar sin editarlos.
- Fuera de la ficha (feed, biblioteca, perfil, `/post/[id]`) la nota sigue con el color del tipo, y `RatingDots` / `RatingHistogram` se comportan como hoy si no reciben la prop nueva.
- Las hojas de cierre, nuevo pase y retomar se montan fuera de `WorkScope` y conservan los colores de tipo globales; los `<dialog>` de dentro siguen el tinte de la obra. No hay regla CSS que restaure colores en `dialog` (corrección del 2026-11-11 a la tarea 1).
- Vitest no procesa CSS: `styles.x` no es una clase real en los tests. Los tests se apoyan en atributos `data-*`, no en nombres de clase.
- Un solo implementador a la vez en este árbol; commits pequeños, uno por tarea.
- Curvas y tiempos, copiados de la spec:
  - rebote: `cubic-bezier(0.34, 1.56, 0.64, 1)`;
  - pastilla 460 ms; latido del punto 560 ms;
  - barra 800 ms `cubic-bezier(0.22, 1, 0.36, 1)`;
  - punto de nota: escala 1,38 en 140 ms; salto 420 ms con 55 ms de desfase;
  - botón: baja 3 px, escala 0,985, 110 ms;
  - histograma: 620 ms con 45 ms de desfase.

## Preparación del entorno (una vez, antes de la tarea 1)

Este worktree no tiene `node_modules` ni `.env.local`. En PowerShell, desde la raíz del worktree:

```powershell
New-Item -ItemType Junction node_modules -Target D:\Proyectos\Personal\Biblioshare\node_modules
Copy-Item D:\Proyectos\Personal\Biblioshare\.env.local .env.local
```

Todos los comandos de test de este plan se lanzan así (el estado de `fnm` no persiste entre llamadas):

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run <ruta>
```

Si un test falla con «Cannot find module» de una dependencia que sí está en `package.json`, el
`node_modules` compartido va por detrás (el checkout principal está en otra rama): instala esa
dependencia en una carpeta temporal y cópiala, no ejecutes `npm ci` aquí. Antes de borrar el
worktree, quita el junction (`cmd /c rmdir node_modules`), o `git worktree remove` vacía el
`node_modules` del repo principal.

## Estructura de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/components/detail/work-scope.module.css` | Modificar | Alias `--type-*` → acento de la obra; restauración dentro de `<dialog>`. |
| `src/components/detail/work-scope-contrast.test.ts` | Modificar | Contraste de los pares nuevos y espejo de los valores globales. |
| `src/components/detail/status-segments.tsx` | Modificar | Pastilla deslizante y latido del punto. |
| `src/components/detail/status-segments.module.css` | Crear | Posición y animación de la pastilla y del latido. |
| `src/components/detail/status-segments.test.tsx` | Crear | Índice de la pastilla y latido tras un cambio. |
| `src/components/ui/rating-dots.tsx` | Modificar | Prop `lively`. |
| `src/components/ui/rating-dots.module.css` | Crear | Escala bajo el cursor y salto en cadena. |
| `src/components/ui/rating-dots.lively.test.tsx` | Crear | Marcas `data-lift` / `data-pop`. |
| `src/components/detail/pass-card.tsx` | Modificar | Enciende `lively`; clases de barra y de botón. |
| `src/components/detail/pass-card.module.css` | Crear | Barra que se llena y botón que se hunde. |
| `src/components/detail/rating-histogram.tsx` | Modificar | Prop `animate`. |
| `src/components/detail/rating-histogram.module.css` | Crear | Barras que crecen. |
| `src/components/detail/rating-histogram.test.tsx` | Crear | Con y sin `animate`. |
| `src/components/detail/community-summary.tsx` | Modificar | Enciende `animate`. |
| `docs/requirements/decisiones.md`, `docs/requirements/backlog.md` | Modificar | Decisión y casilla. |

---

### Task 1: La nota toma el tinte de la obra

**Files:**
- Modify: `src/components/detail/work-scope.module.css`
- Test: `src/components/detail/work-scope-contrast.test.ts`

**Interfaces:**
- Consumes: los tokens `--accent` y `--accent-ink` que `.scope` ya define, y los valores hexadecimales de `--type-*` de `src/app/globals.css`.
- Produces: dentro de `[data-testid="work-scope"]`, `--type-book|movie|series` valen el acento de la obra y sus `-ink`, el acento de texto. Ninguna tarea posterior depende de nombres nuevos.

- [ ] **Step 1: Escribe los tests que fallan**

En `src/components/detail/work-scope-contrast.test.ts`, sustituye la función `srgbLuminance` por estas dos (la segunda conserva el nombre y la firma, así que `ratio` no cambia):

```ts
function linearRgb(L: number, C: number, H: number): [number, number, number] {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function srgbLuminance(L: number, C: number, H: number) {
  return luminance(linearRgb(L, C, H));
}
```

Y añade al final del fichero:

```ts
// ── Color de tipo dentro de la ficha (spec 2026-11-11-ficha-con-gesto) ──────
const globalsCss = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");
const KINDS = ["book", "movie", "series"] as const;

function aliases(text: string) {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/(--type-[\w-]+):\s*var\((--[\w-]+)\)/g)) out[m[1]] = m[2];
  return out;
}
function hexes(text: string) {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/(--type-[\w-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]] = m[2].toLowerCase();
  return out;
}
/** Los valores de `--type-*` de globals.css, por orden de aparición: claro, .dark, sistema oscuro. */
function globalTypeColors(index: number) {
  const out: Record<string, string> = {};
  for (const kind of KINDS) for (const suffix of ["", "-ink"]) {
    const name = `--type-${kind}${suffix}`;
    const found = [...globalsCss.matchAll(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "gi"))];
    expect(found.length, name).toBeGreaterThanOrEqual(3);
    out[name] = found[index][1].toLowerCase();
  }
  return out;
}
// El tinte `bg-type-*/10` es el color al 10 % de alfa: el navegador lo compone
// sobre el fondo en sRGB con gamma, no en lineal.
const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function ratioOverTint(text: [number, number], tint: [number, number], bg: [number, number], h: number) {
  const top = linearRgb(tint[0], tint[1], h).map(encode);
  const under = linearRgb(bg[0], bg[1], h).map(encode);
  const mixed = top.map((v, i) => decode(v * 0.1 + under[i] * 0.9)) as [number, number, number];
  const x = srgbLuminance(text[0], text[1], h), y = luminance(mixed);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const EXPECTED_ALIASES = {
  "--type-book": "--accent", "--type-movie": "--accent", "--type-series": "--accent",
  "--type-book-ink": "--accent-ink", "--type-movie-ink": "--accent-ink", "--type-series-ink": "--accent-ink",
};

describe.each([
  ["claro", ".scope {", ".scope :global(dialog) {", 0],
  ["oscuro", ":global(.dark) .scope {", ":global(.dark) .scope :global(dialog) {", 1],
  ["sistema oscuro", ":global(:root:not(.light):not(.dark)) .scope {", ":global(:root:not(.light):not(.dark)) .scope :global(dialog) {", 2],
] as const)("color de tipo en la ficha, tema %s", (_name, scopeSelector, dialogSelector, globalsIndex) => {
  const t = tokens(block(scopeSelector));

  it("el color de tipo es el acento de la obra", () => {
    expect(aliases(block(scopeSelector))).toEqual(EXPECTED_ALIASES);
  });
  it("las hojas <dialog> recuperan los colores de tipo de globals.css", () => {
    expect(hexes(block(dialogSelector))).toEqual(globalTypeColors(globalsIndex));
  });
  it("como gráfico: 3:1 sobre fondo y tarjeta en los 360 tonos", () => {
    for (let h = 0; h < 360; h++) for (const bg of ["--background", "--surface"]) {
      expect(ratio(t["--accent"], t[bg], h), `--accent sobre ${bg} en ${h}`).toBeGreaterThanOrEqual(3);
    }
  });
  it("como texto sobre su tinte al 10 %: AA en los 360 tonos", () => {
    for (let h = 0; h < 360; h++) for (const bg of ["--background", "--surface"]) {
      expect(
        ratioOverTint(t["--accent-ink"], t["--accent"], t[bg], h),
        `--accent-ink sobre tinte en ${bg}, tono ${h}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
```

- [ ] **Step 2: Comprueba que fallan**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail/work-scope-contrast.test.ts`
Expected: FAIL en «el color de tipo es el acento de la obra» (recibe `{}`) y en «las hojas <dialog>…» (el selector no existe: `expected -1 to be greater than or equal to 0`). Los tests anteriores del fichero siguen en verde.

- [ ] **Step 3: Implementa el alias y la restauración**

En `src/components/detail/work-scope.module.css`:

a) Dentro de **cada uno** de los tres bloques de tokens (`.scope {`, `:global(.dark) .scope {` y el de `@media (prefers-color-scheme: dark)`), añade tras la línea de `--border`:

```css
  /* Dentro de la ficha el color de TIPO es el de la obra (spec 2026-11-11):
     nota, histograma y chip de tipo dejan de chocar con el tinte. */
  --type-book: var(--accent);
  --type-movie: var(--accent);
  --type-series: var(--accent);
  --type-book-ink: var(--accent-ink);
  --type-movie-ink: var(--accent-ink);
  --type-series-ink: var(--accent-ink);
```

(En el bloque `.scope {` van antes de `background: var(--background);`.)

b) Justo después del cierre del bloque `@media (prefers-color-scheme: dark) { … }` y antes del comentario de los títulos de sección, añade:

```css
/* Las hojas <dialog> de la ficha (cierre, nuevo pase, retomar) llevan su propio
   ámbito de materiales y heredarían el alias de arriba: recuperan los colores de
   tipo globales. Son copia de globals.css; el test impide que diverjan. */
.scope :global(dialog) {
  --type-book: #a15a34;
  --type-movie: #3f6b6e;
  --type-series: #7a5676;
  --type-book-ink: #844a2b;
  --type-movie-ink: #375e61;
  --type-series-ink: #6e4d6a;
}
:global(.dark) .scope :global(dialog) {
  --type-book: #cf8a54;
  --type-movie: #6bb0b4;
  --type-series: #b592bd;
  --type-book-ink: #d79d6f;
  --type-movie-ink: #75b5b9;
  --type-series-ink: #bea0c5;
}
@media (prefers-color-scheme: dark) {
  :global(:root:not(.light):not(.dark)) .scope :global(dialog) {
    --type-book: #cf8a54;
    --type-movie: #6bb0b4;
    --type-series: #b592bd;
    --type-book-ink: #d79d6f;
    --type-movie-ink: #75b5b9;
    --type-series-ink: #bea0c5;
  }
}
```

- [ ] **Step 4: Comprueba que pasan**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail/work-scope-contrast.test.ts`
Expected: PASS, todos los tests del fichero.

Si «como gráfico» o «como texto sobre su tinte» fallan en algún tono, ajusta la luminosidad de `--accent` o `--accent-ink` en el bloque afectado (y en su espejo de sistema oscuro) de 0,01 en 0,01 hasta pasar; no bajes los umbrales. Vuelve a lanzar el fichero entero: `--accent-foreground` sobre `--accent` también debe seguir en AA.

- [ ] **Step 5: Commit**

```bash
git add src/components/detail/work-scope.module.css src/components/detail/work-scope-contrast.test.ts
git commit -m "feat(ficha): la nota y el color de tipo toman el tinte de la obra"
```

---

### Task 2: Pastilla de estado deslizante

**Files:**
- Modify: `src/components/detail/status-segments.tsx`
- Create: `src/components/detail/status-segments.module.css`
- Test: `src/components/detail/status-segments.test.tsx`

**Interfaces:**
- Consumes: nada de otras tareas.
- Produces: `StatusSegments` conserva sus props (`status`, `itemType`, `onChange`, `disabled`). El grupo expone `data-count` y `data-active-index`; el punto de la opción recién elegida por el usuario lleva `data-beat`.

- [ ] **Step 1: Escribe el test que falla**

Crea `src/components/detail/status-segments.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { StatusSegments } from "./status-segments";

afterEach(cleanup);

function Harness({ itemType, initial, onChange }: { itemType: ItemType; initial: MediaStatus; onChange?: (s: MediaStatus) => void }) {
  const [status, setStatus] = useState(initial);
  return (
    <NextIntlClientProvider locale="es" messages={messages}>
      <StatusSegments
        status={status}
        itemType={itemType}
        onChange={(next) => {
          onChange?.(next);
          setStatus(next);
        }}
      />
    </NextIntlClientProvider>
  );
}
const group = () => screen.getByRole("group");
const beating = () => group().querySelectorAll("[data-beat]").length;

describe("pastilla deslizante", () => {
  it("libro en curso: cuatro opciones, pastilla en la segunda", () => {
    render(<Harness itemType="book" initial="in_progress" />);
    expect(group().dataset.count).toBe("4");
    expect(group().dataset.activeIndex).toBe("1");
    expect(screen.getByTestId("status-thumb").getAttribute("aria-hidden")).toBe("true");
  });
  it("película vista: tres opciones, pastilla en la segunda", () => {
    render(<Harness itemType="movie" initial="completed" />);
    expect(group().dataset.count).toBe("3");
    expect(group().dataset.activeIndex).toBe("1");
  });
  it("película con «en curso» heredado: cuarta opción al final, con la pastilla", () => {
    render(<Harness itemType="movie" initial="in_progress" />);
    expect(group().dataset.count).toBe("4");
    expect(group().dataset.activeIndex).toBe("3");
  });
  it("conserva el grupo de botones con aria-pressed", () => {
    render(<Harness itemType="book" initial="planned" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false"]);
  });
});

describe("latido del punto", () => {
  it("no late al montar", () => {
    render(<Harness itemType="book" initial="in_progress" />);
    expect(beating()).toBe(0);
  });
  it("late el punto de la opción que el usuario acaba de elegir, y la pastilla la sigue", () => {
    const onChange = vi.fn();
    render(<Harness itemType="book" initial="planned" onChange={onChange} />);
    const target = screen.getAllByRole("button")[2];
    fireEvent.click(target);
    expect(onChange).toHaveBeenCalledWith("completed");
    expect(group().dataset.activeIndex).toBe("2");
    expect(beating()).toBe(1);
    expect(target.querySelector("[data-beat]")).not.toBeNull();
  });
  it("pulsar la opción ya activa ni avisa ni late", () => {
    const onChange = vi.fn();
    render(<Harness itemType="book" initial="planned" onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onChange).not.toHaveBeenCalled();
    expect(beating()).toBe(0);
  });
});
```

- [ ] **Step 2: Comprueba que falla**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail/status-segments.test.tsx`
Expected: FAIL (`data-count` es `undefined`, no existe `status-thumb`, no hay `[data-beat]`). «conserva el grupo de botones» y «pulsar la opción ya activa» pasan ya.

- [ ] **Step 3: Crea el CSS module**

Crea `src/components/detail/status-segments.module.css`:

```css
/* Pastilla deslizante del selector de estado (spec 2026-11-11-ficha-con-gesto).
   `--n` = opciones, `--at` = índice de la activa. El hueco entre opciones es el
   `gap-1` (4px) y el relleno el `p-1` (4px) del grupo: si cambian allí, aquí. */
.thumb {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc((100% - 8px - (var(--n) - 1) * 4px) / var(--n));
  transform: translateX(calc(var(--at) * (100% + 4px)));
  pointer-events: none;
}
.option {
  position: relative;
}
@media (prefers-reduced-motion: no-preference) {
  .thumb {
    transition: transform 460ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .dot[data-beat] {
    animation: beat 560ms ease-out;
  }
  @keyframes beat {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0 color-mix(in oklab, currentColor 70%, transparent);
    }
    40% {
      transform: scale(1.6);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 9px transparent;
    }
  }
}
```

- [ ] **Step 4: Implementa la pastilla y el latido**

En `src/components/detail/status-segments.tsx`:

a) Cambia los imports del principio por:

```tsx
"use client";

import { useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import styles from "./status-segments.module.css";
```

b) Añade, junto a `STATUS_DOT_CLASSES`, el color de texto del punto (el halo del latido usa `currentColor`):

```tsx
const STATUS_TEXT_CLASSES: Record<MediaStatus, string> = {
  planned: "text-status-planned",
  in_progress: "text-status-in-progress",
  completed: "text-status-completed",
  dropped: "text-status-dropped",
};
```

c) Sustituye desde `const order =` hasta el final de la función por:

```tsx
  const order =
    itemType === "movie"
      ? MOVIE_STATUS_ORDER.includes(status)
        ? MOVIE_STATUS_ORDER
        : [...MOVIE_STATUS_ORDER, status]
      : STATUS_ORDER;
  const activeIndex = order.indexOf(status);

  // Última opción elegida AQUÍ por el usuario: su punto late una vez. No late
  // al montar ni cuando el estado llega de fuera (refresco, otra isla).
  const [beat, setBeat] = useState<MediaStatus | null>(null);

  return (
    <div
      role="group"
      aria-label={tSegments("groupLabel")}
      data-count={order.length}
      data-active-index={activeIndex}
      className="relative flex gap-1 rounded-[10px] bg-surface-muted p-1"
      style={{ "--n": order.length, "--at": activeIndex } as CSSProperties}
    >
      {/* El fondo de la activa es UN elemento que se desliza, no una clase por
          botón: así el cambio se ve como movimiento. Sin animación (movimiento
          reducido) queda colocado igual que el fondo de antes. */}
      <span
        aria-hidden="true"
        data-testid="status-thumb"
        className={`${styles.thumb} rounded-[7px] bg-surface shadow-card`}
      />
      {order.map((option) => {
        const isActive = option === status;
        const verbKey = VERB_KEY[option];
        const label = verbKey
          ? tSegments(`${verbKey}.${itemType}`)
          : tLibrary(`status.${option}`);

        return (
          <button
            key={option}
            type="button"
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => {
              // Reafirmar el estado activo no debería reabrir/cerrar pases:
              // solo avisamos al padre cuando cambia de verdad.
              if (isActive) return;
              setBeat(option);
              onChange(option);
            }}
            className={`${styles.option} flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[7px] px-0.5 py-2 text-center text-[11px] leading-tight font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span
              aria-hidden="true"
              data-beat={isActive && beat === option ? "" : undefined}
              className={`${styles.dot} h-2 w-2 rounded-full ${STATUS_DOT_CLASSES[option]} ${STATUS_TEXT_CLASSES[option]}`}
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

Comprueba que las cuatro utilidades `text-status-*` existen: `git grep -n "text-status-planned\|text-status-in-progress\|text-status-completed\|text-status-dropped" -- src | head`. Si alguna no aparece en ningún otro fichero, Tailwind la genera igualmente al verla escrita aquí (los colores `status-*` están en el tema, como demuestra `bg-status-*`).

- [ ] **Step 5: Comprueba que pasa, y que la tarjeta no se rompe**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail/status-segments.test.tsx src/components/detail/pass-card.test.tsx`
Expected: PASS en los dos ficheros.

- [ ] **Step 6: Commit**

```bash
git add src/components/detail/status-segments.tsx src/components/detail/status-segments.module.css src/components/detail/status-segments.test.tsx
git commit -m "feat(ficha): la pastilla de estado se desliza y el punto late al cambiar"
```

---

### Task 3: Puntos de nota con gesto

**Files:**
- Modify: `src/components/ui/rating-dots.tsx`
- Create: `src/components/ui/rating-dots.module.css`
- Modify: `src/components/detail/pass-card.tsx` (solo la llamada a `RatingDots`)
- Test: `src/components/ui/rating-dots.lively.test.tsx`

**Interfaces:**
- Consumes: nada de otras tareas.
- Produces: `RatingDots` acepta `lively?: boolean` (por defecto `false`). Con `lively` y `onChange`, cada punto lleva `data-lift` mientras está bajo el cursor, el foco o el dedo, y `data-pop="a" | "b"` tras fijar una nota (el valor alterna en cada nota para relanzar la animación sin remontar los botones).

- [ ] **Step 1: Escribe el test que falla**

Crea `src/components/ui/rating-dots.lively.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RatingDots } from "./rating-dots";

afterEach(cleanup);

/** Los cinco puntos, en orden: cada uno es el padre de sus dos mitades pulsables. */
const dots = () => [1, 3, 5, 7, 9].map((v) => screen.getByLabelText(`${v}/10`).parentElement!);

describe("RatingDots con lively", () => {
  it("levanta los puntos hasta el que está bajo el cursor", () => {
    render(<RatingDots value={null} onChange={() => {}} lively />);
    fireEvent.mouseEnter(screen.getByLabelText("5/10"));
    expect(dots().map((d) => d.hasAttribute("data-lift"))).toEqual([true, true, true, false, false]);
  });
  it("al fijar una nota saltan solo los puntos rellenos", () => {
    const onChange = vi.fn();
    render(<RatingDots value={null} onChange={onChange} lively />);
    fireEvent.click(screen.getByLabelText("8/10"));
    expect(onChange).toHaveBeenCalledWith(8);
    expect(dots().map((d) => d.getAttribute("data-pop"))).toEqual(["a", "a", "a", "a", null]);
  });
  it("una segunda nota relanza el salto sin remontar los botones", () => {
    render(<RatingDots value={null} onChange={() => {}} lively />);
    const half = screen.getByLabelText("3/10");
    fireEvent.click(screen.getByLabelText("8/10"));
    fireEvent.click(half);
    expect(dots().map((d) => d.getAttribute("data-pop"))).toEqual(["b", "b", null, null, null]);
    expect(screen.getByLabelText("3/10")).toBe(half);
  });
  it("no salta al montar con una nota ya puesta", () => {
    render(<RatingDots value={8} onChange={() => {}} lively />);
    expect(dots().some((d) => d.hasAttribute("data-pop"))).toBe(false);
  });
});

describe("RatingDots sin lively", () => {
  it("no añade marcas de gesto, ni interactivo ni de lectura", () => {
    render(<RatingDots value={null} onChange={() => {}} />);
    fireEvent.mouseEnter(screen.getByLabelText("5/10"));
    fireEvent.click(screen.getByLabelText("8/10"));
    expect(dots().some((d) => d.hasAttribute("data-lift") || d.hasAttribute("data-pop"))).toBe(false);
    expect(renderToStaticMarkup(<RatingDots value={7} lively />)).not.toMatch(/data-(lift|pop)/);
  });
});
```

- [ ] **Step 2: Comprueba que falla**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/ui/rating-dots.lively.test.tsx`
Expected: FAIL en los tres primeros tests (no hay `data-lift` ni `data-pop`; TypeScript además avisa de que `lively` no existe). Los dos últimos pasan ya.

- [ ] **Step 3: Crea el CSS module**

Crea `src/components/ui/rating-dots.module.css`:

```css
/* Gestos de la nota (prop `lively`, spec 2026-11-11-ficha-con-gesto). `--i` es
   el índice del punto. El salto usa `backwards` y no `both`: al terminar, el
   punto vuelve a su estilo normal y la escala bajo el cursor sigue funcionando.
   Dos keyframes idénticos (pop-a / pop-b): alternar el nombre relanza la
   animación sin remontar el punto, que se llevaría el foco de sus botones. */
@media (prefers-reduced-motion: no-preference) {
  .dot {
    transition: transform 140ms ease-out;
  }
  .dot[data-lift] {
    transform: scale(1.38);
  }
  .dot[data-pop="a"] {
    animation: pop-a 420ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
    animation-delay: calc(var(--i) * 55ms);
  }
  .dot[data-pop="b"] {
    animation: pop-b 420ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
    animation-delay: calc(var(--i) * 55ms);
  }
  @keyframes pop-a {
    0% { transform: scale(1); }
    45% { transform: scale(1.7) translateY(-3px); }
    100% { transform: scale(1); }
  }
  @keyframes pop-b {
    0% { transform: scale(1); }
    45% { transform: scale(1.7) translateY(-3px); }
    100% { transform: scale(1); }
  }
}
```

- [ ] **Step 4: Implementa la prop**

En `src/components/ui/rating-dots.tsx`:

a) Imports: añade `type CSSProperties` al import de React y el módulo:

```tsx
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { formatDots, ratingFromFraction } from "@/lib/rating/dots";
import type { ItemType } from "@/lib/catalog/types";
import styles from "./rating-dots.module.css";
```

b) Props: añade `lively = false` a la desestructuración y al tipo:

```tsx
  className = "",
  itemType,
  lively = false,
}: {
```

```tsx
  /** Tiñe la nota con el color del tipo de obra. Sin él, oro. */
  itemType?: ItemType;
  /**
   * Gestos de la tarjeta del pase: los puntos crecen bajo el cursor y saltan en
   * cadena al fijar la nota. Solo tiene efecto con `onChange`. Apagado por
   * defecto: el resto de la app no cambia.
   */
  lively?: boolean;
}) {
```

c) Tras `const padY = …`, añade el estado del salto y la función que fija la nota:

```tsx
  // Última nota fijada AQUÍ (no la que llega por `value`): `n` cuenta las
  // veces, para alternar el nombre de la animación y relanzarla.
  const [pop, setPop] = useState<{ n: number; upTo: number }>({ n: 0, upTo: 0 });
  const gestures = lively && interactive;
  function commit(next: number) {
    onChange!(next);
    if (lively) setPop((p) => ({ n: p.n + 1, upTo: next }));
  }
```

d) En `onPointerUp`, sustituye `if (next !== null) onChange!(next);` por:

```tsx
          if (next !== null) commit(next);
```

e) En el `<span>` de cada punto, sustituye `className` y `style`, y añade los dos atributos:

```tsx
          <span
            key={i}
            className={`relative inline-block rounded-full${gestures ? ` ${styles.dot}` : ""}`}
            data-lift={gestures && preview !== null && preview >= 2 * i + 1 ? "" : undefined}
            data-pop={
              gestures && pop.n > 0 && pop.upTo >= 2 * i + 1 ? (pop.n % 2 === 1 ? "a" : "b") : undefined
            }
            style={
              {
                width: px,
                height: px,
                background: dotBackground(shown, i, fill),
                cursor: interactive ? "pointer" : "default",
                ...(gestures ? { "--i": i } : {}),
              } as CSSProperties
            }
            aria-hidden={!interactive}
          >
```

f) En los dos botones de cada punto, sustituye `onClick={() => onChange!(valueAt(true))}` por `onClick={() => commit(valueAt(true))}` y `onClick={() => onChange!(valueAt(false))}` por `onClick={() => commit(valueAt(false))}`.

g) En `src/components/detail/pass-card.tsx`, añade la prop a la llamada existente:

```tsx
          <RatingDots
            value={shownRating}
            itemType={itemType}
            disabled={busy}
            lively
            onChange={(next) => {
```

- [ ] **Step 5: Comprueba que pasa, con los tests vecinos**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/ui/rating-dots.lively.test.tsx src/components/ui/rating-dots.test.ts src/components/detail/pass-card.test.tsx`
Expected: PASS en los tres ficheros.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/rating-dots.tsx src/components/ui/rating-dots.module.css src/components/ui/rating-dots.lively.test.tsx src/components/detail/pass-card.tsx
git commit -m "feat(ficha): los puntos de nota crecen bajo el cursor y saltan al fijarla"
```

---

### Task 4: Barra que se llena y botón que se hunde

**Files:**
- Create: `src/components/detail/pass-card.module.css`
- Modify: `src/components/detail/pass-card.tsx`

**Interfaces:**
- Consumes: `PassCard` tal como queda tras la tarea 3.
- Produces: nada que otras tareas usen.

No lleva test nuevo: es CSS sin comportamiento observable en jsdom (Vitest no procesa CSS). Lo defienden los tests existentes de la tarjeta, que no deben cambiar, y la verificación en navegador de la tarea 6.

- [ ] **Step 1: Crea el CSS module**

Crea `src/components/detail/pass-card.module.css`:

```css
/* Gestos de la tarjeta del pase (spec 2026-11-11-ficha-con-gesto). */

/* El labio inferior del botón principal es estático: también se ve con
   movimiento reducido. Lo que se anima es hundirlo. */
.primary {
  box-shadow: 0 3px 0 0 var(--accent-hover);
}
@media (prefers-reduced-motion: no-preference) {
  /* La barra se llena desde cero al montarse y anima el ancho cuando cambia. */
  .fill {
    transition: width 800ms cubic-bezier(0.22, 1, 0.36, 1);
    animation: fill-in 800ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
  }
  @keyframes fill-in {
    from { width: 0; }
  }
  .primary,
  .secondary {
    transition:
      transform 110ms ease-out,
      box-shadow 110ms ease-out,
      background-color 150ms ease;
  }
  .primary:active:not(:disabled) {
    transform: translateY(3px) scale(0.985);
    box-shadow: 0 0 0 0 var(--accent-hover);
  }
  .secondary:active:not(:disabled) {
    transform: translateY(2px) scale(0.985);
  }
}
```

- [ ] **Step 2: Aplica las clases en la tarjeta**

En `src/components/detail/pass-card.tsx`:

a) Añade el import, tras el de `StatusSegments`:

```tsx
import styles from "./pass-card.module.css";
```

b) Botón de la primera intención (rama `if (!status)`): cambia su `className` a

```tsx
          className={`w-full py-3 font-semibold ${PRIMARY_SHAPE} ${styles.primary}`}
```

c) Botones de las intenciones secundarias (el `rest.map`): cambia su `className` a

```tsx
                className={`w-full px-3 text-[13px] font-semibold ${PRIMARY_SHAPE} ${styles.secondary}`}
```

d) Relleno de la barra de progreso: cambia su `className` a

```tsx
              className={`h-full rounded-full bg-status-in-progress ${styles.fill}`}
```

e) Botón principal con pase (`ref={primaryRef}`): cambia su `className` a

```tsx
        className={`w-full py-3 font-semibold ${PRIMARY_SHAPE} ${styles.primary}`}
```

- [ ] **Step 3: Comprueba que nada se rompe**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail/pass-card.test.tsx src/components/detail/sticky-pass-cta.test.tsx`
Expected: PASS, sin tocar los tests.

- [ ] **Step 4: Commit**

```bash
git add src/components/detail/pass-card.tsx src/components/detail/pass-card.module.css
git commit -m "feat(ficha): la barra de progreso se llena y el botón principal se hunde al pulsar"
```

---

### Task 5: Histograma que crece

**Files:**
- Modify: `src/components/detail/rating-histogram.tsx`
- Create: `src/components/detail/rating-histogram.module.css`
- Modify: `src/components/detail/community-summary.tsx`
- Test: `src/components/detail/rating-histogram.test.tsx`

**Interfaces:**
- Consumes: nada de otras tareas.
- Produces: `RatingHistogram` acepta `animate?: boolean` (por defecto `false`). Con ella, cada barra lleva `data-grow` y la variable `--i` con su índice.

- [ ] **Step 1: Escribe el test que falla**

Crea `src/components/detail/rating-histogram.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RatingHistogram } from "./rating-histogram";

const distribution = [0, 1, 0, 2, 3, 6, 9, 14, 8, 5];

describe("RatingHistogram", () => {
  it("sin animate no marca las barras (raíl de /post/[id])", () => {
    const html = renderToStaticMarkup(<RatingHistogram itemType="book" distribution={distribution} />);
    expect(html).not.toContain("data-grow");
    expect(html).not.toContain("--i");
  });
  it("con animate marca las diez barras, también las de cero, con su índice", () => {
    const html = renderToStaticMarkup(<RatingHistogram itemType="book" distribution={distribution} animate />);
    expect(html.match(/data-grow/g)).toHaveLength(10);
    for (let i = 0; i < 10; i++) expect(html).toContain(`--i:${i}`);
  });
});
```

- [ ] **Step 2: Comprueba que falla**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail/rating-histogram.test.tsx`
Expected: FAIL en el segundo test (`expected null to have a length of 10`). El primero pasa ya.

- [ ] **Step 3: Crea el CSS module**

Crea `src/components/detail/rating-histogram.module.css`:

```css
/* Las barras crecen desde la base al pintarse (prop `animate`, spec
   2026-11-11-ficha-con-gesto). `--i` es el índice de la barra. */
@media (prefers-reduced-motion: no-preference) {
  .bar[data-grow] {
    transform-origin: bottom;
    animation: grow 620ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
    animation-delay: calc(var(--i) * 45ms);
  }
  @keyframes grow {
    from { transform: scaleY(0); }
  }
}
```

- [ ] **Step 4: Implementa la prop**

Sustituye el contenido de `src/components/detail/rating-histogram.tsx` desde los imports hasta el cierre del `map` de barras por:

```tsx
import type { CSSProperties } from "react";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { starLabel } from "@/lib/stats/rating";
import type { ItemType } from "@/lib/catalog/types";
import styles from "./rating-histogram.module.css";

// Histograma de notas de la comunidad por MEDIA estrella (0,5→5, estilo
// Letterboxd): diez barras verticales teñidas con el color del TIPO de obra, el
// pico a plena intensidad y el resto atenuado. Extraído de `CommunitySummary`
// (ficha) para poder reusarlo en el raíl OBRA de `/post/[id]` sin duplicarlo.
// Presentacional puro (sin estado ni hooks): sirve en árbol server o client.
export function RatingHistogram({
  itemType,
  /** Recuento por media estrella, ascendente: [0,5★, 1★, …, 5★] (10 cubos). */
  distribution,
  /** Altura de las barras (utilidad Tailwind): `h-16` en la ficha, `h-10` compacto. */
  barsHeight = "h-16",
  /** Las barras crecen escalonadas al pintarse. Solo lo enciende la ficha. */
  animate = false,
}: {
  itemType: ItemType;
  distribution: number[];
  barsHeight?: string;
  animate?: boolean;
}) {
  const accent = MEDIA_ACCENT[itemType];
  // La barra más alta manda: se mide contra el pico real, no contra el total,
  // o un reparto plano se vería como diez muñones.
  const max = Math.max(...distribution, 1);
  const peak = distribution.reduce(
    (best, count, i) => (count > distribution[best] ? i : best),
    0,
  );
  const grow = (i: number) => (animate ? ({ "--i": i } as CSSProperties) : undefined);

  return (
    <div>
      <div className={`flex ${barsHeight} items-end gap-[3px]`}>
        {distribution.map((count, i) =>
          // Cero MEDIDO —media estrella que nadie ha puesto—: marca fina en la
          // base (como el histograma de /estadísticas). Un hueco invisible
          // confundiría «cero votos» con «no hay dato».
          count === 0 ? (
            <span
              key={i}
              title={`${starLabel((i + 1) / 2)}★ · 0`}
              data-grow={animate ? "" : undefined}
              className={`${styles.bar} h-0.5 min-w-0 flex-1 rounded-full bg-surface-3`}
              style={grow(i)}
            />
          ) : (
            <span
              key={i}
              title={`${starLabel((i + 1) / 2)}★ · ${count}`}
              data-grow={animate ? "" : undefined}
              className={`${styles.bar} min-w-0 flex-1 rounded-t-[2px]`}
              style={{
                // Mínimo de 4px: un voto suelto se ve, no se queda en muñón.
                height: `max(4px, ${(count / max) * 100}%)`,
                background: `var(${accent.varName})`,
                opacity: i === peak ? 1 : 0.4,
                ...grow(i),
              }}
            />
          ),
        )}
      </div>
```

(El resto del componente —la línea base y la fila de estrellas— no cambia.)

En `src/components/detail/community-summary.tsx`, enciende la prop:

```tsx
        <RatingHistogram itemType={itemType} distribution={distribution} animate />
```

- [ ] **Step 5: Comprueba que pasa**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail/rating-histogram.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/detail/rating-histogram.tsx src/components/detail/rating-histogram.module.css src/components/detail/rating-histogram.test.tsx src/components/detail/community-summary.tsx
git commit -m "feat(ficha): las barras del histograma de Comunidad crecen al pintarse"
```

---

### Task 6: Verificación completa y documentación

**Files:**
- Modify: `docs/requirements/decisiones.md` (entrada nueva al final)
- Modify: `docs/requirements/backlog.md` (casilla)
- Modify: `docs/architecture/graph.json` (solo si el paso 3 añade una trampa)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la rama lista para PR.

- [ ] **Step 1: Suite de tipos, lint y unitarios**

Run (cada uno con el prefijo `fnm env | Out-String | Invoke-Expression; fnm use 22;`):

```powershell
npx tsc --noEmit
npx eslint src/components/detail src/components/ui
npx vitest run src/components/detail src/components/ui
```

Expected: sin errores de tipos ni de lint; todos los tests en verde.

- [ ] **Step 2: E2E de la ficha contra el servidor de desarrollo**

Asegura que el puerto 3000 está libre (`Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object OwningProcess`; si hay un proceso, `Stop-Process -Id <pid>`). Arranca el servidor en segundo plano desde el worktree —con junction de `node_modules`, Turbopack no arranca—:

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npx next dev --webpack -p 3000
```

Espera a que responda (`curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/login` devuelve `200`) y lanza:

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npx playwright test e2e/ficha-acciones.spec.ts e2e/ficha-cartel.spec.ts e2e/pase-hub.spec.ts
```

Expected: los mismos resultados que en `main` para esos tres ficheros, sin haberlos editado. Si aparecen muchos «skipped», falta `.env.local` en el worktree. Si `ficha-cartel` falla por TMDB u OpenLibrary reales, es la issue #1616, no este cambio: confírmalo relanzando ese test en `main`.

- [ ] **Step 3: Recorrido en el navegador**

Con el servidor aún arrancado, usa el agente `qa-verifier` (o el navegador integrado) sobre una ficha de libro, una de película y una de serie de la base de desarrollo, en tema claro y oscuro. Comprueba y anota el resultado de cada punto:

1. La nota del hero, los puntos, la media de Comunidad, el histograma y el chip de tipo tienen el tono de la obra, no naranja/turquesa/malva fijos.
2. Al cambiar de estado la pastilla se desliza con rebote y el punto late una vez; al recargar no late.
3. La barra de progreso se llena al entrar; tras registrar una sesión avanza animada.
4. Al pasar el cursor por «Tu nota» los puntos crecen; al fijar la nota saltan en cadena; fijar otra relanza el salto.
5. El botón principal tiene labio inferior y se hunde al pulsar; las intenciones secundarias se hunden sin labio.
6. En Comunidad las barras del histograma crecen escalonadas.
7. La hoja de cierre («Ya lo leí» o terminar un pase) muestra la nota con el color del TIPO, como antes.
8. Con `prefers-reduced-motion: reduce` emulado no hay ninguna animación y todo está en su sitio.
9. Busca en las pestañas de la ficha alguna lista que mezcle obras de tipos distintos distinguidas por color. Si existe y ha perdido la distinción, envuélvela en un elemento con la clase global `keep-type-colors` y añade a `work-scope.module.css` los selectores `.scope :global(.keep-type-colors)` a las tres reglas que ya restauran los colores dentro de `dialog` (misma lista de valores); amplía el test de la tarea 1 para que también compare esos selectores. Si no existe, anótalo en la descripción de la PR.

Para el servidor al terminar (`Stop-Process` sobre el proceso del puerto 3000).

- [ ] **Step 4: Documentación**

Añade al final de `docs/requirements/decisiones.md`:

```markdown
## 2026-11-11 — Ficha con gesto

- **Dentro de la ficha de obra, el color de tipo es el de la obra.** `WorkScope` redefine
  `--type-*` como el acento de la obra, así que la nota, el histograma y el chip de tipo dejan de
  chocar con el tinte (naranja sobre rojo, turquesa sobre verde). Fuera de la ficha la nota sigue
  con el color del tipo; las hojas `<dialog>` de la ficha también lo conservan.
- **La tarjeta del pase responde:** la pastilla de estado se desliza, la barra de progreso se
  llena, los puntos de nota crecen bajo el cursor y saltan al fijarla, y el botón principal se
  hunde. El histograma de Comunidad crece al pintarse.
- Solo CSS, dentro de `prefers-reduced-motion: no-preference`. Sin textos nuevos, sin esquema, sin
  caché. No se añade celebración al terminar: ya la da el ritual de cierre.
- Los gestos de `RatingDots` (`lively`) y de `RatingHistogram` (`animate`) van tras una prop que
  solo enciende la ficha.
- Spec: `docs/superpowers/specs/2026-11-11-ficha-con-gesto-design.md`.
```

En `docs/requirements/backlog.md`, añade bajo la casilla más reciente de la ficha (búscala con `git grep -n "ficha" -- docs/requirements/backlog.md | tail -5` y sigue el formato de sus vecinas):

```markdown
- [x] Ficha con gesto: la nota toma el tinte de la obra dentro de la ficha y la tarjeta del pase responde con gestos (pastilla deslizante, barra que se llena, puntos que saltan, botón que se hunde, histograma que crece).
```

- [ ] **Step 5: Commit**

```bash
git add docs/requirements/decisiones.md docs/requirements/backlog.md
git commit -m "docs(ficha): decisión y backlog de la ficha con gesto"
```

Si el paso 3 tocó `work-scope.module.css`, su test o `graph.json`, inclúyelos en un commit propio antes de este: `fix(ficha): las listas con tipos mezclados conservan su color`.
