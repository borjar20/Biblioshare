# Jerarquía de resultado, densidad y feed visual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El total manda sobre la operación, la tarjeta gana densidad, los dados presencia, los controles se ordenan en dos bloques con un CTA terracota único, y el feed se vuelve una lista visual con deshacer junto a la última tirada.

**Architecture:** Selector puro nuevo `feedRow(event)` (etiqueta/valor/desglose) sustituye a `describeRandomEvent` (que muere junto al namespace `play.random.log`). `DiceStage` compone su propio resultado en tres niveles. Secciones ganan bloque «Cantidad» + CTA `buttonVariants("primary")`. Sin cambios de motor (solo `selectors.ts`).

**Tech Stack:** React 19, CSS Modules, next-intl (ICU), `buttonVariants` de `@/components/ui/button`, Vitest, Playwright.

## Global Constraints

- Rama: `feat/play-randomizer-visual` (PR #990) — commits directos, sin worktree.
- UN primario por vista: terracota solo en el CTA («Tirar {expr}» / «Lanzar N monedas»); el chip seleccionado se queda sobrio.
- Testids `dice-result`/`coin-result`, `aria-live="polite"`, animaciones y puerta de aterrizaje intactos. Tocar el escenario sigue tirando.
- Textos accesibles «Deshacer» / «Limpiar todo» / «¿Seguro? Borra todo» no cambian.
- Solo tokens existentes; sombra `drop-shadow(0 1px 2px rgb(0 0 0 / 0.12))` literal (válida en ambos temas).
- Unit: `fnm exec --using=22 -- npx.cmd vitest run <path>` (Node 20 del shell rompe vitest).
- e2e: `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts` (reutiliza dev server del 3000; NO arrancar otro).
- `git add` con rutas explícitas, nunca `-A` ni `.`.
- Trailers de commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4`

---

### Task 1: Selector `feedRow` (TDD; `describeRandomEvent` aún NO se borra)

**Files:**
- Modify: `src/lib/play/random/selectors.ts` (añadir al final)
- Test: `src/lib/play/random/reducer.test.ts` (añadir al final)

**Interfaces:**
- Produces: `FeedText = string | { key: string; params?: Record<string, string | number> }`, `FeedRow = { label: FeedText; primary: FeedText; detail?: string }`, `feedRow(event: RandomEvent): FeedRow` — Task 5 los consume. `describeRandomEvent` sigue existiendo hasta Task 5 (dice-section y result-feed aún lo importan).

- [ ] **Step 1: Tests que fallan**

En `reducer.test.ts`: añadir `feedRow` al import de `./selectors` (línea 12) y añadir al FINAL:

```ts
describe("feedRow", () => {
  it("dados: expresión, total y desglose solo con más de un dado", () => {
    expect(feedRow(dice([4, 2, 6]))).toEqual({ label: "3d6", primary: "12", detail: "4 · 2 · 6" });
    expect(feedRow(dice([5]))).toEqual({ label: "1d6", primary: "5" });
  });
  it("monedas: una reusa cara/cruz; varias, recuento", () => {
    expect(feedRow(coins(["tails"]))).toEqual({
      label: { key: "row.coin" },
      primary: { key: "coin.tails" },
    });
    expect(feedRow(coins(["heads", "tails", "heads"]))).toEqual({
      label: { key: "row.coins", params: { count: 3 } },
      primary: { key: "coin.result", params: { heads: 2, tails: 1 } },
    });
    expect(
      feedRow(makeEvent("coin_flipped", { result: "heads" as const }, t0) as RandomEvent),
    ).toEqual({ label: { key: "row.coin" }, primary: { key: "coin.heads" } });
  });
  it("jugadores y bolsa", () => {
    expect(
      feedRow(makeEvent("first_picked", { players: ["a", "b"], picked: "b" }, t0) as RandomEvent),
    ).toEqual({ label: { key: "row.first" }, primary: "b" });
    expect(
      feedRow(makeEvent("order_drawn", { players: ["a", "b"], order: ["b", "a"] }, t0) as RandomEvent),
    ).toEqual({ label: { key: "row.order" }, primary: "b, a" });
    expect(
      feedRow(
        makeEvent("teams_drawn", { players: ["a", "b", "c"], teams: [["a"], ["b", "c"]] }, t0) as RandomEvent,
      ),
    ).toEqual({ label: { key: "row.teams" }, primary: "a — b, c" });
    expect(feedRow(bagDrawn("Rojo"))).toEqual({ label: { key: "row.bag" }, primary: "Rojo" });
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/random/reducer.test.ts`
Expected: FAIL — `feedRow` no exportado.

- [ ] **Step 3: Implementar `feedRow`**

Añadir al FINAL de `selectors.ts`:

```ts
// Fila del feed visual: etiqueta (mono), valor protagonista (serif) y desglose
// opcional. `string` = literal ya resuelto (números, nombres); `{key}` = clave
// i18n relativa a play.random que la UI traduce.
export type FeedText = string | { key: string; params?: Record<string, string | number> };
export type FeedRow = { label: FeedText; primary: FeedText; detail?: string };

export function feedRow(event: RandomEvent): FeedRow {
  switch (event.type) {
    case "dice_rolled": {
      const { count, sides, results } = event.payload;
      return {
        label: `${count}d${sides}`,
        primary: String(results.reduce((a, b) => a + b, 0)),
        ...(count > 1 ? { detail: results.join(" · ") } : {}),
      };
    }
    case "coin_flipped":
      return {
        label: { key: "row.coin" },
        primary: { key: event.payload.result === "heads" ? "coin.heads" : "coin.tails" },
      };
    case "coins_flipped": {
      const { results } = event.payload;
      if (results.length === 1) {
        return {
          label: { key: "row.coin" },
          primary: { key: results[0] === "heads" ? "coin.heads" : "coin.tails" },
        };
      }
      const heads = results.filter((r) => r === "heads").length;
      return {
        label: { key: "row.coins", params: { count: results.length } },
        primary: { key: "coin.result", params: { heads, tails: results.length - heads } },
      };
    }
    case "first_picked":
      return { label: { key: "row.first" }, primary: event.payload.picked };
    case "order_drawn":
      return { label: { key: "row.order" }, primary: event.payload.order.join(", ") };
    case "teams_drawn":
      return {
        label: { key: "row.teams" },
        primary: event.payload.teams.map((team) => team.join(", ")).join(" — "),
      };
    case "bag_drawn":
      return { label: { key: "row.bag" }, primary: event.payload.name };
    default:
      // players_set / bag_set / cleared no llegan al feed (RESULT_EVENT_TYPES).
      return { label: "", primary: "" };
  }
}
```

- [ ] **Step 4: Verificar que pasa + typecheck**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/random/reducer.test.ts` — Expected: PASS.
Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/random/selectors.ts src/lib/play/random/reducer.test.ts
git commit -m "feat(play): selector feedRow -- etiqueta, valor protagonista y desglose por evento

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 2: Identidad de pieza + densidad de la tarjeta

**Files:**
- Modify: `src/components/play/random/stage/die-shape.tsx` (contorno + fuente)
- Modify: `src/components/play/random/stage/stage.module.css` (alturas + sombra)

**Interfaces:** nada nuevo; cambios solo visuales.

- [ ] **Step 1: `die-shape.tsx` — contorno definido y número Fraunces**

La línea de `shapeProps` pasa de:

```tsx
  const shapeProps = { fill: "var(--surface-3)", stroke: "var(--border)", strokeWidth: 3 };
```

a:

```tsx
  // Contorno en --foreground-soft (más definido que --border); las aristas
  // internas de Facets se quedan en --border, más suaves que el borde.
  const shapeProps = { fill: "var(--surface-3)", stroke: "var(--foreground-soft)", strokeWidth: 2.5 };
```

Y el `<text …>` gana `className="font-serif"` (primer atributo, antes de `x="50"`).

- [ ] **Step 2: CSS — densidad y sombra**

En `stage.module.css`:
- `.stage`: `min-height: 260px` → `min-height: 220px`; `padding: 16px` → `padding: 12px`.
- `.resultZone`: `min-height: 72px` → `min-height: 64px`.
- `.dieWrap` queda:

```css
.dieWrap {
  display: block;
  filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.12));
}
```

- [ ] **Step 3: Verificar**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
Run: `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts` — Expected: 5/5 PASS (cambio solo visual).

- [ ] **Step 4: Commit**

```bash
git add src/components/play/random/stage/die-shape.tsx src/components/play/random/stage/stage.module.css
git commit -m "feat(play): piezas con presencia y tarjeta mas densa -- contorno definido, numero Fraunces, sombra minima

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 3: Jerarquía del resultado + controles de dados en dos bloques con CTA

**Files:**
- Modify: `src/components/play/random/stage/dice-stage.tsx` (zona de resultado; muere `resultText`)
- Modify: `src/components/play/random/dice-section.tsx` (reescritura completa)
- Modify: `messages/es.json` (dice: muere `result`, entra `rollCta`; entra `play.random.quantity`)

**Interfaces:**
- Consumes: `buttonVariants` de `@/components/ui/button`.
- Produces: `DiceStage` pierde la prop `resultText` (nueva firma: `{ roll, idleSides, idleCount, onRoll, label, hint }`). Nadie más lo consume.

- [ ] **Step 1: `dice-stage.tsx` — resultado en tres niveles**

Quitar `resultText` de las props (destructuring y tipo) y sustituir la zona de resultado entera por:

```tsx
      <div aria-live="polite" className={`${styles.resultZone} text-center`}>
        {landed && roll ? (
          <div className={styles.pop} data-testid="dice-result">
            <p className="font-serif text-[40px] font-semibold leading-none">
              {roll.results.reduce((a, b) => a + b, 0)}
            </p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {roll.results.length}d{roll.sides}
            </p>
            {roll.results.length > 1 ? (
              <p className="mt-0.5 text-[14px] text-muted-foreground">{roll.results.join(" + ")}</p>
            ) : null}
          </div>
        ) : !roll ? (
          <p className="text-[14px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
```

Actualizar también el JSDoc del componente: sustituir la frase «el texto con el total manda» por «el desglose y el total mandan» si se quiere, o dejarlo — no es bloqueante.

- [ ] **Step 2: Reescribir `dice-section.tsx`**

Contenido completo:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { DICE_MAX_SIDES, rollDice } from "@/lib/play/random/draws";
import type { RandomEvent } from "@/lib/play/random/events";
import { DiceStage } from "./stage/dice-stage";

const QUICK_DICE = [4, 6, 8, 10, 12, 20];
const STEPPER_MAX = 8;

/**
 * Dados en dos bloques: los chips SELECCIONAN el tipo (d? abre caras libres,
 * inválido cae a d6) y la fila «Cantidad» el número; el CTA primario tira
 * (también tocar el escenario). El azar se resuelve AQUÍ (rollDice) y el
 * resultado viaja en el payload.
 */
export function DiceSection({
  lastRoll,
  onEmit,
}: {
  lastRoll: RandomEvent | undefined;
  onEmit: (payload: { count: number; sides: number; results: number[] }) => void;
}) {
  const t = useTranslations("play.random.dice");
  const tr = useTranslations("play.random");
  const [sides, setSides] = useState(6);
  const [custom, setCustom] = useState(false);
  const [customSides, setCustomSides] = useState("");
  const [count, setCount] = useState(1);

  const parsedCustom = Number(customSides);
  const customValid =
    Number.isInteger(parsedCustom) && parsedCustom >= 2 && parsedCustom <= DICE_MAX_SIDES;
  const effectiveSides = custom ? (customValid ? parsedCustom : 6) : sides;

  const last = lastRoll && lastRoll.type === "dice_rolled" ? lastRoll : null;

  const roll = () => onEmit({ count, sides: effectiveSides, results: rollDice(count, effectiveSides) });

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
        onRoll={roll}
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
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {tr("quantity")}
        </span>
        <span className="inline-flex items-center gap-1">
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
      <button
        type="button"
        onClick={roll}
        className={buttonVariants("primary", "mt-3 w-full justify-center py-3 text-[15px]")}
      >
        {t("rollCta", { expr: `${count}d${effectiveSides}` })}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: i18n**

En `messages/es.json`, `play.random.dice` pierde `"result"` y gana (tras `"tap"`):

```json
  "rollCta": "Tirar {expr}",
```

Y al nivel de `play.random` (junto a `"title"`/`"subtitle"`) entra:

```json
  "quantity": "Cantidad",
```

- [ ] **Step 4: Verificar**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
Run: `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts` — Expected: 5/5 PASS (el e2e tira tocando el escenario, que sigue funcionando; «+» vive ahora en el desglose).

- [ ] **Step 5: Commit**

```bash
git add src/components/play/random/stage/dice-stage.tsx src/components/play/random/dice-section.tsx messages/es.json
git commit -m "feat(play): el total manda -- resultado en tres niveles, bloque Cantidad y CTA primario Tirar NdX

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 4: CTA y bloque «Cantidad» en monedas

**Files:**
- Modify: `src/components/play/random/coin-section.tsx`
- Modify: `messages/es.json` (`coin.flipCta`)

**Interfaces:** ninguna nueva; `CoinStage` no cambia.

- [ ] **Step 1: `coin-section.tsx` — bloque cantidad + CTA**

Añadir `import { buttonVariants } from "@/components/ui/button";` y
`const tr = useTranslations("play.random");` (junto al `t` existente). El bloque del stepper
(el `<div className="mt-4 flex items-center justify-center gap-1">` entero) se sustituye por:

```tsx
      <div className="mt-4 flex items-center justify-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {tr("quantity")}
        </span>
        <span className="inline-flex items-center gap-1">
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
        </span>
      </div>
      <button
        type="button"
        onClick={() => onEmit({ count, results: flipCoins(count) })}
        className={buttonVariants("primary", "mt-3 w-full justify-center py-3 text-[15px]")}
      >
        {t("flipCta", { count })}
      </button>
```

- [ ] **Step 2: i18n**

En `messages/es.json`, `play.random.coin` gana (tras `"result"`):

```json
  "flipCta": "{count, plural, one {Lanzar la moneda} other {Lanzar # monedas}}",
```

- [ ] **Step 3: Verificar**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/play/random/coin-section.tsx messages/es.json
git commit -m "feat(play): CTA primario Lanzar N monedas y bloque Cantidad -- espejo del patron de dados

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 5: Feed visual + borrar `describeRandomEvent`/`log.*` + e2e + verificación completa

**Files:**
- Modify: `src/components/play/random/result-feed.tsx` (reescritura completa)
- Modify: `src/lib/play/random/selectors.ts` (borrar `describeRandomEvent`)
- Modify: `src/lib/play/random/reducer.test.ts` (tests de describe mueren)
- Modify: `messages/es.json` (namespace `log` muere; entra `row`)
- Modify: `e2e/partidas-aleatorio.spec.ts` (test 1 usa los CTA)

**Interfaces:**
- Consumes: `feedRow`/`FeedText` (Task 1).
- Produces: nada nuevo.

- [ ] **Step 1: Reescribir `result-feed.tsx`**

Contenido completo:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { RandomEvent } from "@/lib/play/random/events";
import { feedRow, type FeedText } from "@/lib/play/random/selectors";

/**
 * Feed visual de últimos resultados: etiqueta mono, valor protagonista serif
 * y desglose secundario. Deshacer vive junto a la última tirada (revierte el
 * ÚLTIMO evento del log, sea de la sección que sea — por eso está aquí y no
 * dentro de una sección); limpiar todo es ghost con confirmación en dos toques.
 */
export function ResultFeed({
  feed,
  canUndo,
  onUndo,
  onClear,
}: {
  feed: RandomEvent[];
  canUndo: boolean;
  onUndo: () => void;
  onClear: () => void;
}) {
  const t = useTranslations("play.random");
  const [confirming, setConfirming] = useState(false);
  const text = (v: FeedText) => (typeof v === "string" ? v : t(v.key, v.params));

  const undoButton = (
    <button
      type="button"
      onClick={onUndo}
      disabled={!canUndo}
      className="ml-auto shrink-0 text-[12px] text-muted-foreground underline disabled:opacity-40"
    >
      {t("feed.undo")}
    </button>
  );

  return (
    <section className="mt-6" aria-label={t("feed.title")}>
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("feed.title")}
        </h2>
        {confirming ? (
          <button
            type="button"
            onClick={() => {
              onClear();
              setConfirming(false);
            }}
            className="text-[12px] text-play-danger underline"
          >
            {t("feed.clearConfirm")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!canUndo}
            className="text-[12px] text-muted-foreground underline disabled:opacity-40"
          >
            {t("feed.clear")}
          </button>
        )}
      </div>
      {feed.length === 0 ? (
        <p className="mt-2 flex items-center text-[13px] text-muted-foreground">
          {t("feed.empty")}
          {canUndo ? undoButton : null}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {feed.map((event, i) => {
            const row = feedRow(event);
            return (
              <li key={event.id} className="flex items-baseline gap-3">
                <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {text(row.label)}
                </span>
                <span className="font-serif text-[16px] font-semibold">{text(row.primary)}</span>
                {row.detail ? (
                  <span className="text-[12px] text-muted-foreground">{row.detail}</span>
                ) : null}
                {i === 0 ? undoButton : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Borrar `describeRandomEvent`**

En `selectors.ts`: borrar la función entera con su comentario, y quitar `EventDescription` del
import de `@/lib/play/core/types` (queda `import type { PlayEvent } from "@/lib/play/core/types";`).

En `reducer.test.ts`:
- Quitar `describeRandomEvent` del import de `./selectors`.
- El `describe("describeRandomEvent", …)` entero se sustituye por (conservando el it de
  RESULT_EVENT_TYPES, que no era de describe):

```ts
describe("RESULT_EVENT_TYPES", () => {
  it("contiene exactamente los 7 eventos de resultado", () => {
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
});
```

- En el `describe("coins_flipped", …)`, borrar entero el it
  `"describe: una moneda reusa la copia de siempre; varias, recuentos"` (feedRow ya lo cubre).

- [ ] **Step 3: i18n — muere `log`, entra `row`**

En `messages/es.json`, dentro de `play.random`: borrar el objeto `"log": { … }` ENTERO y añadir
en su lugar:

```json
  "row": {
    "coin": "Moneda",
    "coins": "{count} monedas",
    "first": "Primero",
    "order": "Orden",
    "teams": "Equipos",
    "bag": "Bolsa"
  }
```

- [ ] **Step 4: e2e — test 1 tira con los CTA**

En `e2e/partidas-aleatorio.spec.ts`, test 1: la línea del 3d6

```ts
  await page.getByRole("button", { name: "Tirar el dado" }).click();
```

(la SEGUNDA aparición, la que sigue a los dos «Un dado más») pasa a:

```ts
  await page.getByRole("button", { name: "Tirar 3d6" }).click();
```

Y la de monedas

```ts
  await page.getByRole("button", { name: /^lanzar moneda$/i }).click();
```

pasa a:

```ts
  await page.getByRole("button", { name: "Lanzar 3 monedas" }).click();
```

(la primera tirada del test y los tests 4/5 siguen tocando el escenario — el gesto secundario
queda cubierto).

- [ ] **Step 5: Verificación completa**

Run (en orden):
1. `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
2. `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/random src/components/play/random` — Expected: PASS todo.
3. `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts` — Expected: 5/5 PASS.
4. `grep -rn "play.random.log\|describeRandomEvent" src messages e2e` — Expected: sin resultados.

- [ ] **Step 6: Commit**

```bash
git add src/components/play/random/result-feed.tsx src/lib/play/random/selectors.ts src/lib/play/random/reducer.test.ts messages/es.json e2e/partidas-aleatorio.spec.ts
git commit -m "feat(play): feed visual con valor protagonista -- feedRow sustituye a describeRandomEvent y log.* muere

Deshacer vive junto a la ultima tirada; limpiar todo pasa a ghost. El
e2e tira con los CTA nuevos (Tirar 3d6 / Lanzar 3 monedas).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```
