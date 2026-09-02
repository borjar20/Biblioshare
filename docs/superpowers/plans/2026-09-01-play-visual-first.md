# BiblioPlay visual-first Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar las seis pantallas de BiblioPlay que aún eran formulario (hoja de ronda, config MTG, config Recursos, config Puntuación, Bolsa, semántica de ficha) en cero inputs visibles salvo el único tras «+», según `docs/superpowers/specs/2026-09-01-play-visual-first-design.md`.

**Architecture:** Un átomo compartido nuevo (`SeatRow`, fila de fichas sin datos) alimenta a `SeatPicker`, `score-setup-form` y `setup-form`; los números se cambian con `useHoldRepeat`/`HoldRepeatButton` (ya existen) y chips; Recursos gana glifos SVG propios y un evento `resource_updated` en su reducer event-sourced. Lógica nueva testeable vive en `src/lib/play/**` (sin React ni i18n); los componentes se verifican con Playwright.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, next-intl (`messages/es.json`), Vitest (`fnm exec --using=22 -- npx.cmd vitest run <path>`), Playwright (`fnm exec --using=22 -- npm.cmd run test:e2e -- <spec>`, reutiliza el `next dev` que haya en el puerto 3000).

## Global Constraints

- Regla «juguete sobre formulario»: ningún `type="number"`, `<select>` ni `checkbox` nativo; un solo `<input>` visible por pantalla y solo tras un «+» o una ficha tocada.
- Objetivos táctiles de 44 px (`h-11 w-11` o `tap-44`).
- `src/lib/play/**` no importa React ni next-intl.
- Copy solo en `messages/es.json`, namespace `play`; sin emojis de sistema (`DESIGN.md`).
- `git add` con rutas explícitas, nunca `-A`/`.`. Commits terminan con:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4`.
- El campo `ResourceDef.emoji` conserva nombre y validación (`length <= 8`).
- Ids de asiento `p{n}`: primer libre, nunca derivado del índice (quitar por el medio duplicaría).
- Semántica de ficha: tocar **abre panel**; quitar vive dentro del panel.
- Un solo `next dev` en el puerto 3000; los e2e lo reutilizan.

---

### Task 1: `SeatRow` compartido y `SeatPicker` con panel

**Files:**
- Modify: `src/components/play/ui/seat-token.tsx`
- Create: `src/components/play/ui/seat-row.tsx`
- Modify: `src/components/play/ui/seat-picker.tsx`
- Modify: `messages/es.json` (bloque `play.seats`, línea ~2701)
- Test (e2e, sin cambios de código): `e2e/partidas-reloj.spec.ts`, `e2e/partidas-turnos.spec.ts`

**Interfaces:**
- Produces: `SeatToken` gana `size?: "md" | "sm"` (44 px / 32 px, por defecto `"md"`).
- Produces: `SeatRow` con la firma de abajo. `SeatPicker` mantiene su firma pública (`identity, players: string[], max?, onChange, align?, idPrefix`).

- [ ] **Step 1: `size` en `SeatToken`**

En `src/components/play/ui/seat-token.tsx`, añade la prop y úsala en el botón:

```tsx
  size = "md",
}: {
  // ...props existentes...
  /** 44 px por defecto; `sm` (32 px) para filas secundarias como «quién empieza». */
  size?: "md" | "sm";
  onClick: () => void;
}) {
  const filled = variant === "seat";
  const dims = size === "sm" ? "h-8 w-8 text-[12px]" : "h-11 w-11";
  return (
    <span className={`flex ${size === "sm" ? "w-10" : "w-14"} flex-col items-center gap-1`}>
      <button
        // ...
        className={`flex ${dims} shrink-0 select-none items-center justify-center rounded-full font-semibold transition-all disabled:opacity-40 [touch-action:manipulation] ${
          filled ? "text-surface" : "border-2 border-dashed border-border text-muted-foreground"
        } ${variant === "regular" ? "opacity-70" : ""} ${
          variant === "add" ? "text-[18px]" : size === "sm" ? "" : "text-[14px]"
        }`}
```

- [ ] **Step 2: crear `seat-row.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { PlayerRecord } from "@/lib/play/core/db";
import { SeatToken } from "./seat-token";
import { RegularTokens } from "./regular-tokens";

export type SeatRowSeat = { id: string; caption: string; content: ReactNode; selected: boolean };

/**
 * Fila de fichas de una mesa, sin lógica de datos: asientos ocupados, habituales
 * por sentar y el «+». Tocar un asiento SELECCIONA (el llamador abre su panel):
 * quitar nunca es un toque en la ficha — vive dentro del panel. Antes la misma
 * ficha quitaba en los acompañantes y editaba en puntuación (critique 2026-09-01).
 */
export function SeatRow({
  seats,
  onSeatTap,
  panelId,
  regulars = [],
  regularsQuery = "",
  onSeatRegular,
  canAdd,
  adding = false,
  onAdd,
  addControls,
  align = "start",
}: {
  seats: SeatRowSeat[];
  onSeatTap: (id: string) => void;
  /** id del panel que abre un asiento (aria-controls). */
  panelId: string;
  regulars?: PlayerRecord[];
  regularsQuery?: string;
  onSeatRegular?: (regular: { playerId: string; name: string }) => void;
  canAdd: boolean;
  adding?: boolean;
  onAdd: () => void;
  /** id de lo que despliega el «+» (aria-controls). */
  addControls: string;
  align?: "start" | "center";
}) {
  const t = useTranslations("play.seats");
  return (
    <div className={`flex flex-wrap items-start gap-3 ${align === "center" ? "justify-center" : ""}`}>
      {seats.map((seat, i) => (
        <SeatToken
          key={seat.id}
          variant="seat"
          seat={i}
          caption={seat.caption}
          label={t("edit", { name: seat.caption })}
          selected={seat.selected}
          expanded={seat.selected}
          controls={panelId}
          onClick={() => onSeatTap(seat.id)}
        >
          {seat.content}
        </SeatToken>
      ))}
      {canAdd && onSeatRegular ? (
        <RegularTokens regulars={regulars} query={regularsQuery} onSeat={onSeatRegular} />
      ) : null}
      {canAdd ? (
        <SeatToken
          variant="add"
          caption={t("add")}
          label={t("addPlayer")}
          expanded={adding}
          controls={addControls}
          onClick={onAdd}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: `SeatPicker` sobre `SeatRow`, con panel**

Sustituye el cuerpo de `src/components/play/ui/seat-picker.tsx` por:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePlayers } from "@/lib/play/core/use-players";
import { initials } from "./seat-token";
import { SeatRow } from "./seat-row";

/**
 * Selector de jugadores de los acompañantes (Aleatorio, Reloj, Recursos,
 * Turnos): fichas en vez de formulario. Tocar una ficha de color la abre en
 * un panel con «Quitar de la mesa» — nunca quita al toque (un roce en la mesa
 * borraba a alguien sin deshacer). Tocar un habitual atenuado lo sienta; el
 * «+» despliega el ÚNICO input de la pantalla.
 *
 * No se renombra aquí: los acompañantes identifican al jugador por nombre y
 * renombrar sería quitar + añadir (Recursos perdería sus valores).
 */
export function SeatPicker({
  identity,
  players,
  max,
  onChange,
  align = "start",
  idPrefix,
}: {
  identity: string;
  players: string[];
  max?: number;
  onChange: (players: string[]) => void;
  align?: "start" | "center";
  idPrefix: string;
}) {
  const t = useTranslations("play.seats");
  const { players: regulars } = usePlayers(identity);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const inputId = `${idPrefix}-add-player`;
  const panelId = `${idPrefix}-seat`;

  function add(candidate: string, fromInput = false) {
    const trimmed = candidate.trim();
    if (trimmed === "" || players.includes(trimmed)) return;
    if (max !== undefined && players.length >= max) return;
    onChange([...players, trimmed]);
    if (fromInput) {
      setName("");
      setAdding(false);
    }
  }

  function remove(target: string) {
    onChange(players.filter((x) => x !== target));
    setOpen(null);
  }

  const available = regulars.filter((r) => !players.includes(r.name));
  const full = max !== undefined && players.length >= max;
  const opened = open !== null && players.includes(open) ? open : null;

  return (
    <>
      <SeatRow
        seats={players.map((p) => ({ id: p, caption: p, content: initials(p), selected: p === opened }))}
        onSeatTap={(id) => setOpen(id === opened ? null : id)}
        panelId={panelId}
        regulars={available}
        regularsQuery={adding ? name : ""}
        onSeatRegular={(r) => add(r.name)}
        canAdd={!full}
        adding={adding}
        onAdd={() => setAdding(!adding)}
        addControls={inputId}
        align={align}
      />
      {opened !== null ? (
        <div
          id={panelId}
          className={`mt-2 flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-3 py-2 ${
            align === "center" ? "mx-auto w-fit" : ""
          }`}
        >
          <span className="text-[14px] font-semibold">{opened}</span>
          <button
            type="button"
            onClick={() => remove(opened)}
            className="tap-44 rounded-chip border border-border px-3 py-1.5 text-[13px] text-muted-foreground"
          >
            {t("remove", { name: opened })}
          </button>
        </div>
      ) : null}
      {adding ? (
        <div id={inputId} className={`mt-2 flex ${align === "center" ? "justify-center" : ""}`}>
          <input
            autoFocus
            value={name}
            placeholder={t("namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add(name, true);
            }}
            aria-label={t("nameLabel")}
            className="w-48 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: copy**

En `messages/es.json`, bloque `play.seats`: `"remove": "Quitar a {name} de la mesa"` (sustituye el valor actual «Quitar a {name}»).

- [ ] **Step 5: typecheck y e2e de dos acompañantes**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit -p .` → sin errores.
Run: `fnm exec --using=22 -- npm.cmd run test:e2e -- e2e/partidas-reloj.spec.ts e2e/partidas-turnos.spec.ts` → todos verdes (añadir por «+» + Enter no cambia).

- [ ] **Step 6: commit**

```bash
git add src/components/play/ui/seat-token.tsx src/components/play/ui/seat-row.tsx src/components/play/ui/seat-picker.tsx messages/es.json
git commit -m "feat(play): SeatRow compartido -- tocar una ficha abre panel, quitar vive dentro"
```

---

### Task 2: Hoja de ronda con stepper y chips

**Files:**
- Create: `src/lib/play/score/round-draft.ts`
- Create: `src/lib/play/score/round-draft.test.ts`
- Modify: `src/components/play/score/round-sheet.tsx`
- Modify: `messages/es.json` (bloque `play.roundSheet`, línea ~2796)
- Modify: `e2e/partidas-puntuacion.spec.ts:11-24`

**Interfaces:**
- Consumes: `HoldRepeatButton` de `src/components/play/resources/hold-repeat-button.tsx` (`{ direction: 1 | -1, label, onPreview(acc), onCommit(delta) }`), `SeatToken` (Task 1, con `selected`).
- Produces: `applyDelta(values: number[], seat: number, delta: number): number[]`.

- [ ] **Step 1: test del helper**

`src/lib/play/score/round-draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyDelta } from "./round-draft";

describe("applyDelta", () => {
  it("suma al asiento indicado y no toca los demás", () => {
    expect(applyDelta([0, 0, 0], 1, 5)).toEqual([0, 5, 0]);
  });
  it("admite negativos: una ronda puede restar", () => {
    expect(applyDelta([3, 0], 0, -10)).toEqual([-7, 0]);
  });
  it("trunca a entero y devuelve un array nuevo", () => {
    const before = [1, 1];
    const after = applyDelta(before, 0, 2.7);
    expect(after).toEqual([3, 1]);
    expect(after).not.toBe(before);
  });
  it("asiento fuera de rango no cambia nada", () => {
    expect(applyDelta([1, 2], 5, 1)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: correr y ver fallar**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/score/round-draft.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: helper**

`src/lib/play/score/round-draft.ts`:

```ts
/**
 * Borrador de la hoja de ronda: un valor por asiento, cambiado a golpes de
 * chip (±5/±10/±20) o de stepper (±1). Sin clamp: el reducer de puntuación
 * admite negativos y no tiene tope; aquí solo se garantiza entero.
 */
export function applyDelta(values: number[], seat: number, delta: number): number[] {
  if (seat < 0 || seat >= values.length) return [...values];
  return values.map((v, i) => (i === seat ? Math.trunc(v + delta) : v));
}

export const QUICK_DELTAS = [5, 10, 20, -5, -10] as const;
```

- [ ] **Step 4: correr y ver pasar**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/score/round-draft.test.ts` → 4 passed.

- [ ] **Step 5: `RoundSheet` sin inputs**

Sustituye `src/components/play/score/round-sheet.tsx` entero por:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import type { PlayStore } from "@/lib/play/core/store";
import type { RoundEditedEvent, RoundScoredEvent } from "@/lib/play/score/events";
import { applyDelta, QUICK_DELTAS } from "@/lib/play/score/round-draft";
import type { ScoreState } from "@/lib/play/score/types";
import { buttonVariants } from "@/components/ui/button";
import { HoldRepeatButton } from "../resources/hold-repeat-button";
import { SeatToken, initials } from "../ui/seat-token";
import { PlaySheet } from "../play-sheet";

const at = () => Date.now();

/**
 * Hoja de UNA ronda, sin teclado del sistema: chips ±5/±10/±20 que aplican al
 * asiento ACTIVO (el último tocado) y, por fila, ficha + número + −/+ con
 * mantener. Con N `<input>` apilados el teclado tapaba «Apuntar» a partir de
 * seis jugadores, y era el gesto más repetido de la herramienta (critique
 * 2026-09-01). `round === null` es alta (todo a cero); un número es edición.
 */
export function RoundSheet({
  state,
  store,
  round,
  onClose,
}: {
  state: ScoreState;
  store: PlayStore;
  round: number | null;
  onClose: () => void;
}) {
  const t = useTranslations("play");
  const [values, setValues] = useState<number[]>(() =>
    round === null ? state.setup.participants.map(() => 0) : [...state.rounds[round]],
  );
  const [active, setActive] = useState(0);
  // Mantener pulsado acumula en local y se pinta encima del valor hasta soltar.
  const [preview, setPreview] = useState<{ seat: number; delta: number } | null>(null);

  const shown = (seat: number) =>
    values[seat] + (preview && preview.seat === seat ? preview.delta : 0);

  function bump(seat: number, delta: number) {
    setActive(seat);
    setPreview(null);
    setValues((v) => applyDelta(v, seat, delta));
  }

  function confirm() {
    const applied =
      round === null
        ? store.dispatch(
            makeEvent<RoundScoredEvent["type"], RoundScoredEvent["payload"]>(
              "round_scored",
              { scores: values },
              at(),
            ),
          )
        : store.dispatch(
            makeEvent<RoundEditedEvent["type"], RoundEditedEvent["payload"]>(
              "round_edited",
              { round, scores: values },
              at(),
            ),
          );
    if (applied) onClose();
  }

  const activeName = state.setup.participants[active]?.name ?? "";

  return (
    <PlaySheet
      title={round === null ? t("roundSheet.title") : t("roundSheet.edit", { round: round + 1 })}
      onClose={onClose}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2 px-3" role="group" aria-label={t("roundSheet.quickFor", { name: activeName })}>
          {QUICK_DELTAS.map((delta) => (
            <button
              key={delta}
              type="button"
              onClick={() => bump(active, delta)}
              aria-label={t("roundSheet.quick", { n: delta > 0 ? `+${delta}` : String(delta), name: activeName })}
              className="tap-44 h-11 min-w-11 rounded-chip border border-border bg-surface px-3 font-mono text-[14px] tabular-nums"
            >
              {delta > 0 ? `+${delta}` : delta}
            </button>
          ))}
        </div>

        {state.setup.participants.map((participant, seat) => (
          <div
            key={participant.id}
            className={`flex items-center gap-2 rounded-card px-3 py-1 ${seat === active ? "bg-surface-muted" : ""}`}
          >
            <SeatToken
              variant="seat"
              seat={seat}
              caption={participant.name}
              label={t("roundSheet.activate", { name: participant.name })}
              selected={seat === active}
              onClick={() => setActive(seat)}
            >
              {initials(participant.name)}
            </SeatToken>
            <span
              className="min-w-0 flex-1 text-right font-serif text-[24px] font-semibold tabular-nums"
              aria-label={t("roundSheet.scoreOf", { name: participant.name })}
            >
              {shown(seat)}
            </span>
            <HoldRepeatButton
              direction={-1}
              label={t("roundSheet.minus", { name: participant.name })}
              onPreview={(acc) => setPreview({ seat, delta: acc })}
              onCommit={(delta) => bump(seat, delta)}
            />
            <HoldRepeatButton
              direction={1}
              label={t("roundSheet.plus", { name: participant.name })}
              onPreview={(acc) => setPreview({ seat, delta: acc })}
              onCommit={(delta) => bump(seat, delta)}
            />
          </div>
        ))}

        <div className="sticky bottom-0 bg-surface pt-2">
          <button
            type="button"
            onClick={confirm}
            className={buttonVariants("primary", "w-full justify-center py-2.5 text-[14px]")}
          >
            {t("roundSheet.confirm")}
          </button>
        </div>
      </div>
    </PlaySheet>
  );
}
```

- [ ] **Step 6: copy**

Bloque `play.roundSheet`:

```json
    "roundSheet": {
      "title": "Nueva ronda",
      "edit": "Editar ronda {round}",
      "confirm": "Apuntar",
      "scoreOf": "Puntos de {name}",
      "activate": "Puntuar a {name}",
      "plus": "Sumar uno a {name}",
      "minus": "Restar uno a {name}",
      "quick": "Sumar {n} a {name}",
      "quickFor": "Cantidades rápidas para {name}"
    },
```

- [ ] **Step 7: e2e helper**

En `e2e/partidas-puntuacion.spec.ts` sustituye `apuntarValores` por:

```ts
/** Compone `target` para un asiento con chips (+20/+10/+5/−5/−10) y ±1. */
async function ponerPuntos(page: Page, seat: number, target: number) {
  const name = `Jugador ${seat + 1}`;
  await page.getByRole("button", { name: `Puntuar a ${name}` }).click();
  let value = 0;
  const chip = async (label: string) =>
    page.getByRole("button", { name: `Sumar ${label} a ${name}` }).click();
  while (target - value >= 20) { await chip("+20"); value += 20; }
  while (target - value >= 10) { await chip("+10"); value += 10; }
  while (target - value >= 5) { await chip("+5"); value += 5; }
  while (value - target >= 10) { await chip("-10"); value -= 10; }
  while (value - target >= 5) { await chip("-5"); value -= 5; }
  while (value < target) { await page.getByRole("button", { name: `Sumar uno a ${name}` }).click(); value++; }
  while (value > target) { await page.getByRole("button", { name: `Restar uno a ${name}` }).click(); value--; }
  await expect(page.getByLabel(`Puntos de ${name}`)).toHaveText(String(target));
}

/** Hoja de ronda ya abierta: pone cada puntuación en orden de asiento y confirma. */
async function apuntarValores(page: Page, scores: number[]) {
  for (let seat = 0; seat < scores.length; seat++) {
    await ponerPuntos(page, seat, scores[seat]);
  }
  await page.getByRole("button", { name: /^apuntar$/i }).click();
}
```

Ojo: en edición la hoja precarga valores; `ponerPuntos` parte de `value = 0` porque en los tests de edición se comprueba el valor final con el `toHaveText`, así que si un test edita una ronda, cambia `let value = 0` por leer el texto: `let value = Number(await page.getByLabel(\`Puntos de ${name}\`).textContent());`. Aplica esa lectura siempre (vale para alta, que empieza en 0).

- [ ] **Step 8: e2e**

Run: `fnm exec --using=22 -- npm.cmd run test:e2e -- e2e/partidas-puntuacion.spec.ts` → verde. Si un test de edición falla por el valor de partida, revisa el Step 7.

- [ ] **Step 9: commit**

```bash
git add src/lib/play/score/round-draft.ts src/lib/play/score/round-draft.test.ts src/components/play/score/round-sheet.tsx messages/es.json e2e/partidas-puntuacion.spec.ts
git commit -m "feat(play): la hoja de ronda se apunta con chips y steppers -- fuera los N inputs"
```

---

### Task 3: `addPlayer` / `removePlayer` en el borrador de MTG

**Files:**
- Modify: `src/lib/play/ui/setup-draft.ts`
- Modify: `src/lib/play/ui/setup-draft.test.ts`

**Interfaces:**
- Produces: `addPlayer(draft: SetupDraft): SetupDraft`, `removePlayer(draft: SetupDraft, index: number): SetupDraft`.

- [ ] **Step 1: tests**

Añade al final de `src/lib/play/ui/setup-draft.test.ts` (importa `addPlayer, removePlayer` junto a los demás):

```ts
describe("addPlayer / removePlayer", () => {
  it("añade un asiento vacío con el primer id libre, hasta el máximo del modo", () => {
    let d = newDraft("commander", 2);
    d = addPlayer(d);
    expect(d.players.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(d.players[2].commanders[0].id).toBe("p3-c1");
    d = addPlayer(addPlayer(addPlayer(d)));
    expect(d.players).toHaveLength(6);
    expect(addPlayer(d).players).toHaveLength(6);
  });
  it("quitar por el medio no duplica ids al volver a añadir", () => {
    let d = newDraft("commander", 3);
    d = removePlayer(d, 1);
    expect(d.players.map((p) => p.id)).toEqual(["p1", "p3"]);
    d = addPlayer(d);
    expect(d.players.map((p) => p.id)).toEqual(["p1", "p3", "p2"]);
  });
  it("no baja del mínimo del modo", () => {
    const d = newDraft("commander", 2);
    expect(removePlayer(d, 0).players).toHaveLength(2);
  });
  it("recoloca quién empieza: el quitado pasa a 0, los de detrás bajan uno", () => {
    const d = { ...newDraft("commander", 4), startingSeat: 3 };
    expect(removePlayer(d, 3).startingSeat).toBe(0);
    expect(removePlayer(d, 1).startingSeat).toBe(2);
    expect(removePlayer({ ...d, startingSeat: 0 }, 2).startingSeat).toBe(0);
  });
  it("lo que sale de toSetup tras añadir y quitar arranca en el motor", () => {
    const d = addPlayer(removePlayer(newDraft("commander", 4), 1));
    expect(() => arrancar(toSetup(d, nombrePorDefecto))).not.toThrow();
  });
});
```

- [ ] **Step 2: ver fallar**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/ui/setup-draft.test.ts` → FAIL (`addPlayer` no exportado).

- [ ] **Step 3: implementación**

En `src/lib/play/ui/setup-draft.ts`, tras `setPlayerCount`:

```ts
/** Primer `p{n}` libre: quitar por el medio y volver a añadir no puede duplicar. */
function nextSeatIndex(players: readonly DraftPlayer[]): number {
  const used = new Set(players.map((p) => p.id));
  let n = 0;
  while (used.has(playerId(n))) n++;
  return n;
}

/** Un asiento vacío más, si el modo lo admite (fichas de la mesa, 2026-09-01). */
export function addPlayer(draft: SetupDraft): SetupDraft {
  if (draft.players.length >= modeConfig(draft.mode).maxPlayers) return draft;
  return { ...draft, players: [...draft.players, emptyPlayer(nextSeatIndex(draft.players))] };
}

/** Quita un asiento y recoloca quién empieza: el quitado pasa al primero, los de detrás bajan uno. */
export function removePlayer(draft: SetupDraft, index: number): SetupDraft {
  if (draft.players.length <= modeConfig(draft.mode).minPlayers) return draft;
  if (index < 0 || index >= draft.players.length) return draft;
  const players = draft.players.filter((_, i) => i !== index);
  const startingSeat =
    draft.startingSeat === index ? 0 : draft.startingSeat > index ? draft.startingSeat - 1 : draft.startingSeat;
  return { ...draft, players, startingSeat };
}
```

- [ ] **Step 4: ver pasar**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/ui/setup-draft.test.ts` → todos verdes.

- [ ] **Step 5: commit**

```bash
git add src/lib/play/ui/setup-draft.ts src/lib/play/ui/setup-draft.test.ts
git commit -m "feat(play): addPlayer/removePlayer en el borrador de MTG con ids libres"
```

---

### Task 4: Configuración de MTG con fichas, vidas por chips y quién empieza por fichas

**Files:**
- Modify: `src/components/play/setup-form.tsx` (reescritura del JSX; la lógica de prefill/degradación/start no cambia)
- Modify: `messages/es.json` (bloque `play.setup`, línea ~2677)
- Modify: `e2e/partidas-habituales.spec.ts:35-44`
- Test: `e2e/partidas-mtg.spec.ts`, `e2e/partidas-habituales.spec.ts`

**Interfaces:**
- Consumes: `SeatRow` (Task 1), `SeatToken size="sm"` (Task 1), `addPlayer`/`removePlayer` (Task 3), `useHoldRepeat` (`{ step, onPreview, onCommit }` → `{ handlers }`), `RegularPicker` (props `identity, players, takenIds, query, assigned, onPick, onRemembered, self, onPickSelf, suggestOnEmpty`).

- [ ] **Step 1: imports y estado nuevo**

En `setup-form.tsx` cambia los imports:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
// ...
import { useHoldRepeat } from "@/components/play/ui/use-hold-repeat";
import {
  addCommander,
  addPlayer,
  assignRegular,
  assignSelf,
  draftFromSetup,
  newDraft,
  removeCommander,
  removePlayer,
  toSetup,
  updateCommander,
  updatePlayer,
  type SetupDraft,
} from "@/lib/play/ui/setup-draft";
import { buttonVariants } from "@/components/ui/button";
import { RegularPicker } from "./regular-picker";
import { SeatRow } from "./ui/seat-row";
import { SeatToken, initials } from "./ui/seat-token";
import { useRememberedTable } from "./use-remembered-table";

const LIFE_CHIPS = [20, 30, 40] as const;
const LIFE_MIN = 1;
const LIFE_MAX = 999;
```

Elimina el import de `setPlayerCount` (ya no se usa) y la constante `FIELD` se mantiene.

Tras `const draft = edited ?? base;` añade:

```tsx
  const [openSeat, setOpenSeat] = useState<string | null>(null);
  const openIndex = draft.players.findIndex((p) => p.id === openSeat);
  const [lifePreview, setLifePreview] = useState(0);
  const clampLife = (n: number) => Math.min(LIFE_MAX, Math.max(LIFE_MIN, n));
  const commitLife = (total: number) => {
    setEdited({ ...draft, startingLife: clampLife(draft.startingLife + total) });
    setLifePreview(0);
  };
  const lifeUp = useHoldRepeat({ step: 1, onPreview: setLifePreview, onCommit: commitLife });
  const lifeDown = useHoldRepeat({ step: -1, onPreview: setLifePreview, onCommit: commitLife });
  const shownLife = clampLife(draft.startingLife + lifePreview);
  const availableRegulars = regulars.filter((r) => !takenIds.includes(r.playerId));

  function seatRegular(regular: { playerId: string; name: string }) {
    const free = draft.players.findIndex(
      (p) => p.name.trim() === "" && p.playerId === undefined && p.userId === undefined,
    );
    if (free >= 0) {
      setEdited(assignRegular(draft, free, regular));
      return;
    }
    const grown = addPlayer(draft);
    if (grown === draft) return;
    setEdited(assignRegular(grown, grown.players.length - 1, regular));
  }

  function addSeat() {
    const grown = addPlayer(draft);
    if (grown === draft) return;
    setEdited(grown);
    setOpenSeat(grown.players[grown.players.length - 1].id);
  }
```

(`takenIds` ya se calcula antes en el fichero; mueve estas líneas debajo de él.)

- [ ] **Step 2: JSX**

Sustituye todo lo que va desde el `{config.minPlayers !== config.maxPlayers && (` hasta el cierre del segundo `</details>` por:

```tsx
      {/* El botón ANTES que la mesa: empezar no exige tocarla. */}
      <div>
        <button
          type="button"
          onClick={start}
          disabled={snapshot.status === "loading"}
          className={buttonVariants("primary", "w-full justify-center py-3 text-[15px]")}
        >
          {t("setup.start")}
        </button>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {isRematch && remembered
            ? t("setup.rematchSeat", { name: seatName(draft.startingSeat) })
            : t("setup.emptyIsFine")}
        </p>
      </div>

      {/* La mesa como fichas: el número de jugadores ES el número de fichas.
          Tocar una abre SU panel; antes eran 3-4 campos por asiento y el
          pliegue abría desplegado en revancha (14 controles con cuatro). */}
      <section>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("setup.players")}
        </p>
        <SeatRow
          seats={draft.players.map((p, i) => ({
            id: p.id,
            caption: seatName(i),
            content: p.name.trim() === "" ? i + 1 : initials(p.name),
            selected: p.id === openSeat,
          }))}
          onSeatTap={(id) => setOpenSeat(id === openSeat ? null : id)}
          panelId="mtg-seat"
          regulars={availableRegulars}
          onSeatRegular={seatRegular}
          canAdd={draft.players.length < config.maxPlayers}
          onAdd={addSeat}
          addControls="mtg-seat"
        />

        {openIndex >= 0 ? (
          <div id="mtg-seat" className="mt-3 flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
            <div className="flex items-center gap-2">
              <input
                key={draft.players[openIndex].id}
                autoFocus
                value={draft.players[openIndex].name}
                onChange={(e) => setEdited(updatePlayer(draft, openIndex, { name: e.target.value }))}
                placeholder={t("setup.playerN", { n: openIndex + 1 })}
                aria-label={t("setup.name")}
                className={`${FIELD} min-w-0 font-serif text-[15px] font-semibold`}
              />
              {config.minPlayers !== config.maxPlayers ? (
                <button
                  type="button"
                  disabled={draft.players.length <= config.minPlayers}
                  onClick={() => {
                    setEdited(removePlayer(draft, openIndex));
                    setOpenSeat(null);
                  }}
                  className="tap-44 shrink-0 rounded-chip border border-border px-3 py-1.5 text-[13px] text-muted-foreground disabled:opacity-40"
                >
                  {t("seats.removeSeat")}
                </button>
              ) : null}
            </div>
            <RegularPicker
              identity={identity}
              players={regulars}
              takenIds={takenIds}
              query={draft.players[openIndex].name}
              assigned={
                draft.players[openIndex].playerId !== undefined ||
                draft.players[openIndex].userId !== undefined
              }
              onPick={(regular) => setEdited(assignRegular(draft, openIndex, regular))}
              onRemembered={(regular) => setEdited(assignRegular(draft, openIndex, regular))}
              self={self}
              onPickSelf={(me) => setEdited(assignSelf(draft, openIndex, me))}
              suggestOnEmpty={false}
            />
            <input
              value={draft.players[openIndex].deckName}
              onChange={(e) => setEdited(updatePlayer(draft, openIndex, { deckName: e.target.value }))}
              placeholder={t("setup.noDeck")}
              aria-label={t("setup.deck")}
              className={FIELD}
            />
            {draft.players[openIndex].commanders.map((commander, j) => (
              <div key={commander.id} className="flex gap-1.5">
                <input
                  value={commander.name}
                  onChange={(e) => setEdited(updateCommander(draft, openIndex, j, e.target.value))}
                  placeholder={t("setup.noCommander")}
                  aria-label={t("setup.commanderN", { n: j + 1 })}
                  className={FIELD}
                />
                {draft.players[openIndex].commanders.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setEdited(removeCommander(draft, openIndex, j))}
                    aria-label={t("setup.removeCommander")}
                    className="tap-44 h-11 w-11 shrink-0 rounded-chip border border-border text-[16px] text-muted-foreground"
                  >
                    −
                  </button>
                )}
              </div>
            ))}
            {draft.players[openIndex].commanders.length < config.maxCommanders && (
              <button
                type="button"
                onClick={() => setEdited(addCommander(draft, openIndex))}
                className="tap-44 self-start font-mono text-[10px] uppercase tracking-widest text-accent-ink"
              >
                + {t("setup.addCommander")}
              </button>
            )}
            {/* El fondo se elige AQUÍ: viaja en game_started y no hay evento
                para cambiarlo después (#943). Referencia, nunca bytes (#942). */}
            <div className="flex gap-2 pt-1" role="group" aria-label={t("setup.background")}>
              {CARD_BACKGROUND_IDS.map((id, tint) => {
                const chosen = (draft.players[openIndex].cardBackground ?? `seat-${openIndex + 1}`) === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setEdited(updatePlayer(draft, openIndex, { cardBackground: id }))}
                    aria-label={t("setup.backgroundN", { n: tint + 1 })}
                    aria-pressed={chosen}
                    className={`h-11 w-11 rounded-chip ${seatAccent(tint).tint} ${
                      chosen ? `ring-2 ${seatAccent(tint).ring}` : ""
                    }`}
                  />
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      {/* Vidas: chips de los tres valores de siempre + stepper con mantener. */}
      <section>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("setup.startingLife")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {LIFE_CHIPS.map((life) => (
            <button
              key={life}
              type="button"
              aria-pressed={draft.startingLife === life}
              onClick={() => setEdited({ ...draft, startingLife: life })}
              className={`tap-44 h-11 min-w-11 rounded-chip border px-3 font-mono text-[15px] tabular-nums transition-colors ${
                draft.startingLife === life ? "border-accent bg-accent/10 text-accent-ink" : "border-border bg-surface"
              }`}
            >
              {life}
            </button>
          ))}
          <span className="ml-auto inline-flex items-center gap-1">
            <button
              type="button"
              aria-label={t("setup.lifeFewer")}
              {...lifeDown.handlers}
              className="h-11 w-11 select-none rounded-chip border border-border text-[18px] font-semibold [touch-action:manipulation]"
            >
              −
            </button>
            <span className="w-14 text-center font-serif text-[22px] font-semibold tabular-nums" aria-live="polite">
              {shownLife}
            </span>
            <button
              type="button"
              aria-label={t("setup.lifeMore")}
              {...lifeUp.handlers}
              className="h-11 w-11 select-none rounded-chip border border-border text-[18px] font-semibold [touch-action:manipulation]"
            >
              +
            </button>
          </span>
        </div>
      </section>

      {/* Quién empieza: la misma fila de fichas, en pequeño; la elegida con halo. */}
      <section>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("setup.startingSeat")}
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("setup.startingSeat")}>
          {draft.players.map((p, i) => (
            <SeatToken
              key={p.id}
              variant="seat"
              seat={i}
              size="sm"
              caption={seatName(i)}
              label={t("setup.startsWith", { name: seatName(i) })}
              selected={draft.startingSeat === i}
              onClick={() => setEdited({ ...draft, startingSeat: i })}
            >
              {p.name.trim() === "" ? i + 1 : initials(p.name)}
            </SeatToken>
          ))}
        </div>
      </section>
```

Borra el bloque antiguo de «Empezar» (el `<div>` que había antes del `<details>`), ya que ahora va arriba de la mesa. Tras esto el fichero no debe contener `<details>`, `<select>`, `type="number"` ni `<fieldset>`.

- [ ] **Step 3: copy**

Bloque `play.setup`: borra `table`, `advanced`, `advancedSummary`; añade:

```json
      "backgroundN": "Fondo {n}",
      "lifeFewer": "Una vida menos de inicio",
      "lifeMore": "Una vida más de inicio",
      "startsWith": "Empieza {name}",
```

- [ ] **Step 4: e2e de habituales (mtg)**

En `e2e/partidas-habituales.spec.ts:38-40` sustituye:

```ts
  await page.goto("/partidas/mtg/nueva");
  await page.getByRole("button", { name: "Editar a Jugador 1" }).click();
  await page.getByLabel("Nombre").fill("Ana");
```

- [ ] **Step 5: typecheck y e2e**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit -p .` → limpio.
Run: `fnm exec --using=22 -- npm.cmd run test:e2e -- e2e/partidas-mtg.spec.ts e2e/partidas-habituales.spec.ts e2e/partidas-navegacion.spec.ts e2e/partidas-persistencia.spec.ts` → verde. Si `partidas-navegacion` o `-persistencia` tocan «En la mesa»/«Personalizar», actualízalos con el mismo criterio del Step 4.

- [ ] **Step 6: commit**

```bash
git add src/components/play/setup-form.tsx messages/es.json e2e/partidas-habituales.spec.ts
git commit -m "feat(play): la mesa de MTG son fichas -- fuera el contador, el pliegue y el select"
```

---

### Task 5: Glifos de recurso y evento `resource_updated`

**Files:**
- Create: `src/components/play/resources/resource-icons.tsx`
- Modify: `src/lib/play/resources/events.ts`
- Modify: `src/lib/play/resources/reducer.ts`
- Modify: `src/lib/play/resources/reducer.test.ts`

**Interfaces:**
- Produces: `RESOURCE_ICON_IDS`, `RESOURCE_PRESETS: { id: ResourceIconId; nameKey: string }[]`, `ResourceGlyph({ icon, className })`.
- Produces: `ResourceUpdatedEvent = PlayEvent<"resource_updated", { name: string; initial: number; shared: boolean }>`.

- [ ] **Step 1: tests del reducer**

Añade a `src/lib/play/resources/reducer.test.ts`, junto a los helpers, `const update = (name: string, initial: number, shared: boolean) => ev("resource_updated", { name, initial, shared });` y el bloque:

```ts
describe("resource_updated", () => {
  it("cambia la definición y conserva los valores que ya había", () => {
    const s = run([players(["Ana"]), addRes("Madera", 5), adjust("Madera", "Ana", 2), update("Madera", 9, false)]);
    expect(s.defs[0]).toEqual({ name: "Madera", emoji: "", initial: 9, shared: false });
    expect(valueOf(s, "Madera", "Ana")).toBe(7);
  });
  it("pasar a banco reconcilia: una sola entrada compartida a initial", () => {
    const s = run([players(["Ana", "Beto"]), addRes("Oro", 1), update("Oro", 3, true)]);
    expect(s.values).toEqual([{ resource: "Oro", owner: null, value: 3 }]);
  });
  it("values_reset aplica el nuevo inicial", () => {
    const s = run([players(["Ana"]), addRes("Madera", 5), update("Madera", 9, false), ev("values_reset", {})]);
    expect(valueOf(s, "Madera", "Ana")).toBe(9);
  });
  it("recurso inexistente o initial fuera de rango lanza", () => {
    const base = run([players(["Ana"]), addRes("Madera", 5)]);
    expect(() => resourcesReducer(base, update("Oro", 1, false))).toThrow("recurso inexistente");
    expect(() => resourcesReducer(base, update("Madera", -1, false))).toThrow("initial fuera de rango");
  });
});
```

- [ ] **Step 2: ver fallar**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/resources/reducer.test.ts` → FAIL (tipo/evento desconocido).

- [ ] **Step 3: evento y reducer**

`src/lib/play/resources/events.ts`: añade el tipo y la entrada del mapa:

```ts
export type ResourceUpdatedEvent = PlayEvent<
  "resource_updated",
  { name: string; initial: number; shared: boolean }
>;
// en la unión:
  | ResourceUpdatedEvent
// en RESOURCES_EVENT_TYPE_MAP:
  resource_updated: true,
```

`src/lib/play/resources/reducer.ts`, nuevo caso tras `resource_removed`:

```ts
    case "resource_updated": {
      const { name, initial, shared } = event.payload;
      if (!state.defs.some((d) => d.name === name)) throw new Error("recurso inexistente");
      if (!Number.isInteger(initial) || initial < RESOURCE_VALUE_MIN || initial > RESOURCE_VALUE_MAX) {
        throw new Error("initial fuera de rango");
      }
      // Solo cambia la definición: los valores que ya había se conservan y
      // «Reiniciar valores» es quien aplica el nuevo inicial. Cambiar de
      // dueño reconcilia (banco = una entrada; jugadores = una por cabeza).
      const defs = state.defs.map((d) => (d.name === name ? { ...d, initial, shared } : d));
      return { ...state, defs, values: reconcile(state.players, defs, state.values) };
    }
```

- [ ] **Step 4: ver pasar**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/resources/reducer.test.ts` → verde. Si hay un test de «evento desconocido» que enumera tipos, añade `resource_updated`.

- [ ] **Step 5: glifos**

`src/components/play/resources/resource-icons.tsx`:

```tsx
import type { ReactNode } from "react";

/**
 * Glifos propios de recurso (spec visual-first §4). Antes eran emoji del
 * sistema: 🪙 y 🪨 son Emoji 13 y salían como cuadrado vacío en Windows 10 y
 * Android < 11, y DESIGN.md veta los emojis. Trazo en `currentColor` sobre
 * 24×24, estilo de las marcas del hub (`marks/*.tsx`). El id viaja en el
 * campo `emoji` del evento (≤ 8 caracteres, reducer intacto).
 */
export const RESOURCE_ICON_IDS = [
  "gold", "wood", "stone", "wheat", "sheep", "brick", "gem", "heart", "bolt", "star",
] as const;
export type ResourceIconId = (typeof RESOURCE_ICON_IDS)[number];

export const RESOURCE_PRESETS: { id: ResourceIconId; nameKey: string }[] = RESOURCE_ICON_IDS.map(
  (id) => ({ id, nameKey: `presets.${id}` }),
);

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const GLYPHS: Record<ResourceIconId, ReactNode> = {
  gold: (
    <>
      <circle cx="12" cy="12" r="8" {...S} />
      <circle cx="12" cy="12" r="3" {...S} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return <line key={i} x1={12 + 4.5 * Math.cos(a)} y1={12 + 4.5 * Math.sin(a)} x2={12 + 6.5 * Math.cos(a)} y2={12 + 6.5 * Math.sin(a)} {...S} />;
      })}
    </>
  ),
  wood: (
    <>
      <ellipse cx="7" cy="12" rx="3" ry="5" {...S} />
      <path d="M7 7h9a3 5 0 0 1 0 10H7" {...S} />
      <circle cx="7" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  stone: <path d="M6 16l2-7 6-3 5 4-1 6-5 2z" {...S} />,
  wheat: (
    <>
      <path d="M12 21V8" {...S} />
      <path d="M12 8c-3 0-4-2-4-4 2 0 4 1 4 4zM12 8c3 0 4-2 4-4-2 0-4 1-4 4z" {...S} />
      <path d="M12 13c-3 0-4-2-4-4 2 0 4 1 4 4zM12 13c3 0 4-2 4-4-2 0-4 1-4 4z" {...S} />
    </>
  ),
  sheep: (
    <>
      <path d="M6 13a4 4 0 0 1 2-7 4 4 0 0 1 8 0 4 4 0 0 1 2 7 4 4 0 0 1-3 4H9a4 4 0 0 1-3-4z" {...S} />
      <path d="M9 17v3M15 17v3" {...S} />
      <circle cx="17" cy="10" r="1" fill="currentColor" />
    </>
  ),
  brick: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="1" {...S} />
      <path d="M4 12h16M12 6v6M8 12v6M16 12v6" {...S} />
    </>
  ),
  gem: <path d="M8 4h8l4 5-8 11L4 9z M4 9h16 M8 4l4 5 4-5 M12 9v11" {...S} />,
  heart: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" {...S} />,
  bolt: <path d="M13 3L5 14h6l-1 7 8-11h-6z" {...S} />,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" {...S} />,
};

function isIconId(value: string): value is ResourceIconId {
  return (RESOURCE_ICON_IDS as readonly string[]).includes(value);
}

/** Pinta el glifo de un id conocido; cualquier otro string (emoji de eventos viejos) sale como texto. */
export function ResourceGlyph({ icon, className = "h-6 w-6" }: { icon: string; className?: string }) {
  if (!isIconId(icon)) return icon ? <span className="text-[16px] leading-none">{icon}</span> : null;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      {GLYPHS[icon]}
    </svg>
  );
}
```

- [ ] **Step 6: typecheck y commit**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit -p .` → limpio.

```bash
git add src/components/play/resources/resource-icons.tsx src/lib/play/resources/events.ts src/lib/play/resources/reducer.ts src/lib/play/resources/reducer.test.ts
git commit -m "feat(play): glifos propios de recurso y evento resource_updated"
```

---

### Task 6: Configuración de Recursos con presets

**Files:**
- Modify: `src/components/play/resources/resources-config.tsx` (reescritura)
- Modify: `src/components/play/resources/resources-board.tsx:41`
- Modify: `messages/es.json` (bloque `play.resources`, línea ~2982)
- Modify: `e2e/partidas-recursos.spec.ts:19-29`

**Interfaces:**
- Consumes: `RESOURCE_PRESETS`, `ResourceGlyph`, `RESOURCE_ICON_IDS` (Task 5); `resource_updated` (Task 5); `SeatPicker` (Task 1); `useHoldRepeat`.

- [ ] **Step 1: tablero pinta glifo**

En `resources-board.tsx:41` sustituye `{def.emoji ? \`${def.emoji} \` : ""}` por `<ResourceGlyph icon={def.emoji} className="mr-1 inline h-4 w-4 align-[-2px]" />` (importa `ResourceGlyph` de `./resource-icons`).

- [ ] **Step 2: `ResourcesConfig`**

Sustituye el fichero entero por:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useHoldRepeat } from "@/components/play/ui/use-hold-repeat";
import { SeatPicker } from "@/components/play/ui/seat-picker";
import { SeatToken, initials } from "@/components/play/ui/seat-token";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ResourcesEvent } from "@/lib/play/resources/events";
import type { ResourceDef, ResourcesState } from "@/lib/play/resources/types";
import {
  RESOURCES_MAX_DEFS,
  RESOURCES_MAX_PLAYERS,
  RESOURCE_VALUE_MAX,
  RESOURCE_VALUE_MIN,
} from "@/lib/play/resources/reducer";
import { stableColor } from "@/components/play/random/stage/stage-helpers";
import { RESOURCE_ICON_IDS, RESOURCE_PRESETS, ResourceGlyph } from "./resource-icons";

const clampInitial = (n: number) => Math.min(RESOURCE_VALUE_MAX, Math.max(RESOURCE_VALUE_MIN, n));

/**
 * Configuración del gestor (spec visual-first §4): jugadores como fichas,
 * recursos como PRESETS que se crean de un toque (fichas fantasma con glifo),
 * ficha creada que se toca para ajustar inicial/dueño/quitar, y un «+» que
 * abre el constructor de recurso libre — el único input de la pantalla.
 * Antes arrancaba en un campo de texto vacío con emojis del sistema.
 */
export function ResourcesConfig({
  identity,
  state,
  emit,
}: {
  identity: string;
  state: ResourcesState;
  emit: CompanionEmit<ResourcesEvent>;
}) {
  const t = useTranslations("play.resources");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [resName, setResName] = useState("");
  const [icon, setIcon] = useState("");

  const taken = new Set(state.defs.map((d) => d.name));
  const full = state.defs.length >= RESOURCES_MAX_DEFS;
  const presets = RESOURCE_PRESETS.map((p) => ({ ...p, name: t(p.nameKey) })).filter((p) => !taken.has(p.name));
  const opened = state.defs.find((d) => d.name === open) ?? null;

  const trimmedRes = resName.trim();
  const addValid = trimmedRes !== "" && !taken.has(trimmedRes) && !full;

  function createPreset(name: string, id: string) {
    if (full || taken.has(name)) return;
    emit("resource_added", { name, emoji: id, initial: 0, shared: false });
  }

  function createCustom() {
    if (!addValid) return;
    emit("resource_added", { name: trimmedRes, emoji: icon, initial: 0, shared: false });
    setResName("");
    setIcon("");
    setAdding(false);
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("players")}</p>
      <div className="mt-2">
        <SeatPicker
          identity={identity}
          players={state.players}
          max={RESOURCES_MAX_PLAYERS}
          onChange={(players) => emit("players_set", { players })}
          idPrefix="resources"
        />
      </div>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("resources")}</p>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        {state.defs.map((d) => (
          <SeatTokenLike
            key={d.name}
            def={d}
            selected={d.name === open}
            label={t("editResource", { name: d.name })}
            onClick={() => setOpen(open === d.name ? null : d.name)}
          />
        ))}
        {full
          ? null
          : presets.map((p) => (
              <SeatToken
                key={p.id}
                variant="regular"
                caption={p.name}
                label={t("preset", { name: p.name })}
                onClick={() => createPreset(p.name, p.id)}
              >
                <ResourceGlyph icon={p.id} className="h-5 w-5" />
              </SeatToken>
            ))}
        {full ? null : (
          <SeatToken
            variant="add"
            caption={t("custom")}
            label={t("customResource")}
            expanded={adding}
            controls="resources-custom"
            onClick={() => setAdding(!adding)}
          />
        )}
      </div>

      {opened ? <DefPanel def={opened} emit={emit} onRemoved={() => setOpen(null)} /> : null}

      {adding ? (
        <div id="resources-custom" className="mt-3 flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
          <input
            autoFocus
            value={resName}
            placeholder={t("resourcePlaceholder")}
            onChange={(e) => setResName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createCustom();
            }}
            aria-label={t("resourceName")}
            className="min-w-0 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("iconPicker")}>
            {RESOURCE_ICON_IDS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={icon === id}
                aria-label={t("iconOption", { name: t(`presets.${id}`) })}
                onClick={() => setIcon(icon === id ? "" : id)}
                className={`flex h-11 w-11 items-center justify-center rounded-chip border ${
                  icon === id ? "border-foreground bg-surface-muted" : "border-border"
                }`}
              >
                <ResourceGlyph icon={id} className="h-5 w-5" />
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!addValid}
            onClick={createCustom}
            className="tap-44 self-start rounded-chip border border-border px-4 py-2 text-[13px] font-semibold disabled:opacity-40"
          >
            {t("create")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Ficha de un recurso creado: color estable, glifo o inicial, y el inicial debajo. */
function SeatTokenLike({
  def,
  selected,
  label,
  onClick,
}: {
  def: ResourceDef;
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <span className="flex w-14 flex-col items-center gap-1">
      <button
        type="button"
        aria-label={label}
        aria-expanded={selected}
        aria-controls="resources-def"
        title={def.name}
        onClick={onClick}
        className="flex h-11 w-11 flex-col items-center justify-center rounded-full text-surface [touch-action:manipulation]"
        style={{
          background: stableColor(def.name),
          ...(selected ? { boxShadow: "0 0 0 2px var(--background), 0 0 0 4px var(--accent-ink)" } : {}),
        }}
      >
        <ResourceGlyph icon={def.emoji || initials(def.name)} className="h-5 w-5" />
        <span className="text-[10px] font-semibold tabular-nums">{def.initial}</span>
      </button>
      <span className="w-full truncate text-center text-[10px] text-muted-foreground">{def.name}</span>
    </span>
  );
}

/** Panel de un recurso: inicial con mantener, dueño segmentado y quitar. Cada cambio emite. */
function DefPanel({
  def,
  emit,
  onRemoved,
}: {
  def: ResourceDef;
  emit: CompanionEmit<ResourcesEvent>;
  onRemoved: () => void;
}) {
  const t = useTranslations("play.resources");
  const [preview, setPreview] = useState(0);
  const commit = (total: number) => {
    const initial = clampInitial(def.initial + total);
    setPreview(0);
    if (initial !== def.initial) emit("resource_updated", { name: def.name, initial, shared: def.shared });
  };
  const up = useHoldRepeat({ step: 1, onPreview: setPreview, onCommit: commit });
  const down = useHoldRepeat({ step: -1, onPreview: setPreview, onCommit: commit });
  const seg = (on: boolean) =>
    `tap-44 rounded-chip border px-3 py-1.5 text-[13px] font-semibold ${on ? "border-foreground bg-surface-muted" : "border-border"}`;

  return (
    <div id="resources-def" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-3">
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          aria-label={t("fewerInitial")}
          disabled={def.initial <= RESOURCE_VALUE_MIN}
          {...down.handlers}
          className="h-11 w-11 select-none rounded-chip border border-border text-[18px] font-semibold disabled:opacity-40 [touch-action:manipulation]"
        >
          −
        </button>
        <span className="w-14 text-center font-serif text-[20px] font-semibold tabular-nums">
          {clampInitial(def.initial + preview)}
        </span>
        <button
          type="button"
          aria-label={t("moreInitial")}
          disabled={def.initial >= RESOURCE_VALUE_MAX}
          {...up.handlers}
          className="h-11 w-11 select-none rounded-chip border border-border text-[18px] font-semibold disabled:opacity-40 [touch-action:manipulation]"
        >
          +
        </button>
      </span>
      <span className="inline-flex gap-1" role="group" aria-label={t("owner")}>
        <button type="button" aria-pressed={!def.shared} onClick={() => def.shared && emit("resource_updated", { name: def.name, initial: def.initial, shared: false })} className={seg(!def.shared)}>
          {t("ownerPlayers")}
        </button>
        <button type="button" aria-pressed={def.shared} onClick={() => !def.shared && emit("resource_updated", { name: def.name, initial: def.initial, shared: true })} className={seg(def.shared)}>
          {t("ownerBank")}
        </button>
      </span>
      <button
        type="button"
        onClick={() => {
          emit("resource_removed", { name: def.name });
          onRemoved();
        }}
        className="tap-44 rounded-chip border border-border px-3 py-1.5 text-[13px] text-muted-foreground"
      >
        {t("removeResource", { name: def.name })}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: copy**

En `play.resources`: borra `emojiPicker`, `emojiOption`; añade:

```json
      "iconPicker": "Icono",
      "iconOption": "Icono {name}",
      "preset": "Crear {name}",
      "editResource": "Editar {name}",
      "custom": "A medida",
      "customResource": "Recurso a medida",
      "presets": {
        "gold": "Oro", "wood": "Madera", "stone": "Piedra", "wheat": "Trigo", "sheep": "Oveja",
        "brick": "Ladrillo", "gem": "Gema", "heart": "Vida", "bolt": "Energía", "star": "Puntos"
      },
```

- [ ] **Step 4: e2e**

En `e2e/partidas-recursos.spec.ts` sustituye las líneas 18-29 (desde el comentario «Ficha viva» hasta el segundo «Crear ficha») por:

```ts
  // Presets: un toque crea Madera (jugadores, 0); su ficha abre el panel
  // donde el inicial sube a 5. Oro se crea y pasa al banco.
  await page.getByRole("button", { name: "Crear Madera" }).click();
  await page.getByRole("button", { name: "Editar Madera" }).click();
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: "Uno más de inicio" }).click();
  }
  await page.getByRole("button", { name: "Crear Oro" }).click();
  await page.getByRole("button", { name: "Editar Oro" }).click();
  await page.getByRole("button", { name: "Banco", exact: true }).click();
```

Y añade un test nuevo al final del fichero:

```ts
test("recurso a medida: el «+» abre el único input y crea con glifo", async ({ page }) => {
  await page.goto("/partidas/recursos");
  await expect(page.getByLabel("Nombre del recurso")).toHaveCount(0);
  await page.getByRole("button", { name: "Recurso a medida" }).click();
  await page.getByLabel("Nombre del recurso").fill("Maná");
  await page.getByRole("button", { name: "Icono Energía" }).click();
  await page.getByRole("button", { name: "Crear ficha" }).click();
  await expect(page.getByRole("button", { name: "Editar Maná" })).toBeVisible();
  await expect(page.getByLabel("Nombre del recurso")).toHaveCount(0);
});
```

- [ ] **Step 5: e2e y commit**

Run: `fnm exec --using=22 -- npm.cmd run test:e2e -- e2e/partidas-recursos.spec.ts` → verde.

```bash
git add src/components/play/resources/resources-config.tsx src/components/play/resources/resources-board.tsx messages/es.json e2e/partidas-recursos.spec.ts
git commit -m "feat(play): recursos por preset de un toque, glifos propios y panel por ficha"
```

---

### Task 7: Límite Libre/Rondas/Puntos con stepper y juego tras «+»

**Files:**
- Create: `src/components/play/score/target-stepper.tsx`
- Modify: `src/components/play/score/score-setup-form.tsx:452-540`
- Modify: `src/components/play/score/score-preset-chooser.tsx:147-176`
- Modify: `messages/es.json` (bloque `play.scoreSetup`, línea ~2713)
- Modify: `e2e/partidas-puntuacion.spec.ts:105-115`

**Interfaces:**
- Produces: `TargetStepper({ kind: "rounds" | "points", value: number, onChange(value: number): void })`.
- Consumes: `useHoldRepeat`.

- [ ] **Step 1: `TargetStepper`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useHoldRepeat } from "@/components/play/ui/use-hold-repeat";

const MIN = 1;
const MAX = 9999;
export const clampTarget = (n: number) => Math.min(MAX, Math.max(MIN, Math.trunc(n)));

/**
 * El N del límite como número grande con −/+ y mantener (spec visual-first §5).
 * Paso 1 para rondas y 5 para puntos: un límite de 100 puntos no se sube de uno
 * en uno. Lo usan el hub y la configuración: un solo control, un solo aspecto.
 */
export function TargetStepper({
  kind,
  value,
  onChange,
}: {
  kind: "rounds" | "points";
  value: number;
  onChange: (value: number) => void;
}) {
  const t = useTranslations("play.scoreSetup");
  const step = kind === "points" ? 5 : 1;
  const [preview, setPreview] = useState(0);
  const commit = (total: number) => {
    setPreview(0);
    onChange(clampTarget(value + total));
  };
  const up = useHoldRepeat({ step, onPreview: setPreview, onCommit: commit });
  const down = useHoldRepeat({ step: -step, onPreview: setPreview, onCommit: commit });
  const btn =
    "h-11 w-11 select-none rounded-chip border border-border text-[18px] font-semibold disabled:opacity-40 [touch-action:manipulation]";
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={t("fewer")} disabled={value <= MIN} {...down.handlers} className={btn}>
        −
      </button>
      <span
        className="min-w-16 text-center font-serif text-[34px] font-semibold leading-none tabular-nums"
        aria-label={t("targetValue")}
        aria-live="polite"
      >
        {clampTarget(value + preview)}
      </span>
      <button type="button" aria-label={t("more")} disabled={value >= MAX} {...up.handlers} className={btn}>
        +
      </button>
      <span className="text-[13px] text-muted-foreground">{t(kind === "rounds" ? "rounds" : "points").toLowerCase()}</span>
    </div>
  );
}
```

- [ ] **Step 2: `score-setup-form.tsx`**

Sustituye los tres `<fieldset>` (dirección, límite, juego) por:

```tsx
      <section>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("scoreSetup.direction")}
        </p>
        <div className="flex gap-2">
          {(["highest", "lowest"] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              aria-pressed={draft.direction === direction}
              onClick={() => setEdited({ ...draft, direction })}
              className={`h-11 flex-1 rounded-chip border px-3 text-[13px] transition-colors ${
                draft.direction === direction ? "border-accent bg-accent/10 text-accent-ink" : "border-border bg-surface"
              }`}
            >
              {t(direction === "highest" ? "scoreSetup.highest" : "scoreSetup.lowest")}
            </button>
          ))}
        </div>
      </section>

      {/* Límite: Libre / Rondas / Puntos de un toque, y el N como stepper. Antes
          no había forma de cambiar rondas por puntos: el tipo solo venía del preset. */}
      <section>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("scoreSetup.target")}
        </p>
        <div className="flex gap-2" role="group" aria-label={t("scoreSetup.target")}>
          {(["free", "rounds", "points"] as const).map((option) => {
            const on = option === "free" ? !draft.targetActive : draft.targetActive && draft.targetKind === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setEdited(
                    option === "free"
                      ? { ...draft, targetActive: false }
                      : { ...draft, targetActive: true, targetKind: option },
                  )
                }
                className={`h-11 flex-1 rounded-chip border px-3 text-[13px] transition-colors ${
                  on ? "border-accent bg-accent/10 text-accent-ink" : "border-border bg-surface"
                }`}
              >
                {t(`scoreSetup.${option}`)}
              </button>
            );
          })}
        </div>
        {draft.targetActive ? (
          <div className="mt-3">
            <TargetStepper
              kind={draft.targetKind}
              value={draft.targetValue}
              onChange={(targetValue) => setEdited({ ...draft, targetValue })}
            />
          </div>
        ) : null}
      </section>

      {/* A qué se juega: chips de lo guardado y un «+» para el único input. */}
      <section>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("scoreSetup.gameName")}
        </p>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("scoreSetup.gameNameChips")}>
          {[...new Set([...(draft.gameName.trim() ? [draft.gameName.trim()] : []), ...gameNameChoices])].map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={draft.gameName.trim() === name}
              onClick={() => setEdited({ ...draft, gameName: draft.gameName.trim() === name ? "" : name })}
              className={`tap-44 h-11 rounded-chip border px-3 text-[13px] transition-colors ${
                draft.gameName.trim() === name ? "border-accent bg-accent/10 text-accent-ink" : "border-border bg-surface"
              }`}
            >
              {name}
            </button>
          ))}
          <button
            type="button"
            aria-label={t("scoreSetup.addGame")}
            aria-expanded={addingGame}
            aria-controls="score-game-name"
            onClick={() => setAddingGame(!addingGame)}
            className="tap-44 h-11 w-11 rounded-chip border border-dashed border-border text-[18px] text-muted-foreground"
          >
            +
          </button>
        </div>
        {addingGame ? (
          <div id="score-game-name" className="mt-2">
            <input
              autoFocus
              value={draft.gameName}
              onChange={(e) => setEdited({ ...draft, gameName: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") setAddingGame(false);
              }}
              placeholder={t("scoreSetup.gameNamePlaceholder")}
              aria-label={t("scoreSetup.gameName")}
              className={`${FIELD} w-56`}
            />
          </div>
        ) : null}
      </section>
```

Añade `const [addingGame, setAddingGame] = useState(false);` junto a `openSeat`, importa `TargetStepper` de `./target-stepper`. La guarda de `start()` (`if (draft.targetActive && (!Number.isInteger(...)...)) return;`) se queda tal cual: el stepper ya garantiza entero ≥ 1 y esto es cinturón.

Sustituye también el `<fieldset>` de «Jugadores» (líneas 372-402) por `<section>` + `<p>` mono de 10 px y la fila de fichas manual por `SeatRow` (spec §1; importa `SeatRow` de `../ui/seat-row` y quita los imports de `SeatToken`/`RegularTokens` si dejan de usarse):

```tsx
        <SeatRow
          seats={draft.players.map((player, i) => ({
            id: player.id,
            caption: seatName(i),
            content: player.name.trim() === "" ? i + 1 : initials(player.name),
            selected: player.id === openSeat,
          }))}
          onSeatTap={(id) => setOpenSeat(id === openSeat ? null : id)}
          panelId="score-seat"
          regulars={availableRegulars}
          onSeatRegular={seatRegular}
          canAdd={draft.players.length < MAX_PLAYERS}
          onAdd={addSeat}
          addControls="score-seat"
        />
```

- [ ] **Step 3: hub**

En `score-preset-chooser.tsx` sustituye el bloque `{preset !== "libre" && (<div className="mt-3 flex items-center gap-2"> … </div>)}` por:

```tsx
        {preset !== "libre" && (
          <div className="mt-3">
            <TargetStepper
              kind={preset === "rondas" ? "rounds" : "points"}
              value={targetValue ?? 1}
              onChange={(n) => setTargetValues({ ...targetValues, [preset]: n })}
            />
          </div>
        )}
```

Importa `TargetStepper` de `./target-stepper`.

- [ ] **Step 4: copy**

`play.scoreSetup` añade: `"free": "Libre"`, `"rounds": "Rondas"`, `"points": "Puntos"`, `"fewer": "Bajar límite"`, `"more": "Subir límite"`, `"addGame": "Otro juego"`.

- [ ] **Step 5: e2e**

En `e2e/partidas-puntuacion.spec.ts:105-115`: la navegación por «Configurar la mesa» arrastra `n=100`; para llegar a 20 sin input, cambia la URL del test: tras `page.getByRole("button", { name: /a x puntos/i }).click()` navega directo:

```ts
  await page.goto("/partidas/puntuacion/nueva?preset=puntos&jugadores=4&n=20");
  await expect(page.getByLabel("Valor del límite").filter({ visible: true })).toHaveText("20");
```

y borra el `fill("20")` y el `expect(page).toHaveURL(...)` del enlace (mueve ese `toHaveURL` a un test propio corto si quieres conservar la aserción del `n=100`: `await page.getByRole("link", { name: /^configurar la mesa$/i }).click(); await expect(page).toHaveURL(/n=100$/);`).

Añade un test:

```ts
test("config: Libre → Puntos con el stepper, y el juego tras el «+»", async ({ page }) => {
  await page.goto("/partidas/puntuacion/nueva");
  await expect(page.getByLabel("¿A qué jugáis?")).toHaveCount(0);
  await page.getByRole("button", { name: "Puntos", exact: true }).click();
  await page.getByRole("button", { name: "Subir límite" }).click();
  await expect(page.getByLabel("Valor del límite")).toHaveText("105");
  await page.getByRole("button", { name: "Otro juego" }).click();
  await page.getByLabel("¿A qué jugáis?").fill("Chinchón");
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);
});
```

Run: `fnm exec --using=22 -- npm.cmd run test:e2e -- e2e/partidas-puntuacion.spec.ts e2e/partidas-etiqueta-juego.spec.ts` → verde (si `etiqueta-juego` rellena «¿A qué jugáis?» directo, antepón el clic en «Otro juego»).

- [ ] **Step 6: commit**

```bash
git add src/components/play/score/target-stepper.tsx src/components/play/score/score-setup-form.tsx src/components/play/score/score-preset-chooser.tsx messages/es.json e2e/partidas-puntuacion.spec.ts e2e/partidas-etiqueta-juego.spec.ts
git commit -m "feat(play): limite Libre/Rondas/Puntos con stepper y el juego tras el «+»"
```

---

### Task 8: Bolsa sin inputs

**Files:**
- Modify: `src/components/play/random/bag-section.tsx:63-126`
- Modify: `messages/es.json` (bloque `play.random.bag`, línea ~2925)
- Modify: `e2e/partidas-aleatorio.spec.ts:85-90`

- [ ] **Step 1: componente**

Sustituye desde el comentario «min-w-0 en el input» hasta el cierre del `<label>` del checkbox por:

```tsx
      {/* «+» despliega el único input: nombre, cantidad con stepper y Añadir. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label={t("addType")}
          aria-expanded={adding}
          aria-controls="bag-add"
          onClick={() => setAdding(!adding)}
          className="tap-44 h-11 w-11 rounded-chip border border-dashed border-border text-[18px] text-muted-foreground"
        >
          +
        </button>
        <span className="inline-flex gap-1" role="group" aria-label={t("replacementMode")}>
          <button type="button" aria-pressed={!bag.withReplacement} onClick={() => bag.withReplacement && onBagSet(alive(), false)} className={seg(!bag.withReplacement)}>
            {t("noReplacement")}
          </button>
          <button type="button" aria-pressed={bag.withReplacement} onClick={() => !bag.withReplacement && onBagSet(alive(), true)} className={seg(bag.withReplacement)}>
            {t("replacement")}
          </button>
        </span>
      </div>
      {adding ? (
        <div id="bag-add" className="mt-2 flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={name}
            placeholder={t("namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addItem();
            }}
            aria-label={t("itemName")}
            className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
          <span className="inline-flex items-center gap-1">
            <button type="button" aria-label={t("fewer")} disabled={count <= 1} {...down.handlers} className={stepBtn}>−</button>
            <span className="w-8 text-center text-[14px] font-semibold tabular-nums" aria-label={t("itemCount")}>{count + preview}</span>
            <button type="button" aria-label={t("more")} disabled={count >= 99} {...up.handlers} className={stepBtn}>+</button>
          </span>
          <button
            type="button"
            disabled={!addValid}
            onClick={addItem}
            className="tap-44 rounded-chip border border-border px-3 py-1.5 text-[13px] disabled:opacity-40"
          >
            {t("add")}
          </button>
        </div>
      ) : null}
```

Cambios de estado en la cabecera del componente:

```tsx
  const [name, setName] = useState("");
  const [count, setCount] = useState(1);
  const [preview, setPreview] = useState(0);
  const [adding, setAdding] = useState(false);
  const commitCount = (total: number) => {
    setCount((c) => Math.min(99, Math.max(1, c + total)));
    setPreview(0);
  };
  const up = useHoldRepeat({ step: 1, onPreview: setPreview, onCommit: commitCount });
  const down = useHoldRepeat({ step: -1, onPreview: setPreview, onCommit: commitCount });
  const stepBtn = "h-11 w-11 select-none rounded-chip border border-border text-[18px] font-semibold disabled:opacity-40 [touch-action:manipulation]";
  const seg = (on: boolean) => `tap-44 rounded-chip border px-3 py-1.5 text-[13px] font-semibold ${on ? "border-foreground bg-surface-muted" : "border-border"}`;
```

`addValid` pasa a `name.trim() !== "" && !bag.items.some((i) => i.name === name.trim())`; `addItem` usa `count` y al terminar hace `setName(""); setCount(1); setAdding(false);`. Importa `useHoldRepeat` de `@/components/play/ui/use-hold-repeat`. El botón «×» de cada tipo pasa a `className="tap-44 h-11 w-11 rounded-chip border border-border text-[14px]"`.

- [ ] **Step 2: copy**

`play.random.bag`: borra `withReplacement`; añade `"addType": "Añadir tipo"`, `"fewer": "Menos fichas"`, `"more": "Más fichas"`, `"replacementMode": "Reposición"`, `"noReplacement": "Sin reposición"`, `"replacement": "Con reposición"`.

- [ ] **Step 3: e2e**

En `e2e/partidas-aleatorio.spec.ts:85-90`:

```ts
  for (const tipo of ["Rojo", "Azul"]) {
    await page.getByRole("button", { name: "Añadir tipo" }).click();
    await page.getByLabel("Tipo de ficha").fill(tipo);
    await page.getByRole("button", { name: /^añadir$/i }).click();
  }
```

Run: `fnm exec --using=22 -- npm.cmd run test:e2e -- e2e/partidas-aleatorio.spec.ts` → verde (el test de overflow sigue: el «+» cerrado no desborda; ábrelo antes de medir si quieres cubrir el input: añade `await page.getByRole("button", { name: "Añadir tipo" }).click();` antes del `evaluate` y un segundo clic para cerrarlo después).

- [ ] **Step 4: commit**

```bash
git add src/components/play/random/bag-section.tsx messages/es.json e2e/partidas-aleatorio.spec.ts
git commit -m "feat(play): la bolsa se rellena tras el «+» -- fuera los inputs y el checkbox"
```

---

### Task 9: Suite completa, doc y cierre

**Files:**
- Modify: `docs/requirements/decisiones.md` (append-only, vía heredoc Bash)
- Modify: `docs/requirements/backlog.md` (si la épica #931 lista esta tanda)
- Issue nueva: contadores 2-8/2-6 de los hubs como fichas (`area:play,tipo:deuda,P2`)

- [ ] **Step 1: suite**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit -p .` → limpio.
Run: `fnm exec --using=22 -- npx.cmd vitest run` → todo verde.
Run: `fnm exec --using=22 -- npx.cmd eslint src/components/play src/lib/play` → sin errores nuevos (los `react-hooks/set-state-in-effect` de `score-setup-form.tsx` y `use-players.ts` son previos).
Run: `fnm exec --using=22 -- npm.cmd run test:e2e -- e2e/partidas-` → verde.
Run: `grep -rn 'type="number"\|<select\|type="checkbox"\|<fieldset' src/components/play` → solo `dice-section.tsx` (caras del dado tras «d?», aceptado en spec).

- [ ] **Step 2: actas**

Añade al final de `docs/requirements/decisiones.md` (Bash heredoc, `>>`):

```markdown

## La ficha de asiento se toca para abrir, nunca para quitar (2026-09-01)

En los acompañantes tocar una ficha quitaba al jugador y en puntuación la abría: la misma forma con dos
acciones opuestas, y la primera sin deshacer. Se unifica en `SeatRow`: tocar selecciona y abre el panel;
quitar vive dentro. Los acompañantes no renombran (identifican por nombre; renombrar sería quitar+añadir).

## Los recursos llevan glifo propio y se ajustan con `resource_updated` (2026-09-01)

Los iconos eran emoji del sistema: `🪙`/`🪨` son Emoji 13 y salían en blanco en Windows 10 y Android < 11,
además de contravenir DESIGN.md. Diez glifos SVG en `resource-icons.tsx`; el id viaja en el campo `emoji`
(≤ 8 chars, reducer intacto) y los eventos viejos siguen pintando su texto. Los presets crean de un toque
(inicial 0, jugadores) y el panel de la ficha emite `resource_updated`, que solo toca la definición: los
valores en juego se conservan y «Reiniciar valores» aplica el nuevo inicial.

## Sin `type=number`, `select` ni `checkbox` en BiblioPlay (2026-09-01)

Tras la critique visual (25/40): la hoja de ronda va con chips ±5/±10/±20 y −/+ con mantener, el límite
de puntuación es Libre/Rondas/Puntos con `TargetStepper` (paso 1 rondas, 5 puntos) en hub y config, la
config de MTG son fichas con panel + chips de vidas + fichas de quién empieza, y la bolsa se rellena tras
un «+». Única excepción: las caras del `d?` del Aleatorio, ya tras su chip.
```

- [ ] **Step 3: issue de los hubs**

```sh
gh issue create --label "area:play,tipo:deuda,P2" --title "Hubs de Puntuación y MTG: el contador 2-8/2-6 repite con otros controles lo que la config pide con fichas" --body-file <scratchpad>/issue-hubs.md
```

Cuerpo: qué pasa (hub pregunta jugadores con chips numéricos; la config siguiente con fichas; MTG lo pregunta dos veces más), qué se esperaba (un solo vocabulario visual), reproducir (`/partidas/puntuacion` → «Configurar la mesa»), qué SÍ funciona (`?jugadores=` viaja bien), opción registrada en la critique (fichas en el hub o quitar el contador).

- [ ] **Step 4: commit y PR**

```bash
git add docs/requirements/decisiones.md docs/requirements/backlog.md
git commit -m "docs(play): actas de la tanda visual-first"
git push -u origin feat/play-visual-first
gh pr create --title "feat(play): visual-first -- seis pantallas dejan de ser formulario" --body-file <scratchpad>/pr.md
```

El cuerpo de la PR lleva las capturas antes/después de las seis pantallas (hoja de ronda, config MTG, config Recursos, config Puntuación, Bolsa, panel de ficha) a 390 px, la respuesta a la regla #437 («ningún `use cache` nuevo»), y termina con `🤖 Generated with [Claude Code](https://claude.com/claude-code)` y el enlace de sesión.
