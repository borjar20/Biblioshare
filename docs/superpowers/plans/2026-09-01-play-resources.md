# Gestor de recursos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tercer acompañante de BiblioPlay: contadores configurables (por jugador y banco compartido) en `/partidas/recursos`, persistentes y con deshacer.

**Architecture:** Motor event-sourced sobre `useCompanionStore` (clave `` `${identity}:resources` ``): eventos granulares (`adjusted` con delta clampado, nunca lanza por rango) y RECONCILIACIÓN de `values` cuando cambian jugadores o defs. Gesto mantener-pulsado que acumula en local y emite UN evento al soltar (`HoldRepeatButton`).

**Tech Stack:** React 19, IDB (almacén `companion`), next-intl, Vitest, Playwright.

## Global Constraints

- Rama `feat/play-resources` (apilada sobre `feat/play-clock`) — commits directos.
- Motor puro (sin `Date.now()`/`Math.random()` bajo `src/lib/play/resources/`).
- Límites: jugadores 0..6, defs 1..8 (alta rechazada en la 9ª), valores e `initial` −9999..9999, emoji ≤ 8 unidades, delta entero ≠ 0 con |delta| ≤ 9999. `adjusted` CLAMPA el resultado, no lanza por rango.
- Un gesto = un deshacer: mantener pulsado emite UN `adjusted` con el total.
- Sin primario en esta vista (no hay CTA único: la pantalla es manipulación directa); acciones de pie como ghosts con confirm en dos toques.
- `min-w-0` en inputs `flex-1` (lección del overflow de la bolsa).
- Unit: `fnm exec --using=22 -- npx.cmd vitest run <path>` (Node 20 del shell rompe vitest).
- e2e: `fnm exec --using=22 -- npm.cmd run test:e2e -- <spec>` (Playwright gestiona el dev server; NO arrancar otro).
- `git add` con rutas explícitas, nunca `-A` ni `.`.
- Trailers de commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4`

---

### Task 1: Motor de recursos + hook (TDD)

**Files:**
- Create: `src/lib/play/resources/types.ts`
- Create: `src/lib/play/resources/events.ts`
- Create: `src/lib/play/resources/reducer.ts`
- Create: `src/lib/play/resources/selectors.ts`
- Create: `src/lib/play/resources/use-resources.ts`
- Test: `src/lib/play/resources/reducer.test.ts`

**Interfaces:**
- Consumes: `PlayEvent`/`makeEvent` de core; `useCompanionStore`/`CompanionEmit` de `@/lib/play/core/use-companion-store`.
- Produces: `ResourceDef`, `ResourceValue`, `ResourcesState`, `initialResourcesState()`; `ResourcesEvent` (unión de 6); `resourcesReducer`, `replayResources`, `compactResourcesIfNeeded`, constantes `RESOURCES_MAX_PLAYERS` (6), `RESOURCES_MAX_DEFS` (8), `RESOURCE_VALUE_MIN` (−9999), `RESOURCE_VALUE_MAX` (9999); `valueOf(state, resource, owner): number | null`; `useResources(identity)` → `{ state, emit, undo, canUndo, clear, loaded }`. Task 2 los consume tal cual.

- [ ] **Step 1: `types.ts`**

```ts
// Estado del acompañante «Recursos» (spec recursos §1). Invariante de values:
// exactamente una entrada por def compartida (owner null) y una por (def no
// compartida × jugador) — los eventos que cambian players/defs RECONCILIAN.
export type ResourceDef = { name: string; emoji: string; initial: number; shared: boolean };
export type ResourceValue = { resource: string; owner: string | null; value: number };
export type ResourcesState = {
  players: string[];
  defs: ResourceDef[];
  values: ResourceValue[];
};

export function initialResourcesState(): ResourcesState {
  return { players: [], defs: [], values: [] };
}
```

- [ ] **Step 2: `events.ts`**

```ts
import type { PlayEvent } from "@/lib/play/core/types";
import type { ResourceDef } from "./types";

// Eventos del gestor (spec recursos §1). Granulares: `adjusted` lleva el delta
// de UN gesto — deshacer revierte gesto a gesto.
export type ResourcesPlayersSetEvent = PlayEvent<"players_set", { players: string[] }>;
export type ResourceAddedEvent = PlayEvent<"resource_added", ResourceDef>;
export type ResourceRemovedEvent = PlayEvent<"resource_removed", { name: string }>;
export type AdjustedEvent = PlayEvent<
  "adjusted",
  { resource: string; owner: string | null; delta: number }
>;
export type ValuesResetEvent = PlayEvent<"values_reset", Record<string, never>>;
export type ResourcesClearedEvent = PlayEvent<"cleared", Record<string, never>>;

export type ResourcesEvent =
  | ResourcesPlayersSetEvent
  | ResourceAddedEvent
  | ResourceRemovedEvent
  | AdjustedEvent
  | ValuesResetEvent
  | ResourcesClearedEvent;

// Mismo patrón anti-olvido que RANDOM_EVENT_TYPE_MAP.
const RESOURCES_EVENT_TYPE_MAP = {
  players_set: true,
  resource_added: true,
  resource_removed: true,
  adjusted: true,
  values_reset: true,
  cleared: true,
} satisfies Record<ResourcesEvent["type"], true>;

export const RESOURCES_EVENT_TYPES: ReadonlySet<ResourcesEvent["type"]> = new Set(
  Object.keys(RESOURCES_EVENT_TYPE_MAP) as ResourcesEvent["type"][],
);
```

- [ ] **Step 3: Tests que fallan (`reducer.test.ts`)**

Fichero completo:

```ts
import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/play/core/events";
import type { PlayEvent } from "@/lib/play/core/types";
import { initialResourcesState, type ResourcesState } from "./types";
import type { ResourcesEvent } from "./events";
import {
  compactResourcesIfNeeded,
  replayResources,
  resourcesReducer,
  RESOURCES_COMPACT_THRESHOLD,
} from "./reducer";
import { valueOf } from "./selectors";

const t0 = 1000;
const ev = <T extends ResourcesEvent["type"]>(
  type: T,
  payload: Extract<ResourcesEvent, { type: T }>["payload"],
) => makeEvent(type, payload, t0) as ResourcesEvent;

const players = (names: string[]) => ev("players_set", { players: names });
const addRes = (name: string, initial = 0, shared = false, emoji = "") =>
  ev("resource_added", { name, emoji, initial, shared });
const adjust = (resource: string, owner: string | null, delta: number) =>
  ev("adjusted", { resource, owner, delta });

function run(events: ResourcesEvent[], base: ResourcesState | null = null): ResourcesState {
  return events.reduce(resourcesReducer, base ?? initialResourcesState());
}

describe("resource_added / resource_removed — reconciliación", () => {
  it("crea values a initial por jugador, y una sola para compartidos", () => {
    const s = run([players(["Ana", "Beto"]), addRes("Madera", 5), addRes("Oro", 3, true)]);
    expect(valueOf(s, "Madera", "Ana")).toBe(5);
    expect(valueOf(s, "Madera", "Beto")).toBe(5);
    expect(valueOf(s, "Oro", null)).toBe(3);
    expect(s.values).toHaveLength(3);
  });
  it("quitar un recurso borra sus values y deja el resto intacto", () => {
    const s = run([
      players(["Ana"]),
      addRes("Madera", 5),
      addRes("Oro", 3, true),
      ev("resource_removed", { name: "Madera" }),
    ]);
    expect(valueOf(s, "Madera", "Ana")).toBeNull();
    expect(valueOf(s, "Oro", null)).toBe(3);
  });
  it("rechaza duplicados, vacíos, novena def y rangos", () => {
    const s = run([addRes("Oro", 0, true)]);
    expect(() => resourcesReducer(s, addRes("Oro", 1, true))).toThrow();
    expect(() => resourcesReducer(s, addRes("  ", 0))).toThrow();
    expect(() => resourcesReducer(s, addRes("X", 10_000))).toThrow();
    expect(() => resourcesReducer(s, addRes("X", -10_000))).toThrow();
    const eight = run(
      Array.from({ length: 8 }, (_, i) => addRes(`r${i}`, 0, true)),
    );
    expect(() => resourcesReducer(eight, addRes("r8", 0, true))).toThrow();
    expect(() =>
      resourcesReducer(s, ev("resource_removed", { name: "NoExiste" })),
    ).toThrow();
  });
  it("acepta los extremos exactos de initial", () => {
    const s = run([addRes("Max", 9_999, true), addRes("Min", -9_999, true)]);
    expect(valueOf(s, "Max", null)).toBe(9_999);
    expect(valueOf(s, "Min", null)).toBe(-9_999);
  });
});

describe("players_set — reconciliación por nombre", () => {
  it("quien permanece conserva su valor; el nuevo entra a initial; el que sale se borra", () => {
    const s = run([
      players(["Ana", "Beto"]),
      addRes("Madera", 5),
      adjust("Madera", "Ana", 7),
      players(["Ana", "Carla"]),
    ]);
    expect(valueOf(s, "Madera", "Ana")).toBe(12);
    expect(valueOf(s, "Madera", "Carla")).toBe(5);
    expect(valueOf(s, "Madera", "Beto")).toBeNull();
  });
  it("lista vacía es válida (solo banco); 7 jugadores o duplicados lanzan", () => {
    expect(run([players([])]).players).toEqual([]);
    expect(() =>
      run([players(["a", "b", "c", "d", "e", "f", "g"])]),
    ).toThrow();
    expect(() => run([players(["Ana", "Ana"])])).toThrow();
    expect(() => run([players(["Ana", " "])])).toThrow();
  });
});

describe("adjusted — clamp y validación", () => {
  it("suma y clampa en ambos extremos", () => {
    const s = run([addRes("Oro", 9_990, true), adjust("Oro", null, 500)]);
    expect(valueOf(s, "Oro", null)).toBe(9_999);
    const s2 = run([addRes("Deuda", -9_990, true), adjust("Deuda", null, -500)]);
    expect(valueOf(s2, "Deuda", null)).toBe(-9_999);
  });
  it("rechaza delta 0, no entero, fuera de rango, y combinaciones inexistentes", () => {
    const s = run([players(["Ana"]), addRes("Madera", 0), addRes("Oro", 0, true)]);
    expect(() => resourcesReducer(s, adjust("Madera", "Ana", 0))).toThrow();
    expect(() => resourcesReducer(s, adjust("Madera", "Ana", 1.5))).toThrow();
    expect(() => resourcesReducer(s, adjust("Madera", "Ana", 10_000))).toThrow();
    expect(() => resourcesReducer(s, adjust("NoExiste", "Ana", 1))).toThrow();
    expect(() => resourcesReducer(s, adjust("Madera", "Zoe", 1))).toThrow(); // jugador ajeno
    expect(() => resourcesReducer(s, adjust("Madera", null, 1))).toThrow(); // no compartido sin owner
    expect(() => resourcesReducer(s, adjust("Oro", "Ana", 1))).toThrow(); // compartido con owner
  });
});

describe("values_reset y cleared", () => {
  it("reset vuelve todo a initial con la config intacta", () => {
    const s = run([
      players(["Ana"]),
      addRes("Madera", 5),
      adjust("Madera", "Ana", 7),
      ev("values_reset", {}),
    ]);
    expect(valueOf(s, "Madera", "Ana")).toBe(5);
    expect(s.defs).toHaveLength(1);
  });
  it("reset sin defs lanza; cleared vacía todo y undo lo recupera vía log", () => {
    expect(() => run([ev("values_reset", {})])).toThrow();
    const log: ResourcesEvent[] = [players(["Ana"]), addRes("Madera", 5), ev("cleared", {})];
    expect(replayResources(null, log)).toEqual(initialResourcesState());
    expect(valueOf(replayResources(null, log.slice(0, -1)), "Madera", "Ana")).toBe(5);
  });
});

describe("replay y compactación", () => {
  it("replay rechaza eventos desconocidos", () => {
    const alien = makeEvent("dice_rolled", { count: 1, sides: 6, results: [1] }, t0) as PlayEvent;
    expect(() => replayResources(null, [alien])).toThrow();
  });
  it("compactación re-basa conservando el estado", () => {
    const log: ResourcesEvent[] = [players(["Ana"]), addRes("Madera", 0)];
    for (let i = 0; i < RESOURCES_COMPACT_THRESHOLD; i++) log.push(adjust("Madera", "Ana", 1));
    const before = replayResources(null, log);
    const compacted = compactResourcesIfNeeded({ base: null, log });
    expect(compacted.log.length).toBeLessThan(log.length);
    expect(replayResources(compacted.base, compacted.log)).toEqual(before);
  });
});
```

- [ ] **Step 4: Verificar que fallan**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/resources/reducer.test.ts`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 5: Implementar `reducer.ts`**

```ts
import type { PlayEvent } from "@/lib/play/core/types";
import { RESOURCES_EVENT_TYPES, type ResourcesEvent } from "./events";
import { initialResourcesState, type ResourceDef, type ResourcesState, type ResourceValue } from "./types";

// Reducer PURO del gestor de recursos (spec recursos §1): valida y lanza ante
// payload inválido, salvo el RANGO de `adjusted`, que se CLAMPA — un ajuste
// nunca muere en silencio por pasarse. Jamás llama a Date.now().

export const RESOURCES_MAX_PLAYERS = 6;
export const RESOURCES_MAX_DEFS = 8;
export const RESOURCE_VALUE_MIN = -9_999;
export const RESOURCE_VALUE_MAX = 9_999;

function assertPlayers(names: readonly string[]): void {
  if (names.length > RESOURCES_MAX_PLAYERS) {
    throw new Error(`jugadores fuera de 0..${RESOURCES_MAX_PLAYERS}`);
  }
  const seen = new Set<string>();
  for (const name of names) {
    if (name.trim() === "" || name !== name.trim()) throw new Error("nombre vacío o sin recortar");
    if (seen.has(name)) throw new Error("nombre duplicado");
    seen.add(name);
  }
}

const clamp = (n: number): number =>
  Math.min(Math.max(n, RESOURCE_VALUE_MIN), RESOURCE_VALUE_MAX);

// Reconstruye values para (players, defs) conservando los que sobreviven y
// creando a initial los nuevos — el invariante del estado vive aquí.
function reconcile(
  playersList: readonly string[],
  defs: readonly ResourceDef[],
  prev: readonly ResourceValue[],
): ResourceValue[] {
  const out: ResourceValue[] = [];
  for (const def of defs) {
    const owners: (string | null)[] = def.shared ? [null] : [...playersList];
    for (const owner of owners) {
      const kept = prev.find((v) => v.resource === def.name && v.owner === owner);
      out.push(kept ? { ...kept } : { resource: def.name, owner, value: def.initial });
    }
  }
  return out;
}

export function resourcesReducer(state: ResourcesState, event: ResourcesEvent): ResourcesState {
  switch (event.type) {
    case "players_set": {
      const { players } = event.payload;
      assertPlayers(players);
      return {
        players: [...players],
        defs: state.defs,
        values: reconcile(players, state.defs, state.values),
      };
    }
    case "resource_added": {
      const { name, emoji, initial, shared } = event.payload;
      if (name.trim() === "" || name !== name.trim()) throw new Error("nombre vacío o sin recortar");
      if (state.defs.some((d) => d.name === name)) throw new Error("recurso duplicado");
      if (state.defs.length >= RESOURCES_MAX_DEFS) throw new Error(`máximo ${RESOURCES_MAX_DEFS} recursos`);
      if (typeof emoji !== "string" || emoji.length > 8) throw new Error("emoji inválido");
      if (!Number.isInteger(initial) || initial < RESOURCE_VALUE_MIN || initial > RESOURCE_VALUE_MAX) {
        throw new Error("initial fuera de rango");
      }
      const defs = [...state.defs, { name, emoji, initial, shared }];
      return { ...state, defs, values: reconcile(state.players, defs, state.values) };
    }
    case "resource_removed": {
      const { name } = event.payload;
      if (!state.defs.some((d) => d.name === name)) throw new Error("recurso inexistente");
      const defs = state.defs.filter((d) => d.name !== name);
      return { ...state, defs, values: reconcile(state.players, defs, state.values) };
    }
    case "adjusted": {
      const { resource, owner, delta } = event.payload;
      const def = state.defs.find((d) => d.name === resource);
      if (!def) throw new Error("recurso inexistente");
      if (def.shared && owner !== null) throw new Error("compartido no lleva owner");
      if (!def.shared && (owner === null || !state.players.includes(owner))) {
        throw new Error("owner inválido");
      }
      if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > RESOURCE_VALUE_MAX) {
        throw new Error("delta inválido");
      }
      return {
        ...state,
        values: state.values.map((v) =>
          v.resource === resource && v.owner === owner ? { ...v, value: clamp(v.value + delta) } : v,
        ),
      };
    }
    case "values_reset": {
      if (state.defs.length === 0) throw new Error("nada que reiniciar");
      const initialOf = new Map(state.defs.map((d) => [d.name, d.initial]));
      return {
        ...state,
        values: state.values.map((v) => ({ ...v, value: initialOf.get(v.resource) ?? 0 })),
      };
    }
    case "cleared":
      return initialResourcesState();
  }
}

function isResourcesEvent(event: PlayEvent): event is ResourcesEvent {
  return (RESOURCES_EVENT_TYPES as ReadonlySet<string>).has(event.type);
}

export function replayResources(base: ResourcesState | null, log: PlayEvent[]): ResourcesState {
  return log.reduce((state, event) => {
    if (!isResourcesEvent(event)) throw new Error(`evento desconocido: ${event.type}`);
    return resourcesReducer(state, event);
  }, base ?? initialResourcesState());
}

export const RESOURCES_COMPACT_THRESHOLD = 200;
export const RESOURCES_COMPACT_KEEP = 20;

export function compactResourcesIfNeeded(input: {
  base: ResourcesState | null;
  log: PlayEvent[];
}): { base: ResourcesState | null; log: PlayEvent[] } {
  if (input.log.length <= RESOURCES_COMPACT_THRESHOLD) return input;
  const cut = input.log.length - RESOURCES_COMPACT_KEEP;
  return {
    base: replayResources(input.base, input.log.slice(0, cut)),
    log: input.log.slice(cut),
  };
}
```

- [ ] **Step 6: `selectors.ts`**

```ts
import type { ResourcesState } from "./types";

// Valor de (recurso, owner) o null si la combinación no existe. owner null =
// recurso compartido (banco).
export function valueOf(
  state: ResourcesState,
  resource: string,
  owner: string | null,
): number | null {
  const entry = state.values.find((v) => v.resource === resource && v.owner === owner);
  return entry ? entry.value : null;
}
```

- [ ] **Step 7: Verificar que pasan**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/resources/reducer.test.ts` — Expected: PASS.

- [ ] **Step 8: `use-resources.ts`**

```ts
"use client";

import { useCallback } from "react";
import {
  useCompanionStore,
  type CompanionEmit,
} from "@/lib/play/core/use-companion-store";
import type { ResourcesState } from "./types";
import type { ResourcesEvent } from "./events";
import { compactResourcesIfNeeded, replayResources, resourcesReducer } from "./reducer";

/**
 * Store del acompañante «Recursos». Clave propia (`${identity}:resources`) en
 * el almacén companion. Sin feed (no hay historial visible); `clear` = evento
 * cleared, deshacible como en el Aleatorio.
 */
export function useResources(identity: string): {
  state: ResourcesState;
  emit: CompanionEmit<ResourcesEvent>;
  undo: () => void;
  canUndo: boolean;
  clear: () => void;
  loaded: boolean;
} {
  const store = useCompanionStore<ResourcesState, ResourcesEvent>({
    storageKey: `${identity}:resources`,
    replay: replayResources,
    reducer: resourcesReducer,
    compact: compactResourcesIfNeeded,
  });

  const { emit } = store;
  const clear = useCallback(() => {
    emit("cleared", {});
  }, [emit]);

  return { ...store, clear };
}
```

- [ ] **Step 9: Typecheck + commit**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.

```bash
git add src/lib/play/resources/types.ts src/lib/play/resources/events.ts src/lib/play/resources/reducer.ts src/lib/play/resources/reducer.test.ts src/lib/play/resources/selectors.ts src/lib/play/resources/use-resources.ts
git commit -m "feat(play): motor del gestor de recursos -- reconciliacion de values, adjusted con clamp y hook propio

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 2: Pantalla — configuración, tablero y gesto de mantener

**Files:**
- Create: `src/app/partidas/recursos/page.tsx`
- Create: `src/components/play/resources/resources-screen.tsx`
- Create: `src/components/play/resources/resources-config.tsx`
- Create: `src/components/play/resources/resources-board.tsx`
- Create: `src/components/play/resources/hold-repeat-button.tsx`
- Modify: `messages/es.json` (namespace `play.resources`)

**Interfaces:**
- Consumes: todo lo de Task 1; `usePlayers`, `SEAT_ACCENT`, `stableColor`.
- Produces: `ResourcesScreen({ identity })`. Task 3 solo añade hub y e2e.

- [ ] **Step 1: Página (`page.tsx`)**

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { PlayFrame } from "@/components/play/play-frame";
import { ResourcesScreen } from "@/components/play/resources/resources-screen";

export const metadata: Metadata = { title: "Recursos — Biblioshare" };

// Mismo boundary de petición que Aleatorio/Reloj (#435): identidad de sesión
// fuera del prerender; anónimo funciona entero. key: remonta al cambiar (#680).
async function Screen() {
  await connection();
  const identity = (await getCurrentUser())?.id ?? "anon";
  return <ResourcesScreen key={identity} identity={identity} />;
}

export default function ResourcesPage() {
  return (
    <PlayFrame>
      <Suspense fallback={null}>
        <Screen />
      </Suspense>
    </PlayFrame>
  );
}
```

- [ ] **Step 2: `hold-repeat-button.tsx`**

```tsx
"use client";

import { useRef } from "react";

const HOLD_DELAY_MS = 400;
const REPEAT_MS = 120;

/**
 * Botón ±1 con mantener-pulsado: el toque emite onCommit(±1); mantener repite
 * EN LOCAL (onPreview corre el número en pantalla) y al soltar emite UN
 * onCommit con el total — un gesto = un deshacer (spec recursos §2). Salir
 * del botón con el dedo CANCELA la acumulación. El click de teclado
 * (Enter/Espacio) emite ±1.
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
  const acc = useRef(0);
  const held = useRef(false);
  // justHeld: el click sintético llega DESPUÉS del pointerup — sin esta marca,
  // un mantener emitiría su total y además un ±1 extra por el click.
  const justHeld = useRef(false);
  const delay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTimers() {
    if (delay.current) clearTimeout(delay.current);
    if (repeat.current) clearInterval(repeat.current);
    delay.current = null;
    repeat.current = null;
  }

  function start() {
    held.current = false;
    acc.current = 0;
    delay.current = setTimeout(() => {
      held.current = true;
      acc.current = direction;
      onPreview(acc.current);
      repeat.current = setInterval(() => {
        acc.current += direction;
        onPreview(acc.current);
      }, REPEAT_MS);
    }, HOLD_DELAY_MS);
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

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={start}
      onPointerUp={finish}
      onPointerLeave={cancel}
      onClick={() => {
        if (justHeld.current) {
          justHeld.current = false;
          return;
        }
        onCommit(direction);
      }}
      className="h-10 w-10 rounded-chip border border-border text-[18px] font-semibold"
    >
      {direction > 0 ? "+" : "−"}
    </button>
  );
}
```

- [ ] **Step 3: `resources-config.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePlayers } from "@/lib/play/core/use-players";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ResourcesEvent } from "@/lib/play/resources/events";
import type { ResourcesState } from "@/lib/play/resources/types";
import {
  RESOURCES_MAX_DEFS,
  RESOURCES_MAX_PLAYERS,
  RESOURCE_VALUE_MAX,
  RESOURCE_VALUE_MIN,
} from "@/lib/play/resources/reducer";

/**
 * Configuración del gestor: jugadores (habituales a un toque, patrón reloj) y
 * recursos (nombre + emoji opcional + inicial + compartido). Cada cambio
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
  const [resName, setResName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [initial, setInitial] = useState("");
  const [shared, setShared] = useState(false);

  function addPlayer(candidate: string) {
    const trimmed = candidate.trim();
    if (trimmed === "" || state.players.includes(trimmed)) return;
    if (state.players.length >= RESOURCES_MAX_PLAYERS) return;
    emit("players_set", { players: [...state.players, trimmed] });
    setName("");
  }

  const chips = regulars.filter((r) => !state.players.includes(r.name)).slice(0, 6);

  const parsedInitial = initial === "" ? 0 : Number(initial);
  const addValid =
    resName.trim() !== "" &&
    !state.defs.some((d) => d.name === resName.trim()) &&
    state.defs.length < RESOURCES_MAX_DEFS &&
    Number.isInteger(parsedInitial) &&
    parsedInitial >= RESOURCE_VALUE_MIN &&
    parsedInitial <= RESOURCE_VALUE_MAX &&
    emoji.trim().length <= 8;

  function addResource() {
    if (!addValid) return;
    emit("resource_added", {
      name: resName.trim(),
      emoji: emoji.trim(),
      initial: parsedInitial,
      shared,
    });
    setResName("");
    setEmoji("");
    setInitial("");
    setShared(false);
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("players")}
      </p>
      {chips.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2" aria-label={t("regulars")}>
          {chips.map((r) => (
            <button
              key={r.playerId}
              type="button"
              onClick={() => addPlayer(r.name)}
              className="rounded-chip border border-border px-3 py-1 text-[13px]"
            >
              {r.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex gap-2">
        <input
          value={name}
          placeholder={t("namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addPlayer(name);
          }}
          aria-label={t("nameLabel")}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
        <button
          type="button"
          onClick={() => addPlayer(name)}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px]"
        >
          {t("add")}
        </button>
      </div>
      {state.players.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {state.players.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() =>
                  emit("players_set", { players: state.players.filter((x) => x !== p) })
                }
                aria-label={t("removePlayer", { name: p })}
                className="rounded-chip border border-border px-3 py-1 text-[13px]"
              >
                {p} ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("resources")}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={resName}
          placeholder={t("resourcePlaceholder")}
          onChange={(e) => setResName(e.target.value)}
          aria-label={t("resourceName")}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
        <input
          value={emoji}
          placeholder="🪙"
          onChange={(e) => setEmoji(e.target.value)}
          aria-label={t("emojiLabel")}
          className="w-14 rounded-md border border-border bg-surface px-2 py-1.5 text-center text-[14px]"
        />
        <input
          type="number"
          inputMode="numeric"
          value={initial}
          placeholder="0"
          onChange={(e) => setInitial(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t("initialLabel")}
          className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          {t("sharedLabel")}
        </label>
        <button
          type="button"
          disabled={!addValid}
          onClick={addResource}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] disabled:opacity-40"
        >
          {t("addResource")}
        </button>
      </div>
      {state.defs.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {state.defs.map((d) => (
            <li key={d.name}>
              <button
                type="button"
                onClick={() => emit("resource_removed", { name: d.name })}
                aria-label={t("removeResource", { name: d.name })}
                className="rounded-chip border border-border px-3 py-1 text-[13px]"
              >
                {d.emoji ? `${d.emoji} ` : ""}
                {d.name} · {d.initial}
                {d.shared ? ` · ${t("bank")}` : ""} ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: `resources-board.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ResourcesEvent } from "@/lib/play/resources/events";
import type { ResourceDef, ResourcesState } from "@/lib/play/resources/types";
import { valueOf } from "@/lib/play/resources/selectors";
import { stableColor } from "@/components/play/random/stage/stage-helpers";
import { SEAT_ACCENT } from "@/lib/play/ui/seats";
import { HoldRepeatButton } from "./hold-repeat-button";

const QUICK_DELTAS = [5, 10, -5, -10];

function Row({
  def,
  value,
  onAdjust,
  testId,
}: {
  def: ResourceDef;
  value: number;
  onAdjust: (delta: number) => void;
  testId: string;
}) {
  const t = useTranslations("play.resources");
  // preview: acumulado del mantener-pulsado — el número corre en pantalla
  // antes de emitirse el evento único al soltar.
  const [preview, setPreview] = useState(0);
  const [quickOpen, setQuickOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-6 w-1 shrink-0 rounded-full"
          style={{ background: stableColor(def.name) }}
        />
        <span className="min-w-0 flex-1 truncate text-[14px]">
          {def.emoji ? `${def.emoji} ` : ""}
          {def.name}
        </span>
        <HoldRepeatButton
          direction={-1}
          label={t("decrease", { name: def.name })}
          onPreview={setPreview}
          onCommit={onAdjust}
        />
        <span
          data-testid={testId}
          className="w-16 text-center font-serif text-[28px] font-semibold tabular-nums"
        >
          {value + preview}
        </span>
        <HoldRepeatButton
          direction={1}
          label={t("increase", { name: def.name })}
          onPreview={setPreview}
          onCommit={onAdjust}
        />
        <button
          type="button"
          aria-expanded={quickOpen}
          aria-label={t("quick", { name: def.name })}
          onClick={() => setQuickOpen(!quickOpen)}
          className="rounded-chip border border-border px-2 py-1 text-[12px]"
        >
          ±
        </button>
      </div>
      {quickOpen ? (
        <div className="mt-1 flex justify-end gap-2">
          {QUICK_DELTAS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onAdjust(d)}
              className="rounded-chip border border-border px-3 py-1 text-[13px] tabular-nums"
            >
              {d > 0 ? `+${d}` : d}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Tablero del gestor: tarjeta «Banco» con los compartidos y una por jugador
 * con sus recursos. Toque ±1, mantener acumula y emite UNO, chips ±5/±10.
 */
export function ResourcesBoard({
  state,
  emit,
}: {
  state: ResourcesState;
  emit: CompanionEmit<ResourcesEvent>;
}) {
  const t = useTranslations("play.resources");
  const sharedDefs = state.defs.filter((d) => d.shared);
  const playerDefs = state.defs.filter((d) => !d.shared);

  const adjust = (resource: string, owner: string | null) => (delta: number) => {
    if (delta !== 0) emit("adjusted", { resource, owner, delta });
  };

  return (
    <div className="space-y-3">
      {sharedDefs.length > 0 ? (
        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("bank")}
          </h2>
          <div className="mt-2 space-y-2">
            {sharedDefs.map((def) => (
              <Row
                key={def.name}
                def={def}
                value={valueOf(state, def.name, null) ?? 0}
                onAdjust={adjust(def.name, null)}
                testId={`res-bank-${def.name}`}
              />
            ))}
          </div>
        </section>
      ) : null}
      {playerDefs.length > 0
        ? state.players.map((player, i) => (
            <section key={player} className="rounded-card border border-border bg-surface p-4">
              <h2 className="flex items-center gap-2 text-[14px] font-semibold">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: `var(${SEAT_ACCENT[i % SEAT_ACCENT.length].varName})` }}
                />
                {player}
              </h2>
              <div className="mt-2 space-y-2">
                {playerDefs.map((def) => (
                  <Row
                    key={def.name}
                    def={def}
                    value={valueOf(state, def.name, player) ?? 0}
                    onAdjust={adjust(def.name, player)}
                    testId={`res-${i}-${def.name}`}
                  />
                ))}
              </div>
            </section>
          ))
        : null}
    </div>
  );
}
```

- [ ] **Step 5: `resources-screen.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useResources } from "@/lib/play/resources/use-resources";
import { ResourcesConfig } from "./resources-config";
import { ResourcesBoard } from "./resources-board";

/**
 * Pantalla del acompañante «Recursos»: configuración colapsable arriba
 * (abierta al llegar sin nada; NO se auto-cierra a mitad de configuración —
 * el latch se fija UNA vez al cargar) y tablero debajo. Deshacer, reiniciar
 * valores y empezar de cero como ghosts con confirm en dos toques.
 */
export function ResourcesScreen({ identity }: { identity: string }) {
  const t = useTranslations("play.resources");
  const res = useResources(identity);
  const [configOpen, setConfigOpen] = useState<boolean | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const hasBoard =
    res.state.defs.length > 0 &&
    (res.state.players.length > 0 || res.state.defs.every((d) => d.shared));

  // Latch: se decide una vez al cargar (persistido con tablero → colapsada).
  useEffect(() => {
    if (res.loaded) setConfigOpen((prev) => (prev === null ? !hasBoard : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res.loaded]);

  if (!res.loaded) return null;
  const open = configOpen ?? !hasBoard;

  return (
    <div>
      <h1 className="font-serif text-[26px] font-semibold">{t("title")}</h1>
      <p className="mt-1 text-[14px] text-muted-foreground">{t("subtitle")}</p>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setConfigOpen(!open)}
        className="mt-4 rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold"
      >
        {t("configure")}
      </button>
      {open ? (
        <div className="mt-3">
          <ResourcesConfig identity={identity} state={res.state} emit={res.emit} />
        </div>
      ) : null}

      <div className="mt-5">
        {hasBoard ? (
          <ResourcesBoard state={res.state} emit={res.emit} />
        ) : (
          <p className="text-center text-[14px] text-muted-foreground">{t("emptyHint")}</p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={res.undo}
          disabled={!res.canUndo}
          className="-my-2 p-2 text-[12px] text-muted-foreground underline disabled:opacity-40"
        >
          {t("undo")}
        </button>
        {confirmReset ? (
          <button
            type="button"
            onClick={() => {
              res.emit("values_reset", {});
              setConfirmReset(false);
            }}
            className="-my-2 p-2 text-[12px] text-play-danger underline"
          >
            {t("resetConfirm")}
          </button>
        ) : (
          <button
            type="button"
            disabled={res.state.defs.length === 0}
            onClick={() => setConfirmReset(true)}
            className="-my-2 p-2 text-[12px] text-muted-foreground underline disabled:opacity-40"
          >
            {t("reset")}
          </button>
        )}
        {confirmClear ? (
          <button
            type="button"
            onClick={() => {
              res.clear();
              setConfirmClear(false);
              setConfigOpen(true);
            }}
            className="-my-2 p-2 text-[12px] text-play-danger underline"
          >
            {t("clearConfirm")}
          </button>
        ) : (
          <button
            type="button"
            disabled={res.state.defs.length === 0 && res.state.players.length === 0}
            onClick={() => setConfirmClear(true)}
            className="-my-2 p-2 text-[12px] text-muted-foreground underline disabled:opacity-40"
          >
            {t("clear")}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: i18n — namespace `play.resources`**

En `messages/es.json`, dentro de `play` (junto a `clock`), añadir:

```json
"resources": {
  "title": "Recursos",
  "subtitle": "Contadores de monedas, puntos o materiales para cualquier juego.",
  "configure": "Configurar",
  "emptyHint": "Configura jugadores y recursos para empezar.",
  "players": "Jugadores",
  "regulars": "Tus habituales",
  "nameLabel": "Nombre del jugador",
  "namePlaceholder": "Añadir jugador…",
  "add": "Añadir",
  "removePlayer": "Quitar a {name}",
  "resources": "Recursos",
  "resourceName": "Nombre del recurso",
  "resourcePlaceholder": "Madera, Oro…",
  "emojiLabel": "Emoji (opcional)",
  "initialLabel": "Valor inicial",
  "sharedLabel": "Compartido (banco)",
  "addResource": "Añadir recurso",
  "removeResource": "Quitar {name}",
  "bank": "Banco",
  "increase": "Sumar {name}",
  "decrease": "Restar {name}",
  "quick": "Cantidades rápidas de {name}",
  "undo": "Deshacer",
  "reset": "Reiniciar valores",
  "resetConfirm": "¿Seguro? Todos a su inicial",
  "clear": "Empezar de cero",
  "clearConfirm": "¿Seguro? Borra jugadores y recursos"
}
```

- [ ] **Step 7: Verificar + commit**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores. (e2e llega en Task 3.)

```bash
git add src/app/partidas/recursos/page.tsx src/components/play/resources/resources-screen.tsx src/components/play/resources/resources-config.tsx src/components/play/resources/resources-board.tsx src/components/play/resources/hold-repeat-button.tsx messages/es.json
git commit -m "feat(play): pantalla del gestor de recursos -- config colapsable, tablero por tarjetas y gesto de mantener

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 3: Hub (marca + tarjeta) + e2e + verificación completa

**Files:**
- Create: `src/components/play/marks/resources-table-mark.tsx`
- Modify: `src/components/play/tool-grid.tsx` (tarjeta tras la del Reloj)
- Modify: `messages/es.json` (`play.tools.resources.name`)
- Test: `e2e/partidas-recursos.spec.ts`

**Interfaces:**
- Consumes: `SEAT_ACCENT`.
- Produces: nada nuevo.

- [ ] **Step 1: `resources-table-mark.tsx`**

```tsx
import { SEAT_ACCENT } from "@/lib/play/ui/seats";

/**
 * La marca de Recursos son pilas de fichas con una moneda dorada encima,
 * sobre fieltro: fichas en colores de asiento, moneda con el sol de la casa
 * (--gold-graphic, como en la marca del Aleatorio). Sin texto ni <title>:
 * la etiqueta la pone la tarjeta que lo envuelve.
 */
export function ResourcesTableMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <ellipse cx="32" cy="54" rx="24" ry="5" fill="var(--play-felt)" />
      {/* Pila izquierda de fichas. */}
      <rect x="10" y="44" width="18" height="5" rx="2.5" fill={`var(${SEAT_ACCENT[0].varName})`} />
      <rect x="12" y="38" width="18" height="5" rx="2.5" fill={`var(${SEAT_ACCENT[2].varName})`} />
      <rect x="11" y="32" width="18" height="5" rx="2.5" fill={`var(${SEAT_ACCENT[0].varName})`} />
      {/* Pila derecha. */}
      <rect x="36" y="44" width="18" height="5" rx="2.5" fill={`var(${SEAT_ACCENT[1].varName})`} />
      <rect x="34" y="38" width="18" height="5" rx="2.5" fill={`var(${SEAT_ACCENT[3].varName})`} />
      {/* Moneda dorada con el sol. */}
      <circle cx="43" cy="26" r="10" fill="var(--surface)" stroke="var(--gold-graphic)" strokeWidth="1.5" />
      <circle cx="43" cy="26" r="3.5" fill="none" stroke="var(--gold-graphic)" strokeWidth="1.2" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return (
          <line
            key={i}
            x1={43 + 5 * Math.cos(a)}
            y1={26 + 5 * Math.sin(a)}
            x2={43 + 7.5 * Math.cos(a)}
            y2={26 + 7.5 * Math.sin(a)}
            stroke="var(--gold-graphic)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        );
      })}
      {/* Ficha suelta, para romper la simetría. */}
      <circle cx="22" cy="24" r="6" fill="var(--surface-3)" stroke="var(--play-rail)" strokeWidth="1.5" />
    </svg>
  );
}
```

- [ ] **Step 2: Tarjeta en `tool-grid.tsx`**

Añadir el import `import { ResourcesTableMark } from "./marks/resources-table-mark";` y, ENTRE
la tarjeta del Reloj y la de «más herramientas», insertar:

```tsx
      {/* Recursos: tercer acompañante sin partida — tarjeta estática. */}
      <li>
        <Link
          href="/partidas/recursos"
          className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:bg-surface-muted"
        >
          <ResourcesTableMark className="h-16 w-16" />
          <span className="text-center font-serif text-[15px] font-semibold">
            {t("tools.resources.name")}
          </span>
        </Link>
      </li>
```

- [ ] **Step 3: i18n de la tarjeta**

En `messages/es.json`, dentro de `play.tools` (tras `clock`), añadir:

```json
"resources": { "name": "Recursos" }
```

- [ ] **Step 4: e2e `e2e/partidas-recursos.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

// Acompañante «Recursos». Anónimo, IDB propio (clave :resources). Viewport
// móvil como el resto de Play.
test.use({ viewport: { width: 390, height: 844 } });

test("configurar, ajustar, chips rápidos, recargar, deshacer y reiniciar", async ({ page }) => {
  await page.goto("/partidas/recursos");
  await expect(page.getByRole("heading", { name: "Recursos" })).toBeVisible();
  await expect(page.getByText("Configura jugadores y recursos para empezar.")).toBeVisible();

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

  // Tablero: banco primero, luego Ana (res-0) y Beto. Madera de Ana a 5.
  await expect(page.getByTestId("res-0-Madera")).toHaveText("5");
  await page.getByRole("button", { name: "Sumar Madera" }).first().click();
  await expect(page.getByTestId("res-0-Madera")).toHaveText("6");

  // Chips rápidos: ± abre los deltas y +5 emite uno solo.
  await page.getByRole("button", { name: "Cantidades rápidas de Madera" }).first().click();
  await page.getByRole("button", { name: "+5", exact: true }).first().click();
  await expect(page.getByTestId("res-0-Madera")).toHaveText("11");

  // Banco compartido.
  await page.getByRole("button", { name: "Sumar Oro" }).click();
  await expect(page.getByTestId("res-bank-Oro")).toHaveText("1");

  // Recarga conserva (IDB).
  await page.reload();
  await expect(page.getByTestId("res-0-Madera")).toHaveText("11");
  await expect(page.getByTestId("res-bank-Oro")).toHaveText("1");

  // Deshacer revierte el último ajuste (el Oro del banco).
  await page.getByRole("button", { name: /^deshacer$/i }).click();
  await expect(page.getByTestId("res-bank-Oro")).toHaveText("0");

  // Reiniciar valores (dos toques) vuelve al inicial.
  await page.getByRole("button", { name: /^reiniciar valores$/i }).click();
  await page.getByRole("button", { name: /todos a su inicial/i }).click();
  await expect(page.getByTestId("res-0-Madera")).toHaveText("5");
});

test("la tarjeta del hub navega a recursos", async ({ page }) => {
  await page.goto("/partidas");
  await page.getByRole("link", { name: "Recursos", exact: true }).click();
  await expect(page).toHaveURL(/\/partidas\/recursos$/);
  await expect(page.getByRole("heading", { name: "Recursos" })).toBeVisible();
});
```

- [ ] **Step 5: Verificación completa**

Run (en orden):
1. `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
2. `fnm exec --using=22 -- npx.cmd vitest run src/lib/play` — Expected: PASS todo.
3. `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-recursos.spec.ts` — Expected: 2/2 PASS.
4. `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-reloj.spec.ts partidas-aleatorio.spec.ts` — Expected: 3/3 + 5/5 PASS (sin regresión).

- [ ] **Step 6: Commit**

```bash
git add src/components/play/marks/resources-table-mark.tsx src/components/play/tool-grid.tsx messages/es.json e2e/partidas-recursos.spec.ts
git commit -m "feat(play): tarjeta de Recursos en el hub, marca de pilas de fichas y e2e del acompanante

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```
