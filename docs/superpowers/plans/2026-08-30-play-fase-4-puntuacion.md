# BiblioPlay Fase 4 — Puntuación por rondas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Segunda herramienta del motor de partidas — puntuación por rondas con presets, tabla, edición de rondas y resumen — sin tocar la lógica de `src/lib/play/core/` ni el store.

**Architecture:** Dominio puro `src/lib/play/score/` espejo estructural de `mtg/` (events/reducer/selectors); el registro de dominio (`tools.ts`) y el de UI (`tool-views.tsx`) crecen una entrada; UI propia sin módulo de layout (una persona sostiene el móvil). La persistencia, undo, espejo y guardar llegan gratis del motor.

**Tech Stack:** Next.js 16, React 19, next-intl, vitest, Playwright. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-08-30-play-fase-4-puntuacion-design.md` — manda si contradice al plan.

## Global Constraints

- **GATE DE LA FASE: cero cambios de lógica en `src/lib/play/core/` y en el store.** Único cambio permitido en core: `ToolId` pasa a `"mtg" | "score"` en `core/types.ts` (crecimiento de unión previsto). Si una task "necesita" tocar otra cosa del core → BLOCKED y se reporta, no se toca.
- Node 22 para vitest: `fnm use 22` en la misma shell antes de cada `npm test`/`npx vitest`.
- `npm run build` DEBE pasar antes de cada push.
- `git add` con rutas explícitas, nunca `-A`.
- `docs/requirements/decisiones.md` append-only; appends por Bash heredoc.
- Un solo `next dev` en el puerto 3000; Playwright reutiliza el que haya; matar servidores propios al acabar.
- Valores de puntuación: **enteros** (negativos permitidos), sin decimales.
- Jugadores: 2..8. `direction: "highest" | "lowest"`. `target?: { kind: "rounds" | "points"; value: number }`.
- El reducer NUNCA fuerza el fin de partida; `limitReached` es informativo.
- Rutas: `/partidas/puntuacion` (hub con presets `?preset=libre|rondas|puntos`) y `/partidas/puntuacion/nueva`.
- i18n solo `messages/es.json`, namespace `play` (bloques `tools.score`, `scoreBoard`, `roundSheet`, `scoreSummary`).
- Comentarios y copy en español, estilo de los ficheros vecinos.
- Rama: `feat/play-puntuacion` desde `main`. **Entrega en 2 PRs, con una desviación deliberada de la spec §8:** el registro va en PR-B, no en PR-A — `toolViews: Record<ToolId, ToolView>` exige Board/Summary reales en cuanto `ToolId` crece, así que unión+registro+UI son atómicos. PR-A = dominio puro (autocontenido, sin referencias externas todavía). Anotar la desviación en la PR.

---

### Task 0+1: Rama, tipos y eventos del dominio

**Files:**
- Create: `src/lib/play/score/types.ts`
- Create: `src/lib/play/score/events.ts`

**Interfaces (Produces — Tasks 2..6 dependen de estas firmas exactas):**
- `ScoreSetup`, `ScoreState`, `ScoreDirection`, `ScoreTarget` (types.ts)
- `ScoreEvent`, `GameStartedEvent`, `RoundScoredEvent`, `RoundEditedEvent`, `GameFinishedEvent`, `SCORE_EVENT_TYPES` (events.ts)

- [ ] **Step 1: Crear rama**

```bash
git checkout -b feat/play-puntuacion main
```

- [ ] **Step 2: `types.ts`**

```ts
// src/lib/play/score/types.ts
import type { Participant, ToolGameState } from "@/lib/play/core/types";

// La herramienta NO especializa al participante (a diferencia de mtg): una
// puntuación solo necesita nombre y asiento. Si algún día hace falta más,
// se especializa entonces (YAGNI).
export type ScoreDirection = "highest" | "lowest";

/**
 * Límite OPCIONAL e INFORMATIVO: alcanzarlo vuelve la partida finalizable,
 * nunca terminada — el reducer lo ignora y la UI ofrece finalizar (spec §2).
 * Con `points` y direction "lowest", llegar a X te condena y gana el que
 * menos tiene (golf, dominó); con "highest", el que llega gana (UNO a 500).
 */
export type ScoreTarget = { kind: "rounds" | "points"; value: number };

export type ScoreSetup = {
  participants: Participant[]; // 2..8; el orden ES el orden de filas
  direction: ScoreDirection;
  target?: ScoreTarget;
};

export type ScoreState = ToolGameState<"score"> & {
  setup: ScoreSetup;
  rounds: number[][]; // rounds[i][seat]; totales y ranking son SELECTORES
  startedAt: number;
  finishedAt: number | null;
};
```

- [ ] **Step 3: `events.ts`**

```ts
// src/lib/play/score/events.ts
import type { PlayEvent } from "@/lib/play/core/types";
import type { ScoreSetup } from "./types";

// `toolId` va como literal "score", no como ToolId: este fichero es anterior a
// que la unión crezca (PR-A no toca el registro) y el literal es más estrecho.
export type GameStartedEvent = PlayEvent<"game_started", { toolId: "score"; setup: ScoreSetup }>;
// UNA ronda = UN evento; por asiento, longitud = jugadores (spec §2).
export type RoundScoredEvent = PlayEvent<"round_scored", { scores: number[] }>;
export type RoundEditedEvent = PlayEvent<"round_edited", { round: number; scores: number[] }>;
// El ganador NO viaja en el evento: se deriva de los totales al replayar.
export type GameFinishedEvent = PlayEvent<"game_finished", { reason: "manual" }>;

export type ScoreEvent = GameStartedEvent | RoundScoredEvent | RoundEditedEvent | GameFinishedEvent;

// Mismo patrón anti-olvido que MTG_EVENT_TYPE_MAP (ver mtg/events.ts:27-50):
// añadir un evento a la unión y olvidarlo aquí es error de compilación.
const SCORE_EVENT_TYPE_MAP = {
  game_started: true,
  round_scored: true,
  round_edited: true,
  game_finished: true,
} satisfies Record<ScoreEvent["type"], true>;

export const SCORE_EVENT_TYPES: ReadonlySet<ScoreEvent["type"]> = new Set(
  Object.keys(SCORE_EVENT_TYPE_MAP) as ScoreEvent["type"][],
);
```

- [ ] **Step 4: Compila**

```bash
npx tsc --noEmit
```
Expected: limpio (ficheros nuevos autocontenidos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/score/types.ts src/lib/play/score/events.ts
git commit -m "feat(play): tipos y eventos del dominio de puntuacion por rondas (#931)"
```

---

### Task 2: Reducer

**Files:**
- Create: `src/lib/play/score/reducer.ts`
- Test: `src/lib/play/score/reducer.test.ts`

**Interfaces:**
- Consumes: Task 1; `PlayEventError` de `@/lib/play/core/errors`; el patrón de `mtg/reducer.ts` (léelo antes: `initialMtgState` + reducer con switch exhaustivo que lanza `PlayEventError` en rechazos).
- Produces: `initialScoreState(event: GameStartedEvent): ScoreState`; `scoreReducer(state: ScoreState, event: ScoreEvent): ScoreState`.

- [ ] **Step 1: Tests primero (fallan: módulo no existe)**

```ts
// src/lib/play/score/reducer.test.ts
import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/play/core/events";
import { PlayEventError } from "@/lib/play/core/errors";
import type { Participant } from "@/lib/play/core/types";
import type { GameStartedEvent, RoundEditedEvent, RoundScoredEvent, GameFinishedEvent } from "./events";
import { initialScoreState, scoreReducer } from "./reducer";
import type { ScoreSetup } from "./types";

const gente = (n: number): Participant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, kind: "guest" as const, name: `J${i + 1}` }));

const setup = (over: Partial<ScoreSetup> = {}): ScoreSetup => ({
  participants: gente(3),
  direction: "highest",
  ...over,
});

const started = (s: ScoreSetup = setup()) =>
  makeEvent<GameStartedEvent["type"], GameStartedEvent["payload"]>(
    "game_started",
    { toolId: "score", setup: s },
    1000,
  );

const ronda = (scores: number[], at = 2000) =>
  makeEvent<RoundScoredEvent["type"], RoundScoredEvent["payload"]>("round_scored", { scores }, at);

const edita = (round: number, scores: number[], at = 3000) =>
  makeEvent<RoundEditedEvent["type"], RoundEditedEvent["payload"]>("round_edited", { round, scores }, at);

const fin = (at = 9000) =>
  makeEvent<GameFinishedEvent["type"], GameFinishedEvent["payload"]>("game_finished", { reason: "manual" }, at);

describe("initialScoreState", () => {
  it("nace activa, sin rondas, con el setup y startedAt del evento", () => {
    const state = initialScoreState(started());
    expect(state.toolId).toBe("score");
    expect(state.status).toBe("active");
    expect(state.rounds).toEqual([]);
    expect(state.startedAt).toBe(1000);
    expect(state.finishedAt).toBeNull();
  });

  it("rechaza menos de 2 o más de 8 jugadores", () => {
    expect(() => initialScoreState(started(setup({ participants: gente(1) })))).toThrow(PlayEventError);
    expect(() => initialScoreState(started(setup({ participants: gente(9) })))).toThrow(PlayEventError);
  });

  it("rechaza un target sin sentido (valor no entero positivo)", () => {
    expect(() =>
      initialScoreState(started(setup({ target: { kind: "rounds", value: 0 } }))),
    ).toThrow(PlayEventError);
    expect(() =>
      initialScoreState(started(setup({ target: { kind: "points", value: 2.5 } }))),
    ).toThrow(PlayEventError);
  });
});

describe("round_scored", () => {
  it("añade la ronda entera de golpe", () => {
    let s = initialScoreState(started());
    s = scoreReducer(s, ronda([12, 4, 9]));
    s = scoreReducer(s, ronda([8, 15, 6], 2500));
    expect(s.rounds).toEqual([[12, 4, 9], [8, 15, 6]]);
  });

  it("acepta negativos y cero", () => {
    let s = initialScoreState(started());
    s = scoreReducer(s, ronda([-5, 0, 3]));
    expect(s.rounds[0]).toEqual([-5, 0, 3]);
  });

  it("rechaza longitud distinta del número de jugadores", () => {
    const s = initialScoreState(started());
    expect(() => scoreReducer(s, ronda([1, 2]))).toThrow(PlayEventError);
    expect(() => scoreReducer(s, ronda([1, 2, 3, 4]))).toThrow(PlayEventError);
  });

  it("rechaza valores no enteros o no finitos", () => {
    const s = initialScoreState(started());
    expect(() => scoreReducer(s, ronda([1.5, 2, 3]))).toThrow(PlayEventError);
    expect(() => scoreReducer(s, ronda([Number.NaN, 2, 3]))).toThrow(PlayEventError);
  });

  it("con target de rondas alcanzado SIGUE aceptando rondas: el límite es informativo", () => {
    let s = initialScoreState(started(setup({ target: { kind: "rounds", value: 1 } })));
    s = scoreReducer(s, ronda([1, 2, 3]));
    s = scoreReducer(s, ronda([4, 5, 6], 2500));
    expect(s.rounds).toHaveLength(2);
  });
});

describe("round_edited", () => {
  it("reemplaza una ronda existente sin tocar las demás", () => {
    let s = initialScoreState(started());
    s = scoreReducer(s, ronda([1, 2, 3]));
    s = scoreReducer(s, ronda([4, 5, 6], 2500));
    s = scoreReducer(s, edita(0, [10, 2, 3]));
    expect(s.rounds).toEqual([[10, 2, 3], [4, 5, 6]]);
  });

  it("rechaza índice fuera de rango", () => {
    let s = initialScoreState(started());
    s = scoreReducer(s, ronda([1, 2, 3]));
    expect(() => scoreReducer(s, edita(1, [9, 9, 9]))).toThrow(PlayEventError);
    expect(() => scoreReducer(s, edita(-1, [9, 9, 9]))).toThrow(PlayEventError);
  });

  it("valida scores igual que round_scored", () => {
    let s = initialScoreState(started());
    s = scoreReducer(s, ronda([1, 2, 3]));
    expect(() => scoreReducer(s, edita(0, [1, 2]))).toThrow(PlayEventError);
  });
});

describe("game_finished", () => {
  it("marca finished con finishedAt del evento", () => {
    let s = initialScoreState(started());
    s = scoreReducer(s, ronda([1, 2, 3]));
    s = scoreReducer(s, fin());
    expect(s.status).toBe("finished");
    expect(s.finishedAt).toBe(9000);
  });

  it("tras finished, TODO evento se rechaza", () => {
    let s = initialScoreState(started());
    s = scoreReducer(s, fin());
    expect(() => scoreReducer(s, ronda([1, 2, 3]))).toThrow(PlayEventError);
    expect(() => scoreReducer(s, fin(9500))).toThrow(PlayEventError);
  });

  it("un game_started sobre una partida ya iniciada se rechaza", () => {
    const s = initialScoreState(started());
    expect(() => scoreReducer(s, started())).toThrow(PlayEventError);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

```bash
fnm use 22 && npx vitest run src/lib/play/score/reducer.test.ts
```
Expected: FAIL — `Cannot find module './reducer'`.

- [ ] **Step 3: Implementar `reducer.ts`**

```ts
// src/lib/play/score/reducer.ts
import { PlayEventError } from "@/lib/play/core/errors";
import type { GameStartedEvent, ScoreEvent } from "./events";
import type { ScoreState } from "./types";

// Misma disciplina que mtg/reducer.ts: puro, switch exhaustivo, rechazo =
// PlayEventError (el store lo convierte en `false`, spec fases 0-2 §4).

function assertScores(scores: number[], players: number): void {
  if (scores.length !== players) {
    throw new PlayEventError(`ronda con ${scores.length} puntuaciones para ${players} jugadores`);
  }
  for (const value of scores) {
    if (!Number.isInteger(value)) {
      throw new PlayEventError(`puntuación no entera: ${value}`);
    }
  }
}

export function initialScoreState(event: GameStartedEvent): ScoreState {
  const { setup } = event.payload;
  if (setup.participants.length < 2 || setup.participants.length > 8) {
    throw new PlayEventError(`puntuación admite de 2 a 8 jugadores, no ${setup.participants.length}`);
  }
  if (setup.target && (!Number.isInteger(setup.target.value) || setup.target.value < 1)) {
    throw new PlayEventError(`target inválido: ${setup.target.value}`);
  }
  return {
    toolId: "score",
    status: "active",
    setup,
    rounds: [],
    startedAt: event.at,
    finishedAt: null,
  };
}

export function scoreReducer(state: ScoreState, event: ScoreEvent): ScoreState {
  if (state.status === "finished") {
    throw new PlayEventError(`evento ${event.type} sobre una partida terminada`);
  }
  switch (event.type) {
    case "game_started":
      throw new PlayEventError("game_started sobre una partida ya iniciada");
    case "round_scored": {
      assertScores(event.payload.scores, state.setup.participants.length);
      return { ...state, rounds: [...state.rounds, event.payload.scores] };
    }
    case "round_edited": {
      const { round, scores } = event.payload;
      if (round < 0 || round >= state.rounds.length) {
        throw new PlayEventError(`ronda ${round} no existe (hay ${state.rounds.length})`);
      }
      assertScores(scores, state.setup.participants.length);
      const rounds = state.rounds.map((r, i) => (i === round ? scores : r));
      return { ...state, rounds };
    }
    case "game_finished":
      return { ...state, status: "finished", finishedAt: event.at };
  }
}
```

- [ ] **Step 4: Verde**

```bash
npx vitest run src/lib/play/score/reducer.test.ts
```
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/score/reducer.ts src/lib/play/score/reducer.test.ts
git commit -m "feat(play): reducer de puntuacion por rondas (#931)"
```

---

### Task 3: Selectores

**Files:**
- Create: `src/lib/play/score/selectors.ts`
- Test: `src/lib/play/score/selectors.test.ts`

**Interfaces:**
- Consumes: Tasks 1-2; `EventDescription` de `@/lib/play/core/types`.
- Produces: `totals(state: ScoreState): number[]`; `scoreRanking(state: ScoreState): { seat: number; total: number; position: number }[]`; `limitReached(state: ScoreState): boolean`; `describeEvent(event: ScoreEvent, state: ScoreState): EventDescription`.

- [ ] **Step 1: Tests primero**

```ts
// src/lib/play/score/selectors.test.ts
import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/play/core/events";
import type { Participant } from "@/lib/play/core/types";
import type { GameStartedEvent, RoundScoredEvent } from "./events";
import { initialScoreState, scoreReducer } from "./reducer";
import { describeEvent, limitReached, scoreRanking, totals } from "./selectors";
import type { ScoreSetup, ScoreState } from "./types";

const gente = (n: number): Participant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, kind: "guest" as const, name: `J${i + 1}` }));

function conRondas(rounds: number[][], over: Partial<ScoreSetup> = {}): ScoreState {
  const setup: ScoreSetup = { participants: gente(rounds[0]?.length ?? 3), direction: "highest", ...over };
  let s = initialScoreState(
    makeEvent<GameStartedEvent["type"], GameStartedEvent["payload"]>(
      "game_started",
      { toolId: "score", setup },
      1000,
    ),
  );
  let at = 2000;
  for (const r of rounds) {
    s = scoreReducer(
      s,
      makeEvent<RoundScoredEvent["type"], RoundScoredEvent["payload"]>("round_scored", { scores: r }, at++),
    );
  }
  return s;
}

describe("totals", () => {
  it("suma por asiento; sin rondas, todo ceros", () => {
    expect(totals(conRondas([[12, 4, 9], [8, 15, 6], [5, 11, 8]]))).toEqual([25, 30, 23]);
    expect(totals(conRondas([]).status === "active" ? conRondas([]) : conRondas([]))).toEqual([0, 0, 0]);
  });
});

describe("scoreRanking", () => {
  it("con highest gana el mayor", () => {
    const ranking = scoreRanking(conRondas([[12, 4, 9], [8, 15, 6], [5, 11, 8]]));
    expect(ranking[0]).toEqual({ seat: 1, total: 30, position: 1 });
    expect(ranking[1]).toEqual({ seat: 0, total: 25, position: 2 });
    expect(ranking[2]).toEqual({ seat: 2, total: 23, position: 3 });
  });

  it("con lowest gana el menor", () => {
    const ranking = scoreRanking(conRondas([[12, 4, 9]], { direction: "lowest" }));
    expect(ranking[0].seat).toBe(1);
  });

  it("empate comparte posición y la siguiente salta (1,1,3)", () => {
    const ranking = scoreRanking(conRondas([[10, 10, 3]]));
    expect(ranking.map((r) => r.position)).toEqual([1, 1, 3]);
  });
});

describe("limitReached", () => {
  it("sin target, nunca", () => {
    expect(limitReached(conRondas([[1, 2, 3], [1, 2, 3]]))).toBe(false);
  });

  it("target de rondas: al completar la última", () => {
    const target = { kind: "rounds" as const, value: 2 };
    expect(limitReached(conRondas([[1, 2, 3]], { target }))).toBe(false);
    expect(limitReached(conRondas([[1, 2, 3], [4, 5, 6]], { target }))).toBe(true);
  });

  it("target de puntos: cuando ALGÚN total alcanza el valor, en ambas direcciones", () => {
    const target = { kind: "points" as const, value: 20 };
    expect(limitReached(conRondas([[9, 5, 3]], { target }))).toBe(false);
    expect(limitReached(conRondas([[9, 5, 3], [11, 2, 1]], { target }))).toBe(true);
    // Con lowest la semántica es la misma: llegar a X vuelve la partida finalizable.
    expect(limitReached(conRondas([[19, 5, 3], [1, 2, 1]], { target, direction: "lowest" }))).toBe(true);
  });
});

describe("describeEvent", () => {
  it("etiqueta las rondas con su número humano (1-based)", () => {
    const s = conRondas([[1, 2, 3]]);
    const scored = makeEvent<RoundScoredEvent["type"], RoundScoredEvent["payload"]>(
      "round_scored",
      { scores: [1, 2, 3] },
      5000,
    );
    expect(describeEvent(scored, s)).toEqual({ key: "roundScored", params: { round: 2 } });
  });
});
```

Nota Step 1: el segundo assert de `totals` con «sin rondas» está enrevesado — simplifícalo a `expect(totals(conRondas([])))`... pero `conRondas([])` no sabe cuántos jugadores: dale un parámetro por defecto de 3 en la factory (`rounds[0]?.length ?? 3` ya lo hace). Escríbelo limpio: `expect(totals(conRondas([]))).toEqual([0, 0, 0])`.

- [ ] **Step 2: Rojo**

```bash
npx vitest run src/lib/play/score/selectors.test.ts
```
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar `selectors.ts`**

```ts
// src/lib/play/score/selectors.ts
import type { EventDescription } from "@/lib/play/core/types";
import type { ScoreEvent } from "./events";
import type { ScoreState } from "./types";

export function totals(state: ScoreState): number[] {
  const out = state.setup.participants.map(() => 0);
  for (const round of state.rounds) {
    for (let seat = 0; seat < out.length; seat++) out[seat] += round[seat];
  }
  return out;
}

// Empate comparte posición y la siguiente salta (1,1,3): mismo criterio que
// finalRanking de mtg. El "mejor" lo decide direction.
export function scoreRanking(state: ScoreState): { seat: number; total: number; position: number }[] {
  const sums = totals(state);
  const orden = sums
    .map((total, seat) => ({ seat, total }))
    .sort((a, b) => (state.setup.direction === "highest" ? b.total - a.total : a.total - b.total));
  let position = 0;
  let previous: number | null = null;
  return orden.map((entry, index) => {
    if (previous === null || entry.total !== previous) {
      position = index + 1;
      previous = entry.total;
    }
    return { ...entry, position };
  });
}

/**
 * INFORMATIVO (spec §2): la UI ofrece finalizar, el reducer lo ignora. Con
 * `points`, alcanzar (>=) el valor dispara en AMBAS direcciones: con highest
 * el que llega gana; con lowest llegar te condena y gana el que menos tiene.
 */
export function limitReached(state: ScoreState): boolean {
  const { target } = state.setup;
  if (!target) return false;
  if (target.kind === "rounds") return state.rounds.length >= target.value;
  return totals(state).some((total) => total >= target.value);
}

// Etiquetas para la consola de deshacer y el log. `round` humano, 1-based.
export function describeEvent(event: ScoreEvent, state: ScoreState): EventDescription {
  switch (event.type) {
    case "game_started":
      return { key: "gameStarted", params: {} };
    case "round_scored":
      // El evento describe la PRÓXIMA ronda si aún no se aplicó, pero en la
      // consola siempre se describe el último evento YA aplicado: la ronda
      // que añadió es la última — su número humano es rounds.length... salvo
      // que el estado no lo incluya todavía (describe de un pending ajeno).
      // Criterio simple y estable: número = rondas actuales + 1 si el evento
      // no está aplicado no es distinguible aquí; se etiqueta con el total
      // actual + 1 para pending y la UI del log histórico no lo usa.
      return { key: "roundScored", params: { round: state.rounds.length + 1 } };
    case "round_edited":
      return { key: "roundEdited", params: { round: event.payload.round + 1 } };
    case "game_finished":
      return { key: "gameFinished", params: {} };
  }
}
```

**OJO con `describeEvent` de `round_scored`**: el test del Step 1 espera `round: 2` con 1 ronda aplicada (describe el PRÓXIMO). Mira cómo usa `describe` la consola de mtg (`game-sheet.tsx`: describe el último evento del log YA aplicado al estado). Si al integrar (Task 5) la etiqueta sale con número desfasado («Deshacer ronda 2» cuando la aplicada es la 1), cambia el criterio a `state.rounds.length` y ajusta el test — deja el criterio elegido comentado. Es una decisión de UI-corrección, no de arquitectura.

- [ ] **Step 4: Verde**

```bash
npx vitest run src/lib/play/score
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/score/selectors.ts src/lib/play/score/selectors.test.ts
git commit -m "feat(play): selectores de puntuacion -- totales, ranking, limite y etiquetas (#931)"
```

---

### Task 4: Replay de reconstrucción + PR-A

**Files:**
- Create: `src/lib/play/score/replay.test.ts`

- [ ] **Step 1: Test de reconstrucción (gate del motor, espejo del de mtg)**

Mira si `mtg/` tiene un test de reconstrucción por replay (grep `replay` en `src/lib/play/mtg/*.test.ts`) y espeja su forma. Contenido mínimo:

```ts
// src/lib/play/score/replay.test.ts
import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/play/core/events";
// initialScoreState/scoreReducer + fábricas como en reducer.test.ts (cópialas:
// los tests se leen solos, no comparten helpers entre ficheros en este repo
// salvo que ya exista test-fixtures — mira src/lib/play/core/test-fixtures*).

describe("reconstrucción", () => {
  it("estado inicial + eventos reconstruye exactamente el estado final", () => {
    // secuencia: started → 3 rondas → edita ronda 1 → finished
    // aplica todo con scoreReducer y compara con aplicar la MISMA secuencia
    // dos veces: determinismo total (mismo input, mismo estado profundo).
    // Y además: quitar el último evento = estado anterior (undo por prefijo).
  });
});
```

Escríbelo completo con las fábricas de reducer.test.ts; los dos asserts:
`expect(replayA).toEqual(replayB)` y `expect(aplicar(prefijo)).toEqual(estadoAntesDelUltimo)`.

- [ ] **Step 2: Verde + suite entera + build**

```bash
npx vitest run src/lib/play && npx tsc --noEmit && npm run build
```
Expected: todo verde; build compila (el dominio aún no está registrado — es código autocontenido).

- [ ] **Step 3: Commit + push + PR-A**

```bash
git add src/lib/play/score/replay.test.ts
git commit -m "test(play): la puntuacion se reconstruye entera por replay (#931)"
git push -u origin feat/play-puntuacion
gh pr create --title "feat(play): dominio de puntuacion por rondas (#931)" --body-file - <<'EOF'
[resumen real: eventos/reducer/selectores puros de la herramienta de puntuación, espejo de mtg/. AÚN sin registrar (desviación deliberada de la spec §8: la unión ToolId exige Board/Summary reales, así que registro+UI van juntos en la PR-B). Checklist use-cache: no aplica, todo cliente/puro.]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

---

### Task 5: Registro + i18n + componentes de partida (tablero, hojas, resumen)

La task más grande: la unión `ToolId` obliga a que dominio, registro y pantallas lleguen juntos compilando.

**Files:**
- Modify: `src/lib/play/core/types.ts` (SOLO la línea `export type ToolId = "mtg";` → `export type ToolId = "mtg" | "score";`)
- Modify: `src/lib/play/tools.ts` (unión `PlayGameState`, entrada `score` en `playTools` con guard `isScoreEvent` espejo de `isMtgEvent`)
- Modify: `src/components/play/tool-views.tsx` (entrada `score`)
- Create: `src/components/play/marks/score-table-mark.tsx` (ilustración: mira `mtg-table-mark.tsx` y dibuja una tabla estilizada equivalente en SVG/divs)
- Create: `src/components/play/score/score-board.tsx`
- Create: `src/components/play/score/round-sheet.tsx`
- Create: `src/components/play/score/score-game-sheet.tsx`
- Create: `src/components/play/score/score-summary.tsx`
- Modify: `messages/es.json` (bloques nuevos del namespace `play`)

**Interfaces:**
- Consumes: dominio de Tasks 1-3; `ToolScreenProps` de tool-views; `PlaySheet`/`SheetGroup`/`SheetRow` de `play-sheet.tsx`; `useWakeLock` (mira su firma en `use-wake-lock.ts` y cómo la usa `game-board.tsx`); `seatAccent` de `@/lib/play/ui/seats`; `formatElapsed` de `@/lib/play/ui/clock`; `buttonVariants`.
- Produces: `ScoreBoard`, `ScoreSummary` (ambos `ComponentType<ToolScreenProps>`) registrados en `toolViews.score`.

**Requisitos de comportamiento (la spec §4 manda; leer game-board.tsx, game-sheet.tsx, game-summary.tsx ANTES para espejar patrones):**

1. `tools.ts` — entrada score:
```ts
score: {
  i18nKey: "score",
  setupRoute: "/partidas/puntuacion/nueva",
  init: (e) => initialScoreState(e as ScoreGameStartedEvent),
  reduce: (s, e) => scoreReducer(s as ScoreState, e as ScoreEvent),
  describe: (event, state) =>
    isScoreEvent(event) ? describeScoreEvent(event, state as ScoreState) : UNKNOWN_EVENT_DESCRIPTION,
},
```
(usa alias de import para no chocar con los nombres de mtg; `describe` de mtg y score comparten formato `{key, params}` — las claves de score van bajo `log.` como las de mtg: mira `messages/es.json` → `play.log`).

2. `score-board.tsx` — pantalla completa `h-dvh` sobre `bg-play-felt` (como game-board), SIN rotaciones ni grid de asientos:
   - Cabecera: nombre de la herramienta + crono (`GameClock` si es reutilizable — mira `game-clock.tsx`; si está acoplado a mtg, `formatElapsed` directo) + botón menú (abre `ScoreGameSheet`).
   - Tabla: contenedor `overflow-x-auto`; primera columna fija con nombre + barra de color (`seatAccent(seat).bar`); columnas R1..Rn tocables (abren `RoundSheet` en modo edición de esa ronda); columna TOTAL en negrita con `totals()`; `tabular-nums` en todas las cifras.
   - Botón primario «Añadir ronda» (abre `RoundSheet` en modo alta).
   - Si `limitReached(state)`: banda no bloqueante con `t("scoreBoard.limitReached")` y botón «Finalizar» que despacha `game_finished` — la partida sigue editable.
   - Wake lock: mismo uso que game-board.
   - Deshacer accesible (en la hoja de partida, como mtg tras la decisión (9): las acciones de partida viven en la hoja).
3. `round-sheet.tsx` — chasis `PlaySheet`. Props: `{ state, store, round: number | null, onClose }` (`null` = alta). Un `input` numérico por jugador (`inputMode="numeric"`, acepta `-`), etiquetado con el nombre, precargado (0 en alta / valores de la ronda en edición), vacío cuenta 0. Confirmar despacha `round_scored` o `round_edited` vía `store.dispatch(makeEvent(...))` y cierra. Si `dispatch` devuelve `false`, no cierra (mismo trato que las hojas de mtg).
4. `score-game-sheet.tsx` — espejo de `game-sheet.tsx` SIN pasar turno ni presets de mesa: grupo TURNO→ sustituido por grupo con solo (deshacer con etiqueta del último evento); grupo (mantener pantalla, salir sin descartar); caja aparte `pt-2` con (finalizar, descartar con doble toque). Reusa el patrón de `undoable`/`undoLabel` de game-sheet.
5. `score-summary.tsx` — espejo de `game-summary.tsx`: titular «Gana X» (o empate: si `scoreRanking[0]` y `[1]` comparten position, `t("scoreSummary.tie")`), clasificación con posición/nombre/total, duración (`formatElapsed`) y nº de rondas; botones revancha (primero, a `/partidas/puntuacion/nueva?revancha=1`) · Guardar partida (patrón exacto de game-summary con `store.save()`) · Descartar.
6. i18n: añade a `messages/es.json` dentro de `play`: `tools.score` (name, tagline si el grid lo pide — mira qué claves consume `tool-grid.tsx`), `log.roundScored` («Ronda {round} apuntada»), `log.roundEdited`, `log.gameStarted`/`gameFinished` si no existen genéricas (mira las de mtg y reutiliza si son neutras), `scoreBoard.*` (addRound, limitReached, finish...), `roundSheet.*` (title, edit, confirm), `scoreSummary.*` (tie, rounds), `gameSheet.*` reutilizadas donde el texto ya sirve (keepAwake, leave, discard...: NO dupliques claves que ya existen con el mismo texto).

- [ ] **Step 1: Registro + tipos (rojo del compilador como guía)** — cambia `ToolId`, `PlayGameState`, añade entradas; `npx tsc --noEmit` te dirá cada `Record<ToolId, ...>` incompleto y cada estrechamiento roto. Arregla TODOS (incluidos los `state as MtgState` de componentes mtg si el estrechamiento ya no compila — el cast explícito sigue valiendo).
- [ ] **Step 2: Componentes + i18n** hasta que `npx tsc --noEmit` y `npx eslint src/components/play/score src/lib/play/tools.ts` queden limpios.
- [ ] **Step 3: Suite entera**

```bash
npx vitest run src/lib/play src/components src/app 2>/dev/null; npx vitest run src/lib/play; npx vitest run src/app/contraste-play.test.ts
```
Expected: verde (el test de contraste existe — si tus clases nuevas usan tokens ya auditados, pasa solo).

- [ ] **Step 4: Commit**

```bash
git add src/lib/play/core/types.ts src/lib/play/tools.ts src/components/play/tool-views.tsx src/components/play/marks/score-table-mark.tsx src/components/play/score messages/es.json
git commit -m "feat(play): registro y pantallas de la herramienta de puntuacion (#931)"
```

---

### Task 6: Hub con presets, setup y tarjeta en /partidas

**Files:**
- Create: `src/app/partidas/puntuacion/page.tsx` (shell servidor, espejo de `src/app/partidas/mtg/page.tsx` — léela: prerender + isla)
- Create: `src/app/partidas/puntuacion/nueva/page.tsx` (espejo de `src/app/partidas/mtg/nueva/page.tsx`)
- Create: `src/components/play/score/score-preset-chooser.tsx`
- Create: `src/components/play/score/score-setup-form.tsx`
- Modify: `src/components/play/tool-grid.tsx` (mira cómo lista herramientas: si itera `toolViews`/`playTools`, la tarjeta sale sola; si está hardcodeada a mtg, añade la de score)
- Modify: `messages/es.json` (claves del chooser y setup)

**Interfaces:**
- Consumes: `useActiveGame` (snapshot loading/ready — patrón de arranque de `mtg-mode-chooser.tsx`: guard de loading, `if (snapshot.game) store.discard()`, `store.start(...)`, `disabled` en loading); `makeEvent`; dominio score.
- Produces: rutas navegables `/partidas/puntuacion` y `/partidas/puntuacion/nueva?preset=libre|rondas|puntos`.

**Comportamiento:**

1. `score-preset-chooser.tsx` — espejo estructural de `mtg-mode-chooser.tsx`: tarjetas «Libre», «A N rondas», «A X puntos» (aria-pressed, misma estética), «Jugar ya» (arranca con el preset elegido y 4 jugadores por defecto — nombres `Jugador N` — y direction "highest"), enlace «Configurar» a `/partidas/puntuacion/nueva?preset=<id>`. El preset SOLO prefija (spec §5): N y X se introducen en la configuración, no aquí. `cómo funciona` (`how-it-works.tsx` si es genérico; si está acoplado a mtg, sección propia breve).
2. `score-setup-form.tsx` — espejo aligerado de `setup-form.tsx`: número de jugadores (2..8), nombre por jugador, toggle mayor/menor gana, y según preset un campo numérico «rondas» o «puntos» (desactivable — quitar el límite es legal). «Empezar»: patrón exacto de arranque (guard loading, discard si hay activa, `game_started` con `{toolId: "score", setup}`, push a `/partida/activa`). `?revancha=1`: si la partida activa/última es de score... la mesa recordada de mtg (`table-memory`) está tipada a mtg — spec §5: reutilizar SOLO si encaja sin cambiarla; si no, la revancha se limita a prefijar desde la partida en curso terminada (léela del store antes de descartarla) y se abre issue por la mesa recordada de score.
3. Tarjeta en el hub: `tool-grid.tsx` + su i18n.

- [ ] **Step 1: Componentes + páginas + i18n**; `npx tsc --noEmit` y eslint de los ficheros tocados limpios.
- [ ] **Step 2: Humo manual rápido con dev server** (puerto 3000, matar al acabar): hub → puntuación → preset → setup → partida → 2 rondas → editar → resumen.
- [ ] **Step 3: Commit**

```bash
git add src/app/partidas/puntuacion src/components/play/score/score-preset-chooser.tsx src/components/play/score/score-setup-form.tsx src/components/play/tool-grid.tsx messages/es.json
git commit -m "feat(play): hub con presets y configuracion de puntuacion (#931)"
```

---

### Task 7: e2e + cierre documental + PR-B

**Files:**
- Create: `e2e/partidas-puntuacion.spec.ts`
- Modify: `docs/requirements/decisiones.md` (append), `docs/requirements/backlog.md`

- [ ] **Step 1: e2e** — lee `e2e/partidas-mtg.spec.ts` y `e2e/partidas-persistencia.spec.ts` (helpers `e2e/support/play-db.ts` disponibles). Tests:

```ts
// e2e/partidas-puntuacion.spec.ts — esqueleto; arrange con selectores reales
test("partida completa: preset, 3 rondas, editar, deshacer, finalizar, guardar", async ({ page }) => {
  // /partidas → tarjeta Puntuación → preset «Libre» → Jugar ya → tablero
  // 3 rondas por la hoja (valores distintos) → tabla muestra totales correctos
  // tocar columna R2 → editar → total cambia
  // hoja de partida → deshacer → la edición se revierte
  // finalizar → resumen con ganador correcto según totales
  // Guardar partida → /partidas sin banner; active en IDB null (waitForActiveRecord)
});

test("una partida de puntuacion sobrevive al reload", async ({ page }) => {
  // arrange 2 rondas → page.reload() → tabla intacta (misma cifra visible)
});

test("a X puntos: la banda de finalizar aparece al alcanzar el limite y no bloquea", async ({ page }) => {
  // preset «A X puntos» → configurar 20 → dos rondas que lo alcancen →
  // banda visible → añadir OTRA ronda sigue funcionando → finalizar desde la banda
});
```

- [ ] **Step 2: Correr todo**

```bash
npm run test:e2e -- partidas-puntuacion.spec.ts partidas-mtg.spec.ts partidas-navegacion.spec.ts partidas-persistencia.spec.ts
npm run build
```
Expected: e2e todos verdes (los de mtg sin regresión), build compila.

- [ ] **Step 3: decisiones.md** — append (Bash heredoc, comprueba numeración tras la última entrada): título `## 2026-08-30 (N) — Puntuación por rondas: target informativo y presets que solo prefijan`, cuerpo con: el reducer nunca fuerza el fin (límite = finalizable, no terminado; semántica en ambas direcciones), presets como prefill puro (una herramienta, no modos), ronda entera = un evento (edición por `round_edited`, undo natural), y el resultado del gate (qué hubo que tocar del core: idealmente solo `ToolId`).

- [ ] **Step 4: backlog.md** — marca fase 4 (o añade línea si no existe) con puntero a la spec.

- [ ] **Step 5: Commit + push + PR-B**

```bash
git add e2e/partidas-puntuacion.spec.ts docs/requirements/decisiones.md docs/requirements/backlog.md
git commit -m "test(play): e2e de puntuacion por rondas y cierre documental de fase 4 (#931)"
git push
gh pr create --title "feat(play): puntuacion por rondas -- registro, presets, tablero y resumen (#931)" --body-file - <<'EOF'
[resumen real. Nota del gate: enumerar qué tocó del core (debe ser solo ToolId). Checklist use-cache: no aplica.]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

(Si PR-A ya se mergeó, PR-B va contra main con la rama actualizada; si sigue abierta, decidir al llegar: apilar rama nueva como en fase 3 — recordar la trampa del retarget: fusionar la apilada ANTES de borrar la base.)

---

## Self-Review (hecho al escribir el plan)

- **Cobertura de spec:** §2 → Tasks 1-3 (+ replay Task 4); §3 registro → Task 5; §4 UI → Task 5; §5 rutas/presets/tarjeta → Task 6; §6 i18n → Tasks 5-6; §7 tests → Tasks 2-4 y 7; §8 PRs → Tasks 4 y 7 (desviación del reparto documentada en Global Constraints y en la PR-A). Mesa recordada: contemplada en Task 6.2 con salida por issue.
- **Placeholders:** los esqueletos de e2e y del test de replay nombran el arrange exacto a copiar de specs existentes que el implementador debe leer; los componentes de Task 5-6 llevan requisitos de comportamiento numerados con los ficheros espejo. Sin TBD.
- **Consistencia de tipos:** `ScoreSetup/ScoreState/ScoreEvent` idénticos en Tasks 1-5; `initialScoreState/scoreReducer/totals/scoreRanking/limitReached/describeEvent` usados con las mismas firmas; `describeEvent` lleva anotada su única ambigüedad (número de ronda en pending) con criterio de resolución.
