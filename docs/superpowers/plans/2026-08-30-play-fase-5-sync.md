# BiblioPlay Fase 5 — Sync Supabase + historial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** «Guardar partida» sube a Supabase con cola offline, y `/partidas` gana un historial «Guardadas» local-first (espejo IndexedDB) con borrado y adopción de partidas anónimas.

**Architecture:** Espejo unificado: el almacén IndexedDB `saved` (fase 3) gana `syncStatus`/tombstone y pasa a ser la única fuente de la UI; un sincronizador de fondo (`planSync` puro + ejecutor con cliente inyectado) lo iguala a la tabla nueva `play_games` (una fila por partida, log íntegro en JSONB). Spec: `docs/superpowers/specs/2026-08-30-play-fase-5-sync-design.md`.

**Tech Stack:** Next.js (app router), IndexedDB, Supabase (RLS), vitest, Playwright.

## Global Constraints

- `play_games` es **privada total**: 4 políticas RLS `owner_id = (select auth.uid())`, grant de tabla entera solo a `authenticated` (spec §2). Nada de grant fino por columna (trampa #375).
- Regla #437: **cero `use cache`** sobre datos de esta feature; todo se lee en cliente.
- La UI del historial lee **solo IndexedDB**, nunca la red (spec §1). El sync jamás bloquea la UI y sus fallos no producen toasts (spec §8).
- `id` de `play_games` = `gameId` = `committed[0].id` (UUID del `game_started`); push = upsert idempotente por PK (spec §2).
- Sync corre solo con sesión (`identity !== "anon"`) y `navigator.onLine` (spec §5). Un `pending` local NUNCA es pisado por el pull (spec §5.4).
- Adopción de partidas anon: siempre explícita vía banner, nunca automática (spec §7).
- Tests: `fnm use 22` antes de `npx vitest`/playwright (Node 20 del shell rompe vitest).
- Git: `git add` con rutas explícitas, nunca `-A` (hay untracked ajenos).
- Textos de UI: `messages/es.json`, namespace `play.saved` (único locale del repo).
- El core de Play no conoce herramientas concretas, con la excepción ya existente del replay (`core/replay.ts` importa el registro `tools.ts`); la migración IDB v2 usa la misma excepción.

---

### Task 1: Migración SQL `play_games` + data-model.md

**Files:**
- Create: `supabase/migrations/20260893_play_games.sql`
- Modify: `docs/requirements/data-model.md` (sección nueva + fecha de verificación)

**Interfaces:**
- Produces: tabla `public.play_games` con columnas `id, owner_id, tool_id, started_at, finished_at, saved_at, summary, events, created_at, updated_at` — las usan Tasks 5–6.

**Nota de entorno:** los MCP de Supabase pueden estar caídos en la sesión; en ese caso el fichero se escribe igual y **la aplicación a dev/prod la hace el controlador** (fallback: conector claude.ai con project_id explícito — memoria `supabase-mcp-fallback`). Regla del repo: dev primero, prod después; verificar contra objetos reales (`pg_class`), no el ledger.

- [ ] **Step 1: Escribir la migración**

```sql
-- Fase 5 de Play (#931): partidas guardadas. Una fila por partida, log íntegro
-- en JSONB (sin tabla de eventos por filas hasta el multiplayer de fase 9).
-- Privada total: RLS por ownership, sin acceso anon ni lectura de terceros.
create table public.play_games (
  id uuid primary key,                    -- gameId del cliente (= committed[0].id)
  owner_id uuid not null references auth.users (id) on delete cascade,
  tool_id text not null,                  -- "mtg" | "score"; sin enum, las herramientas crecen
  started_at timestamptz not null,
  finished_at timestamptz not null,
  saved_at timestamptz not null,
  summary jsonb not null,
  events jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index play_games_owner_saved on public.play_games (owner_id, saved_at desc);

alter table public.play_games enable row level security;

create policy "play_games_select" on public.play_games
  for select using (owner_id = (select auth.uid()));
create policy "play_games_insert" on public.play_games
  for insert with check (owner_id = (select auth.uid()));
create policy "play_games_update" on public.play_games
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "play_games_delete" on public.play_games
  for delete using (owner_id = (select auth.uid()));

-- Grant de TABLA ENTERA a propósito (nada de grant fino por columna, #375).
grant select, insert, update, delete on public.play_games to authenticated;
```

- [ ] **Step 2: Aplicar en dev** (controlador si el MCP está caído). Verificar: `select relname from pg_class where relname = 'play_games';` devuelve 1 fila y `select count(*) from pg_policies where tablename = 'play_games';` devuelve 4.

- [ ] **Step 3: data-model.md** — añadir la tabla a la sección de esquema con sus columnas, las 4 políticas y la nota «grant de tabla entera a authenticated; privada total»; actualizar la fecha de verificación de la cabecera.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260893_play_games.sql docs/requirements/data-model.md
git commit -m "feat(play): tabla play_games con RLS por ownership (fase 5)"
```

(Prod se aplica en Task 8, tras pasar los e2e — no antes.)

---

### Task 2: `SavedGameSummary` + `summarize` en el registro de herramientas

**Files:**
- Modify: `src/lib/play/core/types.ts` (añadir tipos al final)
- Modify: `src/lib/play/tools.ts` (campo `summarize` en `ToolModule`, entradas mtg/score, `buildSavedSummary`)
- Test: `src/lib/play/tools.test.ts` (añadir describe)

**Interfaces:**
- Consumes: `finalRanking` (`mtg/selectors.ts`, devuelve `{participantId, position}[]`), `scoreRanking`/`totals` (`score/selectors.ts`, `scoreRanking` devuelve `{seat, total, position}[]`).
- Produces: `SavedGameSummary`, `SavedParticipant` (core/types) y `buildSavedSummary(state: PlayGameState): SavedGameSummary` (tools.ts) — los usan Tasks 3, 4, 5, 7.

- [ ] **Step 1: Tipos en `core/types.ts`** (append):

```ts
// Resumen sellado al guardar (fase 5): la lista y el detalle del historial
// renderizan SOLO esto — nunca replay. Es el MISMO objeto que sube a
// play_games.summary, así que cambiarlo es cambiar el contrato con el servidor.
export type SavedParticipant = {
  kind: "user" | "regular" | "guest";
  name: string;
  userId?: string;
};

export type SavedGameSummary = {
  toolId: ToolId;
  participants: SavedParticipant[]; // orden = asientos
  winners: number[]; // asientos con position 1 (empate posible en score)
  ranking: { seat: number; position: number }[];
  durationMs: number;
  tool: Record<string, unknown>; // extensión por herramienta (mtg: mode/turns/commanders; score: rounds/direction/totals/target)
};
```

- [ ] **Step 2: Test que falla** — en `tools.test.ts` añadir (imports arriba del fichero: `buildSavedSummary` de `./tools`; para estados usar los fixtures/replay ya presentes en el fichero — si no los hay, construir logs mínimos como en `score/replay.test.ts`):

```ts
describe("buildSavedSummary", () => {
  it("score: ganador por dirección, participantes planos, duración del estado", () => {
    // partida score de 2 jugadores, direction highest, una ronda [5, 3], finalizada
    const state = replay(scoreFinishedLog); // helper local: game_started + round_scored + game_finished
    const summary = buildSavedSummary(state);
    expect(summary.toolId).toBe("score");
    expect(summary.winners).toEqual([0]);
    expect(summary.ranking).toEqual([
      { seat: 0, position: 1 },
      { seat: 1, position: 2 },
    ]);
    expect(summary.participants.map((p) => p.name)).toEqual(["Ana", "Beto"]);
    expect(summary.tool).toMatchObject({ rounds: 1, direction: "highest", totals: [5, 3] });
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("mtg: ranking por asiento (no por participantId) y comandantes por nombre", () => {
    const state = replay(mtgFinishedLog); // 2 jugadores, seat 1 eliminado, seat 0 ganador
    const summary = buildSavedSummary(state);
    expect(summary.toolId).toBe("mtg");
    expect(summary.winners).toEqual([0]);
    expect(summary.ranking[0]).toEqual({ seat: 0, position: 1 });
    expect((summary.tool.commanders as (string | null)[]).length).toBe(2);
  });

  it("un participante user conserva userId; regular/guest no lo llevan", () => {
    const summary = buildSavedSummary(replay(scoreFinishedLog));
    for (const p of summary.participants) {
      if (p.kind === "user") expect(typeof p.userId).toBe("string");
      else expect("userId" in p).toBe(false);
    }
  });
});
```

- [ ] **Step 3: Correr y ver fallar**: `fnm use 22; npx vitest run src/lib/play/tools.test.ts` — FAIL (buildSavedSummary no existe).

- [ ] **Step 4: Implementar en `tools.ts`**:

```ts
// En ToolModule, añadir:
  // Parte específica del resumen sellado al guardar (fase 5). El común
  // (participantes, duración) lo pone buildSavedSummary.
  summarize: (state: PlayGameState) => Pick<SavedGameSummary, "winners" | "ranking" | "tool">;

// Entrada mtg (dentro de playTools.mtg):
    summarize: (state) => summarizeMtg(state as MtgState),

// Entrada score:
    summarize: (state) => summarizeScore(state as ScoreState),

// Funciones (antes de playTools):
function summarizeMtg(state: MtgState): Pick<SavedGameSummary, "winners" | "ranking" | "tool"> {
  const seatOf = new Map(state.setup.participants.map((p, seat) => [p.id, seat] as const));
  const ranking = finalRanking(state).map((entry) => ({
    seat: seatOf.get(entry.participantId) ?? -1,
    position: entry.position,
  }));
  return {
    winners: ranking.filter((r) => r.position === 1).map((r) => r.seat),
    ranking,
    tool: {
      mode: state.setup.mode,
      turns: state.turnCount,
      // Partner = nombres unidos; sin nombre escrito, null (empezar sin rellenar es camino de primera).
      commanders: state.setup.participants.map((p) => {
        const names = p.commanders.map((c) => c.name).filter(Boolean);
        return names.length > 0 ? names.join(" / ") : null;
      }),
    },
  };
}

function summarizeScore(state: ScoreState): Pick<SavedGameSummary, "winners" | "ranking" | "tool"> {
  const ranking = scoreRanking(state).map(({ seat, position }) => ({ seat, position }));
  return {
    winners: ranking.filter((r) => r.position === 1).map((r) => r.seat),
    ranking,
    tool: {
      rounds: state.rounds.length,
      direction: state.setup.direction,
      totals: totals(state),
      target: state.setup.target ?? null,
    },
  };
}

export function buildSavedSummary(state: PlayGameState): SavedGameSummary {
  const partial = playTools[state.toolId].summarize(state);
  return {
    toolId: state.toolId,
    participants: state.setup.participants.map((p) =>
      p.kind === "user"
        ? { kind: p.kind, name: p.name, userId: p.userId }
        : { kind: p.kind, name: p.name },
    ),
    durationMs: (state.finishedAt ?? state.startedAt) - state.startedAt,
    ...partial,
  };
}
```

Imports nuevos en tools.ts: `finalRanking` de `./mtg/selectors`, `scoreRanking, totals` de `./score/selectors`, `SavedGameSummary` de `./core/types`.

- [ ] **Step 5: Verde**: `npx vitest run src/lib/play/tools.test.ts src/lib/play` — PASS todos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/play/core/types.ts src/lib/play/tools.ts src/lib/play/tools.test.ts
git commit -m "feat(play): resumen sellado por herramienta (buildSavedSummary)"
```

---

### Task 3: IndexedDB v2 — `SavedGameRecord` v2, migración y lecturas

**Files:**
- Modify: `src/lib/play/core/db.ts`
- Test: `src/lib/play/core/db.test.ts` (añadir describe; mirar cómo los tests existentes montan IndexedDB — usan `fake-indexeddb` o similar; seguir el patrón del fichero)

**Interfaces:**
- Consumes: `buildSavedSummary` (Task 2), `replay` (`core/replay.ts`).
- Produces: `SavedGameRecord` v2 (campos nuevos `summary: SavedGameSummary`, `syncStatus: "pending" | "synced"`, `deletedAt: number | null`), `DB_VERSION = 2`, `listSaved(identity): Promise<SavedGameRecord[]>`, `deleteSaved(gameId): Promise<void>`; `saveFinished` sin cambio de firma. Los usan Tasks 4–7.

- [ ] **Step 1: Tests que fallan** (en `db.test.ts`):

```ts
describe("saved v2", () => {
  it("listSaved devuelve solo los registros de la identidad, y deleteSaved borra", async () => {
    await saveFinished(savedRecordV2({ gameId: "g1", identity: "anon" }));
    await saveFinished(savedRecordV2({ gameId: "g2", identity: "uid-1" }));
    const anon = await listSaved("anon");
    expect(anon.map((r) => r.gameId)).toEqual(["g1"]);
    await deleteSaved("g1");
    expect(await listSaved("anon")).toEqual([]);
  });

  it("migración v1→v2: el registro gana summary derivado y queda pending", async () => {
    // Sembrar una BD versión 1 con un registro v1 (sin summary/syncStatus),
    // cerrar, reabrir con el módulo (DB_VERSION 2) y leer.
    const migrated = await listSaved("anon");
    expect(migrated[0].v).toBe(2);
    expect(migrated[0].syncStatus).toBe("pending");
    expect(migrated[0].deletedAt).toBeNull();
    expect(migrated[0].summary.toolId).toBe("score");
  });

  it("migración v1→v2: un log corrupto se descarta en vez de romper el upgrade", async () => {
    // registro v1 cuyo committed no empieza por game_started → tras migrar, no está
  });
});
```

`savedRecordV2` = helper local del test que construye un registro v2 completo con un log score mínimo válido y su `buildSavedSummary`. Para sembrar v1: abrir la BD a mano con `indexedDB.open(DB_NAME, 1)` en el test ANTES de tocar el módulo (el módulo cachea `dbPromise`; usar BDs con nombre limpio por test si el fichero ya lo hace así — seguir su patrón de aislamiento).

- [ ] **Step 2: Ver fallar**: `npx vitest run src/lib/play/core/db.test.ts` — FAIL.

- [ ] **Step 3: Implementar en `db.ts`**:

```ts
export const DB_VERSION = 2;

// SavedGameRecord pasa a v2 (fase 5): el almacén `saved` es el ESPEJO del
// servidor y la única fuente de la UI del historial.
export type SavedGameRecord = {
  gameId: string; // = committed[0].id (el game_started)
  identity: string;
  v: 2;
  committed: PlayEvent[];
  savedAt: number; // epoch ms
  summary: SavedGameSummary; // el mismo objeto que sube a play_games.summary
  syncStatus: "pending" | "synced";
  deletedAt: number | null; // tombstone: borrado pendiente de replicar
};
```

En `onupgradeneeded` (sustituir el handler; nota: importa `replay` de `./replay` y `buildSavedSummary` de `../tools` — misma excepción de neutralidad que ya tiene replay.ts):

```ts
      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains("active")) {
          db.createObjectStore("active", { keyPath: "identity" });
        }
        if (!db.objectStoreNames.contains("saved")) {
          const saved = db.createObjectStore("saved", { keyPath: "gameId" });
          saved.createIndex("identity", "identity");
        }
        // v1 → v2: los guardados de fase 3/4 ganan summary (derivado por replay,
        // UNA vez, aquí) y quedan pendientes de subir. Un log que no re-juega
        // está roto también para la UI: se descarta, no se arrastra.
        if (event.oldVersion > 0 && event.oldVersion < 2) {
          const saved = request.transaction!.objectStore("saved");
          saved.openCursor().onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
            if (!cursor) return;
            const old = cursor.value as {
              gameId: string;
              identity: string;
              committed: PlayEvent[];
              savedAt: number;
            };
            try {
              const summary = buildSavedSummary(replay(old.committed));
              cursor.update({
                gameId: old.gameId,
                identity: old.identity,
                v: 2,
                committed: old.committed,
                savedAt: old.savedAt,
                summary,
                syncStatus: "pending",
                deletedAt: null,
              } satisfies SavedGameRecord);
            } catch {
              cursor.delete();
            }
            cursor.continue();
          };
        }
      };
```

Funciones nuevas (mismo estilo defensivo que las existentes — sin BD, resultado vacío):

```ts
export async function listSaved(identity: string): Promise<SavedGameRecord[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("saved", "readonly")
        .objectStore("saved")
        .index("identity")
        .getAll(identity);
      request.onsuccess = () => resolve((request.result as SavedGameRecord[]) ?? []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

export async function deleteSaved(gameId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction("saved", "readwrite");
      tx.objectStore("saved").delete(gameId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // sin BD no hay nada que borrar
  }
}
```

Ojo: el comentario existente sobre `onblocked` («hoy DB_VERSION es 1 y onblocked no puede dispararse») queda obsoleto — actualizarlo: con v2 el caso es real y el reject ya lo cubre.

- [ ] **Step 4: Verde**: `npx vitest run src/lib/play/core/db.test.ts` — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/core/db.ts src/lib/play/core/db.test.ts
git commit -m "feat(play): espejo saved v2 con syncStatus y tombstone (IDB v2)"
```

---

### Task 4: `store.save()` escribe el registro v2

**Files:**
- Modify: `src/lib/play/core/store.ts` (solo el método `save()`, ~línea 417)
- Test: `src/lib/play/core/store.test.ts` (ajustar/añadir asserts del save)

**Interfaces:**
- Consumes: `buildSavedSummary` (Task 2), `SavedGameRecord` v2 (Task 3).
- Produces: registros guardados nacen `pending` con summary — lo esperan Tasks 5–7.

- [ ] **Step 1: Test que falla** — en el describe del save existente de `store.test.ts`, añadir:

```ts
it("save() sella summary y nace pendiente de subir", async () => {
  // (usar el arranque de partida terminada que ya usa el test de save existente)
  await store.save();
  const [record] = await listSaved(identity);
  expect(record.v).toBe(2);
  expect(record.syncStatus).toBe("pending");
  expect(record.deletedAt).toBeNull();
  expect(record.summary.toolId).toBe(record.committed[0].payload.toolId);
  expect(record.summary.winners.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Ver fallar**: `npx vitest run src/lib/play/core/store.test.ts` — FAIL (falta summary/syncStatus; puede fallar antes en compilación de tipos — vale igual).

- [ ] **Step 3: Implementar** — en `save()`, la llamada a `saveFinished` pasa a:

```ts
      const ok = await saveFinished({
        gameId: game.log.committed[0].id,
        identity,
        v: 2,
        committed: game.log.committed,
        savedAt: Date.now(),
        // Sellado AQUÍ, una vez: la UI del historial no re-juega logs (fase 5).
        summary: buildSavedSummary(game.state),
        syncStatus: "pending",
        deletedAt: null,
      });
```

(import de `buildSavedSummary` desde `../tools`; el push NO se dispara aquí — el store no conoce la red; la isla del historial sincroniza al montar, Task 7.)

- [ ] **Step 4: Verde**: `npx vitest run src/lib/play/core/store.test.ts` — PASS. Correr también `npx tsc --noEmit` (el cambio de tipo de SavedGameRecord puede tocar más sitios; arreglar los que salgan).

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/core/store.ts src/lib/play/core/store.test.ts
git commit -m "feat(play): save() sella el resumen y marca pendiente de subir"
```

---

### Task 5: `planSync` puro + conversores fila↔registro

**Files:**
- Create: `src/lib/play/core/sync.ts`
- Test: `src/lib/play/core/sync.test.ts`

**Interfaces:**
- Consumes: `SavedGameRecord` (Task 3), `SavedGameSummary`, `PlayEvent` (core/types).
- Produces (los usa Task 6):

```ts
export type PlayGameRow = {
  id: string;
  tool_id: string;
  started_at: string; // ISO 8601
  finished_at: string;
  saved_at: string;
  summary: SavedGameSummary;
  events: PlayEvent[];
};
export type SyncPlan = {
  deleteRemote: string[];   // tombstones con copia remota (tras el delete remoto, se borran local)
  dropLocal: string[];      // tombstones SIN copia remota (borrar local directo)
  push: SavedGameRecord[];  // pending → upsert
  adoptLocal: PlayGameRow[];// remoto → registro local synced
  deleteLocal: string[];    // synced local ausente en remoto (lo borró otro dispositivo)
};
export function planSync(local: SavedGameRecord[], remote: PlayGameRow[]): SyncPlan;
export function rowFromRecord(record: SavedGameRecord): PlayGameRow;
export function recordFromRow(row: PlayGameRow, identity: string): SavedGameRecord;
```

- [ ] **Step 1: Tests que fallan** (`sync.test.ts`; helper local `rec(overrides)` que construye un `SavedGameRecord` v2 mínimo con log score válido, y `row(overrides)` para filas):

```ts
describe("planSync", () => {
  it("pending sin remoto → push", () => {
    const plan = planSync([rec({ gameId: "a", syncStatus: "pending" })], []);
    expect(plan.push.map((r) => r.gameId)).toEqual(["a"]);
    expect(plan.adoptLocal).toEqual([]);
  });

  it("pending CON remoto → push igualmente, y el remoto NO se adopta (jamás pisar un pending)", () => {
    const plan = planSync([rec({ gameId: "a", syncStatus: "pending" })], [row({ id: "a" })]);
    expect(plan.push.map((r) => r.gameId)).toEqual(["a"]);
    expect(plan.adoptLocal).toEqual([]);
    expect(plan.deleteLocal).toEqual([]);
  });

  it("tombstone con remoto → deleteRemote; sin remoto → dropLocal", () => {
    const local = [
      rec({ gameId: "a", deletedAt: 1 }),
      rec({ gameId: "b", deletedAt: 1 }),
    ];
    const plan = planSync(local, [row({ id: "a" })]);
    expect(plan.deleteRemote).toEqual(["a"]);
    expect(plan.dropLocal).toEqual(["b"]);
  });

  it("remoto nuevo → adoptLocal; remoto sobre synced local → adoptLocal (el servidor manda)", () => {
    const plan = planSync([rec({ gameId: "a", syncStatus: "synced" })], [row({ id: "a" }), row({ id: "c" })]);
    expect(plan.adoptLocal.map((r) => r.id).sort()).toEqual(["a", "c"]);
  });

  it("synced local ausente en remoto → deleteLocal (lo borró otro dispositivo)", () => {
    const plan = planSync([rec({ gameId: "a", syncStatus: "synced" })], []);
    expect(plan.deleteLocal).toEqual(["a"]);
  });

  it("un tombstone nunca se adopta del remoto aunque exista la fila", () => {
    const plan = planSync([rec({ gameId: "a", deletedAt: 1 })], [row({ id: "a" })]);
    expect(plan.adoptLocal).toEqual([]);
  });
});

describe("conversores", () => {
  it("rowFromRecord: fechas ISO del primer/último evento y savedAt; recordFromRow invierte", () => {
    const record = rec({ gameId: "a", syncStatus: "pending" });
    const asRow = rowFromRecord(record);
    expect(asRow.id).toBe("a");
    expect(Date.parse(asRow.started_at)).toBe(record.committed[0].at);
    expect(Date.parse(asRow.finished_at)).toBe(record.committed[record.committed.length - 1].at);
    const back = recordFromRow(asRow, "uid-1");
    expect(back.gameId).toBe("a");
    expect(back.identity).toBe("uid-1");
    expect(back.syncStatus).toBe("synced");
    expect(back.deletedAt).toBeNull();
    expect(back.committed).toEqual(record.committed);
  });
});
```

- [ ] **Step 2: Ver fallar**: `npx vitest run src/lib/play/core/sync.test.ts` — FAIL (módulo no existe).

- [ ] **Step 3: Implementar `sync.ts`** (esta task solo la parte pura):

```ts
import type { PlayEvent, SavedGameSummary } from "./types";
import type { SavedGameRecord } from "./db";

// (tipos PlayGameRow y SyncPlan como en Interfaces, con estos comentarios de campo)

// Reconciliación PURA (spec §5): sin IDB ni red, para poder probar cada caso.
// Reglas: un pending JAMÁS es pisado por el pull; el servidor manda sobre lo
// synced; un tombstone gana a todo hasta replicarse.
export function planSync(local: SavedGameRecord[], remote: PlayGameRow[]): SyncPlan {
  const remoteIds = new Set(remote.map((r) => r.id));
  const localById = new Map(local.map((r) => [r.gameId, r] as const));
  const plan: SyncPlan = { deleteRemote: [], dropLocal: [], push: [], adoptLocal: [], deleteLocal: [] };

  for (const record of local) {
    if (record.deletedAt !== null) {
      (remoteIds.has(record.gameId) ? plan.deleteRemote : plan.dropLocal).push(record.gameId);
    } else if (record.syncStatus === "pending") {
      plan.push.push(record);
    } else if (!remoteIds.has(record.gameId)) {
      plan.deleteLocal.push(record.gameId);
    }
  }

  for (const row of remote) {
    const existing = localById.get(row.id);
    if (existing && (existing.deletedAt !== null || existing.syncStatus === "pending")) continue;
    plan.adoptLocal.push(row);
  }

  return plan;
}

export function rowFromRecord(record: SavedGameRecord): PlayGameRow {
  const first = record.committed[0];
  const last = record.committed[record.committed.length - 1];
  return {
    id: record.gameId,
    tool_id: record.summary.toolId,
    started_at: new Date(first.at).toISOString(),
    finished_at: new Date(last.at).toISOString(),
    saved_at: new Date(record.savedAt).toISOString(),
    summary: record.summary,
    events: record.committed,
  };
}

export function recordFromRow(row: PlayGameRow, identity: string): SavedGameRecord {
  return {
    gameId: row.id,
    identity,
    v: 2,
    committed: row.events,
    savedAt: Date.parse(row.saved_at),
    summary: row.summary,
    syncStatus: "synced",
    deletedAt: null,
  };
}
```

- [ ] **Step 4: Verde**: `npx vitest run src/lib/play/core/sync.test.ts` — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/core/sync.ts src/lib/play/core/sync.test.ts
git commit -m "feat(play): planSync puro y conversores fila-registro (fase 5)"
```

---

### Task 6: Ejecutor de sync + adaptador Supabase + `requestSavedSync`

**Files:**
- Modify: `src/lib/play/core/sync.ts` (ejecutor + candado)
- Create: `src/lib/play/core/play-games-api.ts` (adaptador Supabase)
- Modify: `src/lib/supabase/database.types.ts` (tabla `play_games`)
- Test: `src/lib/play/core/sync.test.ts` (describe del ejecutor con API doble)

**Interfaces:**
- Consumes: `planSync`/conversores (Task 5), `listSaved`/`saveFinished`/`deleteSaved` (Task 3).
- Produces (los usa Task 7):

```ts
// sync.ts
export type PlayGamesApi = {
  selectAll(): Promise<{ rows: PlayGameRow[] } | { error: true }>;
  upsert(rows: PlayGameRow[]): Promise<{ error: boolean }>;
  remove(ids: string[]): Promise<{ error: boolean }>;
};
export const SAVED_CHANNEL_PREFIX = "biblioshare:play:saved:";
export async function runSavedSync(identity: string, api: PlayGamesApi): Promise<void>;
export function requestSavedSync(identity: string): void; // candado + fire-and-forget; no-op para "anon" u offline
// play-games-api.ts
export function createPlayGamesApi(ownerId: string): PlayGamesApi;
```

- [ ] **Step 1: Tests que fallan** — describe `runSavedSync` con doble en memoria:

```ts
function fakeApi(initialRows: PlayGameRow[] = []) {
  const rows = new Map(initialRows.map((r) => [r.id, r]));
  const calls: string[] = [];
  const api: PlayGamesApi = {
    async selectAll() {
      calls.push("selectAll");
      return { rows: [...rows.values()] };
    },
    async upsert(incoming) {
      calls.push("upsert");
      for (const r of incoming) rows.set(r.id, r);
      return { error: false };
    },
    async remove(ids) {
      calls.push("remove");
      for (const id of ids) rows.delete(id);
      return { error: false };
    },
  };
  return { api, rows, calls };
}

describe("runSavedSync", () => {
  it("push de pending: sube y marca synced", async () => {
    await saveFinished(rec({ gameId: "a", identity: "uid-1", syncStatus: "pending" }));
    const { api, rows } = fakeApi();
    await runSavedSync("uid-1", api);
    expect(rows.has("a")).toBe(true);
    expect((await listSaved("uid-1"))[0].syncStatus).toBe("synced");
  });

  it("tombstone: borra remoto y luego local; si el remove falla, el tombstone sobrevive", async () => {
    await saveFinished(rec({ gameId: "a", identity: "uid-1", syncStatus: "synced", deletedAt: 5 }));
    const { api } = fakeApi([row({ id: "a" })]);
    await runSavedSync("uid-1", api);
    expect(await listSaved("uid-1")).toEqual([]);

    await saveFinished(rec({ gameId: "b", identity: "uid-1", syncStatus: "synced", deletedAt: 5 }));
    const failing = { ...fakeApi([row({ id: "b" })]).api, remove: async () => ({ error: true }) };
    await runSavedSync("uid-1", failing);
    expect((await listSaved("uid-1"))[0].deletedAt).toBe(5);
  });

  it("pull: adopta remotas nuevas como synced y borra las synced ausentes", async () => {
    await saveFinished(rec({ gameId: "vieja", identity: "uid-1", syncStatus: "synced" }));
    const { api } = fakeApi([row({ id: "nueva" })]);
    await runSavedSync("uid-1", api);
    const ids = (await listSaved("uid-1")).map((r) => r.gameId);
    expect(ids).toEqual(["nueva"]);
  });

  it("selectAll con error: no toca NADA local", async () => {
    await saveFinished(rec({ gameId: "a", identity: "uid-1", syncStatus: "pending" }));
    await runSavedSync("uid-1", { ...fakeApi().api, selectAll: async () => ({ error: true as const }) });
    expect((await listSaved("uid-1"))[0].syncStatus).toBe("pending");
  });

  it("upsert con error: los pending siguen pending", async () => {
    await saveFinished(rec({ gameId: "a", identity: "uid-1", syncStatus: "pending" }));
    await runSavedSync("uid-1", { ...fakeApi().api, upsert: async () => ({ error: true }) });
    expect((await listSaved("uid-1"))[0].syncStatus).toBe("pending");
  });
});
```

- [ ] **Step 2: Ver fallar**, luego **Step 3: implementar** en `sync.ts`:

```ts
export const SAVED_CHANNEL_PREFIX = "biblioshare:play:saved:";

function notifySavedChanged(identity: string) {
  try {
    const channel = new BroadcastChannel(SAVED_CHANNEL_PREFIX + identity);
    channel.postMessage({ type: "changed" });
    channel.close();
  } catch {
    // sin BroadcastChannel (entorno de test/navegador raro): la lista se
    // refresca igualmente en el próximo montaje
  }
}

// Una pasada completa (spec §5): tombstones → push → pull/reconciliar.
// Cualquier fallo remoto deja el estado local como estaba: la próxima pasada
// reintenta. Nunca lanza.
export async function runSavedSync(identity: string, api: PlayGamesApi): Promise<void> {
  const local = await listSaved(identity);
  const result = await api.selectAll();
  if ("error" in result) return;
  const plan = planSync(local, result.rows);

  if (plan.deleteRemote.length > 0) {
    const { error } = await api.remove(plan.deleteRemote);
    if (!error) for (const id of plan.deleteRemote) await deleteSaved(id);
  }
  for (const id of plan.dropLocal) await deleteSaved(id);

  if (plan.push.length > 0) {
    const { error } = await api.upsert(plan.push.map(rowFromRecord));
    if (!error) {
      for (const record of plan.push) await saveFinished({ ...record, syncStatus: "synced" });
    }
  }

  for (const adopted of plan.adoptLocal) await saveFinished(recordFromRow(adopted, identity));
  for (const id of plan.deleteLocal) await deleteSaved(id);

  notifySavedChanged(identity);
}

// Candado por identidad: una pasada en vuelo; si llega otra petición, se anota
// y corre UNA vez más al terminar (sin colas largas — spec §5).
const inFlight = new Map<string, { rerun: boolean }>();

export function requestSavedSync(identity: string): void {
  if (identity === "anon") return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const current = inFlight.get(identity);
  if (current) {
    current.rerun = true;
    return;
  }
  const entry = { rerun: false };
  inFlight.set(identity, entry);
  void (async () => {
    try {
      do {
        entry.rerun = false;
        const { createPlayGamesApi } = await import("./play-games-api");
        await runSavedSync(identity, createPlayGamesApi(identity));
      } while (entry.rerun);
    } finally {
      inFlight.delete(identity);
    }
  })();
}
```

(Import dinámico del adaptador: mantiene `sync.ts` testeable sin cliente Supabase y fuera del bundle de quien solo usa `planSync`.)

`play-games-api.ts`:

```ts
import { createClient } from "@/lib/supabase/client";
import type { PlayGamesApi, PlayGameRow } from "./sync";

// Adaptador estrecho sobre supabase-js: lo único que el ejecutor necesita.
// RLS filtra por owner en el select; el owner_id se añade aquí al subir.
export function createPlayGamesApi(ownerId: string): PlayGamesApi {
  const client = createClient();
  return {
    async selectAll() {
      const { data, error } = await client
        .from("play_games")
        .select("id, tool_id, started_at, finished_at, saved_at, summary, events");
      if (error || data === null) return { error: true };
      return { rows: data as unknown as PlayGameRow[] };
    },
    async upsert(rows: PlayGameRow[]) {
      const { error } = await client
        .from("play_games")
        .upsert(rows.map((row) => ({ ...row, owner_id: ownerId })));
      return { error: error !== null };
    },
    async remove(ids: string[]) {
      const { error } = await client.from("play_games").delete().in("id", ids);
      return { error: error !== null };
    },
  };
}
```

`database.types.ts` — añadir al objeto `Tables` (orden alfabético del fichero, misma forma que las tablas vecinas):

```ts
      play_games: {
        Row: {
          created_at: string
          events: Json
          finished_at: string
          id: string
          owner_id: string
          saved_at: string
          started_at: string
          summary: Json
          tool_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          events: Json
          finished_at: string
          id: string
          owner_id: string
          saved_at: string
          started_at: string
          summary: Json
          tool_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          events?: Json
          finished_at?: string
          id?: string
          owner_id?: string
          saved_at?: string
          started_at?: string
          summary?: Json
          tool_id?: string
          updated_at?: string
        }
        Relationships: []
      }
```

- [ ] **Step 4: Verde**: `npx vitest run src/lib/play/core/sync.test.ts` y `npx tsc --noEmit` — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/core/sync.ts src/lib/play/core/sync.test.ts src/lib/play/core/play-games-api.ts src/lib/supabase/database.types.ts
git commit -m "feat(play): sincronizador de guardadas con adaptador supabase"
```

---

### Task 7: Historial «Guardadas» + adopción en `/partidas`

**Files:**
- Create: `src/components/play/saved-games.tsx`
- Modify: `src/app/partidas/page.tsx` (sección nueva bajo `<ToolGrid />`)
- Modify: `messages/es.json` (claves `play.saved.*`)

**Interfaces:**
- Consumes: `listSaved`, `saveFinished`, `deleteSaved` (Task 3), `requestSavedSync`, `SAVED_CHANNEL_PREFIX` (Task 6), `SavedGameRecord`/`SavedGameSummary`, `PlaySheet` (`src/components/play/play-sheet.tsx` — mirar sus props reales antes de usar), `playTools[...].i18nKey` para el nombre de la herramienta.
- Produces: isla `<SavedGames identity={string} />`.

- [ ] **Step 1: Claves i18n** — en `messages/es.json`, dentro de `play`, añadir:

```json
"saved": {
  "title": "Guardadas",
  "empty": "Las partidas que guardes aparecerán aquí.",
  "pending": "Pendiente de subir",
  "players": "{count, plural, one {# jugador} other {# jugadores}}",
  "winner": "Ganó {name}",
  "winnerTie": "Empate",
  "detailTitle": "Partida guardada",
  "delete": "Eliminar partida",
  "deleteConfirm": "Se elimina del historial (y del servidor si estaba subida). ¿Seguro?",
  "adoptTitle": "{count, plural, one {# partida guardada} other {# partidas guardadas}} en este dispositivo",
  "adoptBody": "¿Añadirlas a tu cuenta?",
  "adopt": "Añadir a mi cuenta",
  "adoptDismiss": "Ahora no"
}
```

- [ ] **Step 2: Componente `saved-games.tsx`** ("use client"). Responsabilidades y forma (el implementador sigue los patrones visuales de `remembered-table-card.tsx` / filas del hub):

```tsx
"use client";

// Historial local-first (fase 5): lee SOLO IndexedDB — el sync de fondo la
// iguala al servidor y avisa por BroadcastChannel. Nunca espera a la red.
export function SavedGames({ identity }: { identity: string }) { ... }
```

Comportamiento exacto:
- Estado: `records: SavedGameRecord[] | null` (null = cargando, no pintar nada), `anonCount: number` (solo si `identity !== "anon"`), `selected: SavedGameRecord | null` (sheet de detalle).
- `reload()`: `listSaved(identity)` → filtrar `deletedAt === null` → ordenar `savedAt` desc → set. Si hay sesión, además `listSaved("anon")` → filtrar `deletedAt === null` → `setAnonCount(length)`.
- `useEffect` de montaje: `reload()`; `requestSavedSync(identity)`; suscribirse a `new BroadcastChannel(SAVED_CHANNEL_PREFIX + identity)` con `onmessage = reload`; listener `window "online"` → `requestSavedSync(identity)`. Cleanup: cerrar canal y quitar listener.
- Si `records` vacío y sin banner: sección con `t("saved.title")` + `t("saved.empty")`.
- Fila (button, ancho completo): nombre de herramienta (`t(playTools[summary.toolId].i18nKey + ".name")` — comprobar la clave real que usa `tool-grid.tsx` y reutilizarla), fecha (`new Date(savedAt).toLocaleDateString()`), ganador (`summary.winners.length === 1` → `t("saved.winner", { name: summary.participants[summary.winners[0]].name })`; varios → `t("saved.winnerTie")`), `t("saved.players", { count: summary.participants.length })`, duración (`formatDuration(summary.durationMs)` — helper local: horas y minutos, `1 h 38 min` / `12 min`), badge `t("saved.pending")` si `syncStatus === "pending" && identity !== "anon"`.
- Sheet de detalle (`PlaySheet`, mismo uso que en `game-sheet.tsx`): ranking completo (posición + nombre, con los datos de `summary.ranking` y `summary.participants`), extras por herramienta desde `summary.tool` (mtg: modo y comandante del ganador si existe; score: totales), duración y fecha, y botón eliminar.
- Eliminar: `window.confirm(t("saved.deleteConfirm"))`; si `syncStatus === "pending"` → `deleteSaved(gameId)` directo (nunca subió); si no → `saveFinished({ ...record, deletedAt: Date.now() })` (tombstone). Después: cerrar sheet, `reload()`, `requestSavedSync(identity)`.
- Banner de adopción (encima de la lista, solo si `identity !== "anon" && anonCount > 0` y no descartado en este montaje): `t("saved.adoptTitle", { count })` + `t("saved.adoptBody")`, botones `adopt` / `adoptDismiss`. Adopt: `const anon = await listSaved("anon")`; para cada registro sin tombstone `await saveFinished({ ...record, identity, syncStatus: "pending" })` (el keyPath es `gameId`: re-etiquetar identidad es un put); luego `reload()` + `requestSavedSync(identity)`. Dismiss: `useState` local, reaparece en la próxima visita (spec §7).

- [ ] **Step 3: Wiring en `page.tsx`** — añadir junto al patrón del Banner existente:

```tsx
async function Saved() {
  await connection();
  const user = await getCurrentUser();
  return <SavedGames identity={user?.id ?? "anon"} />;
}
```

y bajo `<ToolGrid />`:

```tsx
      <div className="mt-8">
        <Suspense fallback={null}>
          <Saved />
        </Suspense>
      </div>
```

- [ ] **Step 4: Verificar a mano**: `npm run build` pasa; `next dev` (puerto 3000, matar viejos), partida score rápida → guardar → aparece en Guardadas; borrar la quita.

- [ ] **Step 5: Commit**

```bash
git add src/components/play/saved-games.tsx src/app/partidas/page.tsx messages/es.json
git commit -m "feat(play): historial Guardadas local-first con adopcion en /partidas"
```

---

### Task 8: E2e + docs de cierre + prod

**Files:**
- Create: `e2e/partidas-guardadas.spec.ts`
- Modify: `docs/requirements/backlog.md` (casilla fase 5), `docs/requirements/decisiones.md` (append; usar heredoc Bash, los here-strings de PowerShell los bloquea el hook)

**Interfaces:**
- Consumes: patrón de partida score rápida de `e2e/partidas-puntuacion.spec.ts` (setup libre → puntuar ronda → finalizar) y helpers de `e2e/support/play-db.ts`.

- [ ] **Step 1: Spec e2e** (anon, sin red de Supabase implicada — el sync es no-op sin sesión):

```ts
// Fase 5: historial «Guardadas» local-first. Anon: guardar es local, sin badge
// de subida y sin banner de adopción (spec §6-7).
test("guardar una partida la lleva al historial; borrarla la quita", async ({ page }) => {
  // 1. jugar partida score mínima (copiar el arranque del spec de puntuación:
  //    /partidas/puntuacion/nueva → empezar → puntuar una ronda → finalizar)
  // 2. en el resumen, pulsar Guardar → aterriza en /partidas
  await expect(page.getByRole("heading", { name: "Guardadas" })).toBeVisible();
  const fila = page.getByRole("button", { name: /Ganó/ });
  await expect(fila).toBeVisible();
  await expect(page.getByText("Pendiente de subir")).toHaveCount(0); // anon: sin badge
  await expect(page.getByText(/partidas? guardadas? en este dispositivo/)).toHaveCount(0); // sin banner
  // 3. abrir detalle → eliminar (aceptar el confirm con page.on("dialog"))
  await fila.click();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Eliminar partida" }).click();
  await expect(page.getByText("Las partidas que guardes aparecerán aquí.")).toBeVisible();
});
```

(Trampa conocida: tras navegación blanda el DOM previo congelado sigue consultable — usar `filter({ visible: true })` o `exact` si un selector duplica.)

- [ ] **Step 2: Correr**: `fnm use 22; npm run test:e2e -- partidas-guardadas` (reutiliza el dev server existente) — PASS. Correr también el resto de specs de play: `npm run test:e2e -- partidas` — sin regresiones.

- [ ] **Step 3: Aplicar migración en PROD** (controlador, tras e2e verdes) y verificar `pg_class`/`pg_policies` igual que en dev.

- [ ] **Step 4: Docs** — backlog: marcar la casilla de fase 5 de BiblioPlay. decisiones.md (append-only, al final):

```
## 2026-08-30 — Play fase 5: espejo local como fuente del historial
- La UI de «Guardadas» lee SOLO IndexedDB; un sincronizador de fondo (push/pull)
  la iguala a `play_games`. El servidor manda sobre lo synced; un pending local
  jamás es pisado por el pull.
- Una tabla JSONB (log íntegro en `events`) en vez de eventos por filas: las
  filas por evento solo pagan cuando llegue el multiplayer (fase 9).
- Adopción de partidas anon: banner explícito al entrar, nunca automática.
```

- [ ] **Step 5: Issues de límites asumidos** (spec §10), cada una con sus tres etiquetas:

```sh
gh issue create --label "area:play,tipo:deuda,P2" --title "play: pull de guardadas sin paginación" --body "..."
gh issue create --label "area:play,tipo:deuda,P2" --title "play: el espejo de guardadas no se purga en logout" --body "..."
gh issue create --label "area:play,tipo:deuda,P3" --title "play: adopción sin «no volver a preguntar»" --body "..."
```

- [ ] **Step 6: Commit**

```bash
git add e2e/partidas-guardadas.spec.ts docs/requirements/backlog.md docs/requirements/decisiones.md
git commit -m "test(play): e2e del historial de guardadas + docs de cierre fase 5"
```

---

## Self-review del plan

- **Cobertura de la spec:** §2 tabla+RLS → Task 1; §4 summary → Task 2; §3 espejo v2+migración → Tasks 3–4; §5 sync → Tasks 5–6; §6 historial → Task 7; §7 adopción → Task 7; §8 errores → Tasks 5–6 (tests de fallo); §9 → tests por task + Task 8; §10 → Tasks 1 y 8.
- **Placeholders:** los «...» de los cuerpos de issue en Task 8 los redacta el implementador con el formato de issues del repo (qué falla/limita, qué SÍ funciona); no son código.
- **Consistencia de tipos:** `SavedGameRecord` v2 idéntico en Tasks 3/5; `PlayGameRow` sin `owner_id` (lo inyecta el adaptador, Task 6); `planSync`/`rowFromRecord`/`recordFromRow` firmas iguales en Tasks 5–6.
