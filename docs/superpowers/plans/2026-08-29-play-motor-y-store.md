# BiblioPlay — Motor de eventos y store local (entrega 0 + PR-1 + PR-2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Motor puro de partidas (`src/lib/play/`) con event log inmutable, reducer Commander, undo y coalescing, más store local-first con snapshot en localStorage aislado por identidad.

**Architecture:** Event sourcing puro: fuente de verdad histórica = `committed[]` (primer evento siempre `game_started` con `{toolId, setup}`); estado vivo = `committed + pending` (ráfaga de coalescing). Reducer/log/selectors sin React ni navegador; el store posee los timers y el IO de localStorage; un hook `useSyncExternalStore` expone la partida a React. Spec: `docs/superpowers/specs/2026-08-29-play-fases-0-2-design.md` (issue #931).

**Tech Stack:** TypeScript estricto, Vitest (node), Next 16 / React 19 (solo el hook), localStorage.

**Fuera de este plan:** UI (PR-3/PR-4) — se planifica tras la Fase 1a (canvas de diseño). IndexedDB, Supabase, jugadores habituales: fases 3+.

## Global Constraints

- Node 22 obligatorio para tests (`.nvmrc` 22.23.1). Si `npm test` falla por versión: `fnm use 22.23.1` (el shell por defecto trae v20 y rompe Vitest).
- Tests Vitest viven JUNTO al código (`foo.ts` + `foo.test.ts`), entorno node (no añadir jsdom global; un test que lo necesite lo pide con `// @vitest-environment jsdom` en su PRIMERA línea).
- Alias de imports: `@/` → `src/`.
- Identificadores de código en inglés; comentarios en español explicando el PORQUÉ (convención fuerte del repo, con referencia a issue/spec cuando aplique).
- NADA de React, next-intl, Supabase ni APIs de navegador en `src/lib/play/**` salvo `core/store.ts` (localStorage/timers, con guardas) y `core/use-active-game.ts` (React).
- Prohibido `useState`+`useEffect` para leer localStorage (lint `set-state-in-effect`).
- Mensajes de commit en español, estilo del repo: `feat(play): descripción en frase`.
- Ejecutar comandos `gh` y `git` desde la raíz del repo.
- El bloque `nextjs-agent-rules` de AGENTS.md puede reaparecer en el diff: committearlo con el trabajo, no borrarlo.

---

### Task 1: Entrega 0 — rama, decisiones, backlog, glosario y etiqueta

**Files:**
- Modify: `docs/requirements/decisiones.md` (append AL FINAL, nunca reescribir entradas)
- Modify: `docs/requirements/backlog.md`
- Modify: `docs/UI-GLOSARIO.md`

**Interfaces:**
- Produces: rama `feat/play-motor`; etiqueta GitHub `area:play`; decisiones registradas que autorizan el trabajo de las tasks siguientes (la excepción a `inv-passes-hub` DEBE existir antes de escribir código).

- [ ] **Step 1: Crear rama**

Run: `git checkout -b feat/play-motor`
Expected: `Switched to a new branch 'feat/play-motor'`

- [ ] **Step 2: Añadir tres entradas al FINAL de `docs/requirements/decisiones.md`**

Leer las 2-3 últimas entradas del fichero para copiar su formato exacto (fecha, título, cuerpo). Contenido de las tres entradas (adaptar solo el formato, no el fondo), con fecha 2026-08-29 y referencia a la issue #931 y a la spec `docs/superpowers/specs/2026-08-29-play-fases-0-2-design.md`:

1. **El dominio `play` es una excepción explícita a `inv-passes-hub`.** La regla «cualquier estado del usuario se deriva de `passes`» no aplica: `play` es local-first sin backend en fases 0–3 y, cuando tenga backend (Fase 5), su fuente de verdad serán sus propias tablas. Decidido a propósito en la spec; no es un bug.
2. **Play tiene identidad visual de subapp.** Matiza el «no crear estética gaming independiente» de la issue #931: fundamento Paper (tokens, claro/oscuro), pero acento propio, más movimiento y escala de instrumento. Debe expresar «estás jugando» por sí misma.
3. **`/partidas*` es accesible sin sesión desde Fase 1.** Partida por identidad (`uid` o `anon`) y dispositivo, clave localStorage aislada por identidad para no filtrar la partida entre cuentas del mismo dispositivo (misma clase de fuga que el arreglo #680 del SW).

- [ ] **Step 3: Añadir BiblioPlay al backlog**

En `docs/requirements/backlog.md`, localizar la sección de features en curso/próximas y añadir una línea con el formato del fichero:

```markdown
- [ ] BiblioPlay (dominio `play`): motor de eventos + prototipo Commander local-first — EPIC #931, spec `docs/superpowers/specs/2026-08-29-play-fases-0-2-design.md`
```

- [ ] **Step 4: Registrar términos en `docs/UI-GLOSARIO.md`**

Copiar el formato de entrada del fichero. Términos y definiciones a añadir (área Partidas):

- **partida** — una sesión de juego concreta (la unidad principal del dominio; no «juego»).
- **herramienta** — cada tracker del hub de Partidas (Commander, puntuación por rondas…).
- **jugador** — participante de una partida, sea cuenta Biblioshare, habitual o invitado; su origen no se distingue durante la partida.
- **invitado** — jugador temporal que no persiste tras la partida.
- **jugador habitual** — persona sin cuenta que acumula historial; vinculable a una cuenta solo manualmente (nunca por nombre).
- **comandante** — carta comandante de un mazo en Commander; texto libre, sin catálogo.
- **daño de comandante** — daño acumulado que un comandante concreto ha hecho a un jugador (21 = condición de derrota).
- **veneno** — contadores de veneno (10 = condición de derrota).
- **monarca / iniciativa** — estados globales de mesa con un único poseedor.
- **ronda** — vuelta completa de turnos; es el número que se muestra como «Turno N».

- [ ] **Step 5: Crear etiqueta de área en GitHub**

Run: `gh label create "area:play" --color "1D76DB" --description "Dominio Partidas / Play (BiblioPlay)"`
Expected: etiqueta creada (si ya existe, `gh label list --search play` la confirma y se sigue).

- [ ] **Step 6: Commit**

```bash
git add docs/requirements/decisiones.md docs/requirements/backlog.md docs/UI-GLOSARIO.md
git commit -m "docs(play): entrega 0 -- decisiones, backlog y glosario del dominio play (#931)"
```

---

### Task 2: Tipos del core y de Commander

**Files:**
- Create: `src/lib/play/core/types.ts`
- Create: `src/lib/play/core/errors.ts`
- Create: `src/lib/play/commander/types.ts`

**Interfaces:**
- Produces (los nombres exactos que TODO el resto del plan importa):
  - `core/types.ts`: `ToolId`, `Participant`, `PlayEvent<T,P>`, `EventLog`, `ActiveGameSnapshot`
  - `core/errors.ts`: `PlayEventError`
  - `commander/types.ts`: `CommanderParticipant`, `CommanderSetup`, `EliminationReason`, `FinishReason`, `CommanderPlayerState`, `CommanderState`

- [ ] **Step 1: Escribir `src/lib/play/core/types.ts`**

```ts
// Tipos del motor de partidas. El core es neutro: no conoce conceptos de MTG
// (spec §2 — la especialización vive en cada herramienta).

export type ToolId = "commander";

// Unión discriminada: un invitado con userId o un usuario sin él no compilan
// (spec §2, revisión: los estados imposibles no viven en comentarios).
export type Participant =
  | { id: string; kind: "user"; name: string; userId: string }
  | { id: string; kind: "regular" | "guest"; name: string };

export type PlayEvent<T extends string = string, P = unknown> = {
  id: string; // UUID: idempotencia de la sync futura (Fase 5)
  type: T;
  at: number; // epoch ms, informativo: el orden verdadero es la posición en el log
  payload: P;
};

// Fuente de verdad histórica = committed. Estado vivo = committed + pending.
// pending es la ráfaga de coalescing: todavía NO forma parte del log canónico (spec §2-3).
export type EventLog = {
  committed: PlayEvent[];
  pending: PlayEvent | null;
};

// Lo que se persiste en localStorage. Sin toolId: se deriva de
// committed[0].payload.toolId durante el replay de rehidratación (spec §2).
export type ActiveGameSnapshot = {
  v: 1;
  committed: PlayEvent[];
  pending: PlayEvent | null;
};
```

- [ ] **Step 2: Escribir `src/lib/play/core/errors.ts`**

```ts
// El reducer rechaza eventos inválidos lanzando esto; la rehidratación (que ES
// un replay) lo captura y descarta el snapshot (spec §4).
export class PlayEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayEventError";
  }
}
```

- [ ] **Step 3: Escribir `src/lib/play/commander/types.ts`**

```ts
import type { Participant } from "@/lib/play/core/types";

// La herramienta especializa al participante neutro del core (spec §2).
export type CommanderParticipant = Participant & {
  deckName?: string; // texto libre: sin catálogo de cartas MTG (issue #931)
  commanderName?: string;
};

export type CommanderSetup = {
  participants: CommanderParticipant[]; // el orden ES el orden de asientos en la mesa
  startingLife: number; // 40 por defecto (lo fija la UI, el motor no opina)
  startingSeat: number; // índice de asiento que empieza
};

export type EliminationReason = "life" | "poison" | "commander_damage" | "card" | "concede";
export type FinishReason = "last_standing" | "card" | "time" | "abandoned";

export type CommanderPlayerState = {
  participant: CommanderParticipant;
  life: number;
  poison: number;
  commanderDamage: Record<string, number>; // participantId del atacante -> daño acumulado
  // Solo cuenta la eliminación VIGENTE: player_restored la pone a null y una
  // posterior estrena order nuevo (spec §3, ranking).
  elimination: { order: number; round: number | null; reason?: EliminationReason } | null;
};

export type CommanderState = {
  toolId: "commander";
  status: "active" | "finished";
  setup: CommanderSetup;
  players: CommanderPlayerState[]; // mismo orden que setup.participants (asientos)
  activeSeat: number;
  round: number; // el «Turno N» de la UI es la ronda (spec §3, semántica de turnos)
  turnCount: number; // 0 = el tracker de turnos no se ha usado (es opcional)
  monarch: string | null; // participantId
  initiative: string | null;
  eliminationCounter: number;
  winner: string | null;
  finishReason: FinishReason | null;
  startedAt: number;
  finishedAt: number | null;
};
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/play
git commit -m "feat(play): tipos del motor -- core neutro y especializacion Commander"
```

---

### Task 3: Constructor de eventos y eventos Commander

**Files:**
- Create: `src/lib/play/core/events.ts`
- Create: `src/lib/play/commander/events.ts`
- Create: `src/lib/play/commander/test-fixtures.ts`
- Test: `src/lib/play/core/events.test.ts`

**Interfaces:**
- Consumes: `PlayEvent` (Task 2)
- Produces:
  - `makeEvent<T,P>(type: T, payload: P, at: number, id?: string): PlayEvent<T,P>`
  - `commander/events.ts`: los alias `GameStartedEvent`, `LifeChangedEvent`, `CommanderDamageEvent`, `PoisonChangedEvent`, `TurnPassedEvent`, `MonarchChangedEvent`, `InitiativeChangedEvent`, `PlayerEliminatedEvent`, `PlayerRestoredEvent`, `GameFinishedEvent` y la unión `CommanderEvent`
  - `test-fixtures.ts`: `makeSetup(ids?)`, `started(at?, setup?)`, `ev(type, payload, at)` — usados por TODOS los tests posteriores

- [ ] **Step 1: Escribir el test que falla**

`src/lib/play/core/events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeEvent } from "./events";

describe("makeEvent", () => {
  it("construye el sobre con el at inyectado", () => {
    const e = makeEvent("life_changed", { target: "ana", delta: -1 }, 1234, "e-1");
    expect(e).toEqual({ id: "e-1", type: "life_changed", at: 1234, payload: { target: "ana", delta: -1 } });
  });

  it("genera un UUID si no se pasa id", () => {
    const e = makeEvent("turn_passed", {}, 1);
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/play/core/events.test.ts`
Expected: FAIL — `Cannot find module './events'` (o equivalente).

- [ ] **Step 3: Implementar `src/lib/play/core/events.ts`**

```ts
import type { PlayEvent } from "./types";

// `at` se inyecta SIEMPRE (nada de Date.now() en el motor: pureza y tests
// deterministas). El reloj lo pone quien llama — la UI o el store.
export function makeEvent<T extends string, P>(
  type: T,
  payload: P,
  at: number,
  id: string = globalThis.crypto.randomUUID(),
): PlayEvent<T, P> {
  return { id, type, at, payload };
}
```

- [ ] **Step 4: Escribir `src/lib/play/commander/events.ts`** (solo tipos; el typecheck es su test)

```ts
import type { PlayEvent, ToolId } from "@/lib/play/core/types";
import type { CommanderSetup, EliminationReason, FinishReason } from "./types";

export type GameStartedEvent = PlayEvent<"game_started", { toolId: ToolId; setup: CommanderSetup }>;
export type LifeChangedEvent = PlayEvent<"life_changed", { target: string; delta: number }>;
export type CommanderDamageEvent = PlayEvent<"commander_damage", { source: string; target: string; delta: number }>;
export type PoisonChangedEvent = PlayEvent<"poison_changed", { target: string; delta: number }>;
export type TurnPassedEvent = PlayEvent<"turn_passed", Record<string, never>>;
export type MonarchChangedEvent = PlayEvent<"monarch_changed", { holder: string | null }>;
export type InitiativeChangedEvent = PlayEvent<"initiative_changed", { holder: string | null }>;
export type PlayerEliminatedEvent = PlayEvent<"player_eliminated", { target: string; reason?: EliminationReason }>;
export type PlayerRestoredEvent = PlayEvent<"player_restored", { target: string }>;
export type GameFinishedEvent = PlayEvent<"game_finished", { winner?: string; reason?: FinishReason }>;

export type CommanderEvent =
  | GameStartedEvent
  | LifeChangedEvent
  | CommanderDamageEvent
  | PoisonChangedEvent
  | TurnPassedEvent
  | MonarchChangedEvent
  | InitiativeChangedEvent
  | PlayerEliminatedEvent
  | PlayerRestoredEvent
  | GameFinishedEvent;
```

- [ ] **Step 5: Escribir `src/lib/play/commander/test-fixtures.ts`**

No es un `.test.ts`: Vitest no lo ejecuta, solo se importa desde los tests.

```ts
import { makeEvent } from "@/lib/play/core/events";
import type { CommanderParticipant, CommanderSetup } from "./types";
import type { CommanderEvent, GameStartedEvent } from "./events";

export function guest(id: string): CommanderParticipant {
  return { id, kind: "guest", name: id };
}

export function makeSetup(ids: string[] = ["ana", "borja", "carlos", "laura"]): CommanderSetup {
  return { participants: ids.map(guest), startingLife: 40, startingSeat: 0 };
}

export function started(at = 1000, setup: CommanderSetup = makeSetup()): GameStartedEvent {
  return makeEvent("game_started", { toolId: "commander" as const, setup }, at, `e-start-${at}`);
}

let seq = 0;
// Constructor abreviado para tests: id secuencial legible, at explícito.
export function ev<E extends CommanderEvent>(type: E["type"], payload: E["payload"], at: number): E {
  seq += 1;
  return makeEvent(type, payload, at, `e-${seq}`) as E;
}
```

- [ ] **Step 6: Verificar que pasa**

Run: `npx vitest run src/lib/play/core/events.test.ts && npx tsc --noEmit`
Expected: PASS y sin errores de tipos.

- [ ] **Step 7: Commit**

```bash
git add src/lib/play
git commit -m "feat(play): sobre de evento con reloj inyectado y eventos Commander tipados"
```

---

### Task 4: Reducer Commander — inicio, vidas, veneno y daño de comandante

**Files:**
- Create: `src/lib/play/commander/reducer.ts`
- Test: `src/lib/play/commander/reducer.test.ts`

**Interfaces:**
- Consumes: tipos (Task 2), eventos y fixtures (Task 3)
- Produces:
  - `initialCommanderState(event: GameStartedEvent): CommanderState`
  - `commanderReducer(state: CommanderState, event: CommanderEvent): CommanderState` (lanza `PlayEventError` ante evento inválido — la validación semántica del replay depende de esto)

- [ ] **Step 1: Escribir los tests que fallan**

`src/lib/play/commander/reducer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PlayEventError } from "@/lib/play/core/errors";
import { commanderReducer, initialCommanderState } from "./reducer";
import { ev, makeSetup, started } from "./test-fixtures";
import type { CommanderDamageEvent, LifeChangedEvent, PoisonChangedEvent } from "./events";

describe("initialCommanderState", () => {
  it("arranca con las vidas del setup, sin veneno y con el asiento inicial activo", () => {
    const s = initialCommanderState(started(1000));
    expect(s.status).toBe("active");
    expect(s.players).toHaveLength(4);
    expect(s.players.every((p) => p.life === 40 && p.poison === 0 && p.elimination === null)).toBe(true);
    expect(s.activeSeat).toBe(0);
    expect(s.round).toBe(1);
    expect(s.turnCount).toBe(0);
    expect(s.startedAt).toBe(1000);
  });

  it("rechaza menos de 2 o más de 6 jugadores y los ids duplicados", () => {
    expect(() => initialCommanderState(started(1, makeSetup(["ana"])))).toThrow(PlayEventError);
    expect(() => initialCommanderState(started(1, makeSetup(["a", "b", "c", "d", "e", "f", "g"])))).toThrow(PlayEventError);
    expect(() => initialCommanderState(started(1, makeSetup(["ana", "ana"])))).toThrow(PlayEventError);
  });
});

describe("commanderReducer — contadores", () => {
  const base = initialCommanderState(started(1000));

  it("life_changed suma y resta (sin suelo: vidas negativas existen)", () => {
    let s = commanderReducer(base, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -45 }, 2000));
    expect(s.players[0].life).toBe(-5);
    s = commanderReducer(s, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: 3 }, 2100));
    expect(s.players[0].life).toBe(-2);
  });

  it("commander_damage baja vidas Y acumula daño del atacante en UN evento (spec §3)", () => {
    const s = commanderReducer(
      base,
      ev<CommanderDamageEvent>("commander_damage", { source: "carlos", target: "borja", delta: 5 }, 2000),
    );
    expect(s.players[1].life).toBe(35);
    expect(s.players[1].commanderDamage).toEqual({ carlos: 5 });
    // el atacante no cambia
    expect(s.players[2].life).toBe(40);
  });

  it("poison_changed acumula y no baja de 0", () => {
    let s = commanderReducer(base, ev<PoisonChangedEvent>("poison_changed", { target: "laura", delta: 2 }, 2000));
    s = commanderReducer(s, ev<PoisonChangedEvent>("poison_changed", { target: "laura", delta: -5 }, 2100));
    expect(s.players[3].poison).toBe(0);
  });

  it("rechaza participantes desconocidos y game_started duplicado", () => {
    expect(() => commanderReducer(base, ev<LifeChangedEvent>("life_changed", { target: "nadie", delta: 1 }, 2000)))
      .toThrow(PlayEventError);
    expect(() => commanderReducer(base, started(2000))).toThrow(PlayEventError);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/play/commander/reducer.test.ts`
Expected: FAIL — `Cannot find module './reducer'`.

- [ ] **Step 3: Implementar `src/lib/play/commander/reducer.ts`**

```ts
import { PlayEventError } from "@/lib/play/core/errors";
import type { CommanderPlayerState, CommanderState } from "./types";
import type { CommanderEvent, GameStartedEvent } from "./events";

export function initialCommanderState(event: GameStartedEvent): CommanderState {
  const { setup } = event.payload;
  const n = setup.participants.length;
  if (n < 2 || n > 6) throw new PlayEventError(`Commander admite 2-6 jugadores, no ${n}`);
  const ids = new Set(setup.participants.map((p) => p.id));
  if (ids.size !== n) throw new PlayEventError("ids de participante duplicados");
  if (setup.startingSeat < 0 || setup.startingSeat >= n) throw new PlayEventError("startingSeat fuera de rango");
  return {
    toolId: "commander",
    status: "active",
    setup,
    players: setup.participants.map((participant) => ({
      participant,
      life: setup.startingLife,
      poison: 0,
      commanderDamage: {},
      elimination: null,
    })),
    activeSeat: setup.startingSeat,
    round: 1,
    turnCount: 0,
    monarch: null,
    initiative: null,
    eliminationCounter: 0,
    winner: null,
    finishReason: null,
    startedAt: event.at,
    finishedAt: null,
  };
}

function seatOf(state: CommanderState, id: string): number {
  const i = state.players.findIndex((p) => p.participant.id === id);
  if (i < 0) throw new PlayEventError(`participante desconocido: ${id}`);
  return i;
}

function withPlayer(
  state: CommanderState,
  id: string,
  fn: (p: CommanderPlayerState) => CommanderPlayerState,
): CommanderState {
  const i = seatOf(state, id);
  const players = state.players.slice();
  players[i] = fn(players[i]);
  return { ...state, players };
}

export function commanderReducer(state: CommanderState, event: CommanderEvent): CommanderState {
  // Rechazar es lo que hace fiable la validación por replay al rehidratar (spec §4).
  if (state.status === "finished") throw new PlayEventError(`evento tras game_finished: ${event.type}`);

  switch (event.type) {
    case "game_started":
      throw new PlayEventError("game_started solo puede ser el primer evento");

    case "life_changed": {
      const { target, delta } = event.payload;
      return withPlayer(state, target, (p) => ({ ...p, life: p.life + delta }));
    }

    case "commander_damage": {
      const { source, target, delta } = event.payload;
      seatOf(state, source); // valida que el atacante exista
      // Un solo evento semántico toca vidas Y daño de comandante: nunca se pide
      // al usuario mantener dos contadores a mano (issue #931).
      return withPlayer(state, target, (p) => ({
        ...p,
        life: p.life - delta,
        commanderDamage: { ...p.commanderDamage, [source]: (p.commanderDamage[source] ?? 0) + delta },
      }));
    }

    case "poison_changed": {
      const { target, delta } = event.payload;
      return withPlayer(state, target, (p) => ({ ...p, poison: Math.max(0, p.poison + delta) }));
    }

    default:
      return lifecycleReducer(state, event);
  }
}

// Turnos, estados globales y ciclo de vida — se completa en las Tasks 5 y 6.
function lifecycleReducer(state: CommanderState, event: CommanderEvent): CommanderState {
  throw new PlayEventError(`evento desconocido: ${event.type}`);
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/lib/play/commander/reducer.test.ts`
Expected: PASS (los tests de turnos/eliminación llegan en las tasks siguientes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/commander
git commit -m "feat(play): reducer Commander -- inicio de partida y contadores de vida, veneno y comandante"
```

---

### Task 5: Reducer Commander — turnos, monarca e iniciativa

**Files:**
- Modify: `src/lib/play/commander/reducer.ts` (función `lifecycleReducer`)
- Test: `src/lib/play/commander/reducer.test.ts` (añadir describe)

**Interfaces:**
- Consumes: Task 4.
- Produces: `commanderReducer` maneja `turn_passed`, `monarch_changed`, `initiative_changed` con la semántica exacta de la spec §3: asientos = orden del setup; ronda incrementa al CRUZAR la posición de asiento del inicial (aunque esté eliminado); eliminados se saltan.

- [ ] **Step 1: Añadir los tests que fallan**

Añadir a `src/lib/play/commander/reducer.test.ts`:

```ts
import type { MonarchChangedEvent, PlayerEliminatedEvent, TurnPassedEvent } from "./events";

describe("commanderReducer — turnos", () => {
  const turn = (at: number) => ev<TurnPassedEvent>("turn_passed", {}, at);
  const base = initialCommanderState(started(1000));

  it("avanza al siguiente asiento y sube de ronda al cruzar el asiento inicial", () => {
    let s = base; // activo: asiento 0 (ana), ronda 1
    s = commanderReducer(s, turn(2000)); // borja
    s = commanderReducer(s, turn(2001)); // carlos
    s = commanderReducer(s, turn(2002)); // laura
    expect(s.activeSeat).toBe(3);
    expect(s.round).toBe(1);
    s = commanderReducer(s, turn(2003)); // vuelve a ana: cruza el asiento 0
    expect(s.activeSeat).toBe(0);
    expect(s.round).toBe(2);
    expect(s.turnCount).toBe(4);
  });

  // Los casos de turnos que dependen de player_eliminated (saltar eliminados,
  // ronda posicional con el inicial eliminado, un solo vivo) se añaden en la
  // Task 6, cuando la eliminación exista: cada task acaba con la suite verde.
});

describe("commanderReducer — monarca e iniciativa", () => {
  const base = initialCommanderState(started(1000));

  it("asigna, reasigna y limpia con null", () => {
    let s = commanderReducer(base, ev<MonarchChangedEvent>("monarch_changed", { holder: "ana" }, 2000));
    expect(s.monarch).toBe("ana");
    s = commanderReducer(s, ev<MonarchChangedEvent>("monarch_changed", { holder: null }, 2100));
    expect(s.monarch).toBeNull();
  });

  it("rechaza un poseedor desconocido", () => {
    expect(() => commanderReducer(base, ev<MonarchChangedEvent>("monarch_changed", { holder: "nadie" }, 2000)))
      .toThrow(PlayEventError);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/play/commander/reducer.test.ts`
Expected: FAIL — `PlayEventError: evento desconocido: turn_passed` en los describe nuevos.

- [ ] **Step 3: Implementar en `lifecycleReducer`**

Sustituir `lifecycleReducer` en `src/lib/play/commander/reducer.ts`:

```ts
function lifecycleReducer(state: CommanderState, event: CommanderEvent): CommanderState {
  switch (event.type) {
    case "turn_passed": {
      if (state.players.every((p) => p.elimination)) throw new PlayEventError("no queda nadie vivo");
      const seats = state.players.length;
      let round = state.round;
      let seat = state.activeSeat;
      // El límite de ronda es la POSICIÓN de asiento del inicial, no la persona:
      // si el inicial está eliminado la ronda sigue avanzando (spec §3).
      for (let i = 1; i <= seats; i++) {
        const candidate = (state.activeSeat + i) % seats;
        if (candidate === state.setup.startingSeat) round += 1;
        if (!state.players[candidate].elimination) {
          seat = candidate;
          break;
        }
      }
      return { ...state, activeSeat: seat, round, turnCount: state.turnCount + 1 };
    }

    case "monarch_changed": {
      const { holder } = event.payload;
      if (holder !== null) seatOf(state, holder);
      return { ...state, monarch: holder };
    }

    case "initiative_changed": {
      const { holder } = event.payload;
      if (holder !== null) seatOf(state, holder);
      return { ...state, initiative: holder };
    }

    default:
      return endgameReducer(state, event);
  }
}

// Eliminación, restauración y finalización — Task 6.
function endgameReducer(state: CommanderState, event: CommanderEvent): CommanderState {
  throw new PlayEventError(`evento desconocido: ${event.type}`);
}
```

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/lib/play/commander/reducer.test.ts`
Expected: PASS completo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/commander
git commit -m "feat(play): turnos por asiento con ronda posicional, monarca e iniciativa"
```

---

### Task 6: Reducer Commander — eliminación, restauración y finalización

**Files:**
- Modify: `src/lib/play/commander/reducer.ts` (función `endgameReducer`)
- Test: `src/lib/play/commander/reducer.test.ts` (añadir describe)

**Interfaces:**
- Consumes: Tasks 4-5.
- Produces: `commanderReducer` completo. `player_eliminated` registra `{order, round|null, reason?}`; `player_restored` limpia; `game_finished` admite ganador vivo sin exigir el resto eliminado (victoria por carta, spec §3).

- [ ] **Step 1: Añadir los tests que fallan**

```ts
import type { GameFinishedEvent, PlayerRestoredEvent } from "./events";

describe("commanderReducer — eliminación y final", () => {
  const base = initialCommanderState(started(1000));

  it("elimina con orden y motivo, sin ronda si el tracker de turnos no se usó", () => {
    const s = commanderReducer(
      base,
      ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana", reason: "poison" }, 2000),
    );
    expect(s.players[0].elimination).toEqual({ order: 1, round: null, reason: "poison" });
  });

  it("restaurar limpia la eliminación; reeliminar estrena order nuevo", () => {
    let s = commanderReducer(base, ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 2000));
    s = commanderReducer(s, ev<PlayerRestoredEvent>("player_restored", { target: "ana" }, 2100));
    expect(s.players[0].elimination).toBeNull();
    s = commanderReducer(s, ev<PlayerEliminatedEvent>("player_eliminated", { target: "carlos" }, 2200));
    s = commanderReducer(s, ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 2300));
    expect(s.players[2].elimination?.order).toBe(2);
    expect(s.players[0].elimination?.order).toBe(3); // la primera eliminación de ana no existe ya
  });

  it("rechaza eliminar dos veces y restaurar a un vivo", () => {
    const s = commanderReducer(base, ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 2000));
    expect(() => commanderReducer(s, ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 2100)))
      .toThrow(PlayEventError);
    expect(() => commanderReducer(base, ev<PlayerRestoredEvent>("player_restored", { target: "ana" }, 2000)))
      .toThrow(PlayEventError);
  });

  it("game_finished admite ganador con rivales vivos (victoria por carta) y cierra la partida", () => {
    const s = commanderReducer(
      base,
      ev<GameFinishedEvent>("game_finished", { winner: "carlos", reason: "card" }, 9000),
    );
    expect(s.status).toBe("finished");
    expect(s.winner).toBe("carlos");
    expect(s.finishReason).toBe("card");
    expect(s.finishedAt).toBe(9000);
    // tras finalizar, nada más entra
    expect(() => commanderReducer(s, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: 1 }, 9100)))
      .toThrow(PlayEventError);
  });

  it("rechaza un ganador eliminado", () => {
    const s = commanderReducer(base, ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 2000));
    expect(() => commanderReducer(s, ev<GameFinishedEvent>("game_finished", { winner: "ana" }, 9000)))
      .toThrow(PlayEventError);
  });
});

// Casos de turnos que necesitaban player_eliminated (venían anunciados en la Task 5).
describe("commanderReducer — turnos con eliminados", () => {
  const turn = (at: number) => ev<TurnPassedEvent>("turn_passed", {}, at);
  const base = initialCommanderState(started(1000));

  it("salta eliminados, y la ronda sube por POSICIÓN aunque el inicial esté eliminado", () => {
    let s = commanderReducer(base, ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 1500));
    s = commanderReducer(s, turn(2000)); // activo era 0 -> borja
    s = commanderReducer(s, turn(2001)); // carlos
    s = commanderReducer(s, turn(2002)); // laura
    s = commanderReducer(s, turn(2003)); // cruza asiento 0 (ana, eliminada) -> borja, ronda 2
    expect(s.activeSeat).toBe(1);
    expect(s.round).toBe(2);
  });

  it("eliminar al jugador activo NO cambia el activo; el siguiente pase salta desde su asiento", () => {
    let s = commanderReducer(base, turn(2000)); // activo: borja (asiento 1)
    s = commanderReducer(s, ev<PlayerEliminatedEvent>("player_eliminated", { target: "borja" }, 2100));
    expect(s.activeSeat).toBe(1); // sigue siendo su turno: en Magic puedes morir en tu turno
    s = commanderReducer(s, turn(2200));
    expect(s.activeSeat).toBe(2); // carlos
  });

  it("con un solo vivo, el turno vuelve a él y la ronda avanza al envolver", () => {
    let s = base;
    for (const id of ["ana", "borja", "laura"]) {
      s = commanderReducer(s, ev<PlayerEliminatedEvent>("player_eliminated", { target: id }, 1500));
    }
    s = commanderReducer(s, turn(2000)); // solo carlos (asiento 2) vivo
    expect(s.activeSeat).toBe(2);
    s = commanderReducer(s, turn(2100)); // envuelve la mesa entera y cruza el asiento 0
    expect(s.activeSeat).toBe(2);
    expect(s.round).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/play/commander/reducer.test.ts`
Expected: FAIL — `evento desconocido: player_eliminated`.

- [ ] **Step 3: Implementar `endgameReducer`**

```ts
function endgameReducer(state: CommanderState, event: CommanderEvent): CommanderState {
  switch (event.type) {
    case "player_eliminated": {
      const { target, reason } = event.payload;
      const i = seatOf(state, target);
      if (state.players[i].elimination) throw new PlayEventError(`ya eliminado: ${target}`);
      const order = state.eliminationCounter + 1;
      const players = state.players.slice();
      players[i] = {
        ...players[i],
        // ronda solo si el tracker de turnos se está usando (es opcional, spec §3)
        elimination: { order, round: state.turnCount > 0 ? state.round : null, reason },
      };
      // Eliminar NUNCA cambia el jugador activo: en Magic puedes morir en tu turno.
      return { ...state, players, eliminationCounter: order };
    }

    case "player_restored": {
      const { target } = event.payload;
      const i = seatOf(state, target);
      if (!state.players[i].elimination) throw new PlayEventError(`no está eliminado: ${target}`);
      const players = state.players.slice();
      players[i] = { ...players[i], elimination: null };
      return { ...state, players };
    }

    case "game_finished": {
      const { winner, reason } = event.payload;
      if (winner !== undefined) {
        const i = seatOf(state, winner);
        // Victoria por carta: NO se exige que el resto esté eliminado (spec §3),
        // pero un ganador eliminado sí es contradictorio.
        if (state.players[i].elimination) throw new PlayEventError("el ganador no puede estar eliminado");
      }
      return {
        ...state,
        status: "finished",
        winner: winner ?? null,
        finishReason: reason ?? null,
        finishedAt: event.at,
      };
    }

    default:
      throw new PlayEventError(`evento desconocido: ${(event as { type: string }).type}`);
  }
}
```

- [ ] **Step 4: Verificar que TODO el fichero pasa (incluidos los dos rojos de la Task 5)**

Run: `npx vitest run src/lib/play/commander/reducer.test.ts`
Expected: PASS completo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/commander
git commit -m "feat(play): eliminacion vigente, restauracion y game_finished con victoria por carta"
```

---

### Task 7: Condiciones de derrota (`rules.ts`)

**Files:**
- Create: `src/lib/play/commander/rules.ts`
- Test: `src/lib/play/commander/rules.test.ts`

**Interfaces:**
- Consumes: `CommanderState`, reducer y fixtures.
- Produces: `lossConditions(state: CommanderState, participantId: string): EliminationReason[]` — SOLO señaliza; jamás elimina (issue #931: el tracker no es árbitro).

- [ ] **Step 1: Escribir el test que falla**

`src/lib/play/commander/rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { commanderReducer, initialCommanderState } from "./reducer";
import { lossConditions } from "./rules";
import { ev, started } from "./test-fixtures";
import type { CommanderDamageEvent, LifeChangedEvent, PlayerEliminatedEvent, PoisonChangedEvent } from "./events";

describe("lossConditions", () => {
  const base = initialCommanderState(started(1000));

  it("umbrales exactos: 0 vidas, 10 veneno, 21 de comandante — y un punto antes, nada", () => {
    let s = commanderReducer(base, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -39 }, 2000));
    expect(lossConditions(s, "ana")).toEqual([]); // 1 vida
    s = commanderReducer(s, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -1 }, 2100));
    expect(lossConditions(s, "ana")).toEqual(["life"]); // 0 vidas

    let p = commanderReducer(base, ev<PoisonChangedEvent>("poison_changed", { target: "borja", delta: 9 }, 2000));
    expect(lossConditions(p, "borja")).toEqual([]);
    p = commanderReducer(p, ev<PoisonChangedEvent>("poison_changed", { target: "borja", delta: 1 }, 2100));
    expect(lossConditions(p, "borja")).toEqual(["poison"]);

    let c = commanderReducer(
      base,
      ev<CommanderDamageEvent>("commander_damage", { source: "ana", target: "carlos", delta: 20 }, 2000),
    );
    expect(lossConditions(c, "carlos")).toEqual([]); // 20 de ana y 20 vidas
    c = commanderReducer(c, ev<CommanderDamageEvent>("commander_damage", { source: "ana", target: "carlos", delta: 1 }, 2100));
    expect(lossConditions(c, "carlos")).toContain("commander_damage"); // 21 del MISMO comandante
  });

  it("es por comandante individual: 15+15 de dos atacantes distintos no dispara la condición", () => {
    let s = commanderReducer(
      base,
      ev<CommanderDamageEvent>("commander_damage", { source: "ana", target: "laura", delta: 15 }, 2000),
    );
    s = commanderReducer(s, ev<CommanderDamageEvent>("commander_damage", { source: "borja", target: "laura", delta: 15 }, 2100));
    // 40 − 30 = 10 vidas y ningún comandante llega a 21: ninguna condición.
    expect(lossConditions(s, "laura")).toEqual([]);
  });

  it("un jugador ya eliminado no señaliza nada", () => {
    let s = commanderReducer(base, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -40 }, 2000));
    s = commanderReducer(s, ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana", reason: "life" }, 2100));
    expect(lossConditions(s, "ana")).toEqual([]);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/play/commander/rules.test.ts`
Expected: FAIL — `Cannot find module './rules'`.

- [ ] **Step 3: Implementar `src/lib/play/commander/rules.ts`**

```ts
import type { CommanderState, EliminationReason } from "./types";

// SOLO detecta y señaliza: eliminar es siempre decisión humana — Magic tiene
// demasiadas excepciones para que el tracker haga de árbitro (issue #931).
export function lossConditions(state: CommanderState, participantId: string): EliminationReason[] {
  const player = state.players.find((p) => p.participant.id === participantId);
  if (!player || player.elimination) return [];
  const out: EliminationReason[] = [];
  if (player.life <= 0) out.push("life");
  if (player.poison >= 10) out.push("poison");
  if (Object.values(player.commanderDamage).some((d) => d >= 21)) out.push("commander_damage");
  return out;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/lib/play/commander/rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/commander
git commit -m "feat(play): condiciones de derrota que sugieren y nunca eliminan"
```

---

### Task 8: Log — ráfagas, sellado y undo (`core/log.ts`)

**Files:**
- Create: `src/lib/play/core/log.ts`
- Test: `src/lib/play/core/log.test.ts`

**Interfaces:**
- Consumes: `EventLog`, `PlayEvent`, fixtures.
- Produces (el store de la Task 11 llama exactamente esto):
  - `BURST_WINDOW_MS = 1500`
  - `emptyLog(started: PlayEvent): EventLog`
  - `appendTap(log: EventLog, event: PlayEvent): EventLog` — coalesce en `pending`
  - `append(log: EventLog, event: PlayEvent): EventLog` — sella y committea
  - `flushPending(log: EventLog): EventLog`
  - `undoLast(log: EventLog): { log: EventLog; undone: PlayEvent | null }`
- Puro: SIN timers. La ventana se decide comparando los `at` recibidos; el `setTimeout` vive en el store (spec §3, frontera del reloj).

- [ ] **Step 1: Escribir los tests que fallan**

`src/lib/play/core/log.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeEvent } from "./events";
import { append, appendTap, BURST_WINDOW_MS, emptyLog, flushPending, undoLast } from "./log";
import type { EventLog, PlayEvent } from "./types";

const startedEv = makeEvent("game_started", { toolId: "commander", setup: {} }, 1000, "e-start");
const tap = (delta: number, at: number, target = "ana", id?: string): PlayEvent =>
  makeEvent("life_changed", { target, delta }, at, id ?? `t-${at}`);

const fresh = (): EventLog => emptyLog(startedEv);

describe("appendTap — coalescing en la ráfaga pendiente", () => {
  it("funde taps del mismo tipo+target dentro de la ventana", () => {
    let log = appendTap(fresh(), tap(-1, 2000));
    log = appendTap(log, tap(-1, 2500));
    log = appendTap(log, tap(-3, 3000));
    expect(log.committed).toHaveLength(1); // solo game_started
    expect(log.pending?.payload).toEqual({ target: "ana", delta: -5 });
    expect(log.pending?.at).toBe(3000);
  });

  it("delta neto 0 descarta la ráfaga", () => {
    let log = appendTap(fresh(), tap(-2, 2000));
    log = appendTap(log, tap(2, 2500));
    expect(log.pending).toBeNull();
    expect(log.committed).toHaveLength(1);
  });

  it("target distinto sella la ráfaga anterior y abre otra", () => {
    let log = appendTap(fresh(), tap(-1, 2000));
    log = appendTap(log, tap(-1, 2100, "borja"));
    expect(log.committed).toHaveLength(2);
    expect(log.committed[1].payload).toEqual({ target: "ana", delta: -1 });
    expect(log.pending?.payload).toEqual({ target: "borja", delta: -1 });
  });

  it("fuera de ventana sella; un at que RETROCEDE también sella (reloj corregido, spec §3)", () => {
    let log = appendTap(fresh(), tap(-1, 2000));
    log = appendTap(log, tap(-1, 2000 + BURST_WINDOW_MS + 1));
    expect(log.committed).toHaveLength(2);
    log = appendTap(log, tap(-1, 1000)); // retrocede
    expect(log.committed).toHaveLength(3);
    expect(log.pending?.at).toBe(1000);
  });

  it("commander_damage solo funde con mismo source Y target", () => {
    const cd = (source: string, at: number) =>
      makeEvent("commander_damage", { source, target: "ana", delta: 1 }, at, `cd-${source}-${at}`);
    let log = appendTap(fresh(), cd("carlos", 2000));
    log = appendTap(log, cd("carlos", 2100));
    expect(log.pending?.payload).toEqual({ source: "carlos", target: "ana", delta: 2 });
    log = appendTap(log, cd("laura", 2200)); // otro atacante: sella
    expect(log.committed).toHaveLength(2);
  });

  it("un evento no coalescable committea directo y sella lo pendiente", () => {
    let log = appendTap(fresh(), tap(-1, 2000));
    log = append(log, makeEvent("turn_passed", {}, 2100, "e-turn"));
    expect(log.committed.map((e) => e.type)).toEqual(["game_started", "life_changed", "turn_passed"]);
    expect(log.pending).toBeNull();
  });
});

describe("inmutabilidad", () => {
  it("ningún evento ya committeado cambia jamás al operar sobre el log", () => {
    let log = appendTap(fresh(), tap(-1, 2000));
    log = flushPending(log);
    const frozen = JSON.stringify(log.committed);
    log = appendTap(log, tap(-1, 5000));
    log = flushPending(log);
    log = appendTap(log, tap(-1, 9000));
    expect(JSON.stringify(log.committed.slice(0, 2))).toBe(frozen);
  });
});

describe("undoLast", () => {
  it("con pending, el primer undo descarta la ráfaga; el siguiente hace pop del committeado", () => {
    let log = appendTap(fresh(), tap(-5, 2000));
    log = flushPending(log);
    log = appendTap(log, tap(-3, 4000));
    const first = undoLast(log);
    expect(first.undone?.payload).toEqual({ target: "ana", delta: -3 });
    expect(first.log.committed).toHaveLength(2);
    const second = undoLast(first.log);
    expect(second.undone?.payload).toEqual({ target: "ana", delta: -5 });
    expect(second.log.committed).toHaveLength(1);
  });

  it("game_started no es deshacible", () => {
    const res = undoLast(fresh());
    expect(res.undone).toBeNull();
    expect(res.log.committed).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/play/core/log.test.ts`
Expected: FAIL — `Cannot find module './log'`.

- [ ] **Step 3: Implementar `src/lib/play/core/log.ts`**

```ts
import type { EventLog, PlayEvent } from "./types";

export const BURST_WINDOW_MS = 1500;

// El log committeado es INMUTABLE: solo append y pop del final (undo local
// pre-sync). Un evento con su id no cambia de significado después de existir —
// de esto depende la idempotencia de la sync de Fase 5 (spec §3).

const COALESCABLE = new Set(["life_changed", "poison_changed", "commander_damage"]);

// Clave de ráfaga: tipo + target (+ source en commander_damage). null = no coalescable.
function burstKey(event: PlayEvent): string | null {
  if (!COALESCABLE.has(event.type)) return null;
  const p = event.payload as { target: string; source?: string };
  return `${event.type}:${p.source ?? ""}:${p.target}`;
}

export function emptyLog(started: PlayEvent): EventLog {
  return { committed: [started], pending: null };
}

export function flushPending(log: EventLog): EventLog {
  if (!log.pending) return log;
  return { committed: [...log.committed, log.pending], pending: null };
}

export function append(log: EventLog, event: PlayEvent): EventLog {
  const sealed = flushPending(log);
  return { committed: [...sealed.committed, event], pending: null };
}

export function appendTap(log: EventLog, event: PlayEvent): EventLog {
  const key = burstKey(event);
  if (key === null) return append(log, event);
  const prev = log.pending;
  if (prev && burstKey(prev) === key) {
    const dt = event.at - prev.at;
    // dt < 0 = el reloj retrocedió: sellar, nunca mantener la ráfaga abierta (spec §3).
    if (dt >= 0 && dt <= BURST_WINDOW_MS) {
      const delta = (prev.payload as { delta: number }).delta + (event.payload as { delta: number }).delta;
      if (delta === 0) return { ...log, pending: null };
      return { ...log, pending: { ...prev, at: event.at, payload: { ...(prev.payload as object), delta } } };
    }
  }
  return { ...flushPending(log), pending: event };
}

export function undoLast(log: EventLog): { log: EventLog; undone: PlayEvent | null } {
  if (log.pending) return { log: { ...log, pending: null }, undone: log.pending };
  if (log.committed.length <= 1) return { log, undone: null }; // game_started se queda
  const undone = log.committed[log.committed.length - 1];
  return { log: { committed: log.committed.slice(0, -1), pending: null }, undone };
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/lib/play/core/log.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/core
git commit -m "feat(play): log inmutable con rafaga pendiente, coalescing y undo multi-paso"
```

---

### Task 9: Selectors — ranking derivado y descripción de eventos

**Files:**
- Create: `src/lib/play/commander/selectors.ts`
- Test: `src/lib/play/commander/selectors.test.ts`

Nota: la spec dibuja `core/selectors.ts`, pero estos selectors dependen de `CommanderState`, así que viven en `commander/` (desviación consciente, coherente con «el core no conoce MTG»).

**Interfaces:**
- Consumes: `CommanderState`, reducer, fixtures.
- Produces:
  - `finalRanking(state: CommanderState): { participantId: string; position: number }[]` — numeración de competición (1, 2, 2, 4)
  - `describeEvent(event: CommanderEvent, state: CommanderState): { key: string; params: Record<string, string | number> }` — estructurado para i18n; las cadenas en español viven en la UI, no aquí

- [ ] **Step 1: Escribir los tests que fallan**

`src/lib/play/commander/selectors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { commanderReducer, initialCommanderState } from "./reducer";
import { describeEvent, finalRanking } from "./selectors";
import { ev, started } from "./test-fixtures";
import type {
  CommanderDamageEvent,
  CommanderEvent,
  GameFinishedEvent,
  LifeChangedEvent,
  PlayerEliminatedEvent,
  PlayerRestoredEvent,
} from "./events";

function play(events: CommanderEvent[]) {
  return events.reduce(commanderReducer, initialCommanderState(started(1000)));
}

describe("finalRanking", () => {
  it("ganador 1º, vivos empatados después, eliminados en orden inverso — numeración 1,2,2,4", () => {
    const s = play([
      ev<PlayerEliminatedEvent>("player_eliminated", { target: "laura" }, 2000),
      ev<GameFinishedEvent>("game_finished", { winner: "carlos", reason: "card" }, 3000),
    ]);
    const r = finalRanking(s);
    expect(r).toEqual([
      { participantId: "carlos", position: 1 },
      { participantId: "ana", position: 2 },
      { participantId: "borja", position: 2 },
      { participantId: "laura", position: 4 },
    ]);
  });

  it("caso restauración de la spec: Ana eliminada -> restaurada -> Carlos eliminado -> Ana eliminada", () => {
    const s = play([
      ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 2000),
      ev<PlayerRestoredEvent>("player_restored", { target: "ana" }, 2100),
      ev<PlayerEliminatedEvent>("player_eliminated", { target: "carlos" }, 2200),
      ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 2300),
      ev<GameFinishedEvent>("game_finished", { winner: "borja", reason: "last_standing" }, 3000),
    ]);
    // Solo cuenta la eliminación VIGENTE: ana cayó DESPUÉS que carlos.
    expect(finalRanking(s)).toEqual([
      { participantId: "borja", position: 1 },
      { participantId: "laura", position: 2 },
      { participantId: "ana", position: 3 },
      { participantId: "carlos", position: 4 },
    ]);
  });

  it("sin ganador declarado: los vivos empatan en cabeza", () => {
    const s = play([
      ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana" }, 2000),
      ev<GameFinishedEvent>("game_finished", { reason: "abandoned" }, 3000),
    ]);
    const r = finalRanking(s);
    expect(r.filter((x) => x.position === 1).map((x) => x.participantId).sort()).toEqual(["borja", "carlos", "laura"]);
    expect(r.find((x) => x.participantId === "ana")?.position).toBe(4);
  });
});

describe("describeEvent", () => {
  const base = initialCommanderState(started(1000));

  it("describe con nombre resuelto y cantidad positiva", () => {
    expect(describeEvent(ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -5 }, 2000), base))
      .toEqual({ key: "lifeLost", params: { name: "ana", amount: 5 } });
    expect(describeEvent(ev<LifeChangedEvent>("life_changed", { target: "ana", delta: 3 }, 2000), base))
      .toEqual({ key: "lifeGained", params: { name: "ana", amount: 3 } });
    expect(
      describeEvent(ev<CommanderDamageEvent>("commander_damage", { source: "carlos", target: "borja", delta: 5 }, 2000), base),
    ).toEqual({ key: "commanderDamage", params: { source: "carlos", target: "borja", amount: 5 } });
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/play/commander/selectors.test.ts`
Expected: FAIL — `Cannot find module './selectors'`.

- [ ] **Step 3: Implementar `src/lib/play/commander/selectors.ts`**

```ts
import type { CommanderState } from "./types";
import type { CommanderEvent } from "./events";

export type RankingEntry = { participantId: string; position: number };

// 100% derivado del estado: nada de ranking en payloads (spec §3). Numeración
// de competición estándar: los empatados comparten posición y la siguiente salta.
export function finalRanking(state: CommanderState): RankingEntry[] {
  const winnerId = state.winner;
  const alive = state.players.filter((p) => !p.elimination && p.participant.id !== winnerId);
  const eliminated = state.players
    .filter((p) => p.elimination)
    .sort((a, b) => b.elimination!.order - a.elimination!.order); // último caído = mejor puesto

  const groups: string[][] = [];
  if (winnerId) groups.push([winnerId]);
  if (alive.length > 0) groups.push(alive.map((p) => p.participant.id)); // empate explícito
  for (const p of eliminated) groups.push([p.participant.id]);

  const out: RankingEntry[] = [];
  let position = 1;
  for (const group of groups) {
    for (const id of group) out.push({ participantId: id, position });
    position += group.length;
  }
  return out;
}

export type EventDescription = { key: string; params: Record<string, string | number> };

// Estructurado para i18n: la UI traduce `play.log.<key>` con estos params.
// Aquí no hay ni una cadena en español (inv-t-no-cruza + motor sin next-intl).
export function describeEvent(event: CommanderEvent, state: CommanderState): EventDescription {
  const name = (id: string) => state.players.find((p) => p.participant.id === id)?.participant.name ?? id;
  switch (event.type) {
    case "game_started":
      return { key: "started", params: {} };
    case "life_changed": {
      const { target, delta } = event.payload;
      return delta >= 0
        ? { key: "lifeGained", params: { name: name(target), amount: delta } }
        : { key: "lifeLost", params: { name: name(target), amount: -delta } };
    }
    case "commander_damage": {
      const { source, target, delta } = event.payload;
      return { key: "commanderDamage", params: { source: name(source), target: name(target), amount: delta } };
    }
    case "poison_changed": {
      const { target, delta } = event.payload;
      return delta >= 0
        ? { key: "poisonGained", params: { name: name(target), amount: delta } }
        : { key: "poisonHealed", params: { name: name(target), amount: -delta } };
    }
    case "turn_passed":
      return { key: "turnPassed", params: { round: state.round } };
    case "monarch_changed": {
      const { holder } = event.payload;
      return holder ? { key: "monarch", params: { name: name(holder) } } : { key: "monarchCleared", params: {} };
    }
    case "initiative_changed": {
      const { holder } = event.payload;
      return holder ? { key: "initiative", params: { name: name(holder) } } : { key: "initiativeCleared", params: {} };
    }
    case "player_eliminated":
      return { key: "eliminated", params: { name: name(event.payload.target) } };
    case "player_restored":
      return { key: "restored", params: { name: name(event.payload.target) } };
    case "game_finished":
      return { key: "finished", params: {} };
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/lib/play/commander/selectors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/commander
git commit -m "feat(play): ranking derivado con empates y descripcion de eventos para i18n"
```

---

### Task 10: Registro de herramientas y replay (gate de Fase 2)

**Files:**
- Create: `src/lib/play/tools.ts`
- Create: `src/lib/play/core/replay.ts`
- Test: `src/lib/play/core/replay.test.ts`

**Interfaces:**
- Consumes: reducer Commander, log, fixtures.
- Produces:
  - `tools.ts`: `PlayGameState` (hoy = `CommanderState`), `playTools: Record<ToolId, ToolModule>` con `ToolModule = { init(started: PlayEvent): PlayGameState; reduce(state: PlayGameState, e: PlayEvent): PlayGameState }` — registro de DOMINIO, puro; el registro de UI llegará en PR-3 como fichero aparte (spec §6)
  - `replay.ts`: `replay(committed: PlayEvent[], pending?: PlayEvent | null): PlayGameState` — deriva `toolId` de `committed[0]`, lanza `PlayEventError` si el log no empieza por `game_started`

- [ ] **Step 1: Escribir los tests que fallan**

`src/lib/play/core/replay.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PlayEventError } from "./errors";
import { appendTap, emptyLog, flushPending } from "./log";
import { makeEvent } from "./events";
import { replay } from "./replay";
import { commanderReducer, initialCommanderState } from "@/lib/play/commander/reducer";
import { ev, started } from "@/lib/play/commander/test-fixtures";
import type { CommanderState } from "@/lib/play/commander/types";
import type {
  CommanderDamageEvent,
  CommanderEvent,
  LifeChangedEvent,
  PlayerEliminatedEvent,
  TurnPassedEvent,
} from "@/lib/play/commander/events";

describe("replay", () => {
  it("gate Fase 2: aplicar incremental === re-reduce completo desde game_started", () => {
    const events: CommanderEvent[] = [
      ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -4 }, 2000),
      ev<CommanderDamageEvent>("commander_damage", { source: "carlos", target: "borja", delta: 7 }, 2500),
      ev<TurnPassedEvent>("turn_passed", {}, 3000),
      ev<PlayerEliminatedEvent>("player_eliminated", { target: "laura", reason: "concede" }, 3500),
      ev<TurnPassedEvent>("turn_passed", {}, 4000),
      ev<LifeChangedEvent>("life_changed", { target: "carlos", delta: 2 }, 4500),
    ];
    // incremental: evento a evento, como hace el store en vivo
    const incremental = events.reduce(commanderReducer, initialCommanderState(started(1000)));
    // replay: desde el log persistido, como hace la rehidratación
    const state = replay([started(1000), ...events]);
    expect(state).toEqual(incremental);
  });

  it("aplica pending encima de committed (estado vivo, spec §2)", () => {
    let log = emptyLog(started(1000));
    log = flushPending(appendTap(log, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -5 }, 2000)));
    log = appendTap(log, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -3 }, 4000));
    const state = replay(log.committed, log.pending) as CommanderState;
    expect(state.players[0].life).toBe(32);
  });

  it("rechaza un log que no empieza por game_started o con herramienta desconocida", () => {
    expect(() => replay([ev<TurnPassedEvent>("turn_passed", {}, 1)])).toThrow(PlayEventError);
    const bad = makeEvent("game_started", { toolId: "ajedrez", setup: {} }, 1, "e-bad");
    expect(() => replay([bad])).toThrow(PlayEventError);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/play/core/replay.test.ts`
Expected: FAIL — `Cannot find module './replay'`.

- [ ] **Step 3: Implementar `src/lib/play/tools.ts`**

```ts
import type { PlayEvent, ToolId } from "./core/types";
import type { CommanderState } from "./commander/types";
import type { CommanderEvent, GameStartedEvent } from "./commander/events";
import { commanderReducer, initialCommanderState } from "./commander/reducer";

// Registro de DOMINIO: puro, sin React. El registro de UI (tablero, setup,
// resumen por toolId) es un fichero aparte en src/components/play/ — spec §6.
export type PlayGameState = CommanderState; // unión que crecerá con cada herramienta

export type ToolModule = {
  init: (startedEvent: PlayEvent) => PlayGameState;
  reduce: (state: PlayGameState, event: PlayEvent) => PlayGameState;
};

export const playTools: Record<ToolId, ToolModule> = {
  commander: {
    init: (e) => initialCommanderState(e as GameStartedEvent),
    reduce: (s, e) => commanderReducer(s, e as CommanderEvent),
  },
};
```

- [ ] **Step 4: Implementar `src/lib/play/core/replay.ts`**

```ts
import { PlayEventError } from "./errors";
import type { PlayEvent } from "./types";
import { playTools, type PlayGameState } from "@/lib/play/tools";

// La rehidratación ES este replay: si algo no cuadra, PlayEventError y el
// snapshot se descarta (spec §4). El toolId vive SOLO en game_started (spec §2).
export function replay(committed: PlayEvent[], pending: PlayEvent | null = null): PlayGameState {
  const [first, ...rest] = committed;
  if (!first || first.type !== "game_started") throw new PlayEventError("el log no empieza por game_started");
  const toolId = (first.payload as { toolId?: string }).toolId;
  const tool = toolId !== undefined && toolId in playTools ? playTools[toolId as keyof typeof playTools] : null;
  if (!tool) throw new PlayEventError(`herramienta desconocida: ${String(toolId)}`);
  let state = tool.init(first);
  for (const event of rest) state = tool.reduce(state, event);
  if (pending) state = tool.reduce(state, pending);
  return state;
}
```

- [ ] **Step 5: Verificar que pasa + typecheck**

Run: `npx vitest run src/lib/play/core/replay.test.ts && npx tsc --noEmit`
Expected: PASS y sin errores.

- [ ] **Step 6: Commit — cierra PR-1 (motor puro completo)**

```bash
git add src/lib/play
git commit -m "feat(play): registro de herramientas y replay -- una partida se reconstruye entera desde el log"
```

---

### Task 11: Store local-first con snapshot por identidad

**Files:**
- Create: `src/lib/play/core/store.ts`
- Test: `src/lib/play/core/store.test.ts`

**Interfaces:**
- Consumes: log (Task 8), replay (Task 10), `ActiveGameSnapshot`.
- Produces (lo que el hook de la Task 12 y la UI de PR-3/4 consumen):
  - `playStorageKey(identity: string): string` → `biblioshare:play:<identity>:active`
  - `serializeSnapshot(log: EventLog): string` / `parseSnapshot(raw: string | null): EventLog | null` (puras; parse = forma + replay)
  - `type ActiveGame = { log: EventLog; state: PlayGameState }`
  - `getPlayStore(identity: string): PlayStore` (cacheado por identidad)
  - `PlayStore`: `{ subscribe(cb): () => void; getSnapshot(): ActiveGame | null; start(e): void; tap(e): void; dispatch(e): void; undo(): PlayEvent | null; flush(): void; discard(): void }`
- Anatomía calcada de `src/lib/sessions/timer.ts` (leerlo antes): puro/IO separados, `try/catch` en todo acceso a localStorage, bus propio, snapshot referencialmente estable.

- [ ] **Step 1: Escribir los tests que fallan**

`src/lib/play/core/store.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeEvent } from "./events";
import { BURST_WINDOW_MS } from "./log";
import { getPlayStore, parseSnapshot, playStorageKey, serializeSnapshot, __resetPlayStoresForTests } from "./store";
import { started } from "@/lib/play/commander/test-fixtures";
import type { CommanderState } from "@/lib/play/commander/types";

class FakeStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

let storage: FakeStorage;
beforeEach(() => {
  storage = new FakeStorage();
  vi.stubGlobal("localStorage", storage);
  vi.useFakeTimers();
  __resetPlayStoresForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const tap = (delta: number, at: number) => makeEvent("life_changed", { target: "ana", delta }, at, `t-${at}-${delta}`);

describe("persistencia y aislamiento", () => {
  it("la clave está aislada por identidad: anon no ve la partida de un uid", () => {
    const anon = getPlayStore("anon");
    anon.start(started(1000));
    expect(storage.getItem(playStorageKey("anon"))).not.toBeNull();
    expect(getPlayStore("uid-borja").getSnapshot()).toBeNull();
  });

  it("persiste también la ráfaga abierta y rehidrata (sellándola) tras un 'cierre'", () => {
    const store = getPlayStore("anon");
    store.start(started(1000));
    store.tap(tap(-3, 2000));
    // 'cierre': un store nuevo lee lo persistido sin que haya habido flush
    __resetPlayStoresForTests();
    const reborn = getPlayStore("anon");
    const game = reborn.getSnapshot();
    expect((game?.state as CommanderState).players[0].life).toBe(37);
  });

  it("un snapshot corrupto o inválido se descarta sin lanzar", () => {
    storage.setItem(playStorageKey("anon"), "{esto no es json");
    expect(getPlayStore("anon").getSnapshot()).toBeNull();
    // semánticamente inválido: no empieza por game_started
    storage.setItem(playStorageKey("x"), serializeSnapshot({ committed: [tap(-1, 1)], pending: null }));
    expect(getPlayStore("x").getSnapshot()).toBeNull();
  });
});

describe("ráfagas y suscripción", () => {
  it("los taps se coalescen y el timer del store sella la ráfaga al vencer la ventana", () => {
    const store = getPlayStore("anon");
    store.start(started(1000));
    store.tap(tap(-1, 2000));
    store.tap(tap(-1, 2100));
    expect(store.getSnapshot()?.log.pending).not.toBeNull();
    vi.advanceTimersByTime(BURST_WINDOW_MS + 10);
    expect(store.getSnapshot()?.log.pending).toBeNull();
    expect(store.getSnapshot()?.log.committed.map((e) => e.type)).toEqual(["game_started", "life_changed"]);
  });

  it("getSnapshot es referencialmente estable entre cambios (requisito useSyncExternalStore)", () => {
    const store = getPlayStore("anon");
    store.start(started(1000));
    const a = store.getSnapshot();
    expect(store.getSnapshot()).toBe(a);
    store.tap(tap(-1, 2000));
    const b = store.getSnapshot();
    expect(b).not.toBe(a);
    expect(store.getSnapshot()).toBe(b);
  });

  it("notifica a los suscriptores y undo devuelve el evento deshecho", () => {
    const store = getPlayStore("anon");
    const seen: number[] = [];
    store.subscribe(() => seen.push(1));
    store.start(started(1000));
    store.tap(tap(-5, 2000));
    const undone = store.undo();
    expect(undone?.payload).toEqual({ target: "ana", delta: -5 });
    expect(seen.length).toBeGreaterThanOrEqual(3);
  });

  it("discard borra la clave y deja el snapshot a null", () => {
    const store = getPlayStore("anon");
    store.start(started(1000));
    store.discard();
    expect(store.getSnapshot()).toBeNull();
    expect(storage.getItem(playStorageKey("anon"))).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/play/core/store.test.ts`
Expected: FAIL — `Cannot find module './store'`.

- [ ] **Step 3: Implementar `src/lib/play/core/store.ts`**

```ts
import { append, appendTap, BURST_WINDOW_MS, emptyLog, flushPending, undoLast } from "./log";
import { replay } from "./replay";
import type { ActiveGameSnapshot, EventLog, PlayEvent } from "./types";
import type { PlayGameState } from "@/lib/play/tools";

// Store local-first. Anatomía de src/lib/sessions/timer.ts: lo puro arriba,
// el IO abajo con try/catch (modo privado o cuota llena degradan a memoria,
// nunca rompen la partida — spec §4). Este fichero es el ÚNICO del motor que
// toca navegador, y siempre con guardas.

export const SNAPSHOT_VERSION = 1 as const;

// Aislada por identidad: sin esto la partida del usuario A aparece en la
// cuenta B del mismo dispositivo (misma clase de fuga que el arreglo #680).
export function playStorageKey(identity: string): string {
  return `biblioshare:play:${identity}:active`;
}

export function serializeSnapshot(log: EventLog): string {
  const snapshot: ActiveGameSnapshot = { v: SNAPSHOT_VERSION, committed: log.committed, pending: log.pending };
  return JSON.stringify(snapshot);
}

function isPlayEventShape(value: unknown): value is PlayEvent {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  // at: timestamp finito razonable. NO se exige monotonia: el reloj del sistema
  // puede retroceder con la partida abierta; el orden verdadero es la posición
  // en el log (spec §4).
  return (
    typeof e.id === "string" &&
    typeof e.type === "string" &&
    typeof e.at === "number" &&
    Number.isFinite(e.at) &&
    e.at > 0 &&
    "payload" in e
  );
}

// Forma + semántica: el replay ES la validación (spec §4). Devuelve null en
// vez de lanzar: un snapshot malo se descarta, no tumba la app.
export function parseSnapshot(raw: string | null): EventLog | null {
  if (!raw) return null;
  try {
    const snapshot = JSON.parse(raw) as ActiveGameSnapshot;
    if (snapshot?.v !== SNAPSHOT_VERSION) return null;
    if (!Array.isArray(snapshot.committed) || !snapshot.committed.every(isPlayEventShape)) return null;
    if (snapshot.pending !== null && !isPlayEventShape(snapshot.pending)) return null;
    // Rehidratar sella la ráfaga pendiente (spec §3): entra ya committeada.
    const log = flushPending({ committed: snapshot.committed, pending: snapshot.pending });
    replay(log.committed);
    return log;
  } catch {
    return null;
  }
}

export type ActiveGame = { log: EventLog; state: PlayGameState };

export type PlayStore = {
  subscribe(callback: () => void): () => void;
  getSnapshot(): ActiveGame | null;
  start(event: PlayEvent): void;
  tap(event: PlayEvent): void;
  dispatch(event: PlayEvent): void;
  undo(): PlayEvent | null;
  flush(): void;
  discard(): void;
};

function createPlayStore(identity: string): PlayStore {
  const key = playStorageKey(identity);
  let log: EventLog | null = readStorage();
  let cached: ActiveGame | null = null;
  let dirty = true;
  const listeners = new Set<() => void>();
  let sealTimer: ReturnType<typeof setTimeout> | null = null;

  function readStorage(): EventLog | null {
    try {
      return parseSnapshot(globalThis.localStorage?.getItem(key) ?? null);
    } catch {
      return null;
    }
  }

  function persist() {
    try {
      if (log) globalThis.localStorage?.setItem(key, serializeSnapshot(log));
      else globalThis.localStorage?.removeItem(key);
    } catch {
      // sin storage se sigue jugando en memoria (spec §4)
    }
  }

  function emit() {
    dirty = true;
    persist();
    for (const callback of listeners) callback();
  }

  function clearSealTimer() {
    if (sealTimer !== null) {
      clearTimeout(sealTimer);
      sealTimer = null;
    }
  }

  // El puro (log.ts) no tiene reloj: la ventana de 1,5 s la programa el store
  // y también sella al ocultarse la página (spec §3, frontera puro/impuro).
  function scheduleSeal() {
    clearSealTimer();
    sealTimer = setTimeout(sealNow, BURST_WINDOW_MS);
  }

  function sealNow() {
    clearSealTimer();
    if (log?.pending) {
      log = flushPending(log);
      emit();
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") sealNow();
    });
    window.addEventListener("pagehide", sealNow);
  }

  return {
    subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    getSnapshot() {
      if (dirty) {
        cached = log ? { log, state: replay(log.committed, log.pending) } : null;
        dirty = false;
      }
      return cached;
    },
    start(event) {
      if (log) throw new Error("ya hay una partida activa; la UI debe interceptar antes (spec §4)");
      log = emptyLog(event);
      emit();
    },
    tap(event) {
      if (!log) return;
      log = appendTap(log, event);
      scheduleSeal();
      emit();
    },
    dispatch(event) {
      if (!log) return;
      clearSealTimer();
      log = append(log, event);
      emit();
    },
    undo() {
      if (!log) return null;
      clearSealTimer();
      const result = undoLast(log);
      if (result.undone === null) return null;
      log = result.log;
      emit();
      return result.undone;
    },
    flush: sealNow,
    discard() {
      clearSealTimer();
      log = null;
      emit();
    },
  };
}

const stores = new Map<string, PlayStore>();

export function getPlayStore(identity: string): PlayStore {
  let store = stores.get(identity);
  if (!store) {
    store = createPlayStore(identity);
    stores.set(identity, store);
  }
  return store;
}

// Solo para tests: fuerza a releer localStorage con stores vírgenes.
export function __resetPlayStoresForTests(): void {
  stores.clear();
}
```

Nota: `getSnapshot` re-reduce entero en cada cambio. Con logs de partida (cientos de eventos como mucho) es imperceptible; la memoización incremental fina de la spec §2 se introduce en PR-4 SOLO si el profiler la pide (YAGNI). El rehidratado sella `pending` — cumple la ocasión «rehidratación» de la spec §3.

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/lib/play/core/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/core
git commit -m "feat(play): store local-first -- snapshot por identidad, sellado por timer y rehidratacion validada por replay"
```

---

### Task 12: Hook React, verificación final e issues de deuda

**Files:**
- Create: `src/lib/play/core/use-active-game.ts`
- Test: `src/lib/play/core/use-active-game.test.tsx`

**Interfaces:**
- Consumes: `getPlayStore`, `ActiveGame` (Task 11).
- Produces: `useActiveGame(identity: string): { game: ActiveGame | null; store: PlayStore }` — lo que consumirán las islas cliente de PR-3/PR-4.

- [ ] **Step 1: Escribir el test que falla**

`src/lib/play/core/use-active-game.test.tsx` (PRIMERA línea el pragma jsdom — el entorno global es node a propósito):

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetPlayStoresForTests } from "./store";
import { useActiveGame } from "./use-active-game";
import { started } from "@/lib/play/commander/test-fixtures";

function Probe({ identity }: { identity: string }) {
  const { game } = useActiveGame(identity);
  return <output>{game ? "partida" : "vacio"}</output>;
}

beforeEach(() => {
  __resetPlayStoresForTests();
  // React 19: act necesita el flag en el entorno de test
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => vi.unstubAllGlobals());

describe("useActiveGame", () => {
  it("arranca vacío y se re-renderiza cuando el store cambia", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<Probe identity="anon" />));
    expect(host.textContent).toBe("vacio");
    const { getPlayStore } = await import("./store");
    await act(async () => getPlayStore("anon").start(started(1000)));
    expect(host.textContent).toBe("partida");
    await act(async () => root.unmount());
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/play/core/use-active-game.test.tsx`
Expected: FAIL — `Cannot find module './use-active-game'`.

- [ ] **Step 3: Implementar `src/lib/play/core/use-active-game.ts`**

```ts
"use client";

import { useSyncExternalStore } from "react";
import { getPlayStore, type ActiveGame, type PlayStore } from "./store";

// Constante fuera del hook: un getServerSnapshot nuevo por render provoca
// bucle de re-suscripción (misma trampa resuelta en use-timer-state.ts).
const getServerSnapshot = () => null;

export function useActiveGame(identity: string): { game: ActiveGame | null; store: PlayStore } {
  const store = getPlayStore(identity);
  const game = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
  return { game, store };
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/lib/play/core/use-active-game.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verificación completa del dominio**

Run: `npx vitest run src/lib/play && npx tsc --noEmit && npx next lint --dir src/lib/play` (si `next lint` no existe como script, usar el lint del repo: `npm run lint`)
Expected: todo verde.

- [ ] **Step 6: Abrir las issues de deuda asumida (spec §4 y §9)**

```bash
gh issue create --label "area:play,tipo:deuda,P2" \
  --title "play: sin sincronizacion entre pestanas del mismo dispositivo" \
  --body "El store de partidas (src/lib/play/core/store.ts) tiene bus propio pero no escucha el evento 'storage', asi que dos pestanas abiertas divergen hasta recargar. Que SI funciona: una sola pestana, cierre y rehidratacion. Se resolvera con la persistencia seria de Fase 3 (IndexedDB) o escuchando 'storage'. Origen: spec docs/superpowers/specs/2026-08-29-play-fases-0-2-design.md §4 (EPIC #931)."

gh issue create --label "area:play,tipo:deuda,P2" \
  --title "play: localStorage como persistencia de partida es puente hasta IndexedDB (Fase 3)" \
  --body "El snapshot vive en localStorage (~5MB compartidos, sin transacciones). Un log de partida son pocos KB, sin riesgo real hoy. Fase 3 introduce IndexedDB con esquema/migracion; el snapshot v1 debe migrarse o descartarse con aviso. Origen: spec §4 (EPIC #931)."

gh issue create --label "area:play,tipo:feature,P3" \
  --title "play: adoptar la partida anon al iniciar sesion" \
  --body "Las claves de partida estan aisladas por identidad (biblioshare:play:<uid|anon>:active). Si alguien empieza una partida sin sesion y luego inicia sesion, la partida anon no se adopta: cada identidad ve la suya. Decidir gesto explicito de adopcion. Origen: spec §4 y §10 (EPIC #931)."
```

- [ ] **Step 7: Commit final**

```bash
git add src/lib/play
git commit -m "feat(play): useActiveGame via useSyncExternalStore -- el motor queda listo para la UI"
```

---

## Al terminar el plan

1. **Gates cumplidos que hay que poder demostrar:** reconstrucción completa desde el log (test de Task 10) y rehidratación tras cierre (test de Task 11).
2. Usar la skill `superpowers:finishing-a-development-branch` para decidir merge/PR de `feat/play-motor` (el troceo PR-1/PR-2 de la spec puede entregarse como una única PR de motor+store si la revisión es manejable — son ~15 ficheros pequeños — o dividirse por los commits).
3. **NO actualizar `graph.json` todavía**: los nodos `r-play`/`c-play` requieren rutas y componentes que llegan en PR-3/PR-4; añadir entonces también `m-play` y el flujo.
4. Siguiente paso del roadmap: **Fase 1a — canvas de diseño** (5 pantallas, claro/oscuro) iterado con Borja; después se escribe el plan de PR-3/PR-4 (UI) sobre la dirección visual cerrada.
