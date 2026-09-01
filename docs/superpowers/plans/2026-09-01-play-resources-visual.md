# Recursos: pasada visual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La configuración del gestor deja de ser formulario: jugadores como fichas de asiento, alta de recurso como ficha viva (picker de emojis + stepper + toggle Jugadores/Banco) y `HoldRepeatButton` migrado al hook compartido.

**Architecture:** Motor y tablero intactos. `HoldRepeatButton` pasa a envoltorio de `useHoldRepeat` (cero cambio de comportamiento). `ResourcesConfig` reescrito con el lenguaje de fichas del reloj y una preview que se construye al vuelo.

**Tech Stack:** React 19, next-intl, Playwright.

## Global Constraints

- Rama `feat/play-resources` (PR #998 la absorbe; ya trae mergeado `useHoldRepeat`) — commits directos.
- Motor (`src/lib/play/resources/`), tablero (`resources-board.tsx`), pantalla (`resources-screen.tsx`), hub y marca INTACTOS.
- Un gesto = un deshacer; `select-none` + `[touch-action:manipulation]` en elementos con hold.
- Lecciones del reloj horneadas: tocar un habitual con borrador a medio escribir NO lo borra; `aria-controls` en la ficha «+».
- Testids del tablero (`res-*`) intactos.
- Unit: `fnm exec --using=22 -- npx.cmd vitest run <path>`. e2e: `fnm exec --using=22 -- npm.cmd run test:e2e -- <spec>` (Playwright gestiona el dev server; NO arrancar otro). Node 20 del shell rompe ambos: siempre el prefijo fnm.
- `git add` con rutas explícitas, nunca `-A` ni `.`.
- Trailers de commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4`

---

### Task 1: `HoldRepeatButton` migra a `useHoldRepeat`

**Files:**
- Modify: `src/components/play/resources/hold-repeat-button.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `useHoldRepeat` de `@/components/play/ui/use-hold-repeat`.
- Produces: misma firma pública `HoldRepeatButton({ direction, label, onPreview, onCommit })` — el tablero no se toca.

- [ ] **Step 1: Reescribir el fichero**

Contenido completo:

```tsx
"use client";

import { useHoldRepeat } from "@/components/play/ui/use-hold-repeat";

/**
 * Botón ±1 con mantener-pulsado: envoltorio fino sobre el hook compartido
 * useHoldRepeat — la máquina del gesto (timers, guard del click sintético,
 * cancelaciones) vive allí con sus arreglos de review (avanza #996). Toque =
 * onCommit(±1); mantener acumula EN LOCAL (onPreview) y al soltar emite UN
 * onCommit con el total — un gesto = un deshacer.
 */
export function HoldRepeatButton({
  direction,
  label,
  onPreview,
  onCommit,
}: {
  direction: 1 | -1;
  label: string;
  onPreview: (accumulated: number) => void;
  onCommit: (delta: number) => void;
}) {
  const { handlers } = useHoldRepeat({ step: direction, onPreview, onCommit });
  return (
    <button
      type="button"
      aria-label={label}
      {...handlers}
      className="h-10 w-10 select-none rounded-chip border border-border text-[18px] font-semibold [touch-action:manipulation]"
    >
      {direction > 0 ? "+" : "−"}
    </button>
  );
}
```

- [ ] **Step 2: Verificar — cero cambio de comportamiento**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
Run: `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-recursos.spec.ts` — Expected: 2/2 PASS sin tocar el spec.

- [ ] **Step 3: Commit**

```bash
git add src/components/play/resources/hold-repeat-button.tsx
git commit -m "refactor(play): HoldRepeatButton sobre useHoldRepeat -- una sola maquina de gesto (avanza #996)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 2: `ResourcesConfig` — ficha viva, picker y fichas de asiento

**Files:**
- Modify: `src/components/play/resources/resources-config.tsx` (reescritura completa)
- Modify: `messages/es.json` (claves de `play.resources`)

**Interfaces:**
- Consumes: `useHoldRepeat`, `stableColor`, `SEAT_ACCENT`, constantes del motor — todo existente.
- Produces: misma firma `ResourcesConfig({ identity, state, emit })`.

- [ ] **Step 1: Reescribir `resources-config.tsx`**

Contenido completo:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePlayers } from "@/lib/play/core/use-players";
import { useHoldRepeat } from "@/components/play/ui/use-hold-repeat";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ResourcesEvent } from "@/lib/play/resources/events";
import type { ResourcesState } from "@/lib/play/resources/types";
import {
  RESOURCES_MAX_DEFS,
  RESOURCES_MAX_PLAYERS,
  RESOURCE_VALUE_MAX,
  RESOURCE_VALUE_MIN,
} from "@/lib/play/resources/reducer";
import { stableColor } from "@/components/play/random/stage/stage-helpers";
import { SEAT_ACCENT } from "@/lib/play/ui/seats";

const EMOJI_OPTIONS = ["🪙", "🌲", "💎", "❤️", "⚡", "🧱", "🐑", "🌾", "🪨", "⭐"];

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

/**
 * Configuración visual del gestor (spec recursos-visual §2): jugadores como
 * fichas de asiento (mismo lenguaje que el reloj — tocar quita, habituales
 * atenuados se encienden, la ficha «+» abre el input) y alta de recurso como
 * FICHA VIVA: la preview se construye al teclear/tocar (emoji del picker,
 * inicial con stepper con mantener, dueño con toggle segmentado). Cada cambio
 * emite: la config vive en el log como todo lo demás.
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
  const { players: regulars } = usePlayers(identity);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [resName, setResName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [initial, setInitial] = useState(0);
  const [initialPreview, setInitialPreview] = useState(0);
  const [shared, setShared] = useState(false);

  const clampInitial = (n: number) =>
    Math.min(RESOURCE_VALUE_MAX, Math.max(RESOURCE_VALUE_MIN, n));
  const shownInitial = clampInitial(initial + initialPreview);
  const commitInitial = (total: number) => {
    setInitial((v) => clampInitial(v + total));
    setInitialPreview(0);
  };
  const stepUp = useHoldRepeat({ step: 1, onPreview: setInitialPreview, onCommit: commitInitial });
  const stepDown = useHoldRepeat({
    step: -1,
    onPreview: setInitialPreview,
    onCommit: commitInitial,
  });

  function addPlayer(candidate: string, fromInput = false) {
    const trimmed = candidate.trim();
    if (trimmed === "" || state.players.includes(trimmed)) return;
    if (state.players.length >= RESOURCES_MAX_PLAYERS) return;
    emit("players_set", { players: [...state.players, trimmed] });
    // Solo el alta DESDE el input limpia y cierra: tocar un habitual con un
    // nombre a medio escribir no se traga el borrador (lección del reloj).
    if (fromInput) {
      setName("");
      setAdding(false);
    }
  }

  const regularTokens = regulars.filter((r) => !state.players.includes(r.name)).slice(0, 6);

  const trimmedRes = resName.trim();
  const addValid =
    trimmedRes !== "" &&
    !state.defs.some((d) => d.name === trimmedRes) &&
    state.defs.length < RESOURCES_MAX_DEFS;

  function addResource() {
    if (!addValid) return;
    emit("resource_added", { name: trimmedRes, emoji, initial, shared });
    setResName("");
    setEmoji("");
    setInitial(0);
    setInitialPreview(0);
    setShared(false);
  }

  const segClass = (selected: boolean) =>
    `rounded-chip border px-3 py-1.5 text-[13px] font-semibold ${
      selected ? "border-foreground bg-surface-muted" : "border-border"
    }`;

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("players")}
      </p>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        {state.players.map((p, i) => (
          <span key={p} className="flex w-14 flex-col items-center gap-1">
            <button
              type="button"
              aria-label={t("removePlayer", { name: p })}
              title={p}
              onClick={() =>
                emit("players_set", { players: state.players.filter((x) => x !== p) })
              }
              className="flex h-11 w-11 select-none items-center justify-center rounded-full text-[14px] font-semibold text-surface"
              style={{ background: `var(${SEAT_ACCENT[i % SEAT_ACCENT.length].varName})` }}
            >
              {initials(p)}
            </button>
            <span className="max-w-full truncate text-[10px] text-muted-foreground">{p}</span>
          </span>
        ))}
        {regularTokens.map((r) => (
          <span key={r.playerId} className="flex w-14 flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => addPlayer(r.name)}
              title={r.name}
              className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-border text-[14px] font-semibold text-muted-foreground opacity-70"
            >
              {initials(r.name)}
            </button>
            <span className="max-w-full truncate text-[10px] text-muted-foreground">{r.name}</span>
          </span>
        ))}
        {state.players.length < RESOURCES_MAX_PLAYERS ? (
          <span className="flex w-14 flex-col items-center gap-1">
            <button
              type="button"
              aria-label={t("addPlayer")}
              aria-expanded={adding}
              aria-controls="resources-add-player"
              onClick={() => setAdding(!adding)}
              className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-border text-[18px] font-semibold text-muted-foreground"
            >
              +
            </button>
            <span className="text-[10px] text-muted-foreground">{t("addPlayer")}</span>
          </span>
        ) : null}
      </div>
      {adding ? (
        <div id="resources-add-player" className="mt-2 flex justify-center">
          <input
            autoFocus
            value={name}
            placeholder={t("namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addPlayer(name, true);
            }}
            aria-label={t("nameLabel")}
            className="w-48 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
        </div>
      ) : null}

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("resources")}
      </p>

      {/* Ficha viva: la preview se construye con lo elegido. */}
      <div className="mt-2 flex items-center gap-4">
        <span
          aria-hidden
          className={`flex h-[72px] w-[72px] shrink-0 flex-col items-center justify-center rounded-full text-surface ${
            trimmedRes === "" ? "border-2 border-dashed border-border" : ""
          }`}
          style={trimmedRes === "" ? undefined : { background: stableColor(trimmedRes) }}
        >
          <span className="text-[24px] leading-none">
            {emoji || (trimmedRes ? initials(trimmedRes) : "?")}
          </span>
          <span
            className={`text-[13px] font-semibold tabular-nums ${
              trimmedRes === "" ? "text-muted-foreground" : ""
            }`}
          >
            {shownInitial}
          </span>
        </span>
        <input
          value={resName}
          placeholder={t("resourcePlaceholder")}
          onChange={(e) => setResName(e.target.value)}
          aria-label={t("resourceName")}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("emojiPicker")}>
        {EMOJI_OPTIONS.map((e) => (
          <button
            key={e}
            type="button"
            aria-pressed={emoji === e}
            aria-label={t("emojiOption", { emoji: e })}
            onClick={() => setEmoji(emoji === e ? "" : e)}
            className={`flex h-10 w-10 items-center justify-center rounded-chip border text-[20px] ${
              emoji === e ? "border-foreground bg-surface-muted" : "border-border"
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            aria-label={t("fewerInitial")}
            disabled={initial <= RESOURCE_VALUE_MIN}
            {...stepDown.handlers}
            className="h-9 w-9 select-none rounded-chip border border-border text-[16px] font-semibold disabled:opacity-40 [touch-action:manipulation]"
          >
            −
          </button>
          <span className="w-14 text-center text-[14px] font-semibold tabular-nums">
            {shownInitial}
          </span>
          <button
            type="button"
            aria-label={t("moreInitial")}
            disabled={initial >= RESOURCE_VALUE_MAX}
            {...stepUp.handlers}
            className="h-9 w-9 select-none rounded-chip border border-border text-[16px] font-semibold disabled:opacity-40 [touch-action:manipulation]"
          >
            +
          </button>
        </span>
        <span className="inline-flex gap-1" role="group" aria-label={t("owner")}>
          <button
            type="button"
            aria-pressed={!shared}
            onClick={() => setShared(false)}
            className={segClass(!shared)}
          >
            {t("ownerPlayers")}
          </button>
          <button
            type="button"
            aria-pressed={shared}
            onClick={() => setShared(true)}
            className={segClass(shared)}
          >
            {t("ownerBank")}
          </button>
        </span>
        <button
          type="button"
          disabled={!addValid}
          onClick={addResource}
          className="rounded-chip border border-border px-4 py-2 text-[13px] font-semibold disabled:opacity-40"
        >
          {t("create")}
        </button>
      </div>

      {state.defs.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-3">
          {state.defs.map((d) => (
            <li key={d.name} className="flex w-16 flex-col items-center gap-1">
              <button
                type="button"
                aria-label={t("removeResource", { name: d.name })}
                title={d.name}
                onClick={() => emit("resource_removed", { name: d.name })}
                className="flex h-11 w-11 flex-col items-center justify-center rounded-full text-surface"
                style={{ background: stableColor(d.name) }}
              >
                <span className="text-[16px] leading-none">{d.emoji || initials(d.name)}</span>
                <span className="text-[10px] font-semibold tabular-nums">{d.initial}</span>
              </button>
              <span className="max-w-full truncate text-[10px] text-muted-foreground">
                {d.name}
                {d.shared ? ` · ${t("bank")}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: i18n**

En `messages/es.json`, dentro de `play.resources`: BORRAR `"emojiLabel"`, `"initialLabel"`,
`"sharedLabel"` y `"add"`; AÑADIR (tras `"namePlaceholder"`):

```json
  "addPlayer": "Añadir jugador",
  "emojiPicker": "Icono",
  "emojiOption": "Icono {emoji}",
  "fewerInitial": "Uno menos de inicio",
  "moreInitial": "Uno más de inicio",
  "owner": "Dueño",
  "ownerPlayers": "Jugadores",
  "ownerBank": "Banco",
  "create": "Crear ficha",
```

- [ ] **Step 3: Verificar + commit**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
Run: `grep -rn "emojiLabel\|initialLabel\|sharedLabel" src messages` — Expected: sin resultados.
(e2e queda en rojo hasta la Task 3 — esperado: el spec usa el flujo viejo.)

```bash
git add src/components/play/resources/resources-config.tsx messages/es.json
git commit -m "feat(play): config de recursos como ficha viva -- picker de emojis, stepper con mantener y toggle de dueño

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 3: e2e adaptado + verificación completa

**Files:**
- Modify: `e2e/partidas-recursos.spec.ts` (bloque de configuración del test 1)

**Interfaces:** ninguna.

- [ ] **Step 1: Adaptar el bloque de configuración**

En el test 1, el bloque

```ts
  for (const name of ["Ana", "Beto"]) {
    await page.getByLabel("Nombre del jugador").fill(name);
    await page.getByRole("button", { name: "Añadir", exact: true }).click();
  }
  await page.getByLabel("Nombre del recurso").fill("Madera");
  await page.getByLabel("Valor inicial").fill("5");
  await page.getByRole("button", { name: "Añadir recurso" }).click();
  await page.getByLabel("Nombre del recurso").fill("Oro");
  await page.getByLabel("Compartido (banco)").check();
  await page.getByRole("button", { name: "Añadir recurso" }).click();
```

pasa a:

```ts
  // Jugadores como fichas: la ficha «+» abre el input; Enter añade y cierra.
  for (const name of ["Ana", "Beto"]) {
    await page.getByRole("button", { name: "Añadir jugador" }).click();
    await page.getByLabel("Nombre del jugador").fill(name);
    await page.getByLabel("Nombre del jugador").press("Enter");
  }
  // Ficha viva: Madera 🌲 a 5 para jugadores; Oro al banco.
  await page.getByLabel("Nombre del recurso").fill("Madera");
  await page.getByRole("button", { name: "Icono 🌲" }).click();
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: "Uno más de inicio" }).click();
  }
  await page.getByRole("button", { name: "Crear ficha" }).click();
  await page.getByLabel("Nombre del recurso").fill("Oro");
  await page.getByRole("button", { name: "Banco", exact: true }).click();
  await page.getByRole("button", { name: "Crear ficha" }).click();
```

El resto del test (tablero, chips, recarga, deshacer, reiniciar) y el test del hub quedan
INTACTOS.

- [ ] **Step 2: Verificación completa**

Run (en orden):
1. `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
2. `fnm exec --using=22 -- npx.cmd vitest run src/lib/play` — Expected: PASS todo (motor intacto).
3. `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-recursos.spec.ts` — Expected: 2/2 PASS.
4. `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-reloj.spec.ts partidas-aleatorio.spec.ts` — Expected: 3/3 + 5/5 PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/partidas-recursos.spec.ts
git commit -m "test(play): e2e de recursos sobre fichas, picker y stepper

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```
