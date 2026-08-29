# BiblioPlay — UI de la fase 1 (PR-3 + PR-4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la UI de BiblioPlay sobre el motor ya mergeado (PR-1/PR-2 + deltas de la PR #944): hub de Partidas, hub de Magic con sus modos, configuración de partida, tablero en vivo a pantalla completa y resumen final con revancha.

**Architecture:** Las páginas son shells de servidor; todo lo vivo son islas cliente colgadas de `useActiveGame(identity)` (`useSyncExternalStore` sobre el store local-first). La lógica NO vive en los componentes: cada pieza con decisiones (reparto de la mesa, tamaño del número, desbordamiento de las fichas de daño, borrador de configuración, memoria de la mesa, preferencias del dispositivo) es un módulo puro en `src/lib/play/ui/` con sus tests, y el componente solo lo pinta. La UI resuelve la herramienta por `toolId` contra un registro de UI (`src/components/play/tool-views.tsx`), hermano del registro de dominio que ya existe (`src/lib/play/tools.ts`).

**Tech Stack:** Next 16 (App Router, Cache Components), React 19, Tailwind v4 con los tokens Paper de `globals.css`, next-intl (namespace nuevo `play`), Vitest (node) para lo puro, Playwright para el recorrido.

**Fuentes de verdad del diseño** (leerlas ANTES de maquetar; este plan no las repite entera):

- `docs/requirements/decisiones.md`, entradas `2026-08-29 (6)`, `(7)` y `(8)` — consola por orientación, la herramienta es Magic y el daño por comandante.
- Canvas de la fase 1a: https://claude.ai/code/artifact/54dfdad6-063f-4c30-8947-e8cdb40847ab — 10 artboards, claro y oscuro, con el bloque «Lo que decide este canvas» al final. **Es la referencia visual normativa de este plan.**
- `docs/superpowers/specs/2026-08-29-play-fases-0-2-design.md` §5–§8. Ojo: está **`[Histórico · congelado]`**. Donde diga `commander` como `ToolId` o como carpeta, manda `decisiones.md (7)`: es `mtg`. No se edita la spec.

**Fuera de este plan:** historial de partidas, backend, jugadores habituales, pausar el crono (#941), fondos de tarjeta con imagen (#942), evento de actualización de participante (#943), adoptar la partida anónima al entrar (#934).

## Global Constraints

- Node 22 obligatorio para tests (`.nvmrc` 22.23.1). Si `npm test` falla por versión: `fnm use 22.23.1` (el shell por defecto trae v20 y rompe Vitest).
- Tests Vitest viven JUNTO al código (`foo.ts` + `foo.test.ts`), entorno node. Un test que necesite DOM lo pide con `// @vitest-environment jsdom` en su PRIMERA línea.
- Alias de imports: `@/` → `src/`.
- Identificadores en inglés; comentarios en español explicando el PORQUÉ, con referencia a issue/spec/decisión cuando aplique.
- `src/lib/play/**` no importa React, next-intl ni Supabase. Excepciones ya existentes: `core/store.ts` (localStorage/timers con guardas) y `core/use-active-game.ts` (React). Los módulos nuevos de `src/lib/play/ui/` siguen la misma regla: puros, y si tocan `localStorage` lo hacen con `try/catch` y degradan a valor por defecto.
- Prohibido `useState`+`useEffect` para leer `localStorage` (lint `set-state-in-effect`): se lee con `useSyncExternalStore`, como `use-active-game.ts`.
- **Regla #437 (caché y RLS):** ninguna función de este plan lleva `use cache`. Todo lo de Play depende de la identidad o del `localStorage` del dispositivo.
- `inv-tailwind-literal`: las clases de Tailwind se escriben ENTERAS, nunca interpoladas. El color de asiento sale de una tabla literal (`SEAT_ACCENT`), mismo patrón que `src/lib/catalog/media-accent.ts`. Las posiciones de rejilla que sí son calculadas van en `style={{ gridArea: … }}`, no en clases.
- Textos de interfaz: **cero literales en los componentes**. Todo por `useTranslations("play")` (invariante `inv-t-no-cruza`: un componente no lee namespaces de otra área).
- Términos nuevos van a `docs/UI-GLOSARIO.md` **antes** de escribirlos en `messages/es.json`.
- Mensajes de commit en español, estilo del repo: `feat(play): descripción en frase`.
- Ejecutar `git` y `gh` desde la raíz del repo.
- El bloque `nextjs-agent-rules` de `AGENTS.md` puede reaparecer en el diff: se committea con el trabajo, no se borra.
- Higiene: un solo `next dev` y en el puerto 3000; `npm run test:e2e` reutiliza el que haya.

---

## Estructura de ficheros

**Lógica pura (`src/lib/play/ui/`)** — cada uno con su `.test.ts` hermano:

| Fichero | Responsabilidad |
|---|---|
| `seats.ts` | Tabla literal de los seis colores de asiento (clases Tailwind + nombre de variable CSS). |
| `layout.ts` | Reparto de la mesa: familias, opciones válidas por número de jugadores, rejilla y rotación de cada asiento, modo de consola, tamaño del número de vidas. |
| `clock.ts` | Formato del crono a partir de milisegundos. |
| `preferences.ts` | Preferencias de VISTA del dispositivo (orientación, reparto, pantalla encendida) en `localStorage` + store para `useSyncExternalStore`. |
| `table-memory.ts` | «Última mesa usada» por identidad, para revancha y prerrelleno. |
| `damage-strip.ts` | Qué fichas de daño de comandante caben y cuántas se resumen en «+N». |
| `setup-draft.ts` | Borrador de configuración: alta/baja de jugadores y comandantes, y conversión a `MtgSetup`. |

**Componentes (`src/components/play/`)**:

| Fichero | Responsabilidad |
|---|---|
| `tool-views.tsx` | Registro de UI por `toolId`: ilustración, tablero, resumen. |
| `play-frame.tsx` | «Canto de mesa»: la cinta de seis colores bajo la topbar en todo `/partidas*`. |
| `tool-grid.tsx` | Rejilla de herramientas del hub principal, pintada desde los dos registros. |
| `active-game-banner.tsx` | Banner «partida en curso» con miniatura del tablero real. |
| `tool-hub.tsx` | Plantilla `PlayToolHub` (CTA + secciones por capacidad) y sección de modos. |
| `setup-form.tsx` | Formulario de configuración sobre `setup-draft.ts`. |
| `game-screen.tsx` | Isla raíz de `/partida/activa`: resuelve herramienta, decide tablero o resumen. |
| `game-board.tsx` | Rejilla del tablero según el reparto resuelto. |
| `player-panel.tsx` | Panel de un asiento: vidas, mitades ±1, botones de veneno y comandante, insignias. |
| `damage-overlay.tsx` | Reparto de daño de comandante dentro del panel (gira con él). |
| `center-console.tsx` | Deshacer etiquetado, turno, crono y menú; banda o flotante. |
| `game-clock.tsx` | Crono aislado (repinta él solo, no el tablero). |
| `play-sheet.tsx` | Chasis `<dialog>` de las hojas de Play. |
| `player-sheet.tsx` | Hoja de acciones de UNA persona. |
| `game-sheet.tsx` | Hoja de acciones de la PARTIDA. |
| `game-summary.tsx` | Resumen final, ranking y revancha. |
| `use-wake-lock.ts` | Screen Wake Lock, best-effort. |

**Rutas**: `src/app/partidas/{layout,page}.tsx`, `src/app/partidas/mtg/page.tsx`, `src/app/partidas/mtg/nueva/page.tsx`, `src/app/partida/{layout,activa/page}.tsx`.

**Tocados**: `src/app/globals.css` (tokens Play), `src/components/nav/nav-items.ts` (entrada «Partidas»), `src/components/nav/app-shell.tsx` + `bottom-nav.tsx` (ocultar el chrome en `/partida/*`), `messages/es.json`, `docs/UI-GLOSARIO.md`.

**Corte de PR:** Tasks 1–8 = **PR-3** (navegable, se puede empezar una partida). Tasks 9–14 = **PR-4** (se puede jugarla y terminarla).

---

### Task 1: Tokens de Play y tabla de asientos

**Files:**
- Modify: `src/app/globals.css` (bloques `:root`, `.dark`, el espejo de `@media (prefers-color-scheme: dark)` y `@theme inline`)
- Create: `src/lib/play/ui/seats.ts`
- Test: `src/lib/play/ui/seats.test.ts`
- Test: `src/app/contraste-play.test.ts`

**Interfaces:**
- Produces: `SEAT_ACCENT: SeatAccent[]`, `seatAccent(seat: number): SeatAccent`, `SEAT_COUNT = 6`. Los tokens CSS `--play-felt`, `--play-rail`, `--play-danger`, `--play-seat-1..6` y sus utilidades Tailwind `bg-play-seat-1`, `text-play-danger`, etc.

- [ ] **Step 1: Crear la rama**

Run: `git checkout -b feat/play-ui-fase-1`
Expected: `Switched to a new branch 'feat/play-ui-fase-1'`

- [ ] **Step 2: Añadir los tokens a los TRES bloques de tema de `globals.css`**

Son tres, no dos: `:root` (claro), `.dark` (oscuro elegido) y `:root:not(.light):not(.dark)` dentro de `@media (prefers-color-scheme: dark)` (oscuro de quien nunca tocó el interruptor). Olvidar el tercero es el fallo clásico que ya defiende `contraste-tokens.test.ts`.

En `:root`, al final del bloque (antes del `}` que cierra en la línea ~160):

```css
  /* BiblioPlay (issue #931). Familia propia de la subapp: el fieltro de la mesa,
     el filete que separa paneles, el rojo de condición cumplida y los seis
     colores de asiento. Valores cerrados en el canvas de la fase 1a.
     --play-danger NO es --status-dropped (#b0492f): ese y el óxido del asiento 1
     eran casi el mismo tono y a metro y medio de la mesa no se distinguían. Aquí
     el asiento 1 se va al ámbar y el peligro al carmesí — y aun así el estado
     letal nunca se anuncia SOLO con color (rayado + regla bajo el número), que es
     lo que pide WCAG 1.4.1. */
  --play-felt: #e7dcc9;
  --play-rail: rgba(44, 20, 32, 0.2);
  --play-danger: #97272c;
  --play-seat-1: #bb6a33;
  --play-seat-2: #2f6f7e;
  --play-seat-3: #5f7a3f;
  --play-seat-4: #7d4f76;
  --play-seat-5: #a8781f;
  --play-seat-6: #45598c;
```

En `.dark` Y en el bloque espejo `:root:not(.light):not(.dark)`, los mismos nombres con estos valores:

```css
  --play-felt: #171310;
  --play-rail: rgba(240, 232, 219, 0.16);
  --play-danger: #f4736e;
  --play-seat-1: #e6a878;
  --play-seat-2: #6fb4c0;
  --play-seat-3: #9dbf7a;
  --play-seat-4: #c096c5;
  --play-seat-5: #e0a94a;
  --play-seat-6: #8fa5da;
```

- [ ] **Step 3: Exponerlos como utilidades en `@theme inline`**

En el bloque `@theme inline` de `globals.css`, junto a los demás `--color-*`:

```css
  --color-play-felt: var(--play-felt);
  --color-play-rail: var(--play-rail);
  --color-play-danger: var(--play-danger);
  --color-play-seat-1: var(--play-seat-1);
  --color-play-seat-2: var(--play-seat-2);
  --color-play-seat-3: var(--play-seat-3);
  --color-play-seat-4: var(--play-seat-4);
  --color-play-seat-5: var(--play-seat-5);
  --color-play-seat-6: var(--play-seat-6);
```

- [ ] **Step 4: Escribir el test de contraste que debe fallar**

`src/app/contraste-play.test.ts`. Reutiliza el planteamiento de `src/app/contraste-tokens.test.ts` (leer el CSS real, no copiar valores):

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Los colores de asiento pintan DOS cosas con umbrales distintos: la barra del
// asiento y la mitad teñida al pulsar son objeto gráfico (3:1, WCAG 1.4.11), y
// el número de vidas se pinta sobre el panel, no sobre el color. Lo que este
// test defiende es lo que de verdad se puede romper sin darse cuenta: que un
// asiento se funda con el fieltro de la mesa en alguno de los tres temas.
const globalsCss = readFileSync("src/app/globals.css", "utf8");

function extraerBloque(css: string, selector: RegExp): string {
  const inicio = selector.exec(css);
  if (!inicio) throw new Error(`No se encontró el selector ${selector} en globals.css`);
  let profundidad = 1;
  const desde = inicio.index + inicio[0].length;
  for (let i = desde; i < css.length; i++) {
    if (css[i] === "{") profundidad++;
    else if (css[i] === "}") {
      profundidad--;
      if (profundidad === 0) return css.slice(desde, i);
    }
  }
  throw new Error(`No se encontró el cierre del bloque de ${selector} en globals.css`);
}

function extraerTokens(bloque: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const re = /--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bloque))) tokens[m[1]] = m[2];
  return tokens;
}

function luminanciaRelativa(hex: string): number {
  const canal = (c: number) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * canal(parseInt(hex.slice(1, 3), 16)) +
    0.7152 * canal(parseInt(hex.slice(3, 5), 16)) +
    0.0722 * canal(parseInt(hex.slice(5, 7), 16))
  );
}

function contraste(a: string, b: string): number {
  const lA = luminanciaRelativa(a);
  const lB = luminanciaRelativa(b);
  return (Math.max(lA, lB) + 0.05) / (Math.min(lA, lB) + 0.05);
}

const bloqueMedia = extraerBloque(globalsCss, /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/);

const TEMAS = [
  ["claro", extraerTokens(extraerBloque(globalsCss, /:root\s*\{/))],
  ["oscuro (.dark)", extraerTokens(extraerBloque(globalsCss, /\.dark\s*\{/))],
  [
    "oscuro (@media prefers-color-scheme)",
    extraerTokens(extraerBloque(bloqueMedia, /:root:not\(\.light\):not\(\.dark\)\s*\{/)),
  ],
] as const;

const ASIENTOS = [1, 2, 3, 4, 5, 6] as const;
const UMBRAL_OBJETO_GRAFICO = 3;

describe("tokens de BiblioPlay (#931)", () => {
  for (const [tema, tokens] of TEMAS) {
    it(`${tema}: los seis asientos existen y se distinguen del fieltro`, () => {
      for (const n of ASIENTOS) {
        const color = tokens[`play-seat-${n}`];
        expect(color, `falta --play-seat-${n} en "${tema}"`).toBeDefined();
        expect(
          contraste(color, tokens["play-felt"]),
          `--play-seat-${n} sobre --play-felt en "${tema}"`,
        ).toBeGreaterThanOrEqual(UMBRAL_OBJETO_GRAFICO);
      }
    });

    it(`${tema}: el peligro se distingue del asiento 1 (no eran distinguibles a metro y medio)`, () => {
      expect(tokens["play-danger"]).toBeDefined();
      expect(contraste(tokens["play-danger"], tokens["play-seat-1"])).toBeGreaterThanOrEqual(1.6);
    });

    it(`${tema}: el fieltro existe y no es el mismo papel que el resto de la app`, () => {
      expect(tokens["play-felt"]).toBeDefined();
      expect(tokens["play-felt"]).not.toBe(tokens["background"]);
    });
  }
});
```

- [ ] **Step 5: Correr el test de contraste**

Run: `npx vitest run src/app/contraste-play.test.ts`
Expected: PASS (los tokens del Step 2 ya están puestos; si algún asiento no llega a 3:1 sobre el fieltro, el valor está mal copiado del canvas — corregirlo, no bajar el umbral).

- [ ] **Step 6: Escribir el test de la tabla de asientos**

`src/lib/play/ui/seats.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SEAT_ACCENT, SEAT_COUNT, seatAccent } from "./seats";

describe("colores de asiento", () => {
  it("hay exactamente uno por asiento del máximo actual", () => {
    expect(SEAT_ACCENT).toHaveLength(SEAT_COUNT);
    expect(SEAT_COUNT).toBe(6);
  });

  it("las clases van literales: ninguna lleva interpolación (inv-tailwind-literal)", () => {
    for (const accent of SEAT_ACCENT) {
      for (const value of [accent.bar, accent.tint, accent.text, accent.ring]) {
        expect(value).not.toContain("${");
        expect(value).toMatch(/^[a-z0-9:/[\]-]+$/);
      }
    }
  });

  it("cada asiento tiene su propio color: no se repite ninguna clase de barra", () => {
    const barras = SEAT_ACCENT.map((a) => a.bar);
    expect(new Set(barras).size).toBe(SEAT_COUNT);
  });

  it("seatAccent envuelve por encima del máximo en vez de devolver undefined", () => {
    // Una mesa nunca pasa de 6 hoy, pero un índice fuera de rango no puede
    // reventar el render del tablero entero: se repite color, que es peor
    // estéticamente y mejor que una pantalla en blanco.
    expect(seatAccent(0)).toBe(SEAT_ACCENT[0]);
    expect(seatAccent(6)).toBe(SEAT_ACCENT[0]);
    expect(seatAccent(7)).toBe(SEAT_ACCENT[1]);
  });
});
```

- [ ] **Step 7: Correr el test para verlo fallar**

Run: `npx vitest run src/lib/play/ui/seats.test.ts`
Expected: FAIL — `Failed to resolve import "./seats"`.

- [ ] **Step 8: Escribir `src/lib/play/ui/seats.ts`**

```ts
/**
 * Color de asiento de BiblioPlay. Mismo patrón que `src/lib/catalog/media-accent.ts`:
 * las clases se escriben ENTERAS (invariante `inv-tailwind-literal`) porque el JIT de
 * Tailwind lee el código fuente — una clase interpolada no existe en el CSS final.
 *
 * Son seis porque seis es el máximo de jugadores del modo Commander (`mtg/modes.ts`).
 * Se asume que ciruela e índigo se rozan a contraluz: el color NO es el único
 * distintivo (también están el nombre, el comandante y la posición en la mesa), y
 * cuatro colores repetidos con un rayado se leen peor que seis parecidos.
 */
export type SeatAccent = {
  /** Barra sólida del asiento: mira siempre al centro de la mesa. */
  bar: string;
  /** Tinte suave: mitad pulsada del panel y fondo de tarjeta predefinido. */
  tint: string;
  /** Texto sobre el papel (nombre del comandante en la tira de daño). */
  text: string;
  /** Anillo del asiento activo. */
  ring: string;
  /** Variable CSS cruda, para degradados y `style` calculado. */
  varName: string;
};

export const SEAT_COUNT = 6;

export const SEAT_ACCENT: SeatAccent[] = [
  {
    bar: "bg-play-seat-1",
    tint: "bg-play-seat-1/15",
    text: "text-play-seat-1",
    ring: "ring-play-seat-1",
    varName: "--play-seat-1",
  },
  {
    bar: "bg-play-seat-2",
    tint: "bg-play-seat-2/15",
    text: "text-play-seat-2",
    ring: "ring-play-seat-2",
    varName: "--play-seat-2",
  },
  {
    bar: "bg-play-seat-3",
    tint: "bg-play-seat-3/15",
    text: "text-play-seat-3",
    ring: "ring-play-seat-3",
    varName: "--play-seat-3",
  },
  {
    bar: "bg-play-seat-4",
    tint: "bg-play-seat-4/15",
    text: "text-play-seat-4",
    ring: "ring-play-seat-4",
    varName: "--play-seat-4",
  },
  {
    bar: "bg-play-seat-5",
    tint: "bg-play-seat-5/15",
    text: "text-play-seat-5",
    ring: "ring-play-seat-5",
    varName: "--play-seat-5",
  },
  {
    bar: "bg-play-seat-6",
    tint: "bg-play-seat-6/15",
    text: "text-play-seat-6",
    ring: "ring-play-seat-6",
    varName: "--play-seat-6",
  },
];

/** Índice de asiento -> color, envolviendo: un índice fuera de rango repite color, no rompe. */
export function seatAccent(seat: number): SeatAccent {
  return SEAT_ACCENT[((seat % SEAT_COUNT) + SEAT_COUNT) % SEAT_COUNT];
}
```

- [ ] **Step 9: Correr los tests**

Run: `npx vitest run src/lib/play/ui/seats.test.ts src/app/contraste-play.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 10: Commit**

```bash
git add src/app/globals.css src/lib/play/ui/seats.ts src/lib/play/ui/seats.test.ts src/app/contraste-play.test.ts
git commit -m "feat(play): tokens de mesa y los seis colores de asiento (#931)"
```

---

### Task 2: Reparto de la mesa y tamaño del número

**Files:**
- Create: `src/lib/play/ui/layout.ts`
- Test: `src/lib/play/ui/layout.test.ts`

**Interfaces:**
- Consumes: nada (módulo puro y autónomo).
- Produces:
  - `type BoardOrientation = "portrait" | "landscape"`
  - `type LayoutFamily = "rows" | "head" | "flat"`
  - `type ConsoleMode = "band" | "floating"`
  - `type SeatPlacement = { seat: number; area: string; rotation: 0 | 90 | 180 | -90 }`
  - `type BoardLayout = { family; columns: string; rows: string; areas: string; consoleArea: string; consoleMode: ConsoleMode; seats: SeatPlacement[] }`
  - `layoutOptions(players: number, orientation: BoardOrientation): LayoutFamily[]`
  - `defaultLayout(players: number, orientation: BoardOrientation): LayoutFamily`
  - `resolveLayout(players: number, orientation: BoardOrientation, family: LayoutFamily): BoardLayout`
  - `lifeFontSize(panel: { width: number; height: number; digits: number }): number`

- [ ] **Step 1: Escribir el test**

`src/lib/play/ui/layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultLayout, layoutOptions, lifeFontSize, resolveLayout } from "./layout";

describe("familias de reparto disponibles", () => {
  it("a dos jugadores no hay cabecera: no hay laterales que llenar", () => {
    expect(layoutOptions(2, "portrait")).toEqual(["rows", "flat"]);
    expect(layoutOptions(2, "landscape")).toEqual(["rows", "flat"]);
  });

  it("de cuatro en adelante sí hay cabecera", () => {
    expect(layoutOptions(4, "portrait")).toContain("head");
    expect(layoutOptions(5, "portrait")).toContain("head");
  });

  it("a seis, las dos cabeceras SOLO existen tumbado", () => {
    // De pie los paneles centrales caen a 81 px y dos cifras en mono necesitan 93.
    expect(layoutOptions(6, "portrait")).not.toContain("head");
    expect(layoutOptions(6, "landscape")).toContain("head");
  });
});

describe("reparto por defecto", () => {
  it("el por defecto es siempre una opción válida para ese número y orientación", () => {
    for (const players of [2, 3, 4, 5, 6]) {
      for (const orientation of ["portrait", "landscape"] as const) {
        expect(layoutOptions(players, orientation)).toContain(defaultLayout(players, orientation));
      }
    }
  });

  it("a cinco el por defecto es la cabecera: pasar de 4 a 5 no recoloca a nadie", () => {
    expect(defaultLayout(5, "portrait")).toBe("head");
  });

  it("a seis el por defecto cambia con el giro, y es el único que lo hace", () => {
    expect(defaultLayout(6, "portrait")).toBe("rows");
    expect(defaultLayout(6, "landscape")).toBe("head");
  });
});

describe("resolveLayout", () => {
  it("coloca a todo el mundo, una vez, con su asiento", () => {
    for (const players of [2, 3, 4, 5, 6]) {
      for (const orientation of ["portrait", "landscape"] as const) {
        for (const family of layoutOptions(players, orientation)) {
          const layout = resolveLayout(players, orientation, family);
          const seats = layout.seats.map((s) => s.seat).sort((a, b) => a - b);
          expect(seats, `${players}/${orientation}/${family}`).toEqual(
            Array.from({ length: players }, (_, i) => i),
          );
        }
      }
    }
  });

  it("cada área declarada en `seats` aparece en la rejilla", () => {
    const layout = resolveLayout(4, "portrait", "rows");
    for (const seat of layout.seats) {
      expect(layout.areas).toContain(seat.area);
    }
    expect(layout.areas).toContain(layout.consoleArea);
  });

  it("en filas, el sobrante de un número impar va ABAJO a ancho entero", () => {
    // Es el sitio de quien sostiene el móvil.
    const layout = resolveLayout(3, "portrait", "rows");
    const abajo = layout.seats.filter((s) => s.rotation === 0);
    expect(abajo).toHaveLength(1);
    expect(abajo[0].seat).toBe(2);
  });

  it("la fila de arriba va girada 180 y la de abajo no: se leen desde cada lado", () => {
    const layout = resolveLayout(4, "portrait", "rows");
    expect(layout.seats.filter((s) => s.rotation === 180)).toHaveLength(2);
    expect(layout.seats.filter((s) => s.rotation === 0)).toHaveLength(2);
  });

  it("«todos igual» no gira a nadie: es la salida accesible y la del móvil que se pasa", () => {
    for (const players of [2, 3, 4, 5, 6]) {
      const layout = resolveLayout(players, "portrait", "flat");
      expect(layout.seats.every((s) => s.rotation === 0)).toBe(true);
    }
  });

  it("a cinco con cabecera, el 2x2 queda intacto y solo el quinto va de canto", () => {
    const layout = resolveLayout(5, "portrait", "head");
    const canto = layout.seats.filter((s) => s.rotation === 90 || s.rotation === -90);
    expect(canto).toHaveLength(1);
    expect(canto[0].seat).toBe(4);
  });

  it("a seis tumbado con cabeceras hay dos de canto, uno a cada lado", () => {
    const layout = resolveLayout(6, "landscape", "head");
    const canto = layout.seats.filter((s) => s.rotation === 90 || s.rotation === -90);
    expect(canto).toHaveLength(2);
    expect(new Set(canto.map((s) => s.rotation)).size).toBe(2);
  });

  it("la consola es banda de pie y flotante tumbada (decisión 2026-08-29 (6))", () => {
    expect(resolveLayout(4, "portrait", "rows").consoleMode).toBe("band");
    expect(resolveLayout(4, "landscape", "rows").consoleMode).toBe("floating");
  });
});

describe("tamaño del número de vidas", () => {
  it("el panel de una mesa de 4 de pie da el número grande", () => {
    expect(lifeFontSize({ width: 190, height: 172, digits: 2 })).toBe(75);
  });

  it("la tercera cifra lo baja: a 78 px tres cifras se quedan sin aire", () => {
    const dos = lifeFontSize({ width: 190, height: 172, digits: 2 });
    const tres = lifeFontSize({ width: 190, height: 172, digits: 3 });
    expect(tres).toBeLessThan(dos);
  });

  it("nunca pasa del techo ni baja del suelo legible", () => {
    expect(lifeFontSize({ width: 900, height: 900, digits: 1 })).toBe(78);
    expect(lifeFontSize({ width: 40, height: 40, digits: 3 })).toBe(28);
  });

  it("es monótono: un panel más alto nunca da un número más pequeño", () => {
    const bajo = lifeFontSize({ width: 190, height: 120, digits: 2 });
    const alto = lifeFontSize({ width: 190, height: 172, digits: 2 });
    expect(alto).toBeGreaterThanOrEqual(bajo);
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `npx vitest run src/lib/play/ui/layout.test.ts`
Expected: FAIL — `Failed to resolve import "./layout"`.

- [ ] **Step 3: Escribir `src/lib/play/ui/layout.ts`**

```ts
/**
 * Reparto de la mesa. Puro y sin React: la pantalla más difícil de la app se
 * decide aquí, en funciones que se pueden probar sin montar un tablero.
 *
 * Tres familias, no quince maquetas (canvas de la fase 1a):
 * - `rows`  «mesa»: dos filas enfrentadas, la de arriba girada 180. El reparto base.
 * - `head`  «cabecera(s)»: el bloque central intacto y uno o dos asientos de canto.
 * - `flat`  «todos igual»: nadie girado. Para el móvil que se va pasando por la
 *           mesa y como salida accesible de quien la rotación le complica leer.
 *
 * El reparto es PREFERENCIA DE VISTA, no estado de partida: no entra en el log de
 * eventos, no reordena asientos y no toca el orden del DOM (el orden lógico es
 * siempre el de asientos — la rotación es solo `transform`, spec §7).
 */
export type BoardOrientation = "portrait" | "landscape";
export type LayoutFamily = "rows" | "head" | "flat";
export type ConsoleMode = "band" | "floating";

export type SeatPlacement = {
  seat: number;
  /** Nombre de área de la rejilla; se pinta con `style={{ gridArea }}`. */
  area: string;
  rotation: 0 | 90 | 180 | -90;
};

export type BoardLayout = {
  family: LayoutFamily;
  columns: string;
  rows: string;
  areas: string;
  consoleArea: string;
  consoleMode: ConsoleMode;
  seats: SeatPlacement[];
};

const areaOf = (seat: number) => `s${seat}`;
const CONSOLE_AREA = "cons";

/**
 * La consola sale del hueco SOLO tumbada. De pie la banda a todo el ancho cuesta
 * 14 px repartidos entre dos filas y no compensa; tumbada son 68 px, el 17 % del
 * alto, y salen enteros del número de vidas (decisión 2026-08-29 (6)).
 */
function consoleModeFor(orientation: BoardOrientation): ConsoleMode {
  return orientation === "landscape" ? "floating" : "band";
}

/** Familias que tienen sentido para ese número de jugadores y esa orientación. */
export function layoutOptions(players: number, orientation: BoardOrientation): LayoutFamily[] {
  const options: LayoutFamily[] = ["rows"];
  // A 2 y 3 no hay bloque central que dejar intacto: la «cabecera» sería el reparto
  // en filas con otro nombre. A 6 de pie tampoco: dos laterales dejan los paneles
  // centrales en 81 px y dos cifras en mono necesitan 93 — no cabe, medido.
  const headFits = players >= 4 && (players !== 6 || orientation === "landscape");
  if (headFits) options.push("head");
  options.push("flat");
  return options;
}

export function defaultLayout(players: number, orientation: BoardOrientation): LayoutFamily {
  // A cinco, la cabecera gana por algo que no es estético: pasar de 4 a 5 jugadores
  // no recoloca a nadie, añade un asiento. A seis tumbado salen las seis personas
  // donde estarían en la mesa. En todo lo demás manda el reparto en filas.
  if (players === 5) return "head";
  if (players === 6 && orientation === "landscape") return "head";
  return "rows";
}

/** Rejilla de N columnas iguales. */
const fr = (n: number) => Array.from({ length: n }, () => "1fr").join(" ");

/** Fila de la rejilla escrita como cadena de áreas repetidas hasta `columns`. */
function rowOf(areas: string[], columns: number): string {
  // Un asiento que no llena la fila entera se estira: 3 jugadores dejan al de abajo
  // a ancho completo, que es el sitio de quien sostiene el móvil.
  const cells: string[] = [];
  for (let i = 0; i < columns; i++) {
    cells.push(areas[Math.floor((i * areas.length) / columns)]);
  }
  return `"${cells.join(" ")}"`;
}

function rowsLayout(players: number, orientation: BoardOrientation): BoardLayout {
  // El sobrante de un impar va ABAJO: es el lado de quien tiene el móvil en la mano.
  const top = Math.ceil(players / 2);
  const bottom = players - top;
  const columns = Math.max(top, bottom, 1);
  const topSeats = Array.from({ length: top }, (_, i) => i);
  const bottomSeats = Array.from({ length: bottom }, (_, i) => top + i);
  const consoleMode = consoleModeFor(orientation);

  const gridRows =
    bottom === 0
      ? `1fr ${consoleMode === "band" ? "auto" : "0"}`
      : `1fr ${consoleMode === "band" ? "auto" : "0"} 1fr`;

  const areaRows = [
    rowOf(topSeats.map(areaOf), columns),
    `"${Array.from({ length: columns }, () => CONSOLE_AREA).join(" ")}"`,
  ];
  if (bottom > 0) areaRows.push(rowOf(bottomSeats.map(areaOf), columns));

  return {
    family: "rows",
    columns: fr(columns),
    rows: gridRows,
    areas: areaRows.join(" "),
    consoleArea: CONSOLE_AREA,
    consoleMode,
    seats: [
      ...topSeats.map((seat) => ({ seat, area: areaOf(seat), rotation: 180 as const })),
      ...bottomSeats.map((seat) => ({ seat, area: areaOf(seat), rotation: 0 as const })),
    ],
  };
}

function headLayout(players: number, orientation: BoardOrientation): BoardLayout {
  // El bloque central son los cuatro primeros asientos en 2x2 (o los dos primeros
  // enfrentados si solo hay cuatro contando laterales); los que sobran van de canto.
  const lateralCount = players === 6 ? 2 : players === 5 ? 1 : 2;
  const centerCount = players - lateralCount;
  const centerTop = Math.ceil(centerCount / 2);
  const centerBottom = centerCount - centerTop;
  const consoleMode = consoleModeFor(orientation);

  const centerColumns = Math.max(centerTop, centerBottom, 1);
  const topSeats = Array.from({ length: centerTop }, (_, i) => i);
  const bottomSeats = Array.from({ length: centerBottom }, (_, i) => centerTop + i);
  const lateralSeats = Array.from({ length: lateralCount }, (_, i) => centerCount + i);

  // Una columna de canto a cada lado (o solo a la derecha si hay un único lateral).
  const leftArea = lateralCount === 2 ? areaOf(lateralSeats[0]) : null;
  const rightArea = areaOf(lateralSeats[lateralCount - 1]);
  const wrap = (cells: string) =>
    `"${[leftArea, cells, rightArea].filter(Boolean).join(" ")}"`;

  const areaRows = [
    wrap(rowOf(topSeats.map(areaOf), centerColumns).replaceAll('"', "")),
    wrap(Array.from({ length: centerColumns }, () => CONSOLE_AREA).join(" ")),
  ];
  if (centerBottom > 0) {
    areaRows.push(wrap(rowOf(bottomSeats.map(areaOf), centerColumns).replaceAll('"', "")));
  }

  const columns = [leftArea ? "0.62fr" : null, fr(centerColumns), "0.62fr"]
    .filter(Boolean)
    .join(" ");

  return {
    family: "head",
    columns,
    rows: `1fr ${consoleMode === "band" ? "auto" : "0"}${centerBottom > 0 ? " 1fr" : ""}`,
    areas: areaRows.join(" "),
    consoleArea: CONSOLE_AREA,
    consoleMode,
    seats: [
      ...topSeats.map((seat) => ({ seat, area: areaOf(seat), rotation: 180 as const })),
      ...bottomSeats.map((seat) => ({ seat, area: areaOf(seat), rotation: 0 as const })),
      ...lateralSeats.map((seat, i) => ({
        seat,
        area: areaOf(seat),
        // El de la izquierda mira a la derecha y viceversa: la barra de asiento
        // apunta siempre al centro de la mesa.
        rotation: (lateralCount === 2 && i === 0 ? 90 : -90) as 90 | -90,
      })),
    ],
  };
}

function flatLayout(players: number, orientation: BoardOrientation): BoardLayout {
  // Nadie girado. Con pocos jugadores va en una columna; a partir de 4, en dos.
  const columns = players <= 3 ? 1 : 2;
  const rowCount = Math.ceil(players / columns);
  const seats = Array.from({ length: players }, (_, seat) => ({
    seat,
    area: areaOf(seat),
    rotation: 0 as const,
  }));

  const areaRows: string[] = [];
  for (let r = 0; r < rowCount; r++) {
    const rowSeats = seats.slice(r * columns, r * columns + columns).map((s) => s.area);
    areaRows.push(rowOf(rowSeats, columns));
    // La consola va DEBAJO de la primera fila también aquí: sigue siendo el sitio
    // que todo el mundo alcanza, y así el reparto accesible no pierde el undo.
    if (r === 0) areaRows.push(`"${Array.from({ length: columns }, () => CONSOLE_AREA).join(" ")}"`);
  }

  const consoleMode = consoleModeFor(orientation);
  const gridRows = areaRows
    .map((row) => (row.includes(CONSOLE_AREA) ? (consoleMode === "band" ? "auto" : "0") : "1fr"))
    .join(" ");

  return {
    family: "flat",
    columns: fr(columns),
    rows: gridRows,
    areas: areaRows.join(" "),
    consoleArea: CONSOLE_AREA,
    consoleMode,
    seats,
  };
}

export function resolveLayout(
  players: number,
  orientation: BoardOrientation,
  family: LayoutFamily,
): BoardLayout {
  // Una familia que no aplica a ese número cae al por defecto en vez de pintar una
  // mesa imposible: la preferencia vive en localStorage y puede quedar obsoleta si
  // la siguiente partida tiene otro número de jugadores.
  const usable = layoutOptions(players, orientation).includes(family)
    ? family
    : defaultLayout(players, orientation);
  if (usable === "head") return headLayout(players, orientation);
  if (usable === "flat") return flatLayout(players, orientation);
  return rowsLayout(players, orientation);
}

/** Techo, suelo y holgura del número de vidas, en px. */
const LIFE_MAX = 78;
const LIFE_MIN = 28;
/** Ancho de un dígito en Geist Mono, medido: 0,6 em. */
const MONO_DIGIT_RATIO = 0.6;
/** Padding lateral del panel que el número no puede invadir. */
const PANEL_PADDING = 24;

/**
 * El tamaño sale del panel Y del número de dígitos, no solo del reparto: en
 * Commander se gana vida a puñados y hay mesas que pasan de cien. A 78 px, tres
 * cifras en mono ocupan ~140 px de los ~172 útiles del panel de pie: cabe, pero
 * sin aire. La holgura del 0,8 es lo que devuelve ese aire.
 */
export function lifeFontSize({
  width,
  height,
  digits,
}: {
  width: number;
  height: number;
  digits: number;
}): number {
  const byHeight = height * 0.44;
  const byWidth = ((width - PANEL_PADDING) * 0.8) / (Math.max(digits, 1) * MONO_DIGIT_RATIO);
  return Math.max(LIFE_MIN, Math.floor(Math.min(LIFE_MAX, byHeight, byWidth)));
}
```

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run src/lib/play/ui/layout.test.ts`
Expected: PASS. Si `lifeFontSize({width:190,height:172,digits:2})` no da exactamente 75, imprimir el valor y ajustar el test al valor real de la fórmula (la fórmula es la decisión; el número del test solo la fija).

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/ui/layout.ts src/lib/play/ui/layout.test.ts
git commit -m "feat(play): reparto de la mesa y tamano del numero de vidas (#931)"
```

---

### Task 3: Crono y preferencias de vista del dispositivo

**Files:**
- Create: `src/lib/play/ui/clock.ts`
- Test: `src/lib/play/ui/clock.test.ts`
- Create: `src/lib/play/ui/preferences.ts`
- Test: `src/lib/play/ui/preferences.test.ts`

**Interfaces:**
- Consumes: `BoardOrientation`, `LayoutFamily` de `./layout`.
- Produces:
  - `formatElapsed(ms: number): string`
  - `type BoardPreferences = { orientation: BoardOrientation; layout: LayoutFamily | "auto"; keepAwake: boolean }`
  - `DEFAULT_PREFERENCES: BoardPreferences`, `PREFERENCES_KEY`
  - `readPreferences(): BoardPreferences`, `writePreferences(next: BoardPreferences): void`
  - `preferencesStore: { subscribe(cb: () => void): () => void; getSnapshot(): BoardPreferences }`

- [ ] **Step 1: Escribir el test del crono**

`src/lib/play/ui/clock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatElapsed } from "./clock";

describe("crono de la partida", () => {
  it("por debajo de una hora, MM:SS con minutos a dos cifras", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(9_000)).toBe("00:09");
    expect(formatElapsed(332_000)).toBe("05:32");
    expect(formatElapsed(3_599_000)).toBe("59:59");
  });

  it("a partir de la hora, H:MM:SS", () => {
    expect(formatElapsed(3_600_000)).toBe("1:00:00");
    expect(formatElapsed(3_932_000)).toBe("1:05:32");
    expect(formatElapsed(36_000_000)).toBe("10:00:00");
  });

  it("un tiempo negativo se lee como cero, no como basura", () => {
    // Alcanzable: el reloj del sistema puede retroceder con la partida abierta
    // (el motor ya no exige monotonía en `at`, ver core/store.ts).
    expect(formatElapsed(-5_000)).toBe("00:00");
  });
});
```

- [ ] **Step 2: Correr para verlo fallar**

Run: `npx vitest run src/lib/play/ui/clock.test.ts`
Expected: FAIL — `Failed to resolve import "./clock"`.

- [ ] **Step 3: Escribir `src/lib/play/ui/clock.ts`**

```ts
/**
 * Crono de la partida. Se DERIVA de `startedAt` (ni evento nuevo ni campo nuevo) y
 * cuenta reloj de pared, así que incluye el rato con la app cerrada — que es lo que
 * la gente entiende por «cuánto llevamos». Pausar sí costaría motor y queda fuera
 * de la fase 1 (issue #941).
 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
```

- [ ] **Step 4: Escribir el test de preferencias**

`src/lib/play/ui/preferences.test.ts` — necesita `localStorage`, así que va en jsdom:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  preferencesStore,
  readPreferences,
  writePreferences,
} from "./preferences";

beforeEach(() => {
  localStorage.clear();
});

describe("preferencias de vista del tablero", () => {
  it("sin nada guardado devuelve los valores por defecto", () => {
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES.layout).toBe("auto");
  });

  it("guarda y relee", () => {
    writePreferences({ orientation: "landscape", layout: "head", keepAwake: false });
    expect(readPreferences()).toEqual({ orientation: "landscape", layout: "head", keepAwake: false });
  });

  it("un valor corrupto no rompe el tablero: cae al por defecto", () => {
    localStorage.setItem(PREFERENCES_KEY, "{no es json");
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("un valor fuera del dominio se descarta campo a campo, no entero", () => {
    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ orientation: "diagonal", layout: "head", keepAwake: "sí" }),
    );
    const prefs = readPreferences();
    expect(prefs.orientation).toBe(DEFAULT_PREFERENCES.orientation);
    expect(prefs.layout).toBe("head");
    expect(prefs.keepAwake).toBe(DEFAULT_PREFERENCES.keepAwake);
  });

  it("no lleva identidad en la clave: es preferencia del dispositivo, no dato de nadie", () => {
    // Si algún día guardara algo del jugador, tendría que aislarse por identidad
    // como el log de la partida (misma clase de fuga que el arreglo #680).
    expect(PREFERENCES_KEY).not.toContain("anon");
    expect(PREFERENCES_KEY).toBe("biblioshare:play:board");
  });

  it("el store avisa a sus suscriptores al escribir, y deja de hacerlo al desuscribirse", () => {
    let avisos = 0;
    const unsubscribe = preferencesStore.subscribe(() => {
      avisos += 1;
    });
    writePreferences({ ...DEFAULT_PREFERENCES, orientation: "landscape" });
    expect(avisos).toBe(1);
    expect(preferencesStore.getSnapshot().orientation).toBe("landscape");
    unsubscribe();
    writePreferences(DEFAULT_PREFERENCES);
    expect(avisos).toBe(1);
  });

  it("getSnapshot devuelve la MISMA referencia mientras no cambie nada", () => {
    // useSyncExternalStore entra en bucle infinito si el snapshot es un objeto
    // nuevo en cada llamada (misma trampa que use-timer-state.ts).
    expect(preferencesStore.getSnapshot()).toBe(preferencesStore.getSnapshot());
  });
});
```

- [ ] **Step 5: Correr para verlo fallar**

Run: `npx vitest run src/lib/play/ui/preferences.test.ts`
Expected: FAIL — `Failed to resolve import "./preferences"`.

- [ ] **Step 6: Escribir `src/lib/play/ui/preferences.ts`**

```ts
import type { BoardOrientation, LayoutFamily } from "./layout";

/**
 * Preferencias de VISTA del tablero. No son estado de partida: no entran en el log
 * de eventos, no reordenan asientos y cambiar cualquiera de ellas no altera nada de
 * lo que pasa en la mesa. Por eso viven en `localStorage` SIN aislar por identidad —
 * no hay dato de nadie aquí, solo cómo prefiere mirar este dispositivo.
 *
 * `orientation` no sigue el giro del móvil a propósito: girar sin querer recolocaría
 * la mesa delante de cuatro personas en mitad de un turno. Se gira desde el menú.
 */
export type BoardPreferences = {
  orientation: BoardOrientation;
  /** `auto` = el que recomiende `defaultLayout` para el número de jugadores de turno. */
  layout: LayoutFamily | "auto";
  keepAwake: boolean;
};

export const PREFERENCES_KEY = "biblioshare:play:board";

export const DEFAULT_PREFERENCES: BoardPreferences = {
  orientation: "portrait",
  layout: "auto",
  keepAwake: true,
};

const ORIENTATIONS: BoardOrientation[] = ["portrait", "landscape"];
const LAYOUTS: (LayoutFamily | "auto")[] = ["auto", "rows", "head", "flat"];

/** Campo a campo: un valor raro no invalida los otros dos. */
function parse(raw: string | null): BoardPreferences {
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(raw) as Partial<BoardPreferences>;
    return {
      orientation: ORIENTATIONS.includes(parsed?.orientation as BoardOrientation)
        ? (parsed.orientation as BoardOrientation)
        : DEFAULT_PREFERENCES.orientation,
      layout: LAYOUTS.includes(parsed?.layout as LayoutFamily)
        ? (parsed.layout as LayoutFamily | "auto")
        : DEFAULT_PREFERENCES.layout,
      keepAwake:
        typeof parsed?.keepAwake === "boolean" ? parsed.keepAwake : DEFAULT_PREFERENCES.keepAwake,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function readPreferences(): BoardPreferences {
  try {
    return parse(globalThis.localStorage?.getItem(PREFERENCES_KEY) ?? null);
  } catch {
    // Modo privado o cuota llena: se juega igual con los valores por defecto.
    return DEFAULT_PREFERENCES;
  }
}

let cached: BoardPreferences = readPreferences();
const listeners = new Set<() => void>();

export function writePreferences(next: BoardPreferences): void {
  cached = next;
  try {
    globalThis.localStorage?.setItem(PREFERENCES_KEY, JSON.stringify(next));
  } catch {
    // Sin storage la preferencia dura lo que la pestaña. No rompe la partida.
  }
  for (const listener of listeners) listener();
}

/**
 * Store mínimo para `useSyncExternalStore`: leer `localStorage` con
 * `useState`+`useEffect` está prohibido por lint (`set-state-in-effect`), y además
 * provoca un primer render con el valor equivocado. `getSnapshot` devuelve la MISMA
 * referencia mientras no se escriba: un objeto nuevo por llamada mete a React en un
 * bucle de re-render.
 */
export const preferencesStore = {
  subscribe(callback: () => void): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
  getSnapshot(): BoardPreferences {
    return cached;
  },
};
```

- [ ] **Step 7: Correr los tests**

Run: `npx vitest run src/lib/play/ui/clock.test.ts src/lib/play/ui/preferences.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 8: Commit**

```bash
git add src/lib/play/ui/clock.ts src/lib/play/ui/clock.test.ts src/lib/play/ui/preferences.ts src/lib/play/ui/preferences.test.ts
git commit -m "feat(play): crono derivado y preferencias de vista del tablero (#931)"
```

---

### Task 4: Memoria de la mesa (revancha y prerrelleno)

**Files:**
- Create: `src/lib/play/ui/table-memory.ts`
- Test: `src/lib/play/ui/table-memory.test.ts`

**Interfaces:**
- Consumes: `MtgSetup`, `MtgParticipant` de `@/lib/play/mtg/types`; `MTG_MODES` de `@/lib/play/mtg/modes`.
- Produces:
  - `tableMemoryKey(identity: string): string`
  - `rememberTable(identity: string, setup: MtgSetup): void`
  - `readRememberedTable(identity: string): MtgSetup | null`
  - `rotateStartingSeat(setup: MtgSetup): MtgSetup`

- [ ] **Step 1: Escribir el test**

`src/lib/play/ui/table-memory.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { makeSetup, guestWithPartner, guest } from "@/lib/play/mtg/test-fixtures";
import { readRememberedTable, rememberTable, rotateStartingSeat, tableMemoryKey } from "./table-memory";

beforeEach(() => {
  localStorage.clear();
});

describe("memoria de la última mesa", () => {
  it("guarda y devuelve la mesa entera, comandantes incluidos", () => {
    const setup = { ...makeSetup(), participants: [guestWithPartner("ana"), guest("borja"), guest("carlos"), guest("laura")] };
    rememberTable("anon", setup);
    const leida = readRememberedTable("anon");
    expect(leida?.participants).toHaveLength(4);
    expect(leida?.participants[0].commanders).toHaveLength(2);
  });

  it("va aislada por identidad: la mesa de una cuenta no se lee desde otra", () => {
    // Los nombres de la mesa son datos de personas reales: misma clase de fuga
    // entre cuentas del mismo dispositivo que el arreglo #680.
    rememberTable("uid-1", makeSetup());
    expect(readRememberedTable("uid-2")).toBeNull();
    expect(tableMemoryKey("uid-1")).not.toBe(tableMemoryKey("uid-2"));
  });

  it("una identidad vacía es un error de programación, no una mesa compartida", () => {
    expect(() => tableMemoryKey("  ")).toThrow();
  });

  it("descarta lo corrupto en vez de romper la configuración", () => {
    localStorage.setItem(tableMemoryKey("anon"), "{no es json");
    expect(readRememberedTable("anon")).toBeNull();
  });

  it("descarta una mesa semánticamente imposible (comandantes duplicados)", () => {
    localStorage.setItem(
      tableMemoryKey("anon"),
      JSON.stringify({
        v: 1,
        setup: {
          mode: "commander",
          startingLife: 40,
          startingSeat: 0,
          participants: [
            { id: "a", kind: "guest", name: "a", commanders: [{ id: "dup" }] },
            { id: "b", kind: "guest", name: "b", commanders: [{ id: "dup" }] },
          ],
        },
      }),
    );
    expect(readRememberedTable("anon")).toBeNull();
  });

  it("descarta una versión de snapshot que no reconoce", () => {
    localStorage.setItem(tableMemoryKey("anon"), JSON.stringify({ v: 99, setup: makeSetup() }));
    expect(readRememberedTable("anon")).toBeNull();
  });

  it("la revancha rota el turno inicial un asiento", () => {
    const setup = makeSetup(); // startingSeat: 0, cuatro jugadores
    expect(rotateStartingSeat(setup).startingSeat).toBe(1);
    expect(rotateStartingSeat({ ...setup, startingSeat: 3 }).startingSeat).toBe(0);
  });

  it("rotar no toca a los participantes: solo cambia quién empieza", () => {
    const setup = makeSetup();
    expect(rotateStartingSeat(setup).participants).toEqual(setup.participants);
  });
});
```

- [ ] **Step 2: Correr para verlo fallar**

Run: `npx vitest run src/lib/play/ui/table-memory.test.ts`
Expected: FAIL — `Failed to resolve import "./table-memory"`.

- [ ] **Step 3: Escribir `src/lib/play/ui/table-memory.ts`**

```ts
import { MTG_MODES, type MtgMode } from "@/lib/play/mtg/modes";
import type { MtgSetup } from "@/lib/play/mtg/types";

/**
 * «La última mesa usada». La fricción no está en la primera partida —esa se
 * configura con ganas—, está en la tercera de la tarde: si hay que reescribir cuatro
 * nombres y cuatro comandantes cada vez, se deja de usar la app y se vuelve a los
 * dados. Esto es lo que hace posible «Revancha» y el prerrelleno de «Nueva partida».
 *
 * CERO motor: no es un evento, no entra en el replay y no cambia el estado de
 * ninguna partida. Es una clave aparte del log, escrita al empezar cada partida.
 *
 * Va aislada por identidad porque guarda NOMBRES de personas: la mesa de una cuenta
 * no puede aparecer en otra del mismo dispositivo (arreglo #680, misma clase).
 */
const MEMORY_VERSION = 1 as const;

export function tableMemoryKey(identity: string): string {
  if (identity.trim() === "") {
    throw new Error("tableMemoryKey: identity no puede estar vacía");
  }
  return `biblioshare:play:${identity}:table`;
}

/** Valida la forma Y lo que el motor exigiría al arrancar, para no ofrecer una mesa que no puede empezar. */
function isUsableSetup(value: unknown): value is MtgSetup {
  if (typeof value !== "object" || value === null) return false;
  const setup = value as MtgSetup;
  const config = MTG_MODES[setup.mode as MtgMode];
  if (!config) return false;
  if (!Array.isArray(setup.participants)) return false;
  const n = setup.participants.length;
  if (n < config.minPlayers || n > config.maxPlayers) return false;
  if (typeof setup.startingSeat !== "number" || setup.startingSeat < 0 || setup.startingSeat >= n) {
    return false;
  }
  if (typeof setup.startingLife !== "number" || !Number.isFinite(setup.startingLife)) return false;

  const participantIds = new Set<string>();
  const commanderIds = new Set<string>();
  for (const participant of setup.participants) {
    if (typeof participant?.id !== "string" || participant.id === "") return false;
    if (participantIds.has(participant.id)) return false;
    participantIds.add(participant.id);
    if (!Array.isArray(participant.commanders)) return false;
    if (participant.commanders.length < 1 || participant.commanders.length > config.maxCommanders) {
      return false;
    }
    for (const commander of participant.commanders) {
      if (typeof commander?.id !== "string" || commander.id === "") return false;
      // Ids repetidos mezclarían dos contadores de 21 (decisión 2026-08-29 (8)).
      if (commanderIds.has(commander.id)) return false;
      commanderIds.add(commander.id);
    }
  }
  return true;
}

export function rememberTable(identity: string, setup: MtgSetup): void {
  try {
    globalThis.localStorage?.setItem(
      tableMemoryKey(identity),
      JSON.stringify({ v: MEMORY_VERSION, setup }),
    );
  } catch {
    // Sin storage se juega igual; solo se pierde el prerrelleno de la siguiente.
  }
}

export function readRememberedTable(identity: string): MtgSetup | null {
  try {
    const raw = globalThis.localStorage?.getItem(tableMemoryKey(identity)) ?? null;
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as { v?: number; setup?: unknown };
    if (snapshot?.v !== MEMORY_VERSION) return null;
    return isUsableSetup(snapshot.setup) ? snapshot.setup : null;
  } catch {
    return null;
  }
}

/**
 * Revancha: empieza el siguiente. Es la convención de cualquier mesa y evita la
 * discusión de quién empieza. Sigue siendo editable en «Personalizar».
 */
export function rotateStartingSeat(setup: MtgSetup): MtgSetup {
  return { ...setup, startingSeat: (setup.startingSeat + 1) % setup.participants.length };
}
```

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run src/lib/play/ui/table-memory.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/ui/table-memory.ts src/lib/play/ui/table-memory.test.ts
git commit -m "feat(play): memoria de la ultima mesa para revancha y prerrelleno (#931)"
```

---

### Task 5: i18n, glosario, registro de UI, rutas de `/partidas` y hub principal

**Files:**
- Modify: `docs/UI-GLOSARIO.md`
- Modify: `messages/es.json` (namespace nuevo `play`, más `nav.you.play`)
- Modify: `src/components/nav/nav-items.ts`
- Create: `src/components/play/play-frame.tsx`
- Create: `src/components/play/tool-views.tsx`
- Create: `src/components/play/tool-grid.tsx`
- Create: `src/components/play/active-game-banner.tsx`
- Create: `src/app/partidas/layout.tsx`
- Create: `src/app/partidas/page.tsx`

**Interfaces:**
- Consumes: `playTools` de `@/lib/play/tools`, `useActiveGame` de `@/lib/play/core/use-active-game`, `seatAccent` de `@/lib/play/ui/seats`.
- Produces:
  - `toolViews: Record<ToolId, ToolView>` con `ToolView = { Illustration: ComponentType<{ className?: string }>; hubRoute: string }` (el tablero y el resumen se añaden en la Task 9 y la 13).
  - `<PlayFrame>` (cinta de seis colores + contenedor de sección).
  - `<ActiveGameBanner identity={string} />`.

- [ ] **Step 1: Registrar los términos en `docs/UI-GLOSARIO.md`**

Copiar el formato de entrada del fichero. Términos del área Partidas: **partida**, **mesa**, **asiento**, **reparto**, **jugador**, **mazo**, **comandante**, **partner**, **veneno**, **daño de comandante**, **monarca**, **iniciativa**, **turno**, **ronda**, **eliminado**, **revancha**, **consola**, **fieltro**. Para cada uno: el término que se usa en la interfaz y qué NO se dice (p. ej. «se dice *asiento*, no *posición*»; «se dice *revancha*, no *repetir*»).

- [ ] **Step 2: Añadir el namespace `play` a `messages/es.json`**

Al final del objeto raíz, un namespace nuevo. Estructura mínima que consumen las tasks 5–14 (los textos exactos salen del canvas; aquí está el esqueleto de claves, que es lo que no se puede improvisar después):

```json
"play": {
  "hubTitle": "Partidas",
  "hubSubtitle": "Lleva la cuenta de lo que juegas en la mesa",
  "soon": "Pronto",
  "resume": "Seguir la partida",
  "activeGame": "Partida en curso",
  "turnOf": "Turno {round} · {name}",
  "tools": {
    "mtg": {
      "name": "Magic: The Gathering",
      "hubTitle": "Magic",
      "modesTitle": "Modo",
      "moreModes": "Más modos",
      "moreModesDetail": "Brawl, Dos cabezas… próximamente",
      "footnote": "Avisa cuando alguien cumple una condición de derrota, pero no elimina a nadie: la mesa decide.",
      "newGame": "Nueva partida de {mode}",
      "modes": {
        "commander": { "name": "Commander", "detail": "2–6 · daño de comandante" },
        "duel": { "name": "Duelo", "detail": "1 vs 1 · sin comandante" }
      }
    }
  },
  "setup": {
    "title": "Nueva partida",
    "table": "En la mesa",
    "playerCount": "{count} jugadores",
    "playerN": "Jugador {n}",
    "noDeck": "Sin mazo",
    "commander": "Comandante",
    "addCommander": "Añadir comandante",
    "removeCommander": "Quitar comandante",
    "deck": "Mazo",
    "name": "Nombre",
    "background": "Fondo de la tarjeta",
    "advanced": "Personalizar",
    "advancedSummary": "{life} vidas · empieza el {seat}",
    "startingLife": "Vidas iniciales",
    "startingSeat": "Quién empieza",
    "start": "Empezar",
    "emptyIsFine": "Puedes empezar sin escribir nada: los nombres son opcionales.",
    "rematchSeat": "Empieza {name}, un asiento más allá."
  },
  "board": {
    "life": "Vidas de {name}",
    "plusOne": "Sumar una vida a {name}",
    "minusOne": "Quitar una vida a {name}",
    "poison": "Veneno de {name}: {count}",
    "commanderDamage": "Daño de comandante de {name}",
    "damageTitle": "Daño de comandante",
    "noDamage": "sin daño",
    "more": "+{count}",
    "monarch": "Monarca",
    "initiative": "Iniciativa",
    "eliminated": "Eliminado",
    "close": "Cerrar"
  },
  "console": {
    "undo": "Deshacer {event}",
    "nothingToUndo": "Nada que deshacer",
    "passTurn": "Pasar el turno a {name}",
    "turn": "Turno {round}",
    "elapsed": "Tiempo de partida: {time}",
    "menu": "Acciones de la partida"
  },
  "playerSheet": {
    "title": "{name}",
    "caption": "Asiento {seat} · {life} vidas",
    "setLife": "Fijar vidas exactas",
    "giveMonarch": "Darle el monarca",
    "giveInitiative": "Darle la iniciativa",
    "background": "Fondo de la tarjeta",
    "declareWinner": "Gana la partida",
    "markEliminated": "Marcar como eliminado",
    "restore": "Devolver a la partida",
    "nobody": "nadie"
  },
  "gameSheet": {
    "title": "La partida",
    "caption": "{mode} · {time}",
    "sectionTurn": "Turno",
    "sectionGame": "Partida",
    "rotate": "Girar la mesa",
    "layout": "Repartir la mesa",
    "layoutRows": "En filas",
    "layoutHead": "Cabecera",
    "layoutFlat": "Todos igual",
    "layoutAuto": "Automático",
    "keepAwake": "Mantener la pantalla encendida",
    "finish": "Finalizar la partida",
    "discard": "Descartar la partida",
    "orientationPortrait": "vertical",
    "orientationLandscape": "horizontal",
    "yes": "sí",
    "no": "no"
  },
  "summary": {
    "title": "Fin de la partida",
    "winner": "Gana {name}",
    "noWinner": "Partida terminada",
    "reason": {
      "last_standing": "Último en pie",
      "card": "Por una carta",
      "time": "Por tiempo",
      "abandoned": "Abandonada"
    },
    "ranking": "Clasificación",
    "position": "{position}.º",
    "duration": "Duración",
    "turns": "Turnos",
    "rematch": "Revancha",
    "discard": "Descartar"
  },
  "log": {
    "started": "Empieza la partida",
    "lifeGained": "{name} +{amount} vida",
    "lifeLost": "{name} −{amount} vida",
    "commanderDamage": "{source} → {target} +{amount}",
    "commanderDamageHealed": "{source} → {target} −{amount}",
    "poisonGained": "{name} +{amount} veneno",
    "poisonHealed": "{name} −{amount} veneno",
    "turnPassed": "Turno {round}",
    "monarch": "Monarca: {name}",
    "monarchCleared": "Sin monarca",
    "initiative": "Iniciativa: {name}",
    "initiativeCleared": "Sin iniciativa",
    "eliminated": "{name} eliminado",
    "restored": "{name} vuelve",
    "finished": "Fin de la partida",
    "unknown": "Acción"
  },
  "empty": {
    "noActiveGame": "No hay ninguna partida en curso",
    "goToHub": "Ir a Partidas"
  }
}
```

Y en `nav.you`, junto a las cuatro existentes: `"play": "Partidas"`.

**Comprobar** que las claves de `play.log.*` cubren EXACTAMENTE las que devuelve `describeEvent` (`src/lib/play/mtg/selectors.ts`) más `unknown` (`UNKNOWN_EVENT_DESCRIPTION` en `src/lib/play/tools.ts`). Una clave que falte sale como texto crudo en la consola.

- [ ] **Step 3: Añadir «Partidas» a `youItems`**

En `src/components/nav/nav-items.ts`: importar `PlayIcon` de `@/components/ui/icons`, ampliar el tipo `YouItem["key"]` con `"play"` y añadir la entrada tras `profile`:

```ts
    { key: "play", href: "/partidas", labelKey: "play", Icon: PlayIcon },
```

Regla del repo: lo tuyo cuelga de «Tú». **La barra de cinco no se toca.**

Run: `npx tsc --noEmit`
Expected: sin errores. Si algún consumidor de `youItems` hace un `switch` exhaustivo por `key`, TypeScript lo señalará aquí — resolverlo ahí, no ensanchando el tipo a `string`.

- [ ] **Step 4: Escribir `src/components/play/play-frame.tsx`**

```tsx
import type { ReactNode } from "react";
import { SEAT_ACCENT } from "@/lib/play/ui/seats";

/**
 * «Canto de mesa»: la cinta de seis colores bajo la topbar. Es la marca de la
 * subapp y la ÚNICA licencia visual que se toma — aparece en todo `/partidas*` y en
 * ningún otro sitio de Biblioshare. No decora: son los seis asientos, así que la
 * marca de Partidas es su propio sistema de color.
 */
export function PlayFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div aria-hidden className="flex h-1.5 w-full">
        {SEAT_ACCENT.map((accent, i) => (
          <span key={i} className={`${accent.bar} flex-1`} />
        ))}
      </div>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
```

- [ ] **Step 5: Escribir `src/components/play/tool-views.tsx`**

```tsx
import type { ComponentType } from "react";
import type { ToolId } from "@/lib/play/core/types";
import { MtgTableMark } from "./marks/mtg-table-mark";

/**
 * Registro de UI, hermano del registro de DOMINIO (`src/lib/play/tools.ts`). La
 * separación es por pureza: el motor no conoce React y la UI resuelve por `toolId`
 * (spec §6). Añadir «Puntuación por rondas» en la fase 4 es una entrada en cada
 * registro y su módulo: el hub no se toca.
 */
export type ToolView = {
  /** La marca de la herramienta es el dibujo de su mesa, no un párrafo explicándola. */
  Illustration: ComponentType<{ className?: string }>;
  hubRoute: string;
};

export const toolViews: Record<ToolId, ToolView> = {
  mtg: { Illustration: MtgTableMark, hubRoute: "/partidas/mtg" },
};
```

`ToolView` crece dos veces más en este plan y siempre igual —una propiedad por pantalla que la herramienta aporta—: `Board` en la Task 9 y `Summary` en la Task 13. Se añaden ahí, no aquí: declarar hoy un campo que apunta a un componente que no existe deja el registro roto durante cinco tasks.

`src/components/play/marks/mtg-table-mark.tsx` es un SVG sin texto: cuatro asientos alrededor de un tablero, cada uno con su color de asiento vía `var(--play-seat-N)` (usar `SEAT_ACCENT[i].varName`). Sin `<title>`; lo etiqueta la tarjeta que lo envuelve.

- [ ] **Step 6: Escribir `src/components/play/active-game-banner.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActiveGame } from "@/lib/play/core/use-active-game";
import { seatAccent } from "@/lib/play/ui/seats";

/**
 * La partida se ENSEÑA, no se describe: el banner es una miniatura del tablero de
 * verdad —los mismos asientos, los mismos colores, las mismas vidas— porque
 * reconoces tu partida por su forma antes de leer una palabra. Sale gratis: son los
 * datos que el store ya tiene en memoria.
 */
export function ActiveGameBanner({ identity }: { identity: string }) {
  const t = useTranslations("play");
  const { game } = useActiveGame(identity);
  if (!game || game.state.status === "finished") return null;

  const state = game.state;
  const active = state.players[state.activeSeat];

  return (
    <Link
      href="/partida/activa"
      className="flex items-center gap-4 rounded-card border border-border bg-surface p-4 transition-colors hover:bg-surface-muted"
    >
      <span aria-hidden className="grid grid-cols-2 gap-1">
        {state.players.map((player, seat) => (
          <span
            key={player.participant.id}
            className={`${seatAccent(seat).tint} grid h-9 w-12 place-items-center rounded-chip font-mono text-[13px] ${
              player.elimination ? "opacity-40" : ""
            }`}
          >
            {player.life}
          </span>
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("activeGame")}
        </span>
        <span className="block truncate font-serif text-[15px] font-semibold">
          {t("turnOf", { round: state.round, name: active.participant.name })}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[11px] text-accent-ink">{t("resume")}</span>
    </Link>
  );
}
```

- [ ] **Step 7: Escribir `src/components/play/tool-grid.tsx` y las páginas**

`tool-grid.tsx` (servidor, sin estado): recorre `playTools` y pinta una tarjeta por herramienta con su `Illustration` de `toolViews`, el nombre desde `play.tools.<i18nKey>.name` y enlace a `toolViews[id].hubRoute`. Añade una tarjeta atenuada con la etiqueta `play.soon` para la forma del sitio, **sin enlace**.

`src/app/partidas/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { RouteMessages } from "@/components/route-messages";

// Provider i18n de sección (#444): los providers de next-intl REEMPLAZAN, no
// mergean, así que este manda BASE + `play` para todo `/partidas*`.
export default function PlayMessagesLayout({ children }: { children: ReactNode }) {
  return <RouteMessages ns={["play"]}>{children}</RouteMessages>;
}
```

`src/app/partidas/page.tsx` (shell de servidor):

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { PlayFrame } from "@/components/play/play-frame";
import { ToolGrid } from "@/components/play/tool-grid";
import { ActiveGameBanner } from "@/components/play/active-game-banner";

export const metadata: Metadata = { title: "Partidas — Biblioshare" };

// No hace falta cuenta para jugar (decisión 2026-08-29 (3)): esta página NO
// redirige a /login. La identidad solo decide bajo qué clave de localStorage vive
// la partida — `anon` para quien no ha entrado.
async function Banner() {
  const user = await getCurrentUser();
  return <ActiveGameBanner identity={user?.id ?? "anon"} />;
}

export default async function PlayHubPage() {
  const t = await getTranslations("play");
  return (
    <PlayFrame>
      <h1 className="font-serif text-[26px] font-semibold">{t("hubTitle")}</h1>
      <p className="mt-1 text-[14px] text-muted-foreground">{t("hubSubtitle")}</p>
      {/* La sesión se lee bajo su propio boundary: el armazón de la página no
          espera a las cookies (misma razón que app-shell.tsx, issue #435). */}
      <Suspense fallback={null}>
        <Banner />
      </Suspense>
      <ToolGrid />
    </PlayFrame>
  );
}
```

- [ ] **Step 8: Verificar en el navegador**

Run: `npm run dev` (puerto 3000; si está ocupado, matar el proceso viejo antes)
Abrir `http://localhost:3000/partidas` en claro y en oscuro. Comprobar: cinta de seis colores bajo la topbar, topbar y barra de cinco intactas, tarjeta de Magic con su marca, tarjeta «Pronto» atenuada y sin enlace, y —si no hay partida— ningún banner.

- [ ] **Step 9: Typecheck y lint**

Run: `npx tsc --noEmit && npx eslint src/app/partidas src/components/play src/components/nav --max-warnings=0`
Expected: sin errores ni avisos.

- [ ] **Step 10: Commit**

```bash
git add docs/UI-GLOSARIO.md messages/es.json src/components/nav/nav-items.ts src/components/play src/app/partidas
git commit -m "feat(play): hub de Partidas, registro de UI y canto de mesa (#931)"
```

---

### Task 6: Hub de Magic con sus modos

**Files:**
- Create: `src/components/play/tool-hub.tsx`
- Create: `src/app/partidas/mtg/page.tsx`

**Interfaces:**
- Consumes: `MTG_MODES`, `MTG_MODE_IDS` de `@/lib/play/mtg/modes`; `PlayFrame`.
- Produces: `<PlayToolHub title cta sections>` — plantilla reutilizable por herramienta.

- [ ] **Step 1: Escribir `src/components/play/tool-hub.tsx`**

Plantilla con huecos por capacidad: CTA «Nueva partida» siempre; `history` y `stats` son props opcionales que **no se pintan** mientras no existan (fases 5–7). En la fase 1 no se enseñan secciones vacías prometiendo lo que aún no se puede hacer.

```tsx
import type { ReactNode } from "react";

/**
 * Plantilla de hub por herramienta (spec §6). Commander no es especial: es la
 * primera instancia. Las secciones que aún no existen NO se pintan — un hueco
 * vacío que promete historial es peor que no tener la sección.
 */
export function PlayToolHub({
  title,
  modes,
  cta,
  footnote,
  history,
  stats,
}: {
  title: string;
  modes?: ReactNode;
  cta: ReactNode;
  footnote?: string;
  history?: ReactNode;
  stats?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-serif text-[26px] font-semibold">{title}</h1>
      {modes}
      {cta}
      {history}
      {stats}
      {footnote && <p className="text-[13px] text-muted-foreground">{footnote}</p>}
    </section>
  );
}
```

- [ ] **Step 2: Escribir `src/app/partidas/mtg/page.tsx`**

Cliente para el selector de modo (el modo elegido cambia el CTA sin recargar). Contenido:

- Sección **Modo**: una tarjeta por `MTG_MODE_IDS`, y la tarjeta **es su número de vidas** (`MTG_MODES[mode].startingLife`) en **Fraunces**, no en la mono del tablero: el hub es un sitio donde se lee y se elige, no un instrumento. Nombre debajo, detalle en pequeño. El modo seleccionado lleva `aria-pressed` y el anillo del acento.
- Tarjeta genérica **«Más modos»** a ancho entero, atenuada, con `play.tools.mtg.moreModesDetail`. Sin enlace y sin fecha.
- CTA: enlace a `/partidas/mtg/nueva?modo=<modo>` con el texto `play.tools.mtg.newGame` interpolando el nombre del modo.
- Al pie, la única prosa que queda: `play.tools.mtg.footnote` («avisa pero no elimina»).

- [ ] **Step 3: Verificar en el navegador**

Abrir `http://localhost:3000/partidas/mtg`. Comprobar que se llega desde el hub con un clic, que cambiar de modo cambia el texto del CTA y el destino del enlace, y que «Más modos» no es pulsable.

- [ ] **Step 4: Typecheck, lint y commit**

Run: `npx tsc --noEmit && npx eslint src/app/partidas src/components/play --max-warnings=0`

```bash
git add src/components/play/tool-hub.tsx src/app/partidas/mtg
git commit -m "feat(play): hub de Magic con selector de modos (#931)"
```

---

### Task 7: Borrador de configuración y pantalla de nueva partida

**Files:**
- Create: `src/lib/play/ui/setup-draft.ts`
- Test: `src/lib/play/ui/setup-draft.test.ts`
- Create: `src/components/play/setup-form.tsx`
- Create: `src/app/partidas/mtg/nueva/page.tsx`

**Interfaces:**
- Consumes: `MTG_MODES`, `modeConfig`; `MtgSetup`, `MtgParticipant`; `rememberTable`, `readRememberedTable`, `rotateStartingSeat`; `getPlayStore` / `useActiveGame`; `makeEvent` de `@/lib/play/core/events`.
- Produces:
  - `type DraftCommander = { id: string; name: string }`
  - `type DraftPlayer = { id: string; name: string; deckName: string; commanders: DraftCommander[]; cardBackground?: string }`
  - `type SetupDraft = { mode: MtgMode; startingLife: number; startingSeat: number; players: DraftPlayer[] }`
  - `newDraft(mode: MtgMode, players?: number): SetupDraft`
  - `draftFromSetup(setup: MtgSetup): SetupDraft`
  - `setPlayerCount(draft: SetupDraft, count: number): SetupDraft`
  - `setMode(draft: SetupDraft, mode: MtgMode): SetupDraft`
  - `addCommander(draft: SetupDraft, playerIndex: number): SetupDraft`
  - `removeCommander(draft: SetupDraft, playerIndex: number, commanderIndex: number): SetupDraft`
  - `toSetup(draft: SetupDraft, fallbackName: (index: number) => string): MtgSetup`

- [ ] **Step 1: Escribir el test**

`src/lib/play/ui/setup-draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initialMtgState } from "@/lib/play/mtg/reducer";
import { makeEvent } from "@/lib/play/core/events";
import type { GameStartedEvent } from "@/lib/play/mtg/events";
import {
  addCommander,
  draftFromSetup,
  newDraft,
  removeCommander,
  setMode,
  setPlayerCount,
  toSetup,
} from "./setup-draft";

const nombrePorDefecto = (i: number) => `Jugador ${i + 1}`;
const arrancar = (setup: ReturnType<typeof toSetup>) =>
  initialMtgState(makeEvent("game_started", { toolId: "mtg" as const, setup }, 1000, "e1") as GameStartedEvent);

describe("borrador de configuración", () => {
  it("abre con cuatro jugadores y las vidas del modo", () => {
    // Cero es un camino de primera: se puede empezar sin escribir nada.
    const draft = newDraft("commander");
    expect(draft.players).toHaveLength(4);
    expect(draft.startingLife).toBe(40);
    expect(draft.players.every((p) => p.name === "")).toBe(true);
  });

  it("lo que sale del borrador ARRANCA en el motor sin tocar nada", () => {
    expect(() => arrancar(toSetup(newDraft("commander"), nombrePorDefecto))).not.toThrow();
    expect(() => arrancar(toSetup(newDraft("duel"), nombrePorDefecto))).not.toThrow();
  });

  it("cada jugador sale con al menos un comandante, aunque nadie escriba nada", () => {
    const setup = toSetup(newDraft("commander"), nombrePorDefecto);
    expect(setup.participants.every((p) => p.commanders.length >= 1)).toBe(true);
  });

  it("los nombres vacíos se rellenan con el texto que le pasa la UI", () => {
    const setup = toSetup(newDraft("commander"), nombrePorDefecto);
    expect(setup.participants[2].name).toBe("Jugador 3");
  });

  it("un nombre escrito se conserva y se recorta", () => {
    const draft = newDraft("commander");
    draft.players[0].name = "  Ana  ";
    expect(toSetup(draft, nombrePorDefecto).participants[0].name).toBe("Ana");
  });

  it("cambiar de modo ajusta las vidas y recorta la mesa a lo que el modo admite", () => {
    const draft = setMode(newDraft("commander"), "duel");
    expect(draft.startingLife).toBe(20);
    expect(draft.players).toHaveLength(2);
  });

  it("cambiar de modo también recorta los comandantes de más", () => {
    // Duelo admite uno por asiento; Commander, dos.
    let draft = addCommander(newDraft("commander"), 0);
    expect(draft.players[0].commanders).toHaveLength(2);
    draft = setMode(draft, "duel");
    expect(draft.players[0].commanders).toHaveLength(1);
    expect(() => arrancar(toSetup(draft, nombrePorDefecto))).not.toThrow();
  });

  it("no deja quitar el último comandante de un asiento", () => {
    const draft = removeCommander(newDraft("commander"), 0, 0);
    expect(draft.players[0].commanders).toHaveLength(1);
  });

  it("no añade más comandantes de los que el modo admite", () => {
    let draft = addCommander(newDraft("commander"), 0);
    draft = addCommander(draft, 0);
    expect(draft.players[0].commanders).toHaveLength(2);
  });

  it("bajar el número de jugadores no puede dejar el turno inicial fuera de la mesa", () => {
    let draft = newDraft("commander");
    draft = { ...draft, startingSeat: 3 };
    draft = setPlayerCount(draft, 2);
    expect(draft.startingSeat).toBeLessThan(2);
    expect(() => arrancar(toSetup(draft, nombrePorDefecto))).not.toThrow();
  });

  it("subir y bajar el número de jugadores no pierde lo escrito en los que siguen", () => {
    let draft = newDraft("commander");
    draft.players[0].name = "Ana";
    draft = setPlayerCount(draft, 6);
    draft = setPlayerCount(draft, 4);
    expect(draft.players[0].name).toBe("Ana");
  });

  it("los ids de comandante son únicos en toda la mesa (el motor lo exige)", () => {
    const setup = toSetup(addCommander(newDraft("commander"), 1), nombrePorDefecto);
    const ids = setup.participants.flatMap((p) => p.commanders.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ida y vuelta: de un setup a borrador y otra vez a setup no cambia nada", () => {
    const original = toSetup(addCommander(newDraft("commander"), 0), nombrePorDefecto);
    expect(toSetup(draftFromSetup(original), nombrePorDefecto)).toEqual(original);
  });
});
```

- [ ] **Step 2: Correr para verlo fallar**

Run: `npx vitest run src/lib/play/ui/setup-draft.test.ts`
Expected: FAIL — `Failed to resolve import "./setup-draft"`.

- [ ] **Step 3: Escribir `src/lib/play/ui/setup-draft.ts`**

Puntos que la implementación tiene que respetar (los tests los fijan):

- Ids estables y derivados de la posición: jugador `p1..p6`, comandantes `p1-c1`, `p1-c2`. Es lo que hace que los ids sean únicos en toda la mesa sin llevar contador aparte, que es lo que el reducer valida.
- `toSetup` recorta espacios, rellena el nombre vacío con `fallbackName(i)` (la traducción la pasa la UI: el módulo no importa next-intl) y deja `deckName`/`name` de comandante **sin poner** cuando están vacíos, en vez de guardar `""`.
- `setMode` reajusta `startingLife` al del modo, recorta la mesa a `maxPlayers` y los comandantes a `maxCommanders`.
- `setPlayerCount` conserva lo escrito en los jugadores que siguen y baja `startingSeat` si se queda fuera.
- `cardBackground` viaja como **referencia** (id de tinte), nunca bytes: un data-URI acabaría dentro del log de eventos y del snapshot de `localStorage` (issue #942).

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run src/lib/play/ui/setup-draft.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Escribir `src/components/play/setup-form.tsx`**

Isla cliente. Props: `{ identity: string; mode: MtgMode; prefill: MtgSetup | null }`.

- Cabecera: modo y vidas (`Commander · 40 vidas`).
- Selector de número de jugadores (2–`maxPlayers`), por defecto 4.
- Lista **En la mesa**: una fila por jugador, **cada fila con el color de su asiento** —el que era ciruela en la lista es ciruela en la mesa— con nombre, mazo y comandantes (uno o dos). El orden de la lista **es** el orden de turnos.
- Partner sin campo nuevo: el campo de comandante es una lista de uno o dos; el botón «Añadir comandante» solo aparece si `maxCommanders > 1`.
- **«Personalizar» plegado** (`<details>`), pero enseñando su estado en el resumen: `play.setup.advancedSummary`. Dentro: vidas iniciales y quién empieza.
- Pie: `play.setup.emptyIsFine`. Si viene de revancha, además `play.setup.rematchSeat`.
- Botón **Empezar**: construye el evento y arranca.

```tsx
  const start = () => {
    const setup = toSetup(draft, (i) => t("setup.playerN", { n: i + 1 }));
    const store = getPlayStore(identity);
    // Una sola partida activa (spec §4): si ya hay uNA, `start()` LANZA. La UI lo
    // intercepta antes — aquí se descarta la vieja porque el usuario acaba de
    // pedir empezar otra, que es exactamente lo que hace la revancha.
    if (store.getSnapshot()) store.discard();
    const event = makeEvent("game_started", { toolId: "mtg" as const, setup }, Date.now());
    if (!store.start(event)) return; // setup inválido: el formulario no navega
    rememberTable(identity, setup); // la mesa se recuerda AL EMPEZAR, no al terminar
    router.push("/partida/activa");
  };
```

- [ ] **Step 6: Escribir `src/app/partidas/mtg/nueva/page.tsx`**

Shell de servidor: lee `searchParams.modo` (valida contra `MTG_MODE_IDS`, cae a `commander`), lee la identidad y pinta `<SetupForm>` dentro de `<PlayFrame>`. El prerrelleno lo lee el propio formulario en cliente (`readRememberedTable` toca `localStorage`), no el servidor.

**La topbar sigue puesta aquí**: el corte a pantalla completa llega en el tablero, y es deliberado — entrar en el tablero tiene que sentirse como sentarse a la mesa.

- [ ] **Step 7: Verificar en el navegador**

Abrir `/partidas/mtg/nueva?modo=commander`: cuatro filas rellenas y el botón activo sin escribir nada. Empezar → debe navegar a `/partida/activa` (que aún no existe: 404 esperado en esta task; la Task 9 la crea). Comprobar en DevTools que `localStorage` tiene ya `biblioshare:play:anon:active` y `biblioshare:play:anon:table`.

- [ ] **Step 8: Typecheck, lint y commit**

Run: `npx tsc --noEmit && npx eslint src/lib/play src/components/play src/app/partidas --max-warnings=0`

```bash
git add src/lib/play/ui/setup-draft.ts src/lib/play/ui/setup-draft.test.ts src/components/play/setup-form.tsx src/app/partidas/mtg/nueva
git commit -m "feat(play): configuracion de partida con partner y prerrelleno (#931)"
```

---

### Task 8: Navegación anónima, e2e de PR-3 y apertura de la PR

**Files:**
- Create: `e2e/partidas-navegacion.spec.ts`
- Modify: `e2e/ia-navegacion.spec.ts` (si asume el número de entradas de «Tú»)

**Interfaces:**
- Consumes: las rutas de las tasks 5–7.
- Produces: el gate de PR-3 («navegable e2e»).

- [ ] **Step 1: Comprobar que el anónimo YA puede entrar (y no tocar `proxy.ts` si no hace falta)**

La spec pedía «ajustar `src/proxy.ts` para que `/partidas*` no exija sesión». **Verificar antes de tocar nada**: `src/lib/supabase/proxy.ts` hace `if (!user) return response;` — el proxy no bloquea rutas de app para el anónimo; quien redirige a `/login` es cada página con `getCurrentUser()` + `redirect(loginHref(...))`. Las páginas de Play no lo hacen.

Run: `npx playwright test e2e/partidas-navegacion.spec.ts --grep anónimo` (tras el Step 2)
Si el anónimo entra sin redirección, **no se toca `proxy.ts`** y se anota en el cuerpo de la PR que la línea de la spec era innecesaria. Si hubiera redirección, arreglar la página concreta que la provoca, no el proxy.

- [ ] **Step 2: Escribir `e2e/partidas-navegacion.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

// Sin backend: la limpieza es borrar localStorage, sin maquinaria REST (spec §8).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
    } catch {}
  });
});

test("anónimo llega a Partidas y puede empezar una partida sin cuenta", async ({ page }) => {
  await page.goto("/partidas");
  await expect(page.getByRole("heading", { name: "Partidas" })).toBeVisible();
  await expect(page).not.toHaveURL(/\/login/);

  await page.getByRole("link", { name: /magic/i }).first().click();
  await expect(page).toHaveURL(/\/partidas\/mtg$/);

  await page.getByRole("link", { name: /nueva partida/i }).click();
  await expect(page).toHaveURL(/\/partidas\/mtg\/nueva/);

  // Cero es un camino de primera: se empieza sin escribir nada.
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
});

test("el hub enseña la partida en curso y vuelve a ella", async ({ page }) => {
  await page.goto("/partidas/mtg/nueva?modo=commander");
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);

  await page.goto("/partidas");
  const banner = page.getByRole("link", { name: /partida en curso|turno/i });
  await expect(banner).toBeVisible();
  await banner.click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
});

test("Duelo empieza con 20 vidas y sin daño de comandante", async ({ page }) => {
  await page.goto("/partidas/mtg");
  await page.getByRole("button", { name: /duelo/i }).click();
  await page.getByRole("link", { name: /nueva partida/i }).click();
  await expect(page.getByText(/20 vidas/)).toBeVisible();
});
```

- [ ] **Step 3: Correr el e2e**

Run: `npm run test:e2e -- e2e/partidas-navegacion.spec.ts`
Expected: 3 passed. (Reutiliza el `next dev` que ya haya en 3000; no levantar otro.)

Nota: el tercer test y el final del primero tocan `/partida/activa`, que no existe hasta la Task 9. Si esta task se ejecuta antes, marcar esas dos aserciones con `test.fixme` y quitarlas en la Task 14 — **pero dejar el resto verde**, que es el gate de PR-3.

- [ ] **Step 4: Suite completa y apertura de la PR**

Run: `npm test && npx tsc --noEmit && npx eslint . --max-warnings=0`
Expected: toda la suite en verde.

```bash
git add e2e
git commit -m "test(play): recorrido de navegacion de Partidas sin cuenta (#931)"
git push -u origin feat/play-ui-fase-1
```

El cuerpo va en un fichero, no por sustitución de procesos: el shell por defecto de este repo es PowerShell y `<(...)` es un error de sintaxis ahí. Escribir el cuerpo en un fichero temporal y:

```bash
gh pr create --title "feat(play): hubs, configuracion y navegacion de BiblioPlay (#931)" --body-file pr-3-body.md
```

En el cuerpo: qué entra, qué queda para PR-4, y **la nota sobre `proxy.ts`** (tocado o no, con el motivo).

---

### Task 9: Cáscara del tablero — ruta a pantalla completa, reparto y vidas

**Files:**
- Create: `src/app/partida/layout.tsx`
- Create: `src/app/partida/activa/page.tsx`
- Create: `src/components/play/game-screen.tsx`
- Create: `src/components/play/game-board.tsx`
- Create: `src/components/play/player-panel.tsx`
- Create: `src/components/play/use-wake-lock.ts`
- Create: `src/components/nav/fullscreen-routes.ts`
- Create: `src/components/nav/chrome-gate.tsx`
- Modify: `src/components/nav/app-shell.tsx`
- Modify: `src/components/nav/bottom-nav.tsx`
- Modify: `src/components/play/tool-views.tsx` (añadir `Board` al registro)
- Test: `src/components/nav/fullscreen-routes.test.ts`

**Interfaces:**
- Consumes: `useActiveGame`, `resolveLayout`, `defaultLayout`, `lifeFontSize`, `seatAccent`, `preferencesStore`, `playTools`.
- Produces:
  - `isFullscreenRoute(pathname: string): boolean`
  - `ToolView` gana `Board: ComponentType<{ game: ActiveGame; store: PlayStore; identity: string }>` (`ActiveGame`/`PlayStore` de `@/lib/play/core/store`)
  - `<GameScreen identity={string} />`, `<GameBoard game store identity />`, `<PlayerPanel …>`, `useWakeLock(enabled: boolean)`

- [ ] **Step 1: Escribir el test de las rutas a pantalla completa**

`src/components/nav/fullscreen-routes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isFullscreenRoute } from "./fullscreen-routes";

describe("rutas que se comen el marco de la app", () => {
  it("el tablero sí: es la única pantalla que quita topbar y barra de cinco", () => {
    expect(isFullscreenRoute("/partida/activa")).toBe(true);
  });

  it("los hubs de Partidas NO: la subapp empieza dentro del marco", () => {
    expect(isFullscreenRoute("/partidas")).toBe(false);
    expect(isFullscreenRoute("/partidas/mtg")).toBe(false);
    expect(isFullscreenRoute("/partidas/mtg/nueva")).toBe(false);
  });

  it("no se lleva por delante rutas que empiezan igual", () => {
    expect(isFullscreenRoute("/partidas")).toBe(false);
    expect(isFullscreenRoute("/")).toBe(false);
  });
});
```

- [ ] **Step 2: Correr para verlo fallar**

Run: `npx vitest run src/components/nav/fullscreen-routes.test.ts`
Expected: FAIL — `Failed to resolve import "./fullscreen-routes"`.

- [ ] **Step 3: Escribir `fullscreen-routes.ts` y `chrome-gate.tsx`**

```ts
// src/components/nav/fullscreen-routes.ts
/**
 * Rutas que se comen el marco de la app. `/partida/activa` es la única pantalla de
 * Biblioshare sin topbar ni barra de cinco, y eso es justo lo que separa
 * «configurar» de «jugar»: la mesa ocupa el dispositivo entero.
 *
 * Ojo con el prefijo: `/partidas` (los hubs) NO entra — ahí el marco se queda.
 */
export function isFullscreenRoute(pathname: string): boolean {
  return pathname === "/partida" || pathname.startsWith("/partida/");
}
```

```tsx
// src/components/nav/chrome-gate.tsx
"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isFullscreenRoute } from "./fullscreen-routes";

/**
 * Deja pasar el chrome (que se renderiza en servidor) salvo en las pantallas a
 * sangre. Mismo mecanismo que usa BottomNav para `/post/*`, elevado a componente
 * porque aquí hay que retirar TAMBIÉN la topbar, y `Header` es de servidor.
 */
export function ChromeGate({ children }: { children: ReactNode }) {
  if (isFullscreenRoute(usePathname())) return null;
  return <>{children}</>;
}
```

En `app-shell.tsx`, envolver los DOS `<Suspense>` (el de `SessionChrome` y el de `SessionNav`) con `<ChromeGate>`. En `bottom-nav.tsx`, añadir la comprobación junto a la de `/post/`:

```ts
  if (pathname.startsWith("/post/") || isFullscreenRoute(pathname)) return null;
```

(Se pone en los dos sitios a propósito: el gate quita el árbol entero, y la comprobación de `BottomNav` la deja correcta aunque alguien la use fuera del armazón.)

- [ ] **Step 4: Escribir `use-wake-lock.ts`**

```tsx
"use client";

import { useEffect } from "react";

/**
 * Screen Wake Lock mientras hay partida. **Best-effort**: la API no existe en todos
 * los navegadores y el navegador puede soltar el bloqueo cuando le apetezca, así que
 * todo va en `try/catch` y se REPIDE al volver a ser visible — al minimizar, el
 * sistema lo suelta y no lo devuelve solo.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        sentinel = (await navigator.wakeLock?.request("screen")) ?? null;
        if (cancelled) await sentinel?.release();
      } catch {
        // Sin wake lock se juega igual, solo se apaga la pantalla sola.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
```

- [ ] **Step 5: Escribir la ruta y `game-screen.tsx`**

`src/app/partida/layout.tsx`: `<RouteMessages ns={["play"]}>`.

`src/app/partida/activa/page.tsx`: shell de servidor que lee la identidad y pinta `<GameScreen identity={…} />`. `export const metadata = { title: "Partida — Biblioshare" }`.

`game-screen.tsx` (cliente):

```tsx
"use client";

// Resuelve el toolId del snapshot contra el registro de UI (spec §6). Sin partida
// activa no se redirige en silencio: se enseña el vacío con salida — un `router.push`
// aquí compite con el que acaba de traernos y deja la navegación atrás rota.
```

Estructura: si `!game` → estado vacío con enlace a `/partidas`. Si `game.state.status === "finished"` → `<GameSummary>` (Task 13). Si no → `<GameBoard>`. Contenedor `h-dvh w-full overflow-hidden bg-play-felt`.

- [ ] **Step 6: Escribir `game-board.tsx`**

- Resuelve el reparto: `const family = prefs.layout === "auto" ? defaultLayout(n, prefs.orientation) : prefs.layout;` y `resolveLayout(n, prefs.orientation, family)`.
- Pinta un `<div>` con `style={{ display: "grid", gridTemplateColumns: layout.columns, gridTemplateRows: layout.rows, gridTemplateAreas: layout.areas }}`.
- **El orden del DOM es el orden de asientos, siempre.** La rotación es solo `transform` (spec §7, accesibilidad): quien navega con teclado o lector recorre la mesa en orden de asiento aunque en pantalla estén girados.
- Un asiento lateral (rotación ±90) necesita una caja interior con las **dimensiones intercambiadas** antes de rotar: `transform: rotate()` NO cambia la caja de layout. Es la trampa que ya costó una iteración en el canvas.
- Región `aria-live="polite"` **única** en el tablero, que anuncia el último evento con `playTools[toolId].describe(...)` traducido por `play.log.*`, y el cambio de turno. Una por pantalla, no una por panel.
- Llama a `useWakeLock(prefs.keepAwake)`.

- [ ] **Step 7: Escribir `player-panel.tsx`**

- Cabecera pequeña: nombre + comandante(s), y las insignias de monarca/iniciativa de quien las tenga. **La cabecera es pulsable** y abre la hoja del jugador (Task 12): tocar el nombre, no una pulsación larga — no se descubre, no tiene equivalente con teclado y compite con los gestos nativos del navegador. La pulsación larga puede existir como atajo, nunca como única vía.
- **Padding lateral fijo en la cabecera**, siempre: el hueco de la consola flotante se RESERVA, no se supone (decisión 2026-08-29 (6), invariante 1). La variante que confiaba en que ahí no hubiera nada se cae con un nombre largo o una insignia.
- Mitades izquierda/derecha = **botones reales** de media cara (−1 / +1), con `aria-label` desde `play.board.minusOne` / `plusOne`. En reposo, un − y un + muy tenues; al pulsar, la mitad se tiñe del `tint` del asiento. Es feedback de la ficha, no genérico.
- El número: `font-mono` (Geist Mono), `font-variant-numeric: tabular-nums`, tamaño de `lifeFontSize` a partir del tamaño medido del panel (`ResizeObserver`) y del número de dígitos. Tabular por construcción: al bajar de 10 a 9 el número no se descoloca.
- Tocar el número abre el teclado grande (−10/−5/+5/+10 y valor exacto), dentro del panel y **heredando la rotación**: quien está sentado ahí lo ve derecho.
- Eliminado: panel atenuado y visible, nunca escondido.

- [ ] **Step 8: Verificar en el navegador**

Empezar una partida de 4 y comprobar: sin topbar ni barra inferior; cuatro paneles con la fila de arriba girada; ±1 responde; el número no baila al cambiar de 10 a 9; al volver a `/partidas` reaparece el chrome.

Comprobar también con 2, 3, 5 y 6 jugadores, y girando desde el menú cuando exista (Task 12). Mientras tanto se puede forzar la orientación escribiendo la preferencia a mano en `localStorage`.

- [ ] **Step 9: Correr tests y commit**

Run: `npx vitest run src/components/nav/fullscreen-routes.test.ts && npx tsc --noEmit && npx eslint src --max-warnings=0`

```bash
git add src/app/partida src/components/play src/components/nav
git commit -m "feat(play): tablero a pantalla completa con reparto y contador de vidas (#931)"
```

---

### Task 10: Veneno, daño de comandante y su desglose

**Files:**
- Create: `src/lib/play/ui/damage-strip.ts`
- Test: `src/lib/play/ui/damage-strip.test.ts`
- Create: `src/components/play/damage-overlay.tsx`
- Modify: `src/components/play/player-panel.tsx`

**Interfaces:**
- Consumes: `commanderDamageBreakdown`, `lossConditions` de `@/lib/play/mtg/rules`; `modeConfig`.
- Produces: `fitDamageChips(rows, capacity): { visible: CommanderDamageRow[]; overflow: number }`.

- [ ] **Step 1: Escribir el test**

`src/lib/play/ui/damage-strip.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fitDamageChips } from "./damage-strip";

const fila = (commanderId: string, amount: number, lethal = false) => ({
  commanderId,
  commanderName: commanderId,
  sourceId: commanderId.slice(0, -3),
  amount,
  lethal,
});

describe("qué fichas de daño caben en la tira", () => {
  it("si caben todas, no hay resumen", () => {
    const rows = [fila("ana-c1", 5), fila("borja-c1", 3)];
    expect(fitDamageChips(rows, 3)).toEqual({ visible: rows, overflow: 0 });
  });

  it("lo que no cabe se cuenta, no se esconde en silencio", () => {
    const rows = [fila("ana-c1", 5), fila("borja-c1", 3), fila("carlos-c1", 1)];
    const fit = fitDamageChips(rows, 2);
    expect(fit.visible).toHaveLength(2);
    expect(fit.overflow).toBe(1);
  });

  it("las letales SIEMPRE se ven, aunque lleguen las últimas", () => {
    // La condición de derrota son 21 de UN MISMO comandante: esconder la que ya
    // ha llegado sería esconder justo la que decide la partida.
    const rows = [fila("ana-c1", 2), fila("borja-c1", 3), fila("carlos-c1", 21, true)];
    const fit = fitDamageChips(rows, 1);
    expect(fit.visible.map((r) => r.commanderId)).toEqual(["carlos-c1"]);
    expect(fit.overflow).toBe(2);
  });

  it("si hay más letales que hueco, se enseñan todas: el hueco cede, no la información", () => {
    const rows = [fila("ana-c1", 21, true), fila("borja-c1", 22, true), fila("carlos-c1", 4)];
    const fit = fitDamageChips(rows, 1);
    expect(fit.visible).toHaveLength(2);
    expect(fit.visible.every((r) => r.lethal)).toBe(true);
    expect(fit.overflow).toBe(1);
  });

  it("lo visible conserva el orden de asiento, no el de prioridad", () => {
    // Si no, los números bailarían de sitio entre toques.
    const rows = [fila("ana-c1", 2), fila("borja-c1", 21, true), fila("carlos-c1", 3)];
    const fit = fitDamageChips(rows, 2);
    expect(fit.visible.map((r) => r.commanderId)).toEqual(["ana-c1", "borja-c1"]);
  });

  it("sin daño recibido, ni fichas ni resumen", () => {
    expect(fitDamageChips([], 3)).toEqual({ visible: [], overflow: 0 });
  });
});
```

- [ ] **Step 2: Correr para verlo fallar**

Run: `npx vitest run src/lib/play/ui/damage-strip.test.ts`
Expected: FAIL — `Failed to resolve import "./damage-strip"`.

- [ ] **Step 3: Escribir `src/lib/play/ui/damage-strip.ts`**

Regla: se eligen primero **todas** las letales, luego las demás por orden de asiento hasta `capacity`; lo elegido se devuelve **reordenado por posición original** y el resto se cuenta en `overflow`. La firma toma las filas tal cual las da `commanderDamageBreakdown` (ya vienen en orden de asiento).

- [ ] **Step 4: Correr los tests**

Run: `npx vitest run src/lib/play/ui/damage-strip.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Botones de veneno y comandante en el panel**

Sustituyen a los chips de 10 px del prototipo:

- **44 px de alto de DIBUJO**, no 40 con área virtual: `.seat` lleva `overflow: hidden` y eso recorta el pseudo-elemento de `tap-44` — lo advierte el propio `globals.css`. Donde la utilidad no llega, el control mide lo que se toca.
- Medio panel de ancho cada uno: veneno a la izquierda, daño de comandante a la derecha, **siempre en el mismo sitio y siempre con su número**. Se pulsan con el pulgar sin mirar, que es como se juega.
- En paneles muy estrechos (reparto de 5) dejan de compartir fila y se **apilan**: ahí sobra alto y falta ancho.
- Estado letal (veneno ≥ umbral, o 21 de un mismo comandante — de `lossConditions`): rojo **y rayado**, y el número letal con una regla debajo. **Nunca solo color** (WCAG 1.4.1). Los avisos intermedios se quedan en color.
- Iconos: SVG de `src/components/ui/icons.tsx`, no los glifos ☠/⚔ del canvas (provisionales).
- Monarca e iniciativa **no** son botones: son un testigo que solo tiene una persona y se pulsan una vez cada muchos turnos. Bajan a la hoja del jugador (Task 12); en el panel queda solo la insignia de quien los tiene.

- [ ] **Step 6: Escribir `damage-overlay.tsx`**

- Se abre desde el botón de comandante y **vive dentro del panel**, heredando su rotación: quien está sentado ahí lo ve derecho.
- Una fila por comandante rival, **no por jugador**: con partner son dos filas (Tymna y Thrasios son dos cuentas de 21 distintas). Ordenado por comandante, con el nombre del jugador detrás en gris — lo que hace el daño es la criatura.
- Cada fila: `+1` y `+5`. Tres toques para `Carlos → Atraxa → +5`, y sale **un único evento** porque la ráfaga los fusiona (`store.tap`).
- Un rival a cero **no ocupa sitio** en la tira del panel: sin daño, la tira dice `play.board.noDamage` y es la entrada al reparto. Sin esto, una mesa de 6 con partner tendría hasta diez cifras por panel.
- Nunca dos contadores a mano: `commander_damage` toca vidas Y daño en el mismo evento.

- [ ] **Step 7: Verificar en el navegador**

Partida de 4 con partner en un asiento. Comprobar: la tira enseña una ficha por comandante que haya pegado; al llegar a 21 se raya y sigue visible aunque el panel sea estrecho; el overlay del panel de arriba se lee del derecho desde el otro lado de la mesa; el daño baja las vidas en el mismo gesto.

- [ ] **Step 8: Commit**

Run: `npx tsc --noEmit && npx eslint src --max-warnings=0`

```bash
git add src/lib/play/ui/damage-strip.ts src/lib/play/ui/damage-strip.test.ts src/components/play
git commit -m "feat(play): veneno y dano de comandante desglosado por comandante (#931)"
```

---

### Task 11: La consola — deshacer etiquetado, turno, crono y menú

**Files:**
- Create: `src/components/play/center-console.tsx`
- Create: `src/components/play/game-clock.tsx`
- Modify: `src/components/play/game-board.tsx`

**Interfaces:**
- Consumes: `formatElapsed`, `playTools[toolId].describe`, `store.undo()`, `store.dispatch()`.
- Produces: `<CenterConsole game store mode={ConsoleMode} onOpenMenu />`, `<GameClock startedAt={number} />`. Recibe `game` entero, no solo `game.state`: la etiqueta de deshacer sale del ÚLTIMO evento del log (`game.log.pending ?? game.log.committed.at(-1)`), que no está en el estado derivado.

- [ ] **Step 1: Escribir `game-clock.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatElapsed } from "@/lib/play/ui/clock";

/**
 * El crono vive AISLADO en su propio componente a propósito: un reloj dentro del
 * componente que escucha el store repinta el tablero entero cada segundo durante
 * horas, y con el wake lock puesto eso es batería que se va sin que nadie lo pida.
 * Aquí el `setInterval` solo re-renderiza este `<span>`.
 */
export function GameClock({ startedAt }: { startedAt: number }) {
  const t = useTranslations("play");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const text = formatElapsed(now - startedAt);
  return (
    <span className="font-mono text-[11px] tabular-nums text-muted-foreground" aria-label={t("console.elapsed", { time: text })}>
      {text}
    </span>
  );
}
```

- [ ] **Step 2: Escribir `center-console.tsx`**

Contenido, de izquierda a derecha: **deshacer**, **turno** (`Turno N · Nombre →`, pasar turno en un toque), **crono**, **menú (•••)**.

Invariantes que hay que respetar (decisión 2026-08-29 (6)):

- **Deshacer nunca pierde la etiqueta de QUÉ deshace.** Puede perder la palabra «Deshacer» —la flecha ya lo dice— pero no el «Ana −1»: sin eso hay que pulsar y mirar, que son dos acciones donde había una. El texto completo va en el `aria-label` (`play.console.undo`).
- La etiqueta sale de `playTools[toolId].describe(evento, estado)` traducido por `play.log.*`, nunca de una cadena montada a mano en el componente.
- Sin nada que deshacer, el botón va deshabilitado con `play.console.nothingToUndo` (`game_started` no es deshacible: lo garantiza `core/log.ts`).

Dos tratamientos según `mode`:

- `band` (vertical): banda a todo el ancho entre las dos filas, en el área `cons` de la rejilla.
- `floating` (horizontal): la consola sale del hueco y va **flotando en el centro** sobre paneles a pantalla completa, con la junta de fieltro. El área `cons` mide 0 en la rejilla; la consola se posiciona `absolute` centrada. El hueco bajo ella **ya está reservado** por el padding de las cabeceras (Task 9), no se supone vacío.

- [ ] **Step 3: Verificar en el navegador**

Vertical y horizontal, claro y oscuro. Comprobar que la etiqueta de deshacer sobrevive en el panel más estrecho (la de 6 jugadores) sin recortarse a puntos suspensivos, y que el crono no repinta el tablero (React DevTools → Highlight updates: solo parpadea el `<span>`).

- [ ] **Step 4: Commit**

Run: `npx tsc --noEmit && npx eslint src --max-warnings=0`

```bash
git add src/components/play
git commit -m "feat(play): consola con deshacer etiquetado, turno y crono aislado (#931)"
```

---

### Task 12: Las dos hojas — jugador y partida

**Files:**
- Create: `src/components/play/play-sheet.tsx`
- Create: `src/components/play/player-sheet.tsx`
- Create: `src/components/play/game-sheet.tsx`

**Interfaces:**
- Consumes: `preferencesStore`/`writePreferences`, `layoutOptions`, `store.dispatch`, `store.discard`.
- Produces: `<PlaySheet title caption onClose>`, `<PlayerSheet …>`, `<GameSheet …>`.

- [ ] **Step 1: Escribir `play-sheet.tsx`**

Copiar la anatomía de `src/components/saga/sheet-shell.tsx` —`<dialog>` nativo con `showModal()`, que trae gratis Escape, trampa de foco e `inert` del fondo— cambiando el namespace de i18n a `play` (`inv-t-no-cruza`: un componente de Play no lee `sagaEditor`).

**Copiar también las dos guardas, que son bugs ya documentados:**

1. Cerrar el `<dialog>` al cambiar `pathname`: con Cache Components la hoja **no se desmonta** en navegación soft y quedaría con `open=true` fuera del top layer, rota e incerrable (#448).
2. Cierre al pulsar el fondo comparando `e.target === ref.current`.

- [ ] **Step 2: Escribir `player-sheet.tsx`**

**La regla del reparto:** si la acción necesita responder «¿a quién?», vive en la hoja de esa persona. Si no, en la de la partida. Por eso «Gana la partida» y «Marcar como eliminado» están aquí, y «Finalizar» está en la otra, aunque las tres acaben la partida.

Ítems: fijar vidas exactas · darle el monarca · darle la iniciativa · fondo de la tarjeta · gana la partida · marcar como eliminado (o devolver a la partida si ya lo está). Cabecera: nombre, asiento y vidas.

**Fondo de la tarjeta**: los seis tintes de asiento en suave, elegibles. Viaja en `cardBackground` como **referencia**, nunca bytes. El avatar del perfil y el arte del comandante necesitan red y quedan fuera de la fase local-first (issue #942). Dos invariantes desde ya: el fondo va **siempre bajo un velo de `--surface`**, para que el número se lea por el velo y no por la suerte de la imagen; y la barra del asiento **no desaparece nunca** — el color de asiento es del sistema, el fondo es del jugador.

**Editar nombre y comandantes NO está**: no existe el evento. El contrato solo define eventos de juego, y cambiar los datos de un participante con la partida empezada necesita uno nuevo — renombrar sería casi inocuo, pero **añadir o quitar un comandante cambia las claves de `commanderDamage`**. Está abierto como issue #943; no se maqueta.

- [ ] **Step 3: Escribir `game-sheet.tsx`**

Dos secciones. **Turno**: deshacer (con su etiqueta) y pasar el turno a *quien toque*. **Partida**: girar la mesa · repartir la mesa · mantener la pantalla encendida · finalizar · descartar.

- Cada ítem **enseña su estado actual** a la derecha (`vertical`, `mesa`, `sí`), que es lo que evita tener que abrir para saber cómo está.
- «Repartir la mesa» ofrece solo `layoutOptions(nJugadores, orientación)` más `auto`. A 2 jugadores no hay cabecera; a 6 las dos cabeceras solo aparecen tumbado.
- Girar vive aquí y no en el sensor del móvil: girar sin querer recolocaría la mesa delante de cuatro personas en mitad de un turno. Así es una decisión, no un accidente.
- «Descartar» pide confirmación: borra la partida entera.

- [ ] **Step 4: Las hojas NO giran**

A diferencia del overlay de daño, estas salen de abajo y **sin rotar**: las abre quien tiene el móvil en la mano.

- [ ] **Step 5: Verificar en el navegador y con teclado**

Abrir la hoja del jugador **tocando el nombre** (no con pulsación larga). Con teclado: `Tab` hasta la cabecera, `Enter`, moverse por los ítems, `Escape` para cerrar y comprobar que el foco vuelve a la cabecera. Sin topbar ni barra inferior, la salida y el menú tienen que ser alcanzables por teclado y visibles.

- [ ] **Step 6: Commit**

Run: `npx tsc --noEmit && npx eslint src --max-warnings=0`

```bash
git add src/components/play
git commit -m "feat(play): hoja de jugador y hoja de partida (#931)"
```

---

### Task 13: Resumen final y revancha

**Files:**
- Create: `src/components/play/game-summary.tsx`
- Modify: `src/components/play/tool-views.tsx` (añadir `Summary` y `Board` al registro)
- Modify: `src/components/play/setup-form.tsx` (aceptar el prerrelleno de revancha)

**Interfaces:**
- Consumes: `finalRanking` de `@/lib/play/mtg/selectors`; `readRememberedTable`, `rotateStartingSeat`; `useCelebration`; el `ToolView` de la Task 9.
- Produces: `<GameSummary game store identity />` y `ToolView.Summary`, con la MISMA firma de props que `Board` (`{ game, store, identity }`): así `game-screen.tsx` elige uno u otro por `status` sin cambiar de forma los argumentos.

- [ ] **Step 1: Escribir `game-summary.tsx`**

- Titular: **«Gana {nombre}»** con la razón debajo (`play.summary.reason.*`). Ganar por una carta que lo declara es una condición de primera clase, no una nota al pie de «último en pie».
- **Clasificación** desde `finalRanking(state)` tal cual: ganador 1.º, los vivos no ganadores **comparten** posición, y los eliminados en **orden inverso de eliminación** (el último en caer es el 2.º). La numeración 1-2-2-4 sale del selector; **no se inventa aquí ninguna regla de empate**. Compartir número de turno **no** es simultaneidad: eso habría que modelarlo explícitamente y no está.
- Duración (`formatElapsed(finishedAt - startedAt)`) y turnos.
- **Revancha** es la acción de acento y va primera: cuando una partida acaba, lo probable es que haya otra, no que se cierre la app. Descartar queda como secundaria. Guardar el historial llega en la fase 5 y **no se pinta deshabilitado** — un botón apagado que nadie sabe por qué está apagado es peor que no tenerlo.
- Revancha navega a `/partidas/mtg/nueva?revancha=1` y **no descarta nada todavía**: si te vuelves atrás, el resumen sigue ahí. La partida vieja se sustituye cuando la nueva arranca de verdad, que es lo que exige la regla de una sola partida activa.
- Celebración de entrada con `useCelebration` (el `CelebrationProvider` ya existe), **detrás de `prefers-reduced-motion`** como todo lo demás. Es el único momento de la subapp que se permite una animación de entrada.

- [ ] **Step 2: Enganchar la revancha en el formulario**

`setup-form.tsx`: cuando la URL trae `revancha=1`, el prerrelleno es `rotateStartingSeat(readRememberedTable(identity))` y se enseña `play.setup.rematchSeat` al pie. Sin mesa recordada, se abre en blanco como cualquier partida nueva.

- [ ] **Step 3: Verificar en el navegador**

Terminar una partida (declarar ganador desde la hoja del jugador, o finalizar desde la de partida) y comprobar: ranking correcto con un vivo no ganador compartiendo puesto; revancha abre la configuración con la mesa puesta y **el turno rotado un asiento**; volver atrás deja el resumen intacto; empezar la nueva sustituye la vieja.

- [ ] **Step 4: Commit**

Run: `npx tsc --noEmit && npx eslint src --max-warnings=0`

```bash
git add src/components/play
git commit -m "feat(play): resumen final con clasificacion derivada y revancha (#931)"
```

---

### Task 14: e2e de la partida, accesibilidad y cierre documental

**Files:**
- Create: `e2e/partidas-mtg.spec.ts`
- Modify: `e2e/partidas-navegacion.spec.ts` (quitar los `test.fixme` de la Task 8)
- Modify: `docs/requirements/decisiones.md`
- Modify: `docs/requirements/backlog.md`
- Modify: `docs/architecture/graph.json` (regenerado)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: el gate de la Fase 1 — «partida de 4 jugadores cómoda en móvil, acciones habituales en 1–2 toques».

- [ ] **Step 1: Escribir `e2e/partidas-mtg.spec.ts`**

Recorrido completo, sin backend (la limpieza es borrar `localStorage`):

```ts
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } }); // la mesa se juega en móvil

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
    } catch {}
  });
});

test("crear, jugar, deshacer, terminar y revancha", async ({ page }) => {
  await page.goto("/partidas/mtg/nueva?modo=commander");
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);

  // Sin marco: es la única pantalla de la app que se lo come.
  await expect(page.getByRole("navigation")).toHaveCount(0);

  // Una vida menos en UN toque.
  await page.getByRole("button", { name: /quitar una vida a jugador 1/i }).click();
  await expect(page.getByLabel(/vidas de jugador 1/i)).toHaveText("39");

  // Deshacer dice QUÉ deshace.
  const undo = page.getByRole("button", { name: /deshacer/i });
  await expect(undo).toHaveAttribute("aria-label", /jugador 1/i);
  await undo.click();
  await expect(page.getByLabel(/vidas de jugador 1/i)).toHaveText("40");

  // Rehidratación: la partida sobrevive a cerrar la pestaña.
  await page.reload();
  await expect(page.getByLabel(/vidas de jugador 1/i)).toHaveText("40");

  // Turno en un toque.
  await page.getByRole("button", { name: /pasar el turno/i }).click();
  await expect(page.getByText(/turno/i).first()).toBeVisible();
});

test("daño de comandante: tres toques y un solo evento, con las vidas ya bajadas", async ({ page }) => {
  await page.goto("/partidas/mtg/nueva?modo=commander");
  await page.getByRole("button", { name: /^empezar$/i }).click();

  await page.getByRole("button", { name: /daño de comandante de jugador 1/i }).click();
  await page.getByRole("button", { name: /\+5/ }).first().click();
  await expect(page.getByLabel(/vidas de jugador 1/i)).toHaveText("35");
});

test("descartar deja el tablero vacío y devuelve al hub", async ({ page }) => {
  await page.goto("/partidas/mtg/nueva?modo=commander");
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await page.getByRole("button", { name: /acciones de la partida/i }).click();
  await page.getByRole("button", { name: /descartar/i }).click();
  await page.getByRole("button", { name: /descartar/i }).last().click(); // confirmación
  await expect(page.getByText(/no hay ninguna partida/i)).toBeVisible();
});
```

- [ ] **Step 2: Correr el e2e**

Run: `npm run test:e2e -- e2e/partidas-mtg.spec.ts e2e/partidas-navegacion.spec.ts`
Expected: todo verde. Si un selector no encuentra el control, **arreglar la etiqueta del componente** (probablemente le falta `aria-label`), no relajar el selector: estos tests son también la prueba de que la pantalla es alcanzable sin ver.

- [ ] **Step 3: Auditoría de accesibilidad de la pantalla sin marco**

Comprobar a mano, porque es lo que más fácil se rompe en una pantalla a sangre:

1. El orden del DOM es el de asientos aunque estén girados (recorrer con `Tab` y ver que va 1, 2, 3, 4).
2. Todos los botones tienen etiqueta, no solo símbolo: −/+, veneno, comandante, deshacer, turno, menú.
3. Hay **una** región `aria-live="polite"` y anuncia el último evento y el cambio de turno.
4. Los `<dialog>` no atrapan el foco fuera de sí mismos y `Escape` los cierra.
5. Las micro-interacciones y la celebración respetan `prefers-reduced-motion`.
6. El estado letal no depende solo del color (rayado + regla).

Run: `npm run test:e2e -- e2e/a11y-landmark-main.spec.ts e2e/movil-areas-tactiles.spec.ts`
Expected: sin regresiones (la pantalla sin marco es justo el tipo de cosa que rompe el test de landmarks).

- [ ] **Step 4: Cierre documental (definición de «hecho»)**

1. **`docs/requirements/decisiones.md`** — añadir AL FINAL (append-only) las decisiones de forma que se hayan tomado al implementar y no estuvieran ya escritas. Como mínimo: el mecanismo de ocultar el chrome (`ChromeGate` + `isFullscreenRoute`) y por qué la orientación no sigue al sensor. **No** repetir lo que ya dicen las entradas (6), (7) y (8).
2. **`docs/requirements/backlog.md`** — marcar la casilla de la fase 1 de BiblioPlay.
3. **Esquema**: este plan no toca base de datos, así que `docs/requirements/data-model.md` no se toca (y por lo mismo no aplica la superficie 6 de `DRIFT-CHECK.md`, que es de grants por columna).
4. **Grafo**: `node docs/architecture/sync.mjs` y committear el resultado; el nodo `m-play` gana los ficheros de `src/lib/play/ui/` y los componentes.
5. **Issues** de lo que quede pendiente o se descubra por el camino, con sus tres etiquetas (`area:play` + tipo + prioridad). Candidatas que ya se conocen: el desglose de daño en mesas de 6 con partner si la tira se queda corta, y cualquier límite asumido del wake lock por navegador.

Run: `node docs/architecture/sync.mjs --check`
Expected: OK.

- [ ] **Step 5: Verificación final completa**

```bash
npm test
npx tsc --noEmit
npx eslint . --max-warnings=0
npm run test:e2e -- e2e/partidas-mtg.spec.ts e2e/partidas-navegacion.spec.ts
```
Expected: suite completa en verde, sin errores de tipos ni avisos de lint.

- [ ] **Step 6: Partida real (gate de la Fase 1)**

El gate no lo pasa un test: **jugar una partida de 4 en el móvil**, de principio a fin. Lo que hay que poder decir después: las acciones habituales (±1 vida, pasar turno, deshacer) se hacen en **un toque**; las moderadas (cambio grande, daño de comandante, veneno) en **dos o tres**; y no ha hecho falta llevar ningún contador a mano.

- [ ] **Step 7: Commit y PR-4**

```bash
git add e2e docs
git commit -m "test(play): recorrido completo de una partida y cierre documental (#931)"
git push
```

Si PR-3 ya se mergeó, abrir PR-4 desde la misma rama o una nueva sobre `main`. En el cuerpo: qué se verificó a mano, el resultado del gate de la fase 1 y las issues abiertas.

---

## Al terminar el plan

- La Fase 1 de la issue #931 queda cerrada: se puede montar una partida de Magic, jugarla entera en el móvil y terminarla, sin cuenta y sin red.
- Fuera, con issue propia: pausar el crono (#941), fondos con imagen (#942), evento de actualización de participante (#943), adoptar la partida anónima al entrar (#934), historial y estadísticas (fases 5–7).
