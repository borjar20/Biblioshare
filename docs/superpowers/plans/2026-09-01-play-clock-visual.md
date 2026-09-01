# Reloj: pasada visual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El setup del reloj deja de ser formulario (esfera viva + fichas de jugador + stepper) y el aro de la cuenta atrás se vuelve el selector de duración; mueren los tres inputs custom.

**Architecture:** Motor intacto. Hook compartido nuevo `useHoldRepeat` en `src/components/play/ui/` (la máquina del gesto de recursos con sus arreglos de review, generalizada); `ClockFace` presentacional; `ChessSetup` y `CountdownPanel` reescritos sobre ellos.

**Tech Stack:** React 19, SVG, next-intl, Playwright.

## Global Constraints

- Rama `feat/play-clock` (PR #997 la absorbe) — commits directos.
- Motor y juego de ajedrez INTACTOS: nada bajo `src/lib/play/` ni en `chess-game.tsx`.
- Un gesto = un deshacer: mantener (stepper o aro) acumula en LOCAL y emite/aplica UNA vez al soltar.
- Hardening táctil en todo elemento con hold: `select-none` + `[touch-action:manipulation]` en el className del consumidor; el hook pone `onContextMenu` preventDefault.
- UN primario por vista (los CTA existentes); guardas `blockedByChess`/`blockedByCountdown` se conservan.
- Testids `clock-zone-*`/`clock-time-*`/`countdown-time` intactos.
- Unit: `fnm exec --using=22 -- npx.cmd vitest run <path>` (Node 20 del shell rompe vitest).
- e2e: `fnm exec --using=22 -- npm.cmd run test:e2e -- <spec>` (Playwright gestiona el dev server; NO arrancar otro).
- `git add` con rutas explícitas, nunca `-A` ni `.`.
- Trailers de commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4`

---

### Task 1: `useHoldRepeat` + `ClockFace` + setup con fichas

**Files:**
- Create: `src/components/play/ui/use-hold-repeat.ts`
- Create: `src/components/play/clock/clock-face.tsx`
- Modify: `src/components/play/clock/chess-setup.tsx` (reescritura completa)
- Modify: `messages/es.json` (claves de `play.clock`)

**Interfaces:**
- Consumes: `usePlayers`, `SEAT_ACCENT`, `buttonVariants`, `CLOCK_MAX_PLAYERS`, `CompanionEmit`/`ClockEvent`/`ClockState` — todo existente.
- Produces: `useHoldRepeat({ step, onPreview, onCommit, holdDelayMs?, repeatMs? }) → { handlers }` (Task 2 lo consume); `ClockFace({ minutes })`. La firma de `ChessSetup` no cambia.

- [ ] **Step 1: `use-hold-repeat.ts`**

```ts
"use client";

import { useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

const HOLD_DELAY_MS = 400;
const REPEAT_MS = 120;

/**
 * Gesto de mantener-pulsado compartido (spec reloj-visual §1): tap/teclado =
 * UN onCommit(step); mantener (≥holdDelayMs) acumula EN LOCAL (onPreview corre
 * el número en pantalla cada repeatMs) y al soltar emite UN onCommit con el
 * total — un gesto = un deshacer. Trae los arreglos de la review de recursos:
 * timers limpiados al reempezar y al desmontar, justHeld reseteado en cada
 * pointerdown (un click suprimido por el menú contextual no se traga el
 * siguiente toque), cancel en pointerleave/pointercancel y preventDefault del
 * menú contextual. El consumidor esparce `handlers` en su elemento y añade ÉL
 * `select-none` y `[touch-action:manipulation]` a su className.
 */
export function useHoldRepeat({
  step,
  onPreview,
  onCommit,
  holdDelayMs = HOLD_DELAY_MS,
  repeatMs = REPEAT_MS,
}: {
  step: number;
  onPreview: (accumulated: number) => void;
  onCommit: (total: number) => void;
  holdDelayMs?: number;
  repeatMs?: number;
}): {
  handlers: {
    onPointerDown: () => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
    onContextMenu: (e: ReactMouseEvent) => void;
    onClick: () => void;
  };
} {
  const acc = useRef(0);
  const held = useRef(false);
  const justHeld = useRef(false);
  const delay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTimers() {
    if (delay.current) clearTimeout(delay.current);
    if (repeat.current) clearInterval(repeat.current);
    delay.current = null;
    repeat.current = null;
  }

  // Limpieza al desmontar: un elemento que desaparece a mitad de mantener no
  // deja el interval vivo.
  useEffect(() => {
    return () => {
      if (delay.current) clearTimeout(delay.current);
      if (repeat.current) clearInterval(repeat.current);
    };
  }, []);

  function start() {
    stopTimers();
    justHeld.current = false;
    held.current = false;
    acc.current = 0;
    delay.current = setTimeout(() => {
      held.current = true;
      acc.current = step;
      onPreview(acc.current);
      repeat.current = setInterval(() => {
        acc.current += step;
        onPreview(acc.current);
      }, repeatMs);
    }, holdDelayMs);
  }

  function finish() {
    stopTimers();
    if (held.current) {
      justHeld.current = true;
      onCommit(acc.current);
      onPreview(0);
      held.current = false;
      acc.current = 0;
    }
  }

  function cancel() {
    stopTimers();
    if (held.current) {
      onPreview(0);
      held.current = false;
      acc.current = 0;
    }
  }

  return {
    handlers: {
      onPointerDown: start,
      onPointerUp: finish,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
      onClick: () => {
        if (justHeld.current) {
          justHeld.current = false;
          return;
        }
        onCommit(step);
      },
    },
  };
}
```

- [ ] **Step 2: `clock-face.tsx`**

```tsx
const TAU = Math.PI * 2;

/**
 * Esfera viva del setup (spec reloj-visual §2): arco sombreado proporcional a
 * los minutos elegidos (desde las 12, horario) con la aguja en su borde; más
 * de 60 min llena la esfera y la aguja marca el resto de la segunda vuelta
 * (anillo discontinuo la insinúa). Presentacional puro, aria-hidden — la
 * lectura textual va fuera.
 */
export function ClockFace({ minutes }: { minutes: number }) {
  const frac = Math.min(minutes, 60) / 60;
  const over = minutes > 60;
  const needleFrac = over ? (minutes % 60) / 60 : frac;
  const needleAngle = -Math.PI / 2 + needleFrac * TAU;
  const arcEnd = -Math.PI / 2 + frac * TAU;

  const arcPath = (() => {
    if (frac >= 1 || minutes <= 0) return null;
    const x = 50 + 38 * Math.cos(arcEnd);
    const y = 50 + 38 * Math.sin(arcEnd);
    const large = frac > 0.5 ? 1 : 0;
    return `M 50 50 L 50 12 A 38 38 0 ${large} 1 ${x} ${y} Z`;
  })();

  return (
    <svg viewBox="0 0 100 100" className="h-36 w-36" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="var(--surface)" stroke="var(--play-rail)" strokeWidth="2.5" />
      {Array.from({ length: 12 }, (_, i) => {
        const ang = (i * TAU) / 12 - Math.PI / 2;
        return (
          <line
            key={i}
            x1={50 + 40 * Math.cos(ang)}
            y1={50 + 40 * Math.sin(ang)}
            x2={50 + 44 * Math.cos(ang)}
            y2={50 + 44 * Math.sin(ang)}
            stroke="var(--play-rail)"
            strokeWidth={i % 3 === 0 ? 2 : 1}
          />
        );
      })}
      {frac >= 1 ? (
        <circle cx="50" cy="50" r="38" fill="color-mix(in srgb, var(--accent) 20%, transparent)" />
      ) : arcPath ? (
        <path d={arcPath} fill="color-mix(in srgb, var(--accent) 20%, transparent)" />
      ) : null}
      {over ? (
        <circle
          cx="50"
          cy="50"
          r="32"
          fill="none"
          stroke="color-mix(in srgb, var(--accent) 45%, transparent)"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
      ) : null}
      <line
        x1="50"
        y1="50"
        x2={50 + 36 * Math.cos(needleAngle)}
        y2={50 + 36 * Math.sin(needleAngle)}
        stroke="var(--accent-ink)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="50" cy="50" r="3" fill="var(--accent-ink)" />
    </svg>
  );
}
```

- [ ] **Step 3: Reescribir `chess-setup.tsx`**

Contenido completo:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { usePlayers } from "@/lib/play/core/use-players";
import { useHoldRepeat } from "@/components/play/ui/use-hold-repeat";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ClockEvent } from "@/lib/play/clock/events";
import type { ClockState } from "@/lib/play/clock/types";
import { CLOCK_MAX_PLAYERS } from "@/lib/play/clock/reducer";
import { SEAT_ACCENT } from "@/lib/play/ui/seats";
import { ClockFace } from "./clock-face";

const TIME_PRESETS_MIN = [1, 3, 5, 10, 15, 30];
const INCREMENT_PRESETS_S = [0, 5, 10, 30];
const MINUTES_MIN = 1;
const MINUTES_MAX = 120;

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

/**
 * Setup visual del reloj (spec reloj-visual §2): esfera viva que refleja el
 * tiempo elegido, jugadores como fichas de asiento (tocar quita; habituales
 * atenuados se encienden; la ficha «+» despliega el único input que queda) y
 * stepper de minutos con mantener. «Empezar 5+5» emite chess_configured —
 * el motor no cambia. El rango 1..120 min por construcción hace innecesaria
 * la validación de rangos aquí.
 */
export function ChessSetup({
  identity,
  state,
  emit,
}: {
  identity: string;
  state: ClockState;
  emit: CompanionEmit<ClockEvent>;
}) {
  const t = useTranslations("play.clock");
  const { players: regulars } = usePlayers(identity);
  const [players, setPlayers] = useState<string[]>(state.players.map((p) => p.name));
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [minutes, setMinutes] = useState(() =>
    Math.min(MINUTES_MAX, Math.max(MINUTES_MIN, Math.round(state.initialMs / 60_000) || 5)),
  );
  const [minutesPreview, setMinutesPreview] = useState(0);
  const [incrementS, setIncrementS] = useState(Math.round(state.incrementMs / 1000));

  const clampMin = (n: number) => Math.min(MINUTES_MAX, Math.max(MINUTES_MIN, n));
  const shownMinutes = clampMin(minutes + minutesPreview);
  const commitStep = (total: number) => {
    setMinutes((m) => clampMin(m + total));
    setMinutesPreview(0);
  };
  const stepUp = useHoldRepeat({ step: 1, onPreview: setMinutesPreview, onCommit: commitStep });
  const stepDown = useHoldRepeat({ step: -1, onPreview: setMinutesPreview, onCommit: commitStep });

  function add(candidate: string) {
    const trimmed = candidate.trim();
    if (trimmed === "" || players.includes(trimmed) || players.length >= CLOCK_MAX_PLAYERS) return;
    setPlayers([...players, trimmed]);
    setName("");
    setAdding(false);
  }

  const regularTokens = regulars.filter((r) => !players.includes(r.name)).slice(0, 6);
  const blockedByCountdown = state.mode === "countdown" && state.countdownRunning;
  const valid = players.length >= 2;
  const expr = incrementS > 0 ? `${shownMinutes}+${incrementS}` : t("minutes", { n: shownMinutes });

  const chipClass = (selected: boolean) =>
    `rounded-chip border px-3 py-1.5 text-[13px] font-semibold ${
      selected ? "border-foreground bg-surface-muted" : "border-border"
    }`;

  return (
    <div>
      <div className="flex flex-col items-center">
        <ClockFace minutes={shownMinutes} />
        <p className="mt-1 font-serif text-[20px] font-semibold tabular-nums">
          {t("minutes", { n: shownMinutes })}
          {incrementS > 0 ? ` · +${incrementS} s` : ""}
        </p>
      </div>

      {/* Fichas: jugadores en su color de asiento (tocar quita), habituales
          atenuados (tocar añade) y la ficha «+» que abre el input de nombre. */}
      <div className="mt-4 flex flex-wrap items-start justify-center gap-3">
        {players.map((p, i) => (
          <span key={p} className="flex w-14 flex-col items-center gap-1">
            <button
              type="button"
              aria-label={t("remove", { name: p })}
              title={p}
              onClick={() => setPlayers(players.filter((x) => x !== p))}
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
              onClick={() => add(r.name)}
              title={r.name}
              className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-border text-[14px] font-semibold text-muted-foreground opacity-70"
            >
              {initials(r.name)}
            </button>
            <span className="max-w-full truncate text-[10px] text-muted-foreground">{r.name}</span>
          </span>
        ))}
        {players.length < CLOCK_MAX_PLAYERS ? (
          <span className="flex w-14 flex-col items-center gap-1">
            <button
              type="button"
              aria-label={t("addPlayer")}
              aria-expanded={adding}
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
        <div className="mt-2 flex justify-center">
          <input
            autoFocus
            value={name}
            placeholder={t("namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add(name);
            }}
            aria-label={t("nameLabel")}
            className="w-48 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
        </div>
      ) : null}
      {players.length < 2 ? (
        <p className="mt-2 text-center text-[13px] text-muted-foreground">{t("playersHint")}</p>
      ) : null}

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("initial")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {TIME_PRESETS_MIN.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={shownMinutes === m}
            onClick={() => {
              setMinutes(m);
              setMinutesPreview(0);
            }}
            className={chipClass(shownMinutes === m)}
          >
            {t("minutes", { n: m })}
          </button>
        ))}
        <span className="ml-auto inline-flex items-center gap-1">
          <button
            type="button"
            aria-label={t("fewerMinutes")}
            disabled={minutes <= MINUTES_MIN}
            {...stepDown.handlers}
            className="h-9 w-9 select-none rounded-chip border border-border text-[16px] font-semibold disabled:opacity-40 [touch-action:manipulation]"
          >
            −
          </button>
          <button
            type="button"
            aria-label={t("moreMinutes")}
            disabled={minutes >= MINUTES_MAX}
            {...stepUp.handlers}
            className="h-9 w-9 select-none rounded-chip border border-border text-[16px] font-semibold disabled:opacity-40 [touch-action:manipulation]"
          >
            +
          </button>
        </span>
      </div>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("increment")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {INCREMENT_PRESETS_S.map((sec) => (
          <button
            key={sec}
            type="button"
            aria-pressed={incrementS === sec}
            onClick={() => setIncrementS(sec)}
            className={chipClass(incrementS === sec)}
          >
            {sec === 0 ? t("noIncrement") : t("plusSeconds", { n: sec })}
          </button>
        ))}
      </div>

      {blockedByCountdown ? (
        <p className="mt-4 text-[13px] text-muted-foreground">{t("blockedByCountdown")}</p>
      ) : null}
      <button
        type="button"
        disabled={!valid || blockedByCountdown}
        onClick={() =>
          emit("chess_configured", {
            players,
            initialMs: minutes * 60_000,
            incrementMs: incrementS * 1000,
          })
        }
        className={buttonVariants("primary", "mt-5 w-full justify-center py-3 text-[15px]")}
      >
        {t("startExpr", { expr })}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: i18n**

En `messages/es.json`, dentro de `play.clock`: BORRAR `"customMinutes"` y `"customIncrement"`;
AÑADIR (tras `"minutes"`):

```json
  "fewerMinutes": "Un minuto menos",
  "moreMinutes": "Un minuto más",
  "addPlayer": "Añadir jugador",
  "startExpr": "Empezar {expr}",
```

- [ ] **Step 5: Verificar + commit**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
Run: `grep -rn "customMinutes\|customIncrement" src messages` — Expected: sin resultados.

```bash
git add src/components/play/ui/use-hold-repeat.ts src/components/play/clock/clock-face.tsx src/components/play/clock/chess-setup.tsx messages/es.json
git commit -m "feat(play): setup del reloj sin formulario -- esfera viva, fichas de asiento y stepper con mantener

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 2: El aro de la cuenta atrás como selector

**Files:**
- Modify: `src/components/play/clock/countdown-panel.tsx` (reescritura completa)
- Modify: `messages/es.json` (`clock.addThirty`; muere `clock.customSeconds`)

**Interfaces:**
- Consumes: `useHoldRepeat` (Task 1).
- Produces: nada nuevo; testid `countdown-time` y CTA intactos.

- [ ] **Step 1: Reescribir `countdown-panel.tsx`**

Contenido completo:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { useHoldRepeat } from "@/components/play/ui/use-hold-repeat";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ClockEvent } from "@/lib/play/clock/events";
import type { ClockState } from "@/lib/play/clock/types";
import { CLOCK_DURATION_MS_MAX, CLOCK_DURATION_MS_MIN } from "@/lib/play/clock/reducer";
import { flaggedAt, formatMs, remainingAt } from "@/lib/play/clock/selectors";
import { buzz } from "@/components/play/random/stage/stage-helpers";
import { useNow } from "./use-now";

const PRESETS_S = [30, 60, 120, 300, 600];
const RING_STEP_MS = 30_000;

const RADIUS = 88;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Cuenta atrás compartida: el ARO es el selector (spec reloj-visual §3) — con
 * la cuenta parada, tocarlo suma 30 s (mantener repite en local y al soltar
 * emite UN countdown_configured con el total, clavado al rango del motor).
 * Presets absolutos debajo; CTA de estado; al llegar a 0 el motor la clava,
 * buzz una vez y el tiempo central pasa a danger.
 */
export function CountdownPanel({
  state,
  emit,
}: {
  state: ClockState;
  emit: CompanionEmit<ClockEvent>;
}) {
  const t = useTranslations("play.clock");
  const configured = state.mode === "countdown";
  const running = configured && state.countdownRunning && !state.paused;
  const blockedByChess = state.mode === "chess";
  const now = useNow(running);
  // Acumulado del gesto sobre el aro: se suma en pantalla y se emite al soltar.
  const [ringPreview, setRingPreview] = useState(0);

  const left = configured ? remainingAt(state, now) : state.durationMs;
  const done = configured && flaggedAt(state, now);
  // El aro solo es selector con la cuenta QUIETA (ni corriendo ni en pausa) y
  // sin reloj de ajedrez configurado.
  const ringTappable = !running && !state.paused && !blockedByChess && !done;

  const clampDuration = (ms: number) =>
    Math.min(Math.max(ms, CLOCK_DURATION_MS_MIN), CLOCK_DURATION_MS_MAX);
  const ring = useHoldRepeat({
    step: RING_STEP_MS,
    onPreview: setRingPreview,
    onCommit: (total) => {
      setRingPreview(0);
      emit("countdown_configured", { durationMs: clampDuration(state.durationMs + total) });
    },
  });

  // Sembrado con el evento vigente si YA está agotada al montar: remontar
  // (cambiar de pestaña y volver) no re-vibra (misma lección que chess-game).
  const buzzedFor = useRef<number | null>(done ? state.lastEventAt : null);
  useEffect(() => {
    if (done && buzzedFor.current !== state.lastEventAt) {
      buzzedFor.current = state.lastEventAt;
      buzz();
    }
    if (!done) buzzedFor.current = null;
  }, [done, state.lastEventAt]);

  const shownLeft = left + (ringTappable ? ringPreview : 0);
  const progress =
    configured && state.durationMs > 0 ? Math.min(1, left / state.durationMs) : 1;

  function configure(durationMs: number) {
    emit("countdown_configured", { durationMs });
  }

  const chipClass = (selected: boolean) =>
    `rounded-chip border px-3 py-1.5 text-[13px] font-semibold ${
      selected ? "border-foreground bg-surface-muted" : "border-border"
    }`;

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("duration")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {PRESETS_S.map((sec) => (
          <button
            key={sec}
            type="button"
            aria-pressed={configured && state.durationMs === sec * 1000}
            disabled={running || blockedByChess}
            onClick={() => configure(sec * 1000)}
            className={chipClass(configured && state.durationMs === sec * 1000)}
          >
            {sec < 60 ? t("seconds", { n: sec }) : t("minutes", { n: sec / 60 })}
          </button>
        ))}
      </div>
      {blockedByChess ? (
        <p className="mt-2 text-[13px] text-muted-foreground">{t("blockedByChess")}</p>
      ) : null}

      <div className="mt-5 flex justify-center">
        <button
          type="button"
          aria-label={t("addThirty")}
          disabled={!ringTappable}
          {...ring.handlers}
          className="select-none rounded-full disabled:cursor-default [touch-action:manipulation]"
        >
          <svg viewBox="0 0 200 200" className="h-56 w-56" aria-hidden="true">
            <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="8" />
            <circle
              cx="100"
              cy="100"
              r={RADIUS}
              fill="none"
              stroke={done ? "var(--play-danger)" : "var(--accent-ink)"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
              transform="rotate(-90 100 100)"
            />
            <text
              x="100"
              y="100"
              textAnchor="middle"
              dominantBaseline="central"
              className="font-serif"
              fontSize="40"
              fontWeight="600"
              fill={done ? "var(--play-danger)" : "var(--foreground)"}
              style={{ fontVariantNumeric: "tabular-nums" }}
              data-testid="countdown-time"
            >
              {formatMs(shownLeft)}
            </text>
          </svg>
        </button>
      </div>
      <p className="sr-only">{formatMs(shownLeft)}</p>

      {/* `|| done`: en vivo (sin evento posterior) el estado aún dice
          countdownRunning=true con left=0 — el CTA honesto es «Empezar», que
          recarga primero. */}
      {!configured || (!state.countdownRunning && !state.paused) || done ? (
        <button
          type="button"
          disabled={!configured}
          onClick={() => emit("countdown_started", {})}
          className={buttonVariants("primary", "mt-3 w-full justify-center py-3 text-[15px]")}
        >
          {t("start")}
        </button>
      ) : state.paused ? (
        <button
          type="button"
          onClick={() => emit("clock_resumed", {})}
          className={buttonVariants("primary", "mt-3 w-full justify-center py-3 text-[15px]")}
        >
          {t("resume")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => emit("clock_paused", {})}
          className={buttonVariants("primary", "mt-3 w-full justify-center py-3 text-[15px]")}
        >
          {t("pause")}
        </button>
      )}
      <div className="mt-2 text-center">
        <button
          type="button"
          disabled={!configured}
          onClick={() => emit("countdown_reset", {})}
          className="-my-2 p-2 text-[12px] text-muted-foreground underline disabled:opacity-40"
        >
          {t("reset")}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: i18n**

En `messages/es.json`, dentro de `play.clock`: BORRAR `"customSeconds"`; AÑADIR (tras
`"seconds"`):

```json
  "addThirty": "Añadir 30 segundos",
```

- [ ] **Step 3: Verificar + commit**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
Run: `grep -rn "customSeconds\|configureCustom" src messages` — Expected: sin resultados.

```bash
git add src/components/play/clock/countdown-panel.tsx messages/es.json
git commit -m "feat(play): el aro de la cuenta atras es el selector -- tocar suma 30 s, mantener corre y emite uno

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 3: e2e reescrito + verificación completa

**Files:**
- Modify: `e2e/partidas-reloj.spec.ts` (tests 1 y 2)

**Interfaces:** ninguna.

- [ ] **Step 1: Reescribir los dos primeros tests**

El test de ajedrez: SOLO cambia el bucle de añadir jugadores (el resto queda intacto). El bloque

```ts
  for (const name of ["Ana", "Beto"]) {
    await page.getByLabel("Nombre del jugador").fill(name);
    await page.getByRole("button", { name: /^añadir$/i }).click();
  }
  await page.getByRole("button", { name: "1 min", exact: true }).click();
  await page.getByRole("button", { name: /^empezar$/i }).click();
```

pasa a:

```ts
  // Fichas: la ficha «+» abre el único input que queda; Enter añade y la cierra.
  for (const name of ["Ana", "Beto"]) {
    await page.getByRole("button", { name: "Añadir jugador" }).click();
    await page.getByLabel("Nombre del jugador").fill(name);
    await page.getByLabel("Nombre del jugador").press("Enter");
  }
  await page.getByRole("button", { name: "1 min", exact: true }).click();
  await page.getByRole("button", { name: /^empezar 1 min$/i }).click();
```

El test de cuenta atrás se sustituye ENTERO por:

```ts
test("cuenta atrás: preset, aro que suma, corre y se congela en pausa", async ({ page }) => {
  await page.goto("/partidas/reloj");
  await page.getByRole("tab", { name: "Cuenta atrás" }).click();

  await page.getByRole("button", { name: "30 s", exact: true }).click();
  await expect(page.getByTestId("countdown-time")).toHaveText("0:30");

  // El aro es el selector: un toque suma 30 s con la cuenta parada.
  await page.getByRole("button", { name: "Añadir 30 segundos" }).click();
  await expect(page.getByTestId("countdown-time")).toHaveText("1:00");

  // Corre (el número baja) y la pausa congela. El 0 exacto lo clavan los
  // unit del motor — aquí no se espera medio minuto.
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page.getByTestId("countdown-time")).not.toHaveText("1:00", { timeout: 3000 });
  await page.getByRole("button", { name: /^pausa$/i }).click();
  const frozen = await page.getByTestId("countdown-time").textContent();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("countdown-time")).toHaveText(frozen ?? "");
  await page.getByRole("button", { name: /^reanudar$/i }).click();
  await expect(page.getByRole("button", { name: /^pausa$/i })).toBeVisible();
});
```

(El test del hub no cambia.)

- [ ] **Step 2: Verificación completa**

Run (en orden):
1. `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
2. `fnm exec --using=22 -- npx.cmd vitest run src/lib/play` — Expected: PASS todo (motor intacto).
3. `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-reloj.spec.ts` — Expected: 3/3 PASS.
4. `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts` — Expected: 5/5 PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/partidas-reloj.spec.ts
git commit -m "test(play): e2e del reloj sobre fichas y aro-selector -- sin esperar al cero

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```
