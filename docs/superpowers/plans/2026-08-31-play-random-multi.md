# Aleatorio multi-tirada, facetas y reposo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** N dados y N monedas girando a la vez, facetas de falso 3D en d8/d10/d12/d20, controles de dados en una fila (chips seleccionan + stepper) y texto de reposo que arregla el centrado de los escenarios.

**Architecture:** Único cambio de motor: evento nuevo `coins_flipped` (el `coin_flipped` viejo sigue siendo válido para logs persistidos). La puerta de aterrizaje se generaliza en un hook `useLandingGate` (contador de animationend) compartido por dados y monedas. `DieShape` gana facetas SVG; `DiceStage`/`CoinStage` renderizan filas de objetos; secciones pasan a chips-seleccionan + stepper.

**Tech Stack:** React 19 client components, CSS Modules, next-intl (ICU plural), Vitest, Playwright.

## Global Constraints

- Rama: `feat/play-randomizer-visual` (PR #990) — commits directos, sin worktree.
- `coin_flipped` viejo NO se toca ni se retira del motor (logs IDB deben re-jugar).
- Tokens CSS solo existentes: `--surface-3`, `--surface-muted`, `--border`, `--foreground`.
- Testids `dice-result` / `coin-result`, zonas `aria-live="polite"` y duraciones (dados 900 ms, moneda 1100 ms) se conservan. Stagger 60 ms por objeto.
- Reduced motion: doble cobertura (hook salta puerta + bloque CSS anula animaciones; `.dieSpin` y `.coinFlip` ya están en la lista).
- Límites: dados visibles máx 8, stepper dados 1..8, stepper monedas 1..`COIN_MAX_COUNT` (5).
- Unit tests: `fnm exec --using=22 -- npx.cmd vitest run <path>` (Node 20 del shell rompe vitest).
- e2e: `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts` (reutiliza dev server del puerto 3000; NO arrancar otro).
- `git add` con rutas explícitas, nunca `-A` ni `.`.
- Trailers de commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4`

---

### Task 1: Motor — evento `coins_flipped`

**Files:**
- Modify: `src/lib/play/random/draws.ts`
- Modify: `src/lib/play/random/events.ts`
- Modify: `src/lib/play/random/reducer.ts`
- Modify: `src/lib/play/random/selectors.ts`
- Test: `src/lib/play/random/draws.test.ts`, `src/lib/play/random/reducer.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `COIN_MAX_COUNT = 5` y `flipCoins(count: number, rng?: Rng): ("heads" | "tails")[]` en draws; `CoinsFlippedEvent = PlayEvent<"coins_flipped", { count: number; results: ("heads" | "tails")[] }>` en la unión `RandomEvent`; `describeRandomEvent` devuelve `coinHeads`/`coinTails` con 1 resultado y `{ key: "coins", params: { heads, tails } }` con más. Task 4 emite `coins_flipped` desde la UI.

- [ ] **Step 1: Tests que fallan — draws**

En `src/lib/play/random/draws.test.ts`: añadir `flipCoins` al import de `./draws` (línea 2) y añadir al FINAL del fichero:

```ts
describe("flipCoins", () => {
  it("respeta count y mapea el rng por moneda", () => {
    expect(flipCoins(3, seq(0.2, 0.7, 0.2))).toEqual(["heads", "tails", "heads"]);
  });
  it("rechaza count fuera de 1..5", () => {
    expect(() => flipCoins(0, seq(0))).toThrow();
    expect(() => flipCoins(6, seq(0))).toThrow();
    expect(() => flipCoins(1.5, seq(0))).toThrow();
  });
  it("acepta el máximo exacto (5)", () => {
    expect(flipCoins(5, () => 0)).toEqual(Array(5).fill("heads"));
  });
});
```

- [ ] **Step 2: Tests que fallan — reducer y selectors**

En `src/lib/play/random/reducer.test.ts`:

1. Añadir helper junto a los existentes (tras la línea `const bagDrawn = …`):

```ts
const coins = (results: ("heads" | "tails")[]) =>
  makeEvent("coins_flipped", { count: results.length, results }, t0) as RandomEvent;
```

2. El it `"RESULT_EVENT_TYPES contiene exactamente los 6 eventos de resultado"` pasa a:

```ts
  it("RESULT_EVENT_TYPES contiene exactamente los 7 eventos de resultado", () => {
    expect([...RESULT_EVENT_TYPES].sort()).toEqual(
      [
        "bag_drawn",
        "coin_flipped",
        "coins_flipped",
        "dice_rolled",
        "first_picked",
        "order_drawn",
        "teams_drawn",
      ].sort(),
    );
  });
```

3. Añadir al FINAL del fichero:

```ts
describe("coins_flipped", () => {
  it("válido no cambia el estado", () => {
    const s = initialRandomState();
    expect(randomReducer(s, coins(["heads", "tails", "heads"]))).toBe(s);
  });
  it("rechaza count fuera de 1..5, results descuadrados y valores inválidos", () => {
    const s = initialRandomState();
    const bad = (payload: unknown) =>
      makeEvent("coins_flipped", payload as { count: number; results: ("heads" | "tails")[] }, t0) as RandomEvent;
    expect(() => randomReducer(s, bad({ count: 0, results: [] }))).toThrow();
    expect(() => randomReducer(s, bad({ count: 6, results: Array(6).fill("heads") }))).toThrow();
    expect(() => randomReducer(s, bad({ count: 2, results: ["heads"] }))).toThrow();
    expect(() => randomReducer(s, bad({ count: 1, results: ["edge"] }))).toThrow();
  });
  it("describe: una moneda reusa la copia de siempre; varias, recuentos", () => {
    expect(describeRandomEvent(coins(["heads"])).key).toBe("coinHeads");
    expect(describeRandomEvent(coins(["tails"])).key).toBe("coinTails");
    expect(describeRandomEvent(coins(["heads", "tails", "heads"]))).toEqual({
      key: "coins",
      params: { heads: 2, tails: 1 },
    });
  });
});
```

- [ ] **Step 3: Verificar que fallan**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/random/draws.test.ts src/lib/play/random/reducer.test.ts`
Expected: FAIL (`flipCoins` no exportado; `coins_flipped` evento desconocido).

- [ ] **Step 4: Implementar motor**

`src/lib/play/random/draws.ts` — añadir tras `flipCoin`:

```ts
export const COIN_MAX_COUNT = 5;

export function flipCoins(count: number, rng: Rng = Math.random): ("heads" | "tails")[] {
  if (!Number.isInteger(count) || count < 1 || count > COIN_MAX_COUNT) {
    throw new RangeError(`count fuera de 1..${COIN_MAX_COUNT}`);
  }
  return Array.from({ length: count }, () => flipCoin(rng));
}
```

`src/lib/play/random/events.ts` — bajo `CoinFlippedEvent` añadir:

```ts
// Varias monedas en un solo evento (una tirada = una entrada de feed y un
// deshacer). coin_flipped se conserva por los logs persistidos: la UI ya no
// lo emite, pero el replay lo sigue aceptando.
export type CoinsFlippedEvent = PlayEvent<
  "coins_flipped",
  { count: number; results: ("heads" | "tails")[] }
>;
```

Añadir `| CoinsFlippedEvent` a la unión `RandomEvent` (tras `CoinFlippedEvent`) y `coins_flipped: true,` al `RANDOM_EVENT_TYPE_MAP` (tras `coin_flipped`).

`src/lib/play/random/reducer.ts` — añadir tras `assertDice`:

```ts
function assertCoins(payload: { count: number; results: ("heads" | "tails")[] }): void {
  const { count, results } = payload;
  if (!Number.isInteger(count) || count < 1 || count > 5) throw new Error("count inválido");
  if (results.length !== count) throw new Error("results no cuadra con count");
  for (const r of results) {
    if (r !== "heads" && r !== "tails") throw new Error("resultado inválido");
  }
}
```

Y en el switch, tras el case `coin_flipped`:

```ts
    case "coins_flipped":
      assertCoins(event.payload);
      return state;
```

`src/lib/play/random/selectors.ts` — añadir `"coins_flipped",` al Set `RESULT_EVENT_TYPES` (tras `"coin_flipped",`) y en `describeRandomEvent`, tras el case `coin_flipped`:

```ts
    case "coins_flipped": {
      const { results } = event.payload;
      if (results.length === 1) {
        return { key: results[0] === "heads" ? "coinHeads" : "coinTails", params: {} };
      }
      const heads = results.filter((r) => r === "heads").length;
      return { key: "coins", params: { heads, tails: results.length - heads } };
    }
```

- [ ] **Step 5: Verificar que pasan + typecheck**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/random/draws.test.ts src/lib/play/random/reducer.test.ts`
Expected: PASS.
Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/play/random/draws.ts src/lib/play/random/draws.test.ts src/lib/play/random/events.ts src/lib/play/random/reducer.ts src/lib/play/random/reducer.test.ts src/lib/play/random/selectors.ts
git commit -m "feat(play): evento coins_flipped -- varias monedas en una tirada, coin_flipped sigue valido

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 2: Facetas de falso 3D en `DieShape`

**Files:**
- Modify: `src/components/play/random/stage/die-shape.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `dieShapeFor`, `DieShapeKind` de `./stage-helpers` (sin cambios).
- Produces: misma firma `DieShape({ sides, value, size })` — nadie más cambia.

- [ ] **Step 1: Reescribir `die-shape.tsx`**

Contenido completo del fichero:

```tsx
import { dieShapeFor, type DieShapeKind } from "./stage-helpers";

// Puntos de cada silueta poligonal en viewBox 100×100 (margen para el trazo).
const POLYGONS: Record<Exclude<DieShapeKind, "d6" | "round">, string> = {
  d4: "50,8 94,84 6,84",
  d8: "50,4 96,50 50,96 4,50",
  d10: "50,3 90,40 50,97 10,40",
  d12: "50,6 93.7,37.8 77,89.2 23,89.2 6.3,37.8",
  d20: "50,3 90.7,26.5 90.7,73.5 50,97 9.3,73.5 9.3,26.5",
};

// Centro óptico del texto por silueta: en d8/d10 el número sube a la cara
// frontal que dibujan las facetas; el triángulo carga la masa abajo.
const TEXT_Y: Record<DieShapeKind, number> = {
  d4: 62,
  d6: 50,
  d8: 34,
  d10: 38,
  d12: 52,
  d20: 50,
  round: 50,
};

const LINE = { stroke: "var(--border)", strokeWidth: 2 } as const;
const SHADE = { fill: "var(--surface-muted)" } as const;

// Pentágono del d12 y su cara frontal (mismos vértices a escala 0.55 hacia el
// centro óptico (50,52)).
const D12_OUTER: [number, number][] = [
  [50, 6],
  [93.7, 37.8],
  [77, 89.2],
  [23, 89.2],
  [6.3, 37.8],
];
const D12_INNER: [number, number][] = [
  [50, 26.7],
  [74, 44.2],
  [64.9, 72.5],
  [35.1, 72.5],
  [26, 44.2],
];

// Falso 3D: aristas internas y facetas laterales del poliedro real visto de
// frente. d4/d6/round quedan planos (silueta ya inequívoca).
function Facets({ kind }: { kind: DieShapeKind }) {
  switch (kind) {
    case "d8":
      return (
        <>
          <polygon points="4,50 96,50 50,96" {...SHADE} />
          <line x1="4" y1="50" x2="96" y2="50" {...LINE} />
        </>
      );
    case "d10":
      return (
        <>
          <polygon points="10,40 50,64 50,97" {...SHADE} />
          <polygon points="90,40 50,64 50,97" {...SHADE} />
          <polyline points="10,40 50,64 90,40" fill="none" {...LINE} />
          <line x1="50" y1="64" x2="50" y2="97" {...LINE} />
        </>
      );
    case "d12":
      return (
        <>
          <polygon points={D12_INNER.map((p) => p.join(",")).join(" ")} fill="none" {...LINE} />
          {D12_OUTER.map((p, i) => (
            <line key={i} x1={p[0]} y1={p[1]} x2={D12_INNER[i][0]} y2={D12_INNER[i][1]} {...LINE} />
          ))}
        </>
      );
    case "d20":
      return (
        <>
          <polygon points="50,3 90.7,26.5 90.7,73.5" {...SHADE} />
          <polygon points="50,3 9.3,26.5 9.3,73.5" {...SHADE} />
          <polygon points="9.3,73.5 50,97 90.7,73.5" {...SHADE} />
          <polygon points="50,3 90.7,73.5 9.3,73.5" fill="none" {...LINE} />
        </>
      );
    default:
      return null;
  }
}

/**
 * Dado SVG plano: silueta clásica por número de caras, facetas de falso 3D y
 * el valor en la cara frontal. Presentacional puro; el aria-label lo pone el
 * botón contenedor.
 */
export function DieShape({ sides, value, size }: { sides: number; value: string; size: number }) {
  const kind = dieShapeFor(sides);
  const shapeProps = { fill: "var(--surface-3)", stroke: "var(--border)", strokeWidth: 3 };
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      {kind === "d6" ? (
        <rect x="10" y="10" width="80" height="80" rx="14" {...shapeProps} />
      ) : kind === "round" ? (
        <circle cx="50" cy="50" r="45" {...shapeProps} />
      ) : (
        <polygon points={POLYGONS[kind]} strokeLinejoin="round" {...shapeProps} />
      )}
      <Facets kind={kind} />
      <text
        x="50"
        y={TEXT_Y[kind]}
        textAnchor="middle"
        dominantBaseline="central"
        // Suelo de legibilidad en tamaños mini: a size 30, 35 unidades de
        // viewBox son ~10.5px reales — menos que los 14px del cubo anterior.
        fontSize={size <= 30 ? (value.length >= 3 ? 34 : 44) : value.length >= 3 ? 26 : 35}
        fontWeight="600"
        style={{ fontVariantNumeric: "tabular-nums" }}
        fill="var(--foreground)"
      >
        {value}
      </text>
    </svg>
  );
}
```

- [ ] **Step 2: Verificar**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
Run: `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts` — Expected: 5/5 PASS (cambio solo visual).

- [ ] **Step 3: Commit**

```bash
git add src/components/play/random/stage/die-shape.tsx
git commit -m "feat(play): facetas de falso 3D en d8/d10/d12/d20 -- aristas internas y caras laterales sombreadas

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 3: `useLandingGate` + dados múltiples + controles en una fila

**Files:**
- Create: `src/components/play/random/stage/use-landing-gate.ts`
- Modify: `src/components/play/random/stage/dice-stage.tsx` (reescritura completa)
- Modify: `src/components/play/random/dice-section.tsx` (reescritura completa)
- Modify: `src/components/play/random/stage/stage.module.css` (sección dados)
- Modify: `messages/es.json` (claves de dados)

**Interfaces:**
- Consumes: `DieShape` (Task 2), `buzz`/`useReducedMotion` existentes.
- Produces: `useLandingGate(id: string | null, total: number): { landed: boolean; reduced: boolean; onOneEnd: (e: React.AnimationEvent<HTMLElement>) => void }` — Task 4 lo consume. `DiceStage` pasa a props `{ roll, idleSides, idleCount, resultText, onRoll, label, hint }`.

- [ ] **Step 1: Crear `use-landing-gate.ts`**

```ts
"use client";

import { useRef, useState, type AnimationEvent } from "react";
import { buzz } from "./stage-helpers";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * Puerta de aterrizaje multi-objeto: cuenta los animationend de `total`
 * elementos (guard target === currentTarget) y marca aterrizado con UNA
 * vibración al completarse. Cambiar de id resetea el contador. Reduced motion
 * la salta — el resultado aparece al instante.
 */
export function useLandingGate(
  id: string | null,
  total: number,
): {
  landed: boolean;
  reduced: boolean;
  onOneEnd: (e: AnimationEvent<HTMLElement>) => void;
} {
  const reduced = useReducedMotion();
  const [landedId, setLandedId] = useState<string | null>(null);
  const seen = useRef<{ id: string | null; count: number }>({ id: null, count: 0 });

  function onOneEnd(e: AnimationEvent<HTMLElement>) {
    if (e.target !== e.currentTarget || id === null) return;
    if (seen.current.id !== id) seen.current = { id, count: 0 };
    seen.current.count += 1;
    if (seen.current.count >= total) {
      setLandedId(id);
      buzz();
    }
  }

  return { landed: id !== null && (reduced || landedId === id), reduced, onOneEnd };
}
```

- [ ] **Step 2: Reescribir `dice-stage.tsx`**

Contenido completo:

```tsx
"use client";

import styles from "./stage.module.css";
import { DieShape } from "./die-shape";
import { useLandingGate } from "./use-landing-gate";

const VISIBLE_MAX = 8;

// Tamaño por dados visibles: uno protagonista, muchos compactos.
function dieSize(n: number): number {
  if (n <= 1) return 96;
  if (n === 2) return 80;
  if (n <= 4) return 64;
  return 48;
}

/**
 * Dados SVG que giran a la vez (stagger 60 ms) y aterrizan cada uno en su
 * resultado (teatro determinista: la tirada ya está emitida). En reposo
 * enseña la config del stepper con «?» y el hint que centra el escenario.
 * Más de VISIBLE_MAX resultados (logs antiguos): giran 8 y el texto con el
 * total manda.
 */
export function DiceStage({
  roll,
  idleSides,
  idleCount,
  resultText,
  onRoll,
  label,
  hint,
}: {
  roll: { id: string; sides: number; results: number[] } | null;
  idleSides: number;
  idleCount: number;
  resultText: string | null;
  onRoll: () => void;
  label: string;
  hint: string;
}) {
  const visible = Math.min(roll ? roll.results.length : idleCount, VISIBLE_MAX);
  const { landed, reduced, onOneEnd } = useLandingGate(roll?.id ?? null, visible);
  const sides = roll ? roll.sides : idleSides;
  const size = dieSize(visible);

  return (
    <div className={styles.stage}>
      <button type="button" aria-label={label} onClick={onRoll} className={styles.objectButton}>
        <span className={styles.diceRow}>
          {Array.from({ length: visible }, (_, i) => (
            <span
              key={`${roll?.id ?? "idle"}-${i}`}
              className={roll && !reduced ? `${styles.dieWrap} ${styles.dieSpin}` : styles.dieWrap}
              style={{ width: size, height: size, animationDelay: `${i * 60}ms` }}
              onAnimationEnd={onOneEnd}
            >
              <DieShape sides={sides} value={landed && roll ? String(roll.results[i]) : "?"} size={size} />
            </span>
          ))}
        </span>
      </button>
      <div aria-live="polite" className={styles.resultZone}>
        {landed && roll ? (
          <p className={`${styles.pop} font-serif text-[24px] font-semibold`} data-testid="dice-result">
            {resultText}
          </p>
        ) : !roll ? (
          <p className="text-[14px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Reescribir `dice-section.tsx`**

Contenido completo:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DICE_MAX_SIDES, rollDice } from "@/lib/play/random/draws";
import type { RandomEvent } from "@/lib/play/random/events";
import { describeRandomEvent } from "@/lib/play/random/selectors";
import { DiceStage } from "./stage/dice-stage";

const QUICK_DICE = [4, 6, 8, 10, 12, 20];
const STEPPER_MAX = 8;

/**
 * Dados: los chips SELECCIONAN el tipo (d? abre caras libres, inválido cae a
 * d6) y el stepper la cantidad; tirar es tocar el escenario. El azar se
 * resuelve AQUÍ (rollDice) y el resultado viaja en el payload.
 */
export function DiceSection({
  lastRoll,
  onEmit,
}: {
  lastRoll: RandomEvent | undefined;
  onEmit: (payload: { count: number; sides: number; results: number[] }) => void;
}) {
  const t = useTranslations("play.random.dice");
  const [sides, setSides] = useState(6);
  const [custom, setCustom] = useState(false);
  const [customSides, setCustomSides] = useState("");
  const [count, setCount] = useState(1);

  const parsedCustom = Number(customSides);
  const customValid =
    Number.isInteger(parsedCustom) && parsedCustom >= 2 && parsedCustom <= DICE_MAX_SIDES;
  const effectiveSides = custom ? (customValid ? parsedCustom : 6) : sides;

  const last = lastRoll && lastRoll.type === "dice_rolled" ? lastRoll : null;
  const resultText = last ? t("result", describeRandomEvent(last).params) : null;

  const chipClass = (selected: boolean) =>
    `rounded-chip border px-4 py-2 text-[14px] font-semibold ${
      selected ? "border-foreground bg-surface-muted" : "border-border"
    }`;

  return (
    <div>
      <DiceStage
        roll={
          last
            ? { id: last.id, sides: last.payload.sides, results: last.payload.results }
            : null
        }
        idleSides={effectiveSides}
        idleCount={count}
        resultText={resultText}
        onRoll={() => onEmit({ count, sides: effectiveSides, results: rollDice(count, effectiveSides) })}
        label={t("tap")}
        hint={t("hint")}
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {QUICK_DICE.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={!custom && sides === d}
            onClick={() => {
              setCustom(false);
              setSides(d);
            }}
            className={chipClass(!custom && sides === d)}
          >
            d{d}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={custom}
          aria-label={t("customSides")}
          onClick={() => setCustom(true)}
          className={chipClass(custom)}
        >
          d?
        </button>
        {custom ? (
          <input
            type="number"
            inputMode="numeric"
            min={2}
            max={DICE_MAX_SIDES}
            aria-label={t("customSides")}
            value={customSides}
            placeholder="6"
            onChange={(e) => setCustomSides(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px] text-foreground"
          />
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1">
          <button
            type="button"
            aria-label={t("fewer")}
            disabled={count <= 1}
            onClick={() => setCount((c) => Math.max(1, c - 1))}
            className="rounded-chip border border-border px-3 py-2 text-[14px] font-semibold disabled:opacity-40"
          >
            −
          </button>
          <span className="w-8 text-center text-[14px] font-semibold tabular-nums">{count}</span>
          <button
            type="button"
            aria-label={t("more")}
            disabled={count >= STEPPER_MAX}
            onClick={() => setCount((c) => Math.min(STEPPER_MAX, c + 1))}
            className="rounded-chip border border-border px-3 py-2 text-[14px] font-semibold disabled:opacity-40"
          >
            +
          </button>
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: CSS — fila de dados**

En `stage.module.css`, el bloque `/* ---- dados ---- */` queda así (sustituye desde `.dieWrap` hasta `.miniDie` inclusive — mueren `.miniRow` y `.miniDie`):

```css
/* ---- dados ---- */
.diceRow,
.coinRow {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: center;
  max-width: 300px;
}
.dieWrap {
  display: block;
}
.dieSpin {
  animation: dieroll 900ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
@keyframes dieroll {
  from {
    transform: rotate(-720deg) scale(0.8);
  }
  70% {
    transform: rotate(-40deg) scale(1.08);
  }
  to {
    transform: rotate(0deg) scale(1);
  }
}
```

Y en el bloque `@media (prefers-reduced-motion: reduce)` quitar `.miniDie,` de la lista (la clase ya no existe; la lista queda `.dieSpin, .coinFlip, .pop, .reveal, .card, .bagShake, .tokenPop`).

- [ ] **Step 5: i18n dados**

En `messages/es.json`, el objeto `play.random.dice` queda EXACTAMENTE así (mueren `countLabel`, `sidesLabel`, `roll`; entran `hint`, `fewer`, `more`, `customSides`):

```json
"dice": {
  "result": "{rolls} = {total}",
  "tap": "Tirar el dado",
  "hint": "Toca el dado para tirar",
  "fewer": "Un dado menos",
  "more": "Un dado más",
  "customSides": "Caras personalizadas"
}
```

- [ ] **Step 6: Verificar**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
Run: `fnm exec --using=22 -- npx.cmd vitest run src/components/play/random/stage/stage-helpers.test.ts` — Expected: PASS.
NO correr e2e aquí: los tests 1/4/5 usan los controles viejos y fallarán hasta la Task 5 (reescritura e2e). Es el estado esperado.

- [ ] **Step 7: Commit**

```bash
git add src/components/play/random/stage/use-landing-gate.ts src/components/play/random/stage/dice-stage.tsx src/components/play/random/dice-section.tsx src/components/play/random/stage/stage.module.css messages/es.json
git commit -m "feat(play): N dados girando a la vez y controles en una fila -- chips seleccionan, stepper, tap tira

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 4: Monedas múltiples

**Files:**
- Modify: `src/components/play/random/stage/coin-stage.tsx` (reescritura completa)
- Modify: `src/components/play/random/coin-section.tsx` (reescritura completa)
- Modify: `src/components/play/random/random-screen.tsx` (wiring)
- Modify: `src/components/play/random/stage/stage.module.css` (coinScene)
- Modify: `messages/es.json` (claves de moneda + log.coins)

**Interfaces:**
- Consumes: `useLandingGate` (Task 3), `COIN_MAX_COUNT`/`flipCoins` (Task 1).
- Produces: `CoinStage` props `{ flip: { id; results } | null, idleCount, resultText, onFlip, label, hint }`; `CoinSection.onEmit` pasa a `(payload: { count: number; results: ("heads" | "tails")[] }) => void`.

- [ ] **Step 1: Reescribir `coin-stage.tsx`**

Contenido completo (HeadsFace/TailsFace se conservan tal cual del fichero actual — copiarlas literales):

```tsx
"use client";

import styles from "./stage.module.css";
import { useLandingGate } from "./use-landing-gate";

const COIN_VISIBLE_MAX = 5;

function coinSize(n: number): number {
  if (n <= 1) return 110;
  if (n === 2) return 88;
  return 64;
}

// Cara: sol. Cruz: aspa con laurel. Misma familia visual que random-table-mark.
function HeadsFace() {
  return (
    <svg viewBox="0 0 110 110" aria-hidden="true">
      <circle cx="55" cy="55" r="53" fill="var(--surface-3)" stroke="var(--border)" strokeWidth="3" />
      <circle cx="55" cy="55" r="18" fill="none" stroke="var(--gold-graphic)" strokeWidth="4" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return (
          <line
            key={i}
            x1={55 + 26 * Math.cos(a)}
            y1={55 + 26 * Math.sin(a)}
            x2={55 + 38 * Math.cos(a)}
            y2={55 + 38 * Math.sin(a)}
            stroke="var(--gold-graphic)"
            strokeWidth="4"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

function TailsFace() {
  return (
    <svg viewBox="0 0 110 110" aria-hidden="true">
      <circle cx="55" cy="55" r="53" fill="var(--surface-3)" stroke="var(--border)" strokeWidth="3" />
      <path
        d="M38 38 L72 72 M72 38 L38 72"
        stroke="var(--gold-graphic)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M30 78 Q55 92 80 78"
        fill="none"
        stroke="var(--gold-graphic)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Monedas 3D: varias revoluciones (stagger 60 ms) y cada una cae del lado
 * emitido. Revelación única al aterrizar la última (useLandingGate). En
 * reposo enseña tantas monedas como el stepper y el hint que centra.
 */
export function CoinStage({
  flip,
  idleCount,
  resultText,
  onFlip,
  label,
  hint,
}: {
  flip: { id: string; results: ("heads" | "tails")[] } | null;
  idleCount: number;
  resultText: string | null;
  onFlip: () => void;
  label: string;
  hint: string;
}) {
  const visible = Math.min(flip ? flip.results.length : idleCount, COIN_VISIBLE_MAX);
  const { landed, reduced, onOneEnd } = useLandingGate(flip?.id ?? null, visible);
  const size = coinSize(visible);

  return (
    <div className={styles.stage}>
      <button type="button" aria-label={label} onClick={onFlip} className={styles.objectButton}>
        <span className={styles.coinRow}>
          {Array.from({ length: visible }, (_, i) => (
            <span
              key={`${flip?.id ?? "idle"}-${i}`}
              className={styles.coinScene}
              style={{ width: size, height: size }}
            >
              <span
                className={flip && !reduced ? `${styles.coinSpin} ${styles.coinFlip}` : styles.coinSpin}
                style={{ animationDelay: `${i * 60}ms` }}
                onAnimationEnd={onOneEnd}
              >
                <span
                  className={styles.coin}
                  style={flip && flip.results[i] === "tails" ? { transform: "rotateX(180deg)" } : undefined}
                >
                  <span className={styles.coinFace}>
                    <HeadsFace />
                  </span>
                  <span className={`${styles.coinFace} ${styles.coinBack}`}>
                    <TailsFace />
                  </span>
                </span>
              </span>
            </span>
          ))}
        </span>
      </button>
      <div aria-live="polite" className={styles.resultZone}>
        {landed && flip ? (
          <p className={`${styles.pop} font-serif text-[24px] font-semibold`} data-testid="coin-result">
            {resultText}
          </p>
        ) : !flip ? (
          <p className="text-[14px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Reescribir `coin-section.tsx`**

Contenido completo:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { COIN_MAX_COUNT, flipCoins } from "@/lib/play/random/draws";
import type { RandomEvent } from "@/lib/play/random/events";
import { CoinStage } from "./stage/coin-stage";

/**
 * Monedas: stepper 1..COIN_MAX_COUNT y tocar la moneda lanza. Acepta el
 * coins_flipped nuevo y el coin_flipped viejo (logs persistidos) normalizado
 * a results.
 */
export function CoinSection({
  lastFlip,
  onEmit,
}: {
  lastFlip: RandomEvent | undefined;
  onEmit: (payload: { count: number; results: ("heads" | "tails")[] }) => void;
}) {
  const t = useTranslations("play.random.coin");
  const [count, setCount] = useState(1);

  const results =
    lastFlip && lastFlip.type === "coins_flipped"
      ? lastFlip.payload.results
      : lastFlip && lastFlip.type === "coin_flipped"
        ? [lastFlip.payload.result]
        : null;
  const heads = results ? results.filter((r) => r === "heads").length : 0;
  const resultText = results
    ? results.length === 1
      ? t(results[0])
      : t("result", { heads, tails: results.length - heads })
    : null;

  return (
    <div>
      <CoinStage
        flip={lastFlip && results ? { id: lastFlip.id, results } : null}
        idleCount={count}
        resultText={resultText}
        onFlip={() => onEmit({ count, results: flipCoins(count) })}
        label={t("flip")}
        hint={t("hint")}
      />
      <div className="mt-4 flex items-center justify-center gap-1">
        <button
          type="button"
          aria-label={t("fewer")}
          disabled={count <= 1}
          onClick={() => setCount((c) => Math.max(1, c - 1))}
          className="rounded-chip border border-border px-3 py-2 text-[14px] font-semibold disabled:opacity-40"
        >
          −
        </button>
        <span className="w-8 text-center text-[14px] font-semibold tabular-nums">{count}</span>
        <button
          type="button"
          aria-label={t("more")}
          disabled={count >= COIN_MAX_COUNT}
          onClick={() => setCount((c) => Math.min(COIN_MAX_COUNT, c + 1))}
          className="rounded-chip border border-border px-3 py-2 text-[14px] font-semibold disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wiring en `random-screen.tsx`**

El bloque de `CoinSection` pasa a:

```tsx
        {tab === "coin" ? (
          <CoinSection
            lastFlip={companion.feed.find(
              (e) => e.type === "coins_flipped" || e.type === "coin_flipped",
            )}
            onEmit={(payload) => companion.emit("coins_flipped", payload)}
          />
        ) : null}
```

- [ ] **Step 4: CSS — coinScene con tamaño variable**

En `stage.module.css`, `.coinScene` pierde el tamaño fijo (lo pone la fila con inline style):

```css
.coinScene {
  display: block;
  perspective: 600px;
}
```

(Quitar solo las líneas `width: 110px;` y `height: 110px;`.)

- [ ] **Step 5: i18n moneda + log**

En `messages/es.json`, `play.random.coin` queda:

```json
"coin": {
  "flip": "Lanzar moneda",
  "heads": "Cara",
  "tails": "Cruz",
  "hint": "Toca la moneda para lanzar",
  "fewer": "Una moneda menos",
  "more": "Una moneda más",
  "result": "{heads, plural, one {# cara} other {# caras}}, {tails, plural, one {# cruz} other {# cruces}}"
}
```

Y en `play.random.log`, tras `"coinTails"`, añadir:

```json
  "coins": "Monedas: {heads, plural, one {# cara} other {# caras}}, {tails, plural, one {# cruz} other {# cruces}}",
```

- [ ] **Step 6: Verificar**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
(e2e sigue en rojo por los controles viejos hasta Task 5; no correrlo aquí.)

- [ ] **Step 7: Commit**

```bash
git add src/components/play/random/stage/coin-stage.tsx src/components/play/random/coin-section.tsx src/components/play/random/random-screen.tsx src/components/play/random/stage/stage.module.css messages/es.json
git commit -m "feat(play): monedas multiples -- stepper 1..5, N monedas girando y recuento de caras/cruces

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 5: Hints de ruleta/bolsa + e2e reescrito + verificación completa

**Files:**
- Modify: `src/components/play/random/stage/players-wheel.tsx` (prop hint)
- Modify: `src/components/play/random/stage/bag-stage.tsx` (prop hint)
- Modify: `src/components/play/random/players-section.tsx` (pasar hint)
- Modify: `src/components/play/random/bag-section.tsx` (pasar hint)
- Modify: `messages/es.json` (wheelHint, drawHint)
- Modify: `e2e/partidas-aleatorio.spec.ts` (tests 1, 4, 5)

**Interfaces:**
- Consumes: nada nuevo de tareas previas.
- Produces: `PlayersWheel` y `BagStage` ganan prop obligatoria `hint: string`.

- [ ] **Step 1: Hint en `players-wheel.tsx`**

Añadir `hint` a las props (tras `disabled`):

```tsx
  label,
  disabled,
  hint,
}: {
  players: string[];
  spin: { id: string; picked: string } | null;
  onSpin: () => void;
  label: string;
  disabled: boolean;
  hint: string;
}) {
```

Y la zona de resultado pasa a:

```tsx
      <div aria-live="polite" className={styles.resultZone}>
        {landed && spin ? (
          <p className={`${styles.pop} font-serif text-[24px] font-semibold`} data-testid="players-result">
            {spin.picked}
          </p>
        ) : !spin ? (
          <p className="text-[14px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
```

- [ ] **Step 2: Hint en `bag-stage.tsx`**

Añadir `hint: string` a las props de `BagStage` (mismo patrón: tras `disabled` en el destructuring y en el tipo). La zona de resultado pasa a:

```tsx
      <div aria-live="polite" className={styles.resultZone}>
        {drawn ? (
          <span
            key={drawn.id}
            className={`${styles.token} ${reduced ? "" : styles.tokenPop} font-serif text-[20px]`}
            style={{ background: stableColor(drawn.name) }}
            onAnimationEnd={buzz}
          >
            <span data-testid="bag-result">{drawn.name}</span>
          </span>
        ) : (
          <p className="text-[14px] text-muted-foreground">{hint}</p>
        )}
      </div>
```

- [ ] **Step 3: Pasar hints desde las secciones**

En `src/components/play/random/players-section.tsx`, el `<PlayersWheel …>` gana `hint={t("wheelHint")}` (su `t` ya es `play.random.players`). En `src/components/play/random/bag-section.tsx`, el `<BagStage …>` gana `hint={t("drawHint")}` (su `t` ya es `play.random.bag`).

- [ ] **Step 4: i18n**

En `messages/es.json`: a `play.random.players` añadir tras `"first"`:

```json
  "wheelHint": "Toca la ruleta para sortear",
```

A `play.random.bag` añadir tras `"draw"`:

```json
  "drawHint": "Toca la bolsa para sacar ficha",
```

- [ ] **Step 5: Reescribir e2e (tests 1, 4 y 5)**

En `e2e/partidas-aleatorio.spec.ts`, el test 1 completo pasa a:

```ts
test("dados y moneda: resultado, feed, deshacer y recarga", async ({ page }) => {
  await page.goto("/partidas/aleatorio");
  await expect(page.getByRole("heading", { name: "Aleatorio" })).toBeVisible();

  // Reposo: hint que centra el escenario. Tirar = tocar el dado.
  await expect(page.getByText("Toca el dado para tirar")).toBeVisible();
  await page.getByRole("button", { name: "Tirar el dado" }).click();
  await expect(page.getByTestId("dice-result")).toBeVisible();
  await expect(page.getByText("Toca el dado para tirar")).toHaveCount(0);

  // 3d6 vía stepper: el resultado formatea "a + b + c = total".
  await page.getByRole("button", { name: "Un dado más" }).click();
  await page.getByRole("button", { name: "Un dado más" }).click();
  await page.getByRole("button", { name: "Tirar el dado" }).click();
  await expect(page.getByTestId("dice-result")).toContainText("=");

  // 3 monedas: recuento "N caras, M cruces" (o singular).
  await page.getByRole("tab", { name: "Moneda" }).click();
  await page.getByRole("button", { name: "Una moneda más" }).click();
  await page.getByRole("button", { name: "Una moneda más" }).click();
  await page.getByRole("button", { name: /^lanzar moneda$/i }).click();
  await expect(page.getByTestId("coin-result")).toContainText(/cara|cruz/i);

  // El feed acumula los tres resultados; deshacer quita el último (las monedas).
  const feed = page.locator('section[aria-label="Últimos resultados"] li');
  await expect(feed).toHaveCount(3);
  await page.getByRole("button", { name: /^deshacer$/i }).click();
  await expect(feed).toHaveCount(2);

  // El estado sobrevive a una recarga (store companion en IDB).
  await page.reload();
  await expect(page.locator('section[aria-label="Últimos resultados"] li')).toHaveCount(2);

  // Limpiar todo (dos toques) vacía el feed; deshacer el cleared lo recupera.
  await page.getByRole("button", { name: /^limpiar todo$/i }).click();
  await page.getByRole("button", { name: /borra todo/i }).click();
  await expect(page.locator('section[aria-label="Últimos resultados"] li')).toHaveCount(0);
  await page.getByRole("button", { name: /^deshacer$/i }).click();
  await expect(page.locator('section[aria-label="Últimos resultados"] li')).toHaveCount(2);
});
```

En el test `"convive con una partida de puntuación activa"` y en el test `"con reduced motion el resultado aparece al instante"`, sustituir la línea:

```ts
  await page.getByRole("button", { name: "d6", exact: true }).click();
```

por:

```ts
  await page.getByRole("button", { name: "Tirar el dado" }).click();
```

(los chips ya no tiran; el comentario del test de reduced motion sobre «el cubo» puede quedar).

- [ ] **Step 6: Verificación completa**

Run (en este orden):
1. `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
2. `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/random src/components/play/random` — Expected: PASS todo.
3. `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts` — Expected: 5/5 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/play/random/stage/players-wheel.tsx src/components/play/random/stage/bag-stage.tsx src/components/play/random/players-section.tsx src/components/play/random/bag-section.tsx messages/es.json e2e/partidas-aleatorio.spec.ts
git commit -m "feat(play): texto de reposo en los cuatro escenarios y e2e adaptado a los controles nuevos

El hueco reservado para el resultado ya no descuadra el centrado: en
reposo lo ocupa un hint atenuado por seccion.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```
