# Randomizer / bolsa virtual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Herramienta de acompañamiento «Aleatorio» en BiblioPlay: dados, moneda, primer jugador, orden, equipos y bolsa virtual, con estado persistente local que convive con cualquier partida activa.

**Architecture:** Módulo `src/lib/play/random/` con el estilo de motor de Play (eventos + reducer puro + replay determinista; el azar se resuelve al despachar y el RESULTADO viaja en el payload), pero FUERA del registro de herramientas: store IDB propio `companion` (DB v4) porque el slot `active` es único por identidad y el randomizer se usa DURANTE otra partida. Sin Supabase, sin historial, sin participants.

**Tech Stack:** Next.js (App Router), React client components, IndexedDB (patrón CAS de `core/db.ts`), Vitest + fake-indexeddb, Playwright, next-intl.

**Spec:** `docs/superpowers/specs/2026-08-31-play-randomizer-design.md`

## Global Constraints

- Node 22 para tests: `fnm exec --using=22 npx vitest run <fichero>` (el shell trae Node 20 y vitest revienta).
- `git add` SIEMPRE con rutas explícitas — jamás `-A` ni `.` (hay ficheros ajenos sin trackear: `.impeccable/`, `.github/hooks/`).
- El reducer JAMÁS llama a `Math.random()` ni a `Date.now()` — azar y reloj entran por parámetros/payload.
- No introducir instancias nuevas de `react-hooks/set-state-in-effect` (deuda #856; el build no corre ESLint pero no se amplía la deuda).
- Comentarios de código en español, estilo del repo (explican el porqué, no el qué).
- `db.ts` es neutro: no importa NADA de `src/lib/play/random/` (el `base` del registro companion viaja como `unknown`).
- Textos de UI vía next-intl (`messages/es.json`), namespace `play.random.*`; ningún literal castellano en JSX.
- Validaciones de payload en el REDUCER (throw), no solo en la UI — el log es la fuente de verdad y el replay debe rechazar logs corruptos.
- Constantes de compactación: `COMPACT_THRESHOLD = 200`, `COMPACT_KEEP = 20`.
- Límites de dados: `count` 1–20, `sides` 2–1000, enteros.
- Equipos: mínimo 2, máximo n−1; reparto round-robin sobre permutación aleatoria.

---

### Task 1: Dominio — tipos, eventos y helpers de azar

**Files:**
- Create: `src/lib/play/random/types.ts`
- Create: `src/lib/play/random/events.ts`
- Create: `src/lib/play/random/draws.ts`
- Test: `src/lib/play/random/draws.test.ts`

**Interfaces:**
- Consumes: `PlayEvent` de `src/lib/play/core/types.ts`.
- Produces: `RandomState`, `BagItem` (types.ts); `RandomEvent` y sus 9 miembros + `RANDOM_EVENT_TYPES` (events.ts); `Rng`, `rollDice(count, sides, rng?)`, `flipCoin(rng?)`, `shuffle(items, rng?)`, `pickFirst(players, rng?)`, `drawTeams(players, teamCount, rng?)`, `drawFromBag(items, rng?)` (draws.ts). Tasks 2, 4, 5 consumen exactamente estos nombres.

- [ ] **Step 1: Escribir `types.ts`**

```ts
// Estado del acompañante Aleatorio (spec §3). Es deliberadamente pequeño: el
// feed de resultados NO vive aquí — se deriva del log de eventos.
export type BagItem = { name: string; count: number };

export type RandomState = {
  players: string[]; // lista compartida: primer jugador / orden / equipos
  bag: {
    items: BagItem[]; // count = RESTANTES (sin reemplazo descuenta)
    initial: BagItem[]; // foto para «Reiniciar bolsa»
    withReplacement: boolean;
  };
};
```

- [ ] **Step 2: Escribir `events.ts`**

```ts
import type { PlayEvent } from "@/lib/play/core/types";
import type { BagItem } from "./types";

// Eventos del acompañante (spec §3). El azar se resuelve al DESPACHAR y el
// resultado viaja en el payload: el reducer jamás tira dados — replay
// determinista y undo = pop del log, como en el resto de Play.
export type DiceRolledEvent = PlayEvent<
  "dice_rolled",
  { count: number; sides: number; results: number[] }
>;
export type CoinFlippedEvent = PlayEvent<"coin_flipped", { result: "heads" | "tails" }>;
export type FirstPickedEvent = PlayEvent<"first_picked", { players: string[]; picked: string }>;
export type OrderDrawnEvent = PlayEvent<"order_drawn", { players: string[]; order: string[] }>;
export type TeamsDrawnEvent = PlayEvent<"teams_drawn", { players: string[]; teams: string[][] }>;
export type PlayersSetEvent = PlayEvent<"players_set", { players: string[] }>;
// Configurar, editar y reiniciar la bolsa son el MISMO evento: la UI manda la
// foto completa y `initial` se actualiza a esa foto (spec §3).
export type BagSetEvent = PlayEvent<"bag_set", { items: BagItem[]; withReplacement: boolean }>;
export type BagDrawnEvent = PlayEvent<"bag_drawn", { name: string }>;
// Borrado total como evento (no truncado físico del log): así deshacer lo revierte.
export type ClearedEvent = PlayEvent<"cleared", Record<string, never>>;

export type RandomEvent =
  | DiceRolledEvent
  | CoinFlippedEvent
  | FirstPickedEvent
  | OrderDrawnEvent
  | TeamsDrawnEvent
  | PlayersSetEvent
  | BagSetEvent
  | BagDrawnEvent
  | ClearedEvent;

// Mismo patrón anti-olvido que SCORE_EVENT_TYPE_MAP (score/events.ts:25-31).
const RANDOM_EVENT_TYPE_MAP = {
  dice_rolled: true,
  coin_flipped: true,
  first_picked: true,
  order_drawn: true,
  teams_drawn: true,
  players_set: true,
  bag_set: true,
  bag_drawn: true,
  cleared: true,
} satisfies Record<RandomEvent["type"], true>;

export const RANDOM_EVENT_TYPES: ReadonlySet<RandomEvent["type"]> = new Set(
  Object.keys(RANDOM_EVENT_TYPE_MAP) as RandomEvent["type"][],
);
```

- [ ] **Step 3: Escribir los tests de `draws.ts` (fallando)**

`src/lib/play/random/draws.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { drawFromBag, drawTeams, flipCoin, pickFirst, rollDice, shuffle } from "./draws";
import type { BagItem } from "./types";

// RNG determinista para tests: devuelve la secuencia dada, cíclica.
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("rollDice", () => {
  it("mapea el rng al rango 1..caras", () => {
    expect(rollDice(3, 6, seq(0, 0.5, 0.999))).toEqual([1, 4, 6]);
  });
  it("rng en el borde alto no se sale del rango", () => {
    // 0.9999… * 6 = 5.999… → floor 5 → 6; nunca 7.
    expect(rollDice(1, 6, () => 0.9999999999)).toEqual([6]);
  });
  it("rechaza parámetros fuera de límites", () => {
    expect(() => rollDice(0, 6, seq(0))).toThrow();
    expect(() => rollDice(21, 6, seq(0))).toThrow();
    expect(() => rollDice(1, 1, seq(0))).toThrow();
    expect(() => rollDice(1, 1001, seq(0))).toThrow();
    expect(() => rollDice(1.5, 6, seq(0))).toThrow();
    expect(() => rollDice(1, 6.5, seq(0))).toThrow();
  });
});

describe("flipCoin", () => {
  it("mitad baja cara, mitad alta cruz", () => {
    expect(flipCoin(() => 0.2)).toBe("heads");
    expect(flipCoin(() => 0.7)).toBe("tails");
  });
});

describe("shuffle", () => {
  it("con rng constante 0 rota de forma conocida y conserva los elementos", () => {
    const result = shuffle(["a", "b", "c", "d"], () => 0);
    expect([...result].sort()).toEqual(["a", "b", "c", "d"]);
    expect(result).not.toBe(undefined);
  });
  it("no muta la entrada", () => {
    const input = ["a", "b", "c"];
    shuffle(input, () => 0);
    expect(input).toEqual(["a", "b", "c"]);
  });
});

describe("pickFirst", () => {
  it("elige por índice del rng", () => {
    expect(pickFirst(["ana", "beto", "carla"], () => 0.5)).toBe("beto");
  });
  it("exige al menos 2 jugadores", () => {
    expect(() => pickFirst(["ana"], () => 0)).toThrow();
  });
});

describe("drawTeams", () => {
  it("particiona a todos con tamaños que difieren como mucho en 1", () => {
    const teams = drawTeams(["a", "b", "c", "d", "e"], 2, seq(0));
    expect(teams).toHaveLength(2);
    const all = teams.flat().sort();
    expect(all).toEqual(["a", "b", "c", "d", "e"]);
    const sizes = teams.map((t) => t.length).sort();
    expect(sizes).toEqual([2, 3]);
  });
  it("rechaza menos de 2 o más de n-1 equipos", () => {
    expect(() => drawTeams(["a", "b", "c"], 1, seq(0))).toThrow();
    expect(() => drawTeams(["a", "b", "c"], 3, seq(0))).toThrow();
  });
});

describe("drawFromBag", () => {
  const items: BagItem[] = [
    { name: "Rojo", count: 2 },
    { name: "Azul", count: 1 },
  ];
  it("pondera por restantes: los 2 primeros tickets son Rojo, el tercero Azul", () => {
    expect(drawFromBag(items, () => 0)).toBe("Rojo");
    expect(drawFromBag(items, () => 0.5)).toBe("Rojo"); // ticket 1 de 3
    expect(drawFromBag(items, () => 0.9)).toBe("Azul"); // ticket 2 de 3
  });
  it("ignora tipos a 0 restantes", () => {
    expect(drawFromBag([{ name: "Rojo", count: 0 }, { name: "Azul", count: 1 }], () => 0)).toBe(
      "Azul",
    );
  });
  it("bolsa vacía lanza", () => {
    expect(() => drawFromBag([], () => 0)).toThrow();
    expect(() => drawFromBag([{ name: "Rojo", count: 0 }], () => 0)).toThrow();
  });
});
```

- [ ] **Step 4: Verificar que fallan**

Run: `fnm exec --using=22 npx vitest run src/lib/play/random/draws.test.ts`
Expected: FAIL — módulo `./draws` no existe.

- [ ] **Step 5: Escribir `draws.ts`**

```ts
import type { BagItem } from "./types";

// Helpers de azar PUROS (spec §2): el RNG entra inyectado (default Math.random)
// para que los tests sean deterministas. Quien despacha llama a estos helpers y
// mete el RESULTADO en el payload del evento — el reducer nunca los llama.
export type Rng = () => number;

export const DICE_MAX_COUNT = 20;
export const DICE_MAX_SIDES = 1000;

// Entero uniforme en 0..n-1. El min() protege del borde rng() → valores
// pegados a 1 por redondeo flotante.
function intBelow(n: number, rng: Rng): number {
  return Math.min(Math.floor(rng() * n), n - 1);
}

export function rollDice(count: number, sides: number, rng: Rng = Math.random): number[] {
  if (!Number.isInteger(count) || count < 1 || count > DICE_MAX_COUNT) {
    throw new RangeError(`count fuera de 1..${DICE_MAX_COUNT}`);
  }
  if (!Number.isInteger(sides) || sides < 2 || sides > DICE_MAX_SIDES) {
    throw new RangeError(`sides fuera de 2..${DICE_MAX_SIDES}`);
  }
  return Array.from({ length: count }, () => intBelow(sides, rng) + 1);
}

export function flipCoin(rng: Rng = Math.random): "heads" | "tails" {
  return rng() < 0.5 ? "heads" : "tails";
}

// Fisher-Yates sobre copia: la entrada no se muta.
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = intBelow(i + 1, rng);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickFirst(players: readonly string[], rng: Rng = Math.random): string {
  if (players.length < 2) throw new RangeError("hacen falta al menos 2 jugadores");
  return players[intBelow(players.length, rng)];
}

// Round-robin sobre una permutación: tamaños que difieren como mucho en 1 (spec §4).
export function drawTeams(
  players: readonly string[],
  teamCount: number,
  rng: Rng = Math.random,
): string[][] {
  if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > players.length - 1) {
    throw new RangeError("equipos fuera de 2..n-1");
  }
  const order = shuffle(players, rng);
  const teams: string[][] = Array.from({ length: teamCount }, () => []);
  order.forEach((name, i) => teams[i % teamCount].push(name));
  return teams;
}

// Extracción ponderada por restantes. Tipos a 0 no reciben tickets.
export function drawFromBag(items: readonly BagItem[], rng: Rng = Math.random): string {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (total <= 0) throw new RangeError("bolsa vacía");
  let ticket = intBelow(total, rng);
  for (const item of items) {
    if (ticket < item.count) return item.name;
    ticket -= item.count;
  }
  // Inalcanzable: ticket < total por construcción.
  return items[items.length - 1].name;
}
```

- [ ] **Step 6: Verificar que pasan**

Run: `fnm exec --using=22 npx vitest run src/lib/play/random/draws.test.ts`
Expected: PASS (todos).

- [ ] **Step 7: Typecheck y commit**

```bash
npx tsc --noEmit
git add src/lib/play/random/types.ts src/lib/play/random/events.ts src/lib/play/random/draws.ts src/lib/play/random/draws.test.ts
git commit -m "feat(play): dominio del randomizer -- tipos, eventos y helpers de azar con RNG inyectado"
```

---

### Task 2: Reducer, replay, compactación y describe

**Files:**
- Create: `src/lib/play/random/reducer.ts`
- Create: `src/lib/play/random/selectors.ts`
- Test: `src/lib/play/random/reducer.test.ts`

**Interfaces:**
- Consumes: `RandomState`, `BagItem` (Task 1 types.ts); `RandomEvent`, `RANDOM_EVENT_TYPES` (Task 1 events.ts); `PlayEvent`, `EventDescription` de `core/types.ts`; `makeEvent` de `core/events.ts` (tests).
- Produces: `initialRandomState(): RandomState`; `randomReducer(state: RandomState, event: RandomEvent): RandomState`; `replayRandom(base: RandomState | null, log: PlayEvent[]): RandomState` (lanza ante evento desconocido o payload inválido); `COMPACT_THRESHOLD` (200), `COMPACT_KEEP` (20); `compactIfNeeded(input: { base: RandomState | null; log: PlayEvent[] }): { base: RandomState | null; log: PlayEvent[] }` (reducer.ts). `describeRandomEvent(event: RandomEvent): EventDescription`; `RESULT_EVENT_TYPES: ReadonlySet<RandomEvent["type"]>` (selectors.ts). Tasks 4 y 5 consumen estos nombres.

- [ ] **Step 1: Escribir los tests (fallando)**

`src/lib/play/random/reducer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/play/core/events";
import type { PlayEvent } from "@/lib/play/core/types";
import {
  COMPACT_KEEP,
  COMPACT_THRESHOLD,
  compactIfNeeded,
  initialRandomState,
  randomReducer,
  replayRandom,
} from "./reducer";
import { describeRandomEvent, RESULT_EVENT_TYPES } from "./selectors";
import type { RandomEvent } from "./events";

const t0 = 1000;
const dice = (results: number[], sides = 6) =>
  makeEvent("dice_rolled", { count: results.length, sides, results }, t0) as RandomEvent;
const bagSet = (items: { name: string; count: number }[], withReplacement = false) =>
  makeEvent("bag_set", { items, withReplacement }, t0) as RandomEvent;
const bagDrawn = (name: string) => makeEvent("bag_drawn", { name }, t0) as RandomEvent;

describe("randomReducer — eventos de resultado", () => {
  it("dice_rolled coherente no cambia el estado", () => {
    const s = initialRandomState();
    expect(randomReducer(s, dice([4, 2, 6]))).toBe(s);
  });
  it("dice_rolled con results incoherentes lanza", () => {
    const s = initialRandomState();
    expect(() => randomReducer(s, dice([4, 2]) && ({ ...dice([4, 2]), payload: { count: 3, sides: 6, results: [4, 2] } } as RandomEvent))).toThrow();
    expect(() => randomReducer(s, { ...dice([7]), payload: { count: 1, sides: 6, results: [7] } } as RandomEvent)).toThrow();
    expect(() => randomReducer(s, { ...dice([0]), payload: { count: 1, sides: 6, results: [0] } } as RandomEvent)).toThrow();
  });
  it("first_picked exige picked dentro de players y al menos 2", () => {
    const s = initialRandomState();
    const ok = makeEvent("first_picked", { players: ["a", "b"], picked: "a" }, t0) as RandomEvent;
    expect(randomReducer(s, ok)).toBe(s);
    const fuera = makeEvent("first_picked", { players: ["a", "b"], picked: "z" }, t0) as RandomEvent;
    expect(() => randomReducer(s, fuera)).toThrow();
    const solo = makeEvent("first_picked", { players: ["a"], picked: "a" }, t0) as RandomEvent;
    expect(() => randomReducer(s, solo)).toThrow();
  });
  it("order_drawn debe ser permutación exacta de players", () => {
    const s = initialRandomState();
    const ok = makeEvent("order_drawn", { players: ["a", "b"], order: ["b", "a"] }, t0) as RandomEvent;
    expect(randomReducer(s, ok)).toBe(s);
    const mal = makeEvent("order_drawn", { players: ["a", "b"], order: ["b", "b"] }, t0) as RandomEvent;
    expect(() => randomReducer(s, mal)).toThrow();
  });
  it("teams_drawn debe ser partición exacta con 2..n-1 equipos", () => {
    const s = initialRandomState();
    const ok = makeEvent(
      "teams_drawn",
      { players: ["a", "b", "c"], teams: [["a", "c"], ["b"]] },
      t0,
    ) as RandomEvent;
    expect(randomReducer(s, ok)).toBe(s);
    const repite = makeEvent(
      "teams_drawn",
      { players: ["a", "b", "c"], teams: [["a", "a"], ["b"]] },
      t0,
    ) as RandomEvent;
    expect(() => randomReducer(s, repite)).toThrow();
    const unEquipo = makeEvent(
      "teams_drawn",
      { players: ["a", "b", "c"], teams: [["a", "b", "c"]] },
      t0,
    ) as RandomEvent;
    expect(() => randomReducer(s, unEquipo)).toThrow();
  });
});

describe("randomReducer — jugadores y bolsa", () => {
  it("players_set guarda nombres recortados y rechaza vacíos y duplicados", () => {
    const s = initialRandomState();
    const next = randomReducer(s, makeEvent("players_set", { players: ["Ana", "Beto"] }, t0) as RandomEvent);
    expect(next.players).toEqual(["Ana", "Beto"]);
    expect(() =>
      randomReducer(s, makeEvent("players_set", { players: ["Ana", ""] }, t0) as RandomEvent),
    ).toThrow();
    expect(() =>
      randomReducer(s, makeEvent("players_set", { players: ["Ana", "Ana"] }, t0) as RandomEvent),
    ).toThrow();
  });
  it("bag_set fija items e initial a la misma foto", () => {
    const s = randomReducer(initialRandomState(), bagSet([{ name: "Rojo", count: 2 }]));
    expect(s.bag.items).toEqual([{ name: "Rojo", count: 2 }]);
    expect(s.bag.initial).toEqual([{ name: "Rojo", count: 2 }]);
    expect(s.bag.withReplacement).toBe(false);
  });
  it("bag_set rechaza nombres vacíos, duplicados y counts no positivos", () => {
    const s = initialRandomState();
    expect(() => randomReducer(s, bagSet([{ name: "", count: 1 }]))).toThrow();
    expect(() =>
      randomReducer(s, bagSet([{ name: "Rojo", count: 1 }, { name: "Rojo", count: 2 }])),
    ).toThrow();
    expect(() => randomReducer(s, bagSet([{ name: "Rojo", count: 0 }]))).toThrow();
    expect(() => randomReducer(s, bagSet([{ name: "Rojo", count: 1.5 }]))).toThrow();
  });
  it("bag_drawn sin reemplazo descuenta; a 0 lanza", () => {
    let s = randomReducer(initialRandomState(), bagSet([{ name: "Rojo", count: 1 }]));
    s = randomReducer(s, bagDrawn("Rojo"));
    expect(s.bag.items).toEqual([{ name: "Rojo", count: 0 }]);
    expect(s.bag.initial).toEqual([{ name: "Rojo", count: 1 }]); // initial no se toca
    expect(() => randomReducer(s, bagDrawn("Rojo"))).toThrow();
    expect(() => randomReducer(s, bagDrawn("Verde"))).toThrow();
  });
  it("bag_drawn con reemplazo no descuenta", () => {
    let s = randomReducer(initialRandomState(), bagSet([{ name: "Rojo", count: 1 }], true));
    s = randomReducer(s, bagDrawn("Rojo"));
    expect(s.bag.items).toEqual([{ name: "Rojo", count: 1 }]);
  });
  it("reiniciar = bag_set con initial: restaura restantes", () => {
    let s = randomReducer(initialRandomState(), bagSet([{ name: "Rojo", count: 2 }]));
    s = randomReducer(s, bagDrawn("Rojo"));
    s = randomReducer(s, bagSet(s.bag.initial, s.bag.withReplacement));
    expect(s.bag.items).toEqual([{ name: "Rojo", count: 2 }]);
  });
  it("cleared vuelve al estado inicial", () => {
    let s = randomReducer(initialRandomState(), bagSet([{ name: "Rojo", count: 2 }]));
    s = randomReducer(s, makeEvent("players_set", { players: ["Ana", "Beto"] }, t0) as RandomEvent);
    s = randomReducer(s, makeEvent("cleared", {}, t0) as RandomEvent);
    expect(s).toEqual(initialRandomState());
  });
});

describe("replayRandom", () => {
  it("replay determinista de un log mixto", () => {
    const log: PlayEvent[] = [
      makeEvent("players_set", { players: ["Ana", "Beto"] }, t0),
      dice([4, 2, 6]),
      bagSet([{ name: "Rojo", count: 2 }]),
      bagDrawn("Rojo"),
    ];
    const s = replayRandom(null, log);
    expect(s.players).toEqual(["Ana", "Beto"]);
    expect(s.bag.items).toEqual([{ name: "Rojo", count: 1 }]);
  });
  it("evento desconocido en el log lanza (log corrupto se descarta, no se arrastra)", () => {
    const log: PlayEvent[] = [makeEvent("intruso", { x: 1 }, t0)];
    expect(() => replayRandom(null, log)).toThrow();
  });
  it("arranca desde base si la hay", () => {
    const base = replayRandom(null, [bagSet([{ name: "Azul", count: 3 }])]);
    const s = replayRandom(base, [bagDrawn("Azul")]);
    expect(s.bag.items).toEqual([{ name: "Azul", count: 2 }]);
  });
});

describe("compactIfNeeded", () => {
  it("bajo el umbral no toca nada", () => {
    const input = { base: null, log: [dice([1])] as PlayEvent[] };
    expect(compactIfNeeded(input)).toBe(input);
  });
  it("sobre el umbral re-basa y conserva la cola; el estado replayado es idéntico", () => {
    const log: PlayEvent[] = [bagSet([{ name: "Rojo", count: COMPACT_THRESHOLD + 10 }])];
    for (let i = 0; i < COMPACT_THRESHOLD; i++) log.push(bagDrawn("Rojo"));
    const before = replayRandom(null, log);
    const compacted = compactIfNeeded({ base: null, log });
    expect(compacted.log).toHaveLength(COMPACT_KEEP);
    expect(replayRandom(compacted.base, compacted.log)).toEqual(before);
  });
});

describe("describeRandomEvent", () => {
  it("etiqueta dados con expresión y total", () => {
    const d = describeRandomEvent(dice([4, 2, 6]) as RandomEvent);
    expect(d.key).toBe("dice");
    expect(d.params).toEqual({ expr: "3d6", rolls: "4 + 2 + 6", total: 12 });
  });
  it("un solo dado omite la suma redundante en rolls", () => {
    const d = describeRandomEvent(dice([5]) as RandomEvent);
    expect(d.params).toEqual({ expr: "1d6", rolls: "5", total: 5 });
  });
  it("etiqueta el resto de resultados", () => {
    expect(describeRandomEvent(makeEvent("coin_flipped", { result: "heads" as const }, t0) as RandomEvent).key).toBe("coinHeads");
    expect(describeRandomEvent(makeEvent("coin_flipped", { result: "tails" as const }, t0) as RandomEvent).key).toBe("coinTails");
    const first = describeRandomEvent(
      makeEvent("first_picked", { players: ["a", "b"], picked: "b" }, t0) as RandomEvent,
    );
    expect(first).toEqual({ key: "first", params: { picked: "b" } });
    const order = describeRandomEvent(
      makeEvent("order_drawn", { players: ["a", "b"], order: ["b", "a"] }, t0) as RandomEvent,
    );
    expect(order).toEqual({ key: "order", params: { order: "b, a" } });
    const teams = describeRandomEvent(
      makeEvent("teams_drawn", { players: ["a", "b", "c"], teams: [["a"], ["b", "c"]] }, t0) as RandomEvent,
    );
    expect(teams).toEqual({ key: "teams", params: { teams: "a — b, c" } });
    const drawn = describeRandomEvent(bagDrawn("Rojo") as RandomEvent);
    expect(drawn).toEqual({ key: "bagDrawn", params: { name: "Rojo" } });
  });
  it("RESULT_EVENT_TYPES contiene exactamente los 6 eventos de resultado", () => {
    expect([...RESULT_EVENT_TYPES].sort()).toEqual(
      ["bag_drawn", "coin_flipped", "dice_rolled", "first_picked", "order_drawn", "teams_drawn"].sort(),
    );
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `fnm exec --using=22 npx vitest run src/lib/play/random/reducer.test.ts`
Expected: FAIL — `./reducer` y `./selectors` no existen.

- [ ] **Step 3: Escribir `reducer.ts`**

```ts
import type { PlayEvent } from "@/lib/play/core/types";
import type { BagItem, RandomState } from "./types";
import { RANDOM_EVENT_TYPES, type RandomEvent } from "./events";

// Reducer PURO del acompañante (spec §3): valida el payload y lanza ante uno
// inválido — el log es la fuente de verdad y un replay no puede aceptar
// basura en silencio. Jamás llama a Math.random()/Date.now().

export function initialRandomState(): RandomState {
  return { players: [], bag: { items: [], initial: [], withReplacement: false } };
}

function assertDice(payload: { count: number; sides: number; results: number[] }): void {
  const { count, sides, results } = payload;
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error("count inválido");
  if (!Number.isInteger(sides) || sides < 2 || sides > 1000) throw new Error("sides inválido");
  if (results.length !== count) throw new Error("results no cuadra con count");
  for (const r of results) {
    if (!Number.isInteger(r) || r < 1 || r > sides) throw new Error("resultado fuera de rango");
  }
}

function assertSameMembers(a: readonly string[], b: readonly string[]): void {
  if (a.length !== b.length) throw new Error("no es permutación");
  const left = [...a].sort();
  const right = [...b].sort();
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) throw new Error("no es permutación");
  }
}

function assertNames(names: readonly string[]): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (name.trim() === "" || name !== name.trim()) throw new Error("nombre vacío o sin recortar");
    if (seen.has(name)) throw new Error("nombre duplicado");
    seen.add(name);
  }
}

function assertBagItems(items: readonly BagItem[]): void {
  assertNames(items.map((i) => i.name));
  for (const item of items) {
    if (!Number.isInteger(item.count) || item.count < 1) throw new Error("count de bolsa inválido");
  }
}

export function randomReducer(state: RandomState, event: RandomEvent): RandomState {
  switch (event.type) {
    // Eventos de RESULTADO: no cambian el estado, pero se validan igual —
    // viven en el log y el feed los renderiza.
    case "dice_rolled":
      assertDice(event.payload);
      return state;
    case "coin_flipped":
      return state;
    case "first_picked": {
      const { players, picked } = event.payload;
      if (players.length < 2) throw new Error("hacen falta 2 jugadores");
      if (!players.includes(picked)) throw new Error("picked no está en players");
      return state;
    }
    case "order_drawn": {
      const { players, order } = event.payload;
      if (players.length < 2) throw new Error("hacen falta 2 jugadores");
      assertSameMembers(players, order);
      return state;
    }
    case "teams_drawn": {
      const { players, teams } = event.payload;
      if (teams.length < 2 || teams.length > players.length - 1) {
        throw new Error("equipos fuera de 2..n-1");
      }
      assertSameMembers(players, teams.flat());
      return state;
    }
    case "players_set":
      assertNames(event.payload.players);
      return { ...state, players: [...event.payload.players] };
    case "bag_set": {
      assertBagItems(event.payload.items);
      const items = event.payload.items.map((i) => ({ ...i }));
      return {
        ...state,
        bag: {
          items,
          initial: event.payload.items.map((i) => ({ ...i })),
          withReplacement: event.payload.withReplacement,
        },
      };
    }
    case "bag_drawn": {
      const { name } = event.payload;
      const item = state.bag.items.find((i) => i.name === name);
      if (!item || item.count < 1) throw new Error("tipo agotado o inexistente");
      if (state.bag.withReplacement) return state;
      return {
        ...state,
        bag: {
          ...state.bag,
          items: state.bag.items.map((i) => (i.name === name ? { ...i, count: i.count - 1 } : i)),
        },
      };
    }
    case "cleared":
      return initialRandomState();
  }
}

function isRandomEvent(event: PlayEvent): event is RandomEvent {
  return (RANDOM_EVENT_TYPES as ReadonlySet<string>).has(event.type);
}

// Replay desde base (o inicial). Lanza ante evento desconocido o payload
// inválido: quien carga descarta el registro corrupto y arranca de cero.
export function replayRandom(base: RandomState | null, log: PlayEvent[]): RandomState {
  return log.reduce((state, event) => {
    if (!isRandomEvent(event)) throw new Error(`evento desconocido: ${event.type}`);
    return randomReducer(state, event);
  }, base ?? initialRandomState());
}

// Compactación (spec §5): el log no crece sin límite. Al pasar el umbral se
// re-basa el estado y se conserva solo la cola — el feed enseña 20 y deshacer
// más allá no tiene caso de uso.
export const COMPACT_THRESHOLD = 200;
export const COMPACT_KEEP = 20;

export function compactIfNeeded(input: { base: RandomState | null; log: PlayEvent[] }): {
  base: RandomState | null;
  log: PlayEvent[];
} {
  if (input.log.length <= COMPACT_THRESHOLD) return input;
  const cut = input.log.length - COMPACT_KEEP;
  return {
    base: replayRandom(input.base, input.log.slice(0, cut)),
    log: input.log.slice(cut),
  };
}
```

- [ ] **Step 4: Escribir `selectors.ts`**

```ts
import type { EventDescription } from "@/lib/play/core/types";
import type { RandomEvent } from "./events";

// Eventos que el feed enseña: los de RESULTADO. Configuración (players_set,
// bag_set) y cleared no son «resultados» — se deshacen igual, pero no se listan.
export const RESULT_EVENT_TYPES: ReadonlySet<RandomEvent["type"]> = new Set([
  "dice_rolled",
  "coin_flipped",
  "first_picked",
  "order_drawn",
  "teams_drawn",
  "bag_drawn",
] as RandomEvent["type"][]);

// {key, params} contra el namespace play.random.log.* — mismo contrato que los
// describe() de mtg/score.
export function describeRandomEvent(event: RandomEvent): EventDescription {
  switch (event.type) {
    case "dice_rolled": {
      const { count, sides, results } = event.payload;
      return {
        key: "dice",
        params: {
          expr: `${count}d${sides}`,
          rolls: results.join(" + "),
          total: results.reduce((a, b) => a + b, 0),
        },
      };
    }
    case "coin_flipped":
      return { key: event.payload.result === "heads" ? "coinHeads" : "coinTails", params: {} };
    case "first_picked":
      return { key: "first", params: { picked: event.payload.picked } };
    case "order_drawn":
      return { key: "order", params: { order: event.payload.order.join(", ") } };
    case "teams_drawn":
      return {
        key: "teams",
        params: { teams: event.payload.teams.map((t) => t.join(", ")).join(" — ") },
      };
    case "players_set":
      return { key: "playersSet", params: { count: event.payload.players.length } };
    case "bag_set":
      return { key: "bagSet", params: {} };
    case "bag_drawn":
      return { key: "bagDrawn", params: { name: event.payload.name } };
    case "cleared":
      return { key: "cleared", params: {} };
  }
}
```

- [ ] **Step 5: Verificar que pasan**

Run: `fnm exec --using=22 npx vitest run src/lib/play/random/reducer.test.ts`
Expected: PASS. Ojo al test «un solo dado»: espera `rolls: "5"` — `[5].join(" + ")` ya da eso.

- [ ] **Step 6: Suite entera + typecheck + commit**

```bash
fnm exec --using=22 npx vitest run
npx tsc --noEmit
git add src/lib/play/random/reducer.ts src/lib/play/random/selectors.ts src/lib/play/random/reducer.test.ts
git commit -m "feat(play): reducer del randomizer con validaciones, replay desde base y compactacion"
```

---

### Task 3: Persistencia — store `companion` en IDB v4

**Files:**
- Modify: `src/lib/play/core/db.ts` (DB_VERSION, upgrade, tipos y CRUD nuevos)
- Test: `src/lib/play/core/db.test.ts` (añadir bloque `describe` al final)

**Interfaces:**
- Consumes: infraestructura existente de `db.ts` (`openDb` interno, patrón CAS de `writeActive`).
- Produces: `CompanionRecord = { identity: string; v: 1; base: unknown; log: PlayEvent[]; rev: number }` (`base` viaja como `unknown` — db.ts es neutro y no importa de `random/`); `CompanionWriteResult`; `readCompanion(identity): Promise<CompanionRecord | null>`; `writeCompanion(record): Promise<CompanionWriteResult>`; `deleteCompanion(identity): Promise<void>`. Task 4 consume estos nombres.

- [ ] **Step 1: Escribir los tests (fallando)**

Añadir al final de `src/lib/play/core/db.test.ts` (los imports nuevos —`readCompanion`, `writeCompanion`, `deleteCompanion`, `type CompanionRecord`— se suman al import existente de `./db`):

```ts
describe("companion (DB v4)", () => {
  function companion(rev: number): CompanionRecord {
    return {
      identity: "anon",
      v: 1,
      base: null,
      log: [{ id: "e1", type: "dice_rolled", at: 1000, payload: { count: 1, sides: 6, results: [4] } }],
      rev,
    };
  }

  it("write + read redondo", async () => {
    expect(await writeCompanion(companion(1))).toEqual({ ok: true });
    expect(await readCompanion("anon")).toEqual(companion(1));
  });

  it("aísla por identidad", async () => {
    await writeCompanion(companion(1));
    expect(await readCompanion("uid-x")).toBeNull();
  });

  it("CAS: rev igual o menor no pisa y devuelve el vigente", async () => {
    await writeCompanion(companion(2));
    const result = await writeCompanion(companion(2));
    expect(result).toEqual({ ok: false, reason: "conflict", current: companion(2) });
    expect(await writeCompanion(companion(3))).toEqual({ ok: true });
  });

  it("delete borra y read devuelve null", async () => {
    await writeCompanion(companion(1));
    await deleteCompanion("anon");
    expect(await readCompanion("anon")).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `fnm exec --using=22 npx vitest run src/lib/play/core/db.test.ts`
Expected: FAIL — `readCompanion` no exportado.

- [ ] **Step 3: Implementar en `db.ts`**

Cambiar `export const DB_VERSION = 3;` por `export const DB_VERSION = 4;`.

Añadir tras `PlayerRecord` (db.ts:46):

```ts
// CompanionRecord llega con el randomizer (spec randomizer §5): el almacén
// `companion` guarda el estado del acompañante «Aleatorio» FUERA del slot
// `active` — una partida activa y el randomizer conviven. `base` es el estado
// re-basado por la compactación; viaja como `unknown` porque db.ts es neutro
// y no importa tipos de `random/` (quien lee valida por replay).
export type CompanionRecord = {
  identity: string; // uid real o "anon", mismo aislamiento que `active`
  v: 1;
  base: unknown; // RandomState serializado o null
  log: PlayEvent[];
  rev: number; // CAS, como ActiveGameRecord
};

export type CompanionWriteResult =
  | { ok: true }
  | { ok: false; reason: "conflict"; current: CompanionRecord }
  | { ok: false; reason: "unavailable" };
```

En `onupgradeneeded`, junto a los `contains` existentes (db.ts:66-76):

```ts
if (!db.objectStoreNames.contains("companion")) {
  db.createObjectStore("companion", { keyPath: "identity" });
}
```

Añadir tras `deleteActive` (db.ts:202), calcando las formas de `readActive`/`writeActive`/`deleteActive`:

```ts
export async function readCompanion(identity: string): Promise<CompanionRecord | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("companion", "readonly")
        .objectStore("companion")
        .get(identity);
      request.onsuccess = () =>
        resolve((request.result as CompanionRecord | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

// Mismo CAS que writeActive (db.ts:165): el rev en BD igual o mayor gana y se
// devuelve para que quien escribe lo adopte.
export async function writeCompanion(record: CompanionRecord): Promise<CompanionWriteResult> {
  try {
    const db = await openDb();
    return await new Promise<CompanionWriteResult>((resolve) => {
      const tx = db.transaction("companion", "readwrite");
      const store = tx.objectStore("companion");
      const get = store.get(record.identity);
      get.onsuccess = () => {
        const current = (get.result as CompanionRecord | undefined) ?? null;
        if (current && current.rev >= record.rev) {
          resolve({ ok: false, reason: "conflict", current });
          return;
        }
        store.put(record);
      };
      tx.oncomplete = () => resolve({ ok: true });
      tx.onerror = () => resolve({ ok: false, reason: "unavailable" });
      tx.onabort = () => resolve({ ok: false, reason: "unavailable" });
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function deleteCompanion(identity: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction("companion", "readwrite");
      tx.objectStore("companion").delete(identity);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // sin BD no hay nada que borrar
  }
}
```

Nota v3→v4: NO hay migración de datos — el store nuevo nace vacío; los `contains` existentes hacen el upgrade idempotente para BDs frescas y viejas.

- [ ] **Step 4: Verificar que pasan (fichero y suite entera — el bump de versión toca a todos los tests de db)**

```bash
fnm exec --using=22 npx vitest run src/lib/play/core/db.test.ts
fnm exec --using=22 npx vitest run
```
Expected: PASS todo.

- [ ] **Step 5: Typecheck y commit**

```bash
npx tsc --noEmit
git add src/lib/play/core/db.ts src/lib/play/core/db.test.ts
git commit -m "feat(play): store companion en IDB v4 con CAS -- el randomizer no pisa la partida activa"
```

---

### Task 4: Hook `useCompanion` + página + secciones Dados/Moneda + feed + deshacer

**Files:**
- Create: `src/lib/play/random/use-companion.ts`
- Create: `src/components/play/random/random-screen.tsx`
- Create: `src/components/play/random/dice-section.tsx`
- Create: `src/components/play/random/coin-section.tsx`
- Create: `src/components/play/random/result-feed.tsx`
- Create: `src/app/partidas/aleatorio/page.tsx`
- Modify: `messages/es.json` (namespace `play.random`, parcial — esta task añade lo suyo)

**Interfaces:**
- Consumes: Task 2 (`initialRandomState`, `replayRandom`, `randomReducer`, `compactIfNeeded`, `describeRandomEvent`, `RESULT_EVENT_TYPES`); Task 3 (`readCompanion`, `writeCompanion`, `deleteCompanion`, `CompanionRecord`); Task 1 (`rollDice`, `flipCoin`, `RandomEvent`); `makeEvent`; `PlayFrame`, `getCurrentUser`.
- Produces: `useCompanion(identity: string): { state: RandomState; feed: RandomEvent[]; emit<T extends RandomEvent["type"]>(type: T, payload: Extract<RandomEvent, { type: T }>["payload"]): boolean; undo(): void; canUndo: boolean; clear(): void; loaded: boolean }` — `feed` = eventos de RESULTADO, más reciente PRIMERO, máx 20. `RandomScreen({ identity })` con pestañas `dice | coin | players | bag` (players y bag llegan en Task 5 — esta task deja las pestañas declaradas y renderiza un `<div>` vacío para ellas). Task 5 consume `useCompanion` y añade sus secciones a `random-screen.tsx`.

- [ ] **Step 1: Escribir `use-companion.ts`**

```ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { makeEvent } from "@/lib/play/core/events";
import type { PlayEvent } from "@/lib/play/core/types";
import {
  deleteCompanion,
  readCompanion,
  writeCompanion,
  type CompanionRecord,
} from "@/lib/play/core/db";
import type { RandomState } from "./types";
import type { RandomEvent } from "./events";
import { compactIfNeeded, initialRandomState, randomReducer, replayRandom } from "./reducer";
import { RESULT_EVENT_TYPES } from "./selectors";

type Snapshot = { base: RandomState | null; log: PlayEvent[]; rev: number };

const FEED_MAX = 20;

/**
 * Estado del acompañante «Aleatorio» (spec §5): carga de IDB con replay
 * validado (registro corrupto se descarta, no se arrastra), dispatch con
 * validación del reducer, compactación al pasar el umbral y persistencia CAS.
 * Si IDB no está (privado, cuota), se sigue en memoria — mismo criterio que
 * el resto de Play. En conflicto CAS (otra pestaña), se ADOPTA el registro
 * vigente: sin sync de fondo, el último que escribe manda.
 */
export function useCompanion(identity: string): {
  state: RandomState;
  feed: RandomEvent[];
  emit: <T extends RandomEvent["type"]>(
    type: T,
    payload: Extract<RandomEvent, { type: T }>["payload"],
  ) => boolean;
  undo: () => void;
  canUndo: boolean;
  clear: () => void;
  loaded: boolean;
} {
  const [snapshot, setSnapshot] = useState<Snapshot>({ base: null, log: [], rev: 0 });
  const [loaded, setLoaded] = useState(false);
  // Rev vivo para la cadena de escrituras: los setState son asíncronos y dos
  // emits seguidos no pueden partir del mismo rev.
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const record = await readCompanion(identity);
      if (cancelled) return;
      if (record) {
        try {
          // Validación por replay: si el registro no re-juega, está roto
          // también para la UI — se borra y se arranca de cero.
          replayRandom((record.base as RandomState | null) ?? null, record.log);
          setSnapshot({
            base: (record.base as RandomState | null) ?? null,
            log: record.log,
            rev: record.rev,
          });
        } catch {
          await deleteCompanion(identity);
        }
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [identity]);

  const state = useMemo(
    () => replayRandom(snapshot.base, snapshot.log),
    [snapshot.base, snapshot.log],
  );

  const persist = useCallback(
    async (next: Snapshot) => {
      const record: CompanionRecord = {
        identity,
        v: 1,
        base: next.base,
        log: next.log,
        rev: next.rev,
      };
      const result = await writeCompanion(record);
      if (!result.ok && result.reason === "conflict") {
        // Otra pestaña escribió antes: se adopta su registro si re-juega.
        try {
          replayRandom((result.current.base as RandomState | null) ?? null, result.current.log);
          setSnapshot({
            base: (result.current.base as RandomState | null) ?? null,
            log: result.current.log,
            rev: result.current.rev,
          });
        } catch {
          // vigente corrupto: nos quedamos con lo nuestro en memoria
        }
      }
      // "unavailable": memoria y a seguir — sin IDB no hay nada mejor que hacer.
    },
    [identity],
  );

  const commit = useCallback(
    (log: PlayEvent[]) => {
      const current = snapRef.current;
      const compacted = compactIfNeeded({ base: current.base, log });
      const next: Snapshot = { ...compacted, rev: current.rev + 1 };
      setSnapshot(next);
      void persist(next);
    },
    [persist],
  );

  const emit = useCallback(
    <T extends RandomEvent["type"]>(
      type: T,
      payload: Extract<RandomEvent, { type: T }>["payload"],
    ): boolean => {
      const current = snapRef.current;
      const event = makeEvent(type, payload, Date.now()) as RandomEvent;
      try {
        // Validación ANTES de comprometer: el reducer lanza ante payload inválido.
        randomReducer(replayRandom(current.base, current.log), event);
      } catch {
        return false;
      }
      commit([...current.log, event]);
      return true;
    },
    [commit],
  );

  const undo = useCallback(() => {
    const current = snapRef.current;
    if (current.log.length === 0) return;
    commit(current.log.slice(0, -1));
  }, [commit]);

  const clear = useCallback(() => {
    emit("cleared", {});
  }, [emit]);

  const feed = useMemo(
    () =>
      [...snapshot.log]
        .reverse()
        .filter((e): e is RandomEvent => (RESULT_EVENT_TYPES as ReadonlySet<string>).has(e.type))
        .slice(0, FEED_MAX),
    [snapshot.log],
  );

  return { state, feed, emit, undo, canUndo: snapshot.log.length > 0, clear, loaded };
}
```

- [ ] **Step 2: Escribir `result-feed.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { RandomEvent } from "@/lib/play/random/events";
import { describeRandomEvent } from "@/lib/play/random/selectors";

/**
 * Feed de últimos resultados + deshacer + limpiar todo. El deshacer revierte
 * el ÚLTIMO evento del log, sea de la sección que sea (spec §4) — por eso vive
 * aquí y no dentro de una sección. Limpiar pide confirmación en dos toques
 * (sin modal: patrón inline del resto de Play).
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

  return (
    <section className="mt-6" aria-label={t("feed.title")}>
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("feed.title")}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="rounded-chip border border-border px-3 py-1 text-[12px] disabled:opacity-40"
          >
            {t("feed.undo")}
          </button>
          {confirming ? (
            <button
              type="button"
              onClick={() => {
                onClear();
                setConfirming(false);
              }}
              className="rounded-chip border border-danger px-3 py-1 text-[12px] text-danger"
            >
              {t("feed.clearConfirm")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!canUndo}
              className="rounded-chip border border-border px-3 py-1 text-[12px] disabled:opacity-40"
            >
              {t("feed.clear")}
            </button>
          )}
        </div>
      </div>
      {feed.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted-foreground">{t("feed.empty")}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {feed.map((event) => {
            const { key, params } = describeRandomEvent(event);
            return (
              <li key={event.id} className="text-[13px]">
                {t(`log.${key}`, params)}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

Nota para el implementador: si el token `border-danger`/`text-danger` no existe en el tema, usar el que use el borrado de `players-manager.tsx` (mirar ese fichero y copiar su clase).

- [ ] **Step 3: Escribir `dice-section.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DICE_MAX_COUNT, DICE_MAX_SIDES, rollDice } from "@/lib/play/random/draws";
import type { RandomEvent } from "@/lib/play/random/events";
import { describeRandomEvent } from "@/lib/play/random/selectors";

const QUICK_DICE = [4, 6, 8, 10, 12, 20];

/**
 * Dados: botones rápidos d4–d20 (un toque = 1dX) y tirada libre NdX. El azar
 * se resuelve AQUÍ (rollDice) y el resultado viaja en el payload (spec §2).
 * Inputs numéricos con placeholder visual y select-on-focus, como los del score.
 */
export function DiceSection({
  lastRoll,
  onEmit,
}: {
  lastRoll: RandomEvent | undefined;
  onEmit: (payload: { count: number; sides: number; results: number[] }) => void;
}) {
  const t = useTranslations("play.random.dice");
  const [count, setCount] = useState("");
  const [sides, setSides] = useState("");

  function roll(countValue: number, sidesValue: number) {
    const results = rollDice(countValue, sidesValue);
    onEmit({ count: countValue, sides: sidesValue, results });
  }

  const parsedCount = Number(count || "1");
  const parsedSides = Number(sides || "6");
  const customValid =
    Number.isInteger(parsedCount) &&
    parsedCount >= 1 &&
    parsedCount <= DICE_MAX_COUNT &&
    Number.isInteger(parsedSides) &&
    parsedSides >= 2 &&
    parsedSides <= DICE_MAX_SIDES;

  const last = lastRoll && lastRoll.type === "dice_rolled" ? describeRandomEvent(lastRoll) : null;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {QUICK_DICE.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => roll(1, d)}
            className="rounded-chip border border-border px-4 py-2 text-[14px] font-semibold"
          >
            d{d}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-end gap-2">
        <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
          {t("countLabel")}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={DICE_MAX_COUNT}
            value={count}
            placeholder="1"
            onChange={(e) => setCount(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px] text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
          {t("sidesLabel")}
          <input
            type="number"
            inputMode="numeric"
            min={2}
            max={DICE_MAX_SIDES}
            value={sides}
            placeholder="6"
            onChange={(e) => setSides(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px] text-foreground"
          />
        </label>
        <button
          type="button"
          disabled={!customValid}
          onClick={() => roll(parsedCount, parsedSides)}
          className="rounded-chip border border-border px-4 py-2 text-[14px] font-semibold disabled:opacity-40"
        >
          {t("roll")}
        </button>
      </div>
      {last ? (
        <p className="mt-4 font-serif text-[22px] font-semibold" data-testid="dice-result">
          {t("result", last.params)}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Escribir `coin-section.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { flipCoin } from "@/lib/play/random/draws";
import type { RandomEvent } from "@/lib/play/random/events";

export function CoinSection({
  lastFlip,
  onEmit,
}: {
  lastFlip: RandomEvent | undefined;
  onEmit: (payload: { result: "heads" | "tails" }) => void;
}) {
  const t = useTranslations("play.random.coin");
  const result = lastFlip && lastFlip.type === "coin_flipped" ? lastFlip.payload.result : null;

  return (
    <div>
      <button
        type="button"
        onClick={() => onEmit({ result: flipCoin() })}
        className="rounded-chip border border-border px-4 py-2 text-[14px] font-semibold"
      >
        {t("flip")}
      </button>
      {result ? (
        <p className="mt-4 font-serif text-[22px] font-semibold" data-testid="coin-result">
          {t(result)}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Escribir `random-screen.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useCompanion } from "@/lib/play/random/use-companion";
import { DiceSection } from "./dice-section";
import { CoinSection } from "./coin-section";
import { ResultFeed } from "./result-feed";

type Tab = "dice" | "coin" | "players" | "bag";
const TABS: Tab[] = ["dice", "coin", "players", "bag"];

/**
 * Pantalla del acompañante «Aleatorio» (spec §4): pestañas-chip, sin setup —
 * entras y usas. Anónimo funciona entero. El feed y deshacer son globales
 * (revierte el último evento, sea de la pestaña que sea).
 */
export function RandomScreen({ identity }: { identity: string }) {
  const t = useTranslations("play.random");
  const companion = useCompanion(identity);
  const [tab, setTab] = useState<Tab>("dice");

  if (!companion.loaded) return null;

  const lastOf = (type: string) => companion.feed.find((e) => e.type === type);

  return (
    <div>
      <h1 className="font-serif text-[26px] font-semibold">{t("title")}</h1>
      <p className="mt-1 text-[14px] text-muted-foreground">{t("subtitle")}</p>

      <div role="tablist" aria-label={t("title")} className="mt-4 flex flex-wrap gap-2">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-chip border px-3 py-1.5 text-[13px] ${
              tab === id ? "border-foreground bg-surface-muted font-semibold" : "border-border"
            }`}
          >
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "dice" ? (
          <DiceSection
            lastRoll={lastOf("dice_rolled")}
            onEmit={(payload) => companion.emit("dice_rolled", payload)}
          />
        ) : null}
        {tab === "coin" ? (
          <CoinSection
            lastFlip={lastOf("coin_flipped")}
            onEmit={(payload) => companion.emit("coin_flipped", payload)}
          />
        ) : null}
        {/* players y bag llegan en la siguiente task */}
        {tab === "players" ? <div /> : null}
        {tab === "bag" ? <div /> : null}
      </div>

      <ResultFeed
        feed={companion.feed}
        canUndo={companion.canUndo}
        onUndo={companion.undo}
        onClear={companion.clear}
      />
    </div>
  );
}
```

- [ ] **Step 6: Escribir la página `src/app/partidas/aleatorio/page.tsx`**

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { PlayFrame } from "@/components/play/play-frame";
import { RandomScreen } from "@/components/play/random/random-screen";

export const metadata: Metadata = { title: "Aleatorio — Biblioshare" };

// Mismo boundary de petición que el hub (#435): la identidad depende de la
// sesión y no se puede leer durante el prerender. Anónimo funciona entero —
// la identidad solo aísla la clave de IDB, como en el resto de Play.
async function Screen() {
  await connection();
  const identity = (await getCurrentUser())?.id ?? "anon";
  return <RandomScreen identity={identity} />;
}

export default function RandomPage() {
  return (
    <PlayFrame>
      <Suspense fallback={null}>
        <Screen />
      </Suspense>
    </PlayFrame>
  );
}
```

Antes de dar por bueno el JSX: mirar `src/app/partidas/puntuacion/page.tsx` y calcar el patrón exacto de `PlayFrame` (props, back link si lo hay).

- [ ] **Step 7: i18n — añadir a `messages/es.json` dentro del objeto `play` (respetando el orden alfabético o el criterio del fichero — mirar cómo están ordenadas las claves hermanas)**

```json
"random": {
  "title": "Aleatorio",
  "subtitle": "Dados, moneda, sorteos y bolsa para cualquier juego.",
  "tabs": {
    "dice": "Dados",
    "coin": "Moneda",
    "players": "Jugadores",
    "bag": "Bolsa"
  },
  "dice": {
    "countLabel": "Cuántos",
    "sidesLabel": "Caras",
    "roll": "Tirar",
    "result": "{rolls} = {total}"
  },
  "coin": {
    "flip": "Lanzar moneda",
    "heads": "Cara",
    "tails": "Cruz"
  },
  "feed": {
    "title": "Últimos resultados",
    "empty": "Aún no hay resultados.",
    "undo": "Deshacer",
    "clear": "Limpiar todo",
    "clearConfirm": "¿Seguro? Borra todo"
  },
  "log": {
    "dice": "{expr}: {rolls} = {total}",
    "coinHeads": "Moneda: cara",
    "coinTails": "Moneda: cruz",
    "first": "Empieza {picked}",
    "order": "Orden: {order}",
    "teams": "Equipos: {teams}",
    "playersSet": "Jugadores actualizados ({count})",
    "bagSet": "Bolsa configurada",
    "bagDrawn": "Ficha: {name}"
  }
}
```

(`log.playersSet` y `log.bagSet` no salen en el feed — RESULT_EVENT_TYPES los filtra — pero `describeRandomEvent` los cubre y la clave existe por si un futuro los enseña.)

- [ ] **Step 8: Verificar**

```bash
npx tsc --noEmit
fnm exec --using=22 npx vitest run
npm run build
```
Expected: todo limpio. Arrancar `next dev` (puerto 3000, matar zombis antes si lo ocupan) y comprobar a mano: `/partidas/aleatorio` carga, d6 tira y sale en feed, moneda funciona, deshacer quita el último, recarga conserva.

- [ ] **Step 9: Commit**

```bash
git add src/lib/play/random/use-companion.ts src/components/play/random/random-screen.tsx src/components/play/random/dice-section.tsx src/components/play/random/coin-section.tsx src/components/play/random/result-feed.tsx src/app/partidas/aleatorio/page.tsx messages/es.json
git commit -m "feat(play): pantalla Aleatorio con dados, moneda, feed y deshacer sobre store companion"
```

---

### Task 5: Secciones Jugadores y Bolsa

**Files:**
- Create: `src/components/play/random/players-section.tsx`
- Create: `src/components/play/random/bag-section.tsx`
- Modify: `src/components/play/random/random-screen.tsx` (sustituir los `<div />` placeholder)
- Modify: `messages/es.json` (añadir `play.random.players` y `play.random.bag`)

**Interfaces:**
- Consumes: `useCompanion` (Task 4 — `state`, `emit`, `feed`); `pickFirst`, `shuffle`, `drawTeams`, `drawFromBag` (Task 1); `usePlayers(identity)` de `src/lib/play/core/use-players.ts` (devuelve `{ players: PlayerRecord[], reload, loaded }`; con `identity === "anon"` devuelve `[]` sin tocar red); `describeRandomEvent`.
- Produces: `PlayersSection`, `BagSection` — componentes cableados en `random-screen.tsx`.

- [ ] **Step 1: Escribir `players-section.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePlayers } from "@/lib/play/core/use-players";
import { drawTeams, pickFirst, shuffle } from "@/lib/play/random/draws";
import type { RandomEvent } from "@/lib/play/random/events";
import { describeRandomEvent } from "@/lib/play/random/selectors";

/**
 * Lista compartida de jugadores + tres sorteos (spec §4). Los chips de
 * habituales solo salen con sesión (usePlayers con "anon" devuelve []); el
 * texto libre funciona siempre. Cada cambio de lista emite players_set con la
 * foto completa; cada sorteo resuelve el azar AQUÍ y emite el resultado.
 */
export function PlayersSection({
  identity,
  players,
  lastResult,
  onSetPlayers,
  onEmit,
}: {
  identity: string;
  players: string[];
  lastResult: RandomEvent | undefined;
  onSetPlayers: (players: string[]) => void;
  onEmit: (event: RandomEvent["type"] extends never ? never : { type: "first_picked" | "order_drawn" | "teams_drawn"; payload: unknown }) => void;
}) {
  const t = useTranslations("play.random.players");
  const { players: regulars } = usePlayers(identity);
  const [name, setName] = useState("");
  const [teamCount, setTeamCount] = useState("");

  function add(candidate: string) {
    const trimmed = candidate.trim();
    if (trimmed === "" || players.includes(trimmed)) return;
    onSetPlayers([...players, trimmed]);
    setName("");
  }

  const chips = regulars.filter((r) => !players.includes(r.name)).slice(0, 6);
  const parsedTeams = Number(teamCount || "2");
  const teamsValid =
    Number.isInteger(parsedTeams) && parsedTeams >= 2 && parsedTeams <= players.length - 1;
  const canDraw = players.length >= 2;

  const last =
    lastResult &&
    (lastResult.type === "first_picked" ||
      lastResult.type === "order_drawn" ||
      lastResult.type === "teams_drawn")
      ? describeRandomEvent(lastResult)
      : null;

  return (
    <div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label={t("regulars")}>
          {chips.map((r) => (
            <button
              key={r.playerId}
              type="button"
              onClick={() => add(r.name)}
              className="rounded-chip border border-border px-3 py-1 text-[13px]"
            >
              {r.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex gap-2">
        <input
          value={name}
          placeholder={t("namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add(name);
          }}
          aria-label={t("nameLabel")}
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
        <button
          type="button"
          onClick={() => add(name)}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px]"
        >
          {t("add")}
        </button>
      </div>

      {players.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {players.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => onSetPlayers(players.filter((x) => x !== p))}
                aria-label={t("remove", { name: p })}
                className="rounded-chip border border-border px-3 py-1 text-[13px]"
              >
                {p} ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">{t("hint")}</p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <button
          type="button"
          disabled={!canDraw}
          onClick={() =>
            onEmit({ type: "first_picked", payload: { players, picked: pickFirst(players) } })
          }
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
        >
          {t("first")}
        </button>
        <button
          type="button"
          disabled={!canDraw}
          onClick={() =>
            onEmit({ type: "order_drawn", payload: { players, order: shuffle(players) } })
          }
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
        >
          {t("order")}
        </button>
        <label className="flex items-end gap-2">
          <span className="sr-only">{t("teamCount")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={2}
            value={teamCount}
            placeholder="2"
            onChange={(e) => setTeamCount(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={t("teamCount")}
            className="w-16 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
          <button
            type="button"
            disabled={!canDraw || !teamsValid}
            onClick={() =>
              onEmit({
                type: "teams_drawn",
                payload: { players, teams: drawTeams(players, parsedTeams) },
              })
            }
            className="rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
          >
            {t("teams")}
          </button>
        </label>
      </div>

      {last ? (
        <p className="mt-4 font-serif text-[18px] font-semibold" data-testid="players-result">
          {/* la clave del log ya formatea el resultado completo */}
          {useTranslations("play.random")(`log.${last.key}`, last.params)}
        </p>
      ) : null}
    </div>
  );
}
```

**OJO implementador (dos arreglos obligatorios sobre el esqueleto de arriba):**
1. `useTranslations` NO puede llamarse dentro del JSX condicional (regla de hooks). Declarar arriba `const tLog = useTranslations("play.random")` y usar `tLog(\`log.${last.key}\`, last.params)`.
2. La prop `onEmit` tal como está tipada arriba es fea; simplificar a: `onEmit: (type: "first_picked" | "order_drawn" | "teams_drawn", payload: { players: string[]; picked?: string; order?: string[]; teams?: string[][] }) => void` **o mejor**: tres callbacks separados `onFirst(players, picked)`, `onOrder(players, order)`, `onTeams(players, teams)` — elegir lo que deje el tipado limpio sin `unknown`, y cablear en `random-screen.tsx` con `companion.emit("first_picked", …)` etc.

- [ ] **Step 2: Escribir `bag-section.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { drawFromBag } from "@/lib/play/random/draws";
import type { BagItem, RandomState } from "@/lib/play/random/types";
import type { RandomEvent } from "@/lib/play/random/events";

/**
 * Bolsa virtual (spec §4): editar tipos, sacar ficha (ponderado por
 * restantes), toggle de reemplazo y reiniciar. Toda edición emite bag_set con
 * la FOTO completa (initial se re-fija a esa foto); reiniciar = bag_set con
 * initial. Sacar resuelve el azar aquí y emite bag_drawn.
 */
export function BagSection({
  bag,
  lastDrawn,
  onBagSet,
  onDraw,
}: {
  bag: RandomState["bag"];
  lastDrawn: RandomEvent | undefined;
  onBagSet: (items: BagItem[], withReplacement: boolean) => void;
  onDraw: (name: string) => void;
}) {
  const t = useTranslations("play.random.bag");
  const [name, setName] = useState("");
  const [count, setCount] = useState("");

  const remaining = bag.items.reduce((sum, i) => sum + i.count, 0);
  const parsedCount = Number(count || "1");
  const addValid =
    name.trim() !== "" &&
    !bag.items.some((i) => i.name === name.trim()) &&
    Number.isInteger(parsedCount) &&
    parsedCount >= 1;

  function addItem() {
    if (!addValid) return;
    onBagSet([...bag.items, { name: name.trim(), count: parsedCount }], bag.withReplacement);
    setName("");
    setCount("");
  }

  const drawn = lastDrawn && lastDrawn.type === "bag_drawn" ? lastDrawn.payload.name : null;

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={name}
          placeholder={t("namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
          aria-label={t("itemName")}
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={count}
          placeholder="1"
          onChange={(e) => setCount(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t("itemCount")}
          className="w-16 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
        <button
          type="button"
          disabled={!addValid}
          onClick={addItem}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] disabled:opacity-40"
        >
          {t("add")}
        </button>
      </div>

      {bag.items.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {bag.items.map((item) => (
            <li key={item.name} className="flex items-center justify-between text-[14px]">
              <span>
                {item.name} <span className="text-muted-foreground">×{item.count}</span>
              </span>
              <button
                type="button"
                onClick={() =>
                  onBagSet(bag.items.filter((i) => i.name !== item.name), bag.withReplacement)
                }
                aria-label={t("remove", { name: item.name })}
                className="rounded-chip border border-border px-2 py-0.5 text-[12px]"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">{t("hint")}</p>
      )}

      <label className="mt-3 flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={bag.withReplacement}
          onChange={(e) =>
            onBagSet(bag.items.map((i) => ({ ...i })), e.target.checked)
          }
        />
        {t("withReplacement")}
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={remaining === 0}
          onClick={() => onDraw(drawFromBag(bag.items))}
          className="rounded-chip border border-border px-4 py-2 text-[14px] font-semibold disabled:opacity-40"
        >
          {t("draw")}
        </button>
        <span className="text-[13px] text-muted-foreground">{t("remaining", { n: remaining })}</span>
        <button
          type="button"
          disabled={bag.initial.length === 0}
          onClick={() => onBagSet(bag.initial.map((i) => ({ ...i })), bag.withReplacement)}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] disabled:opacity-40"
        >
          {t("reset")}
        </button>
      </div>

      {drawn ? (
        <p className="mt-4 font-serif text-[22px] font-semibold" data-testid="bag-result">
          {drawn}
        </p>
      ) : null}
    </div>
  );
}
```

**OJO implementador:** el toggle de reemplazo emite `bag_set` con los items ACTUALES como nueva foto — eso re-fija `initial` a los restantes de ese momento. Es el comportamiento aceptado en la spec («la UI manda la foto completa»); no lo "arregles" añadiendo un evento nuevo.

- [ ] **Step 3: Cablear en `random-screen.tsx`**

Sustituir los placeholders:

```tsx
{tab === "players" ? (
  <PlayersSection
    identity={identity}
    players={companion.state.players}
    lastResult={companion.feed.find(
      (e) => e.type === "first_picked" || e.type === "order_drawn" || e.type === "teams_drawn",
    )}
    onSetPlayers={(players) => companion.emit("players_set", { players })}
    onFirst={(players, picked) => companion.emit("first_picked", { players, picked })}
    onOrder={(players, order) => companion.emit("order_drawn", { players, order })}
    onTeams={(players, teams) => companion.emit("teams_drawn", { players, teams })}
  />
) : null}
{tab === "bag" ? (
  <BagSection
    bag={companion.state.bag}
    lastDrawn={lastOf("bag_drawn")}
    onBagSet={(items, withReplacement) => companion.emit("bag_set", { items, withReplacement })}
    onDraw={(name) => companion.emit("bag_drawn", { name })}
  />
) : null}
```

(con los imports correspondientes; ajustar las props de `PlayersSection` a la forma final elegida en el Step 1).

- [ ] **Step 4: i18n — añadir dentro de `play.random`**

```json
"players": {
  "regulars": "Tus habituales",
  "nameLabel": "Nombre del jugador",
  "namePlaceholder": "Añadir jugador…",
  "add": "Añadir",
  "remove": "Quitar a {name}",
  "hint": "Añade al menos 2 jugadores para sortear.",
  "first": "Primer jugador",
  "order": "Orden aleatorio",
  "teams": "Equipos",
  "teamCount": "Número de equipos"
},
"bag": {
  "itemName": "Tipo de ficha",
  "namePlaceholder": "Rojo, Azul…",
  "itemCount": "Cantidad",
  "add": "Añadir",
  "remove": "Quitar {name}",
  "hint": "Añade tipos de ficha con su cantidad.",
  "withReplacement": "Con reemplazo (no descuenta)",
  "draw": "Sacar ficha",
  "remaining": "Quedan {n}",
  "reset": "Reiniciar bolsa"
}
```

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit
fnm exec --using=22 npx vitest run
npm run build
```
Manual en dev: añadir jugadores (chips si hay sesión), sortear primero/orden/equipos, montar bolsa Rojo×2 Azul×1, sacar hasta agotar (botón se desactiva), reiniciar, deshacer revierte el último saque (restaura el restante).

- [ ] **Step 6: Commit**

```bash
git add src/components/play/random/players-section.tsx src/components/play/random/bag-section.tsx src/components/play/random/random-screen.tsx messages/es.json
git commit -m "feat(play): secciones Jugadores y Bolsa del Aleatorio -- sorteos y extraccion sin reemplazo"
```

---

### Task 6: Tarjeta en el hub, marca SVG, e2e y cierre documental

**Files:**
- Create: `src/components/play/marks/random-table-mark.tsx`
- Modify: `src/components/play/tool-grid.tsx` (tarjeta estática antes de la de «pronto»)
- Modify: `messages/es.json` (clave `play.tools.random.name` — mirar la forma exacta de `tools.mtg`/`tools.score` y calcarla)
- Create: `e2e/partidas-aleatorio.spec.ts`
- Modify: `docs/requirements/backlog.md` (línea en la sección BiblioPlay)
- Modify: `docs/requirements/decisiones.md` (entrada al FINAL, append-only, vía Bash heredoc — los here-strings de PowerShell los bloquea el hook)

**Interfaces:**
- Consumes: UI completa de Tasks 4-5; patrón de marca de `score-table-mark.tsx` (SVG 64×64, `var(--play-rail)`, `var(--surface)`, `var(--play-felt)`, sin texto, `aria-hidden`).
- Produces: tarjeta «Aleatorio» en el hub → `/partidas/aleatorio`.

- [ ] **Step 1: Escribir `random-table-mark.tsx`**

```tsx
/**
 * La marca del Aleatorio es un DADO sobre la mesa con una moneda al lado:
 * silueta distinta de la hoja de puntuación (papel con rejilla) y de la mesa
 * de Magic (fieltro con asientos) a tamaño de tarjeta. Sin texto ni <title>:
 * la etiqueta la pone la tarjeta que lo envuelve.
 */
export function RandomTableMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      {/* El dado, ligeramente girado. */}
      <g transform="rotate(-8 28 32)">
        <rect
          x="12"
          y="16"
          width="30"
          height="30"
          rx="6"
          fill="var(--surface)"
          stroke="var(--play-rail)"
          strokeWidth="1.5"
        />
        {/* Cinco pips. */}
        <circle cx="20" cy="24" r="2.5" fill="var(--play-rail)" />
        <circle cx="34" cy="24" r="2.5" fill="var(--play-rail)" />
        <circle cx="27" cy="31" r="2.5" fill="var(--play-rail)" />
        <circle cx="20" cy="38" r="2.5" fill="var(--play-rail)" />
        <circle cx="34" cy="38" r="2.5" fill="var(--play-rail)" />
      </g>
      {/* La moneda, medio detrás del dado. */}
      <circle cx="47" cy="42" r="9" fill="var(--play-felt)" stroke="var(--play-rail)" strokeWidth="1.5" />
      <circle cx="47" cy="42" r="5.5" fill="none" stroke="var(--play-rail)" strokeWidth="1" />
    </svg>
  );
}
```

- [ ] **Step 2: Tarjeta en `tool-grid.tsx`**

Antes del `<li>` de «pronto» (tool-grid.tsx:39), añadir un `<li>` estático — el randomizer NO está en `playTools` (decisión de spec: fuera del registro, no ocupa el slot activo):

```tsx
{/* El Aleatorio vive FUERA del registro de herramientas a propósito (spec
    randomizer §2): es un acompañante sin partida — no ocupa el slot activo
    ni aparece en guardadas. Por eso su tarjeta es estática y no sale del map. */}
<li>
  <Link
    href="/partidas/aleatorio"
    className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:bg-surface-muted"
  >
    <RandomTableMark className="h-16 w-16" />
    <span className="text-center font-serif text-[15px] font-semibold">
      {t("tools.random.name")}
    </span>
  </Link>
</li>
```

con `import { RandomTableMark } from "./marks/random-table-mark";` arriba. En `messages/es.json`, añadir `"random"` dentro de `play.tools` calcando la FORMA de `tools.score` (si esa entrada tiene más claves que `name` — mirar el fichero — añadir solo las que la tarjeta y la página usan; no inventar claves muertas): como mínimo `"random": { "name": "Aleatorio" }`.

- [ ] **Step 3: Escribir el e2e**

`e2e/partidas-aleatorio.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// Acompañante «Aleatorio» (spec randomizer). Anónimo: sin red de Supabase que
// montar — la identidad solo aísla la clave de IDB. Viewport móvil como el
// resto de suites de Play.
test.use({ viewport: { width: 390, height: 844 } });

test("dados y moneda: resultado, feed, deshacer y recarga", async ({ page }) => {
  await page.goto("/partidas/aleatorio");
  await expect(page.getByRole("heading", { name: "Aleatorio" })).toBeVisible();

  await page.getByRole("button", { name: "d6", exact: true }).click();
  await expect(page.getByTestId("dice-result")).toBeVisible();

  // Tirada libre 3d6: el resultado formatea "a + b + c = total".
  await page.getByLabel("Cuántos").fill("3");
  await page.getByLabel("Caras").fill("6");
  await page.getByRole("button", { name: /^tirar$/i }).click();
  await expect(page.getByTestId("dice-result")).toContainText("=");

  await page.getByRole("tab", { name: "Moneda" }).click();
  await page.getByRole("button", { name: /^lanzar moneda$/i }).click();
  await expect(page.getByTestId("coin-result")).toHaveText(/^(Cara|Cruz)$/);

  // El feed acumula los tres resultados; deshacer quita el último (la moneda).
  const feed = page.locator('section[aria-label="Últimos resultados"] li');
  await expect(feed).toHaveCount(3);
  await page.getByRole("button", { name: /^deshacer$/i }).click();
  await expect(feed).toHaveCount(2);

  // El estado sobrevive a una recarga (store companion en IDB).
  await page.reload();
  await expect(page.locator('section[aria-label="Últimos resultados"] li')).toHaveCount(2);
});

test("jugadores: primero, orden y equipos", async ({ page }) => {
  await page.goto("/partidas/aleatorio");
  await page.getByRole("tab", { name: "Jugadores" }).click();

  for (const name of ["Ana", "Beto", "Carla", "Dario"]) {
    await page.getByLabel("Nombre del jugador").fill(name);
    await page.getByRole("button", { name: /^añadir$/i }).click();
  }

  await page.getByRole("button", { name: /^primer jugador$/i }).click();
  await expect(page.getByTestId("players-result")).toContainText(/Ana|Beto|Carla|Dario/);

  await page.getByRole("button", { name: /^orden aleatorio$/i }).click();
  await expect(page.getByTestId("players-result")).toContainText("Orden:");

  await page.getByLabel("Número de equipos").fill("2");
  await page.getByRole("button", { name: /^equipos$/i }).click();
  await expect(page.getByTestId("players-result")).toContainText("Equipos:");
});

test("bolsa sin reemplazo se agota, se desactiva y se reinicia", async ({ page }) => {
  await page.goto("/partidas/aleatorio");
  await page.getByRole("tab", { name: "Bolsa" }).click();

  await page.getByLabel("Tipo de ficha").fill("Rojo");
  await page.getByLabel("Cantidad").fill("1");
  await page.getByRole("button", { name: /^añadir$/i }).click();
  await page.getByLabel("Tipo de ficha").fill("Azul");
  await page.getByLabel("Cantidad").fill("1");
  await page.getByRole("button", { name: /^añadir$/i }).click();

  await expect(page.getByText("Quedan 2")).toBeVisible();
  await page.getByRole("button", { name: /^sacar ficha$/i }).click();
  await page.getByRole("button", { name: /^sacar ficha$/i }).click();
  await expect(page.getByText("Quedan 0")).toBeVisible();
  await expect(page.getByRole("button", { name: /^sacar ficha$/i })).toBeDisabled();

  await page.getByRole("button", { name: /^reiniciar bolsa$/i }).click();
  await expect(page.getByText("Quedan 2")).toBeVisible();
});

test("convive con una partida de puntuación activa", async ({ page }) => {
  // Arrancar una partida real («jugar ya» del sub-hub de puntuación)...
  await page.goto("/partidas/puntuacion");
  await page.getByRole("button", { name: /^jugar ya$/i }).click();
  await expect(page).toHaveURL(/\/partida\/activa$/);

  // ...usar el Aleatorio en medio...
  await page.goto("/partidas/aleatorio");
  await page.getByRole("button", { name: "d6", exact: true }).click();
  await expect(page.getByTestId("dice-result")).toBeVisible();

  // ...y la partida sigue viva: el hub enseña el banner de partida en curso.
  await page.goto("/partidas");
  await expect(page.getByRole("link", { name: /continuar/i })).toBeVisible();
});
```

**OJO implementador:** el último `expect` (banner «continuar») debe calcarse del selector que ya use `e2e/partidas-guardadas.spec.ts` o el componente `active-game-banner.tsx` para el banner — mirar y ajustar el rol/nombre exacto antes de dar el test por escrito.

- [ ] **Step 4: Correr e2e**

```bash
fnm exec --using=22 npm run test:e2e -- partidas-aleatorio.spec.ts
```
(Playwright reutiliza el dev server del puerto 3000 si ya hay uno; no levantar un segundo.)
Expected: 4 passed.

- [ ] **Step 5: Backlog y decisiones**

- `docs/requirements/backlog.md`: en la sección BiblioPlay, añadir línea marcada: `- [x] Aleatorio: dados, moneda, primer jugador, orden, equipos y bolsa virtual (acompañante local, sin historial)`. Mirar el formato de las líneas vecinas y calcarlo.
- `docs/requirements/decisiones.md`: entrada AL FINAL (append-only) vía Bash heredoc:

```bash
cat >> docs/requirements/decisiones.md << 'EOF'

## 2026-08-31 — Randomizer como acompañante fuera del slot de partida

- El «Aleatorio» usa el estilo de motor de Play (eventos + reducer puro; el azar
  se resuelve al despachar y el resultado viaja en el payload) pero NO entra en
  ToolId/playTools: el slot `active` es único por identidad y el randomizer se
  usa durante otra partida — entrar al registro la pisaría.
- Persistencia en store IDB propio `companion` (DB v4) con el mismo CAS que
  `active`; sin Supabase ni historial (una tirada no es una partida).
- El log se compacta al pasar 200 eventos re-basando el estado y conservando los
  últimos 20 (el feed enseña 20; deshacer más allá no tiene caso de uso).
EOF
```

- [ ] **Step 6: Verificación final y commit**

```bash
npx tsc --noEmit
fnm exec --using=22 npx vitest run
npm run build
git add src/components/play/marks/random-table-mark.tsx src/components/play/tool-grid.tsx messages/es.json e2e/partidas-aleatorio.spec.ts docs/requirements/backlog.md docs/requirements/decisiones.md
git commit -m "feat(play): tarjeta Aleatorio en el hub, marca, e2e y cierre documental"
```

---

## Self-Review (hecho al escribir el plan)

- **Cobertura de spec:** §1 alcance (6 funciones: Tasks 1-5), §2 arquitectura (Tasks 1-3), §3 dominio (Tasks 1-2), §4 UI (Tasks 4-5, tarjeta Task 6), §5 persistencia+compactación (Tasks 3-4, compactación pura en Task 2), §6 testing (unit Tasks 1-3, e2e Task 6), §7 hecho (Task 6). Sin huecos.
- **Placeholders:** los dos «OJO implementador» de Task 5/6 no son huecos — señalan decisiones locales (forma final de props, selector del banner) que exigen mirar un fichero vecino; el resto del código está completo.
- **Consistencia de tipos:** `useCompanion` (Task 4) consume exactamente lo producido por Tasks 1-3; `PlayersSection`/`BagSection` (Task 5) cablean contra `emit` con los payloads de events.ts; `compactIfNeeded` firma idéntica en Task 2 (producción) y Task 4 (consumo).
