# BiblioPlay Fase 6 — Jugadores habituales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jugadores habituales persistentes (crear desde el setup, elegir con chips, gestionar desde el hub), con tabla `play_players` + espejo IndexedDB sincronizado con el motor genérico de fase 5.

**Architecture:** `planSync` y el ejecutor de fase 5 se generalizan a «registro espejo» (`{syncStatus, deletedAt}` + clave) y se instancian dos veces: guardadas (API intacta) y jugadores (almacén IDB `players`, DB v3, tabla nueva). `Participant` regular gana `playerId`; los setups ofrecen chips y «Recordar»; el hub gana el sheet «Tus jugadores». Spec: `docs/superpowers/specs/2026-08-31-play-fase-6-habituales-design.md`.

**Tech Stack:** Next.js app router, IndexedDB, Supabase RLS, vitest, Playwright.

## Global Constraints

- `play_players` privada total: 4 políticas RLS `owner_id = (select auth.uid())`, grant de tabla entera a `authenticated`, nada fino por columna (#375). Regla #437: cero `use cache`.
- Habituales SOLO con sesión: sin sesión los setups y el hub quedan EXACTAMENTE como hoy (spec §1). `identity` de un PlayerRecord NUNCA es "anon".
- El sync de jugadores lleva las MISMAS guardas de fase 5: sesión viva verificada en selectAll, relectura antes de cada escritura local, fallo remoto → local intacto, nunca lanza (spec §4).
- Un pending JAMÁS es pisado por el pull; tombstone gana a todo hasta replicarse (semántica de fase 5, sin cambios).
- El summary y el log embeben COPIA del nombre: borrar/renombrar un habitual no toca partidas guardadas (spec §5).
- Editar el texto de un asiento asignado a habitual lo degrada a invitado con ese texto; nunca renombra al habitual (spec §6).
- `linked_user_id` nace en la tabla pero NINGUNA lógica lo lee (spec §1).
- Tests: `fnm use 22` antes de vitest/playwright. Git: `git add` rutas explícitas, nunca `-A`. i18n solo `messages/es.json`.
- `runSavedSync`/`requestSavedSync`/`planSync` conservan comportamiento observable de fase 5: sus tests actuales deben seguir pasando con adaptaciones solo mecánicas (tipado/argumentos), nunca de semántica.

---

### Task 1: Migración SQL `play_players` + data-model.md

**Files:**
- Create: `supabase/migrations/20260894_play_players.sql`
- Modify: `docs/requirements/data-model.md` (subsección en «8. Play» + fecha)

**Interfaces:**
- Produces: tabla `public.play_players` (`id, owner_id, name, linked_user_id, created_at, updated_at`) — la usan Tasks 4 y el adaptador.

**Nota de entorno:** los MCP de Supabase pueden estar caídos; el fichero se escribe igual y la aplicación a dev/prod la hace el controlador (dev ahora; prod tras e2e, con anexo a `schema-baseline.sql` en la misma pasada — §11 de data-model).

- [ ] **Step 1: Escribir la migración**

```sql
-- Fase 6 de Play (#931): jugadores habituales — personas persistentes del
-- entorno del usuario, sin cuenta Biblioshare. Privada total por RLS.
-- linked_user_id queda listo para la vinculación futura (acción explícita,
-- jamás matching automático); NINGUNA lógica lo lee todavía.
create table public.play_players (
  id uuid primary key,                    -- generado en cliente (crypto.randomUUID)
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  linked_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index play_players_owner on public.play_players (owner_id);

alter table public.play_players enable row level security;

create policy "play_players_select" on public.play_players
  for select using (owner_id = (select auth.uid()));
create policy "play_players_insert" on public.play_players
  for insert with check (owner_id = (select auth.uid()));
create policy "play_players_update" on public.play_players
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "play_players_delete" on public.play_players
  for delete using (owner_id = (select auth.uid()));

-- Grant de TABLA ENTERA a propósito (nada de grant fino por columna, #375).
grant select, insert, update, delete on public.play_players to authenticated;
```

- [ ] **Step 2: data-model.md** — en la sección «8. Play», añadir subsección `play_players` (columnas, 4 políticas, nota de grant entero y de `linked_user_id` dormido), estado «dev 2026-08-31; prod pendiente de e2e», y actualizar la fecha de cabecera del doc.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260894_play_players.sql docs/requirements/data-model.md
git commit -m "feat(play): tabla play_players con RLS por ownership (fase 6)"
```

---

### Task 2: `planSync` y ejecutor genéricos (refactor sin cambio de semántica)

**Files:**
- Modify: `src/lib/play/core/sync.ts`
- Test: `src/lib/play/core/sync.test.ts` (adaptaciones mecánicas SOLO si el tipado lo exige)

**Interfaces:**
- Produces (los usan Tasks 4 y el código existente de guardadas):

```ts
export type MirrorRecord = { syncStatus: "pending" | "synced"; deletedAt: number | null };

export type SyncPlan<L, R> = {
  deleteRemote: string[];
  dropLocal: string[];
  push: L[];
  adoptLocal: R[];
  deleteLocal: string[];
};

export function planSync<L extends MirrorRecord, R extends { id: string }>(
  local: L[],
  remote: R[],
  localId: (record: L) => string,
): SyncPlan<L, R>;

// Operaciones de espejo que el ejecutor genérico necesita de cada dominio.
export type MirrorStore<L extends MirrorRecord, R extends { id: string }> = {
  list(identity: string): Promise<L[]>;
  read(id: string): Promise<L | null>;
  put(record: L): Promise<boolean>;
  remove(id: string): Promise<void>;
  localId(record: L): string;
  toRow(record: L): R;
  fromRow(row: R, identity: string): L;
  channelPrefix: string;
};

export type MirrorApi<R> = {
  selectAll(): Promise<{ rows: R[] } | { error: true }>;
  upsert(rows: R[]): Promise<{ error: boolean }>;
  remove(ids: string[]): Promise<{ error: boolean }>;
};

export async function runMirrorSync<L extends MirrorRecord, R extends { id: string }>(
  identity: string,
  api: MirrorApi<R>,
  store: MirrorStore<L, R>,
): Promise<void>;

// La API pública de fase 5 NO cambia:
export function runSavedSync(identity: string, api: PlayGamesApi): Promise<void>; // = runMirrorSync con el store de guardadas
export function requestSavedSync(identity: string): void;
export type PlayGamesApi = MirrorApi<PlayGameRow>;
```

- [ ] **Step 1: Refactor en `sync.ts`** — mover el cuerpo actual de `planSync` a la firma genérica (la única diferencia real: `record.gameId` pasa a `localId(record)`); mover el cuerpo de `runSavedSync` a `runMirrorSync` parametrizado por `MirrorStore` (las guardas de relectura usan `store.read`/`store.put`/`store.remove` y `store.localId`; la notificación usa `store.channelPrefix`). Definir el store de guardadas:

```ts
const savedStore: MirrorStore<SavedGameRecord, PlayGameRow> = {
  list: listSaved,
  read: readSaved,
  put: saveFinished,
  remove: deleteSaved,
  localId: (record) => record.gameId,
  toRow: rowFromRecord,
  fromRow: recordFromRow,
  channelPrefix: SAVED_CHANNEL_PREFIX,
};

export function runSavedSync(identity: string, api: PlayGamesApi): Promise<void> {
  return runMirrorSync(identity, api, savedStore);
}
```

El candado `inFlight`/`requestSavedSync` no cambia. El comentario de cabecera de `planSync` se conserva (las reglas son las mismas). En `runMirrorSync`, el mark-synced del push escribe `{ ...current, syncStatus: "synced" } as L` (el spread sobre el releído conserva la guarda I2 de fase 5).

- [ ] **Step 2: Adaptar llamadas en tests** — `planSync(local, remote)` pasa a `planSync(local, remote, (r) => r.gameId)` en `sync.test.ts`. NINGÚN valor esperado cambia.

- [ ] **Step 3: Verificar sin regresión**: `fnm use 22; npx vitest run src/lib/play` — los 267 existentes verdes (los tests de runSavedSync pasan sin tocar su semántica). `npx tsc --noEmit` limpio.

- [ ] **Step 4: Commit**

```bash
git add src/lib/play/core/sync.ts src/lib/play/core/sync.test.ts
git commit -m "refactor(play): planSync y ejecutor de espejo genericos (preparacion fase 6)"
```

---

### Task 3: IndexedDB v3 — almacén `players` y CRUD

**Files:**
- Modify: `src/lib/play/core/db.ts`
- Test: `src/lib/play/core/db.test.ts`

**Interfaces:**
- Produces (los usan Tasks 4–7):

```ts
export type PlayerRecord = {
  playerId: string;            // = play_players.id
  identity: string;            // uid real; NUNCA "anon"
  v: 1;
  name: string;
  syncStatus: "pending" | "synced";
  deletedAt: number | null;
};
export const DB_VERSION = 3;
export function listPlayers(identity: string): Promise<PlayerRecord[]>;
export function readPlayer(playerId: string): Promise<PlayerRecord | null>;
export function putPlayer(record: PlayerRecord): Promise<boolean>;
export function deletePlayer(playerId: string): Promise<void>;
```

- [ ] **Step 1: Tests que fallan** (patrón de aislamiento del fichero existente):

```ts
describe("players (fase 6)", () => {
  it("putPlayer/listPlayers aíslan por identidad y deletePlayer borra", async () => {
    await putPlayer(playerRecord({ playerId: "j1", identity: "uid-1", name: "Pablo" }));
    await putPlayer(playerRecord({ playerId: "j2", identity: "uid-2", name: "Otro" }));
    expect((await listPlayers("uid-1")).map((p) => p.name)).toEqual(["Pablo"]);
    await deletePlayer("j1");
    expect(await listPlayers("uid-1")).toEqual([]);
  });

  it("readPlayer devuelve null si no existe", async () => {
    expect(await readPlayer("nadie")).toBeNull();
  });

  it("migración v2→v3: crea el almacén players sin tocar las guardadas", async () => {
    // sembrar BD versión 2 con un SavedGameRecord v2 (open(DB_NAME, 2) a mano,
    // crear active/saved como en v2, insertar, cerrar), reabrir con el módulo:
    // listSaved conserva el registro y listPlayers devuelve [] sin error.
  });
});
```

`playerRecord(overrides)` = helper local con `{ v: 1, syncStatus: "pending", deletedAt: null, ...overrides }`.

- [ ] **Step 2: Ver fallar**: `npx vitest run src/lib/play/core/db.test.ts` — FAIL.

- [ ] **Step 3: Implementar** — `DB_VERSION = 3`; en `onupgradeneeded` añadir (los `contains` existentes ya hacen el resto idempotente):

```ts
        if (!db.objectStoreNames.contains("players")) {
          const players = db.createObjectStore("players", { keyPath: "playerId" });
          players.createIndex("identity", "identity");
        }
```

CRUD calcado del estilo de `listSaved`/`readSaved`/`saveFinished`/`deleteSaved` (defensivo: sin BD → `[]`/`null`/`false`/no-op), sobre el almacén `players` y su índice `identity`.

- [ ] **Step 4: Verde**: `npx vitest run src/lib/play/core/db.test.ts` y `npx vitest run src/lib/play` + `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/core/db.ts src/lib/play/core/db.test.ts
git commit -m "feat(play): almacen players en el espejo local (IDB v3)"
```

---

### Task 4: Sync de jugadores — filas, ejecutor instanciado, adaptador, candado

**Files:**
- Create: `src/lib/play/core/players-sync.ts`
- Create: `src/lib/play/core/play-players-api.ts`
- Modify: `src/lib/supabase/database.types.ts` (tabla `play_players`, orden alfabético)
- Test: `src/lib/play/core/players-sync.test.ts`

**Interfaces:**
- Consumes: `runMirrorSync`, `MirrorStore`, `MirrorApi`, `planSync` (Task 2); CRUD de `players` (Task 3); `createClient` de `@/lib/supabase/client`.
- Produces (los usan Tasks 6–7):

```ts
// players-sync.ts
export type PlayPlayerRow = { id: string; name: string };
export const PLAYERS_CHANNEL_PREFIX = "biblioshare:play:players:";
export function runPlayersSync(identity: string, api: MirrorApi<PlayPlayerRow>): Promise<void>;
export function requestPlayersSync(identity: string): void; // no-op anon/offline, candado propio
// play-players-api.ts
export function createPlayPlayersApi(ownerId: string): MirrorApi<PlayPlayerRow>;
```

- [ ] **Step 1: Tests que fallan** (`players-sync.test.ts`; doble `fakeApi` como el de `sync.test.ts` pero con `PlayPlayerRow`):

```ts
describe("runPlayersSync", () => {
  it("push de pending: sube y marca synced", async () => { /* putPlayer pending → runPlayersSync → fila en remoto, local synced */ });
  it("rename pendiente: el upsert lleva el nombre nuevo", async () => { /* putPlayer synced, luego putPlayer {name: "Nuevo", pending} → runPlayersSync → remoto tiene "Nuevo" */ });
  it("tombstone: borra remoto y local; remove fallido deja el tombstone", async () => { /* como fase 5 */ });
  it("pull: adopta remotos nuevos como synced y borra los synced ausentes", async () => { /* como fase 5 */ });
  it("rename hecho DURANTE la pasada no se pisa al marcar synced", async () => {
    // upsert del doble escribe putPlayer({name: "Cambiado", syncStatus: "pending"}) antes de resolver;
    // al acabar la pasada el registro local conserva name "Cambiado"... y sigue pending o synced?
    // Regla (heredada del runMirrorSync genérico): el mark-synced escribe {...current, syncStatus: "synced"}
    // sobre el RELEÍDO → conserva "Cambiado" pero lo marca synced; el remoto tiene el nombre viejo.
    // Aserción: name === "Cambiado" (no se pierde el rename). El desfase remoto se corrige en la
    // siguiente pasada SOLO si sigue pending — por eso la aserción fuerte es: si el releído difiere
    // del empujado (name distinto), NO marcar synced (dejar pending). Ver Step 3.
  });
  it("selectAll con error: no toca nada local", async () => { /* como fase 5 */ });
});
```

- [ ] **Step 2: Ver fallar**, luego **Step 3: implementar**.

`players-sync.ts`:

```ts
import type { MirrorApi, MirrorStore } from "./sync";
import { runMirrorSync } from "./sync";
import { deletePlayer, listPlayers, putPlayer, readPlayer, type PlayerRecord } from "./db";

export type PlayPlayerRow = { id: string; name: string };
export const PLAYERS_CHANNEL_PREFIX = "biblioshare:play:players:";

const playersStore: MirrorStore<PlayerRecord, PlayPlayerRow> = {
  list: listPlayers,
  read: readPlayer,
  put: putPlayer,
  remove: deletePlayer,
  localId: (record) => record.playerId,
  toRow: (record) => ({ id: record.playerId, name: record.name }),
  fromRow: (row, identity) => ({
    playerId: row.id,
    identity,
    v: 1,
    name: row.name,
    syncStatus: "synced",
    deletedAt: null,
  }),
  channelPrefix: PLAYERS_CHANNEL_PREFIX,
};

export function runPlayersSync(identity: string, api: MirrorApi<PlayPlayerRow>): Promise<void> {
  return runMirrorSync(identity, api, playersStore);
}

// Candado gemelo de requestSavedSync (no se comparte el Map: una pasada de
// jugadores no debe bloquear ni re-lanzar una de guardadas).
const inFlight = new Map<string, { rerun: boolean }>();

export function requestPlayersSync(identity: string): void {
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
        const { createPlayPlayersApi } = await import("./play-players-api");
        await runPlayersSync(identity, createPlayPlayersApi(identity));
      } while (entry.rerun);
    } finally {
      inFlight.delete(identity);
    }
  })();
}
```

**Ajuste al genérico que exige el test del rename (Task 2 lo deja preparado, aquí se endurece):** en `runMirrorSync`, el mark-synced del push compara el releído con lo empujado — si difieren (el usuario editó durante el vuelo), NO se marca synced:

```ts
const current = await store.read(store.localId(record));
if (current === null || current.deletedAt !== null) continue;
if (JSON.stringify(store.toRow(current)) !== JSON.stringify(store.toRow(record))) continue; // editado en vuelo: sigue pending
await store.put({ ...current, syncStatus: "synced" });
```

(Para guardadas es inerte — un SavedGameRecord no se edita tras guardarse — y para jugadores cierra el rename-en-vuelo. Añadir la comparación en Task 2 directamente si se prefiere; los tests de fase 5 no la notan.)

`play-players-api.ts` (calcado de `play-games-api.ts`, con su misma guarda de sesión viva y `updated_at` fresco):

```ts
import { createClient } from "@/lib/supabase/client";
import type { MirrorApi } from "./sync";
import type { PlayPlayerRow } from "./players-sync";

export function createPlayPlayersApi(ownerId: string): MirrorApi<PlayPlayerRow> {
  const client = createClient();
  return {
    async selectAll() {
      // Guarda de sesión viva (fase 5, hallazgo I1): la identidad renderizada
      // puede no ser ya la de las cookies; sin esto, el pull contaminaría el
      // espejo de otra cuenta.
      const { data: userData } = await client.auth.getUser();
      if (userData.user?.id !== ownerId) return { error: true };
      const { data, error } = await client.from("play_players").select("id, name");
      if (error || data === null) return { error: true };
      return { rows: data as PlayPlayerRow[] };
    },
    async upsert(rows) {
      const { error } = await client.from("play_players").upsert(
        rows.map((row) => ({ ...row, owner_id: ownerId, updated_at: new Date().toISOString() })),
      );
      return { error: error !== null };
    },
    async remove(ids) {
      const { error } = await client.from("play_players").delete().in("id", ids);
      return { error: error !== null };
    },
  };
}
```

`database.types.ts` — bloque `play_players` entre `play_games` y `post_preferences`, misma forma que las vecinas (Row/Insert/Update; `linked_user_id: string | null` y opcional en Insert/Update; `created_at`/`updated_at` opcionales en Insert).

- [ ] **Step 4: Verde**: `npx vitest run src/lib/play/core/players-sync.test.ts src/lib/play` + `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/core/players-sync.ts src/lib/play/core/players-sync.test.ts src/lib/play/core/play-players-api.ts src/lib/play/core/sync.ts src/lib/supabase/database.types.ts
git commit -m "feat(play): sync de jugadores habituales sobre el motor de espejo"
```

---

### Task 5: Dominio — `Participant` regular con `playerId`, drafts y summary

**Files:**
- Modify: `src/lib/play/core/types.ts` (Participant, SavedParticipant)
- Modify: `src/lib/play/tools.ts` (buildSavedSummary copia playerId)
- Modify: `src/lib/play/ui/setup-draft.ts` (DraftPlayer.playerId, updatePlayer degrada, toSetup, draftFromSetup)
- Modify: `src/components/play/score/score-setup-form.tsx` (draft de score: playerId + mismas reglas)
- Test: `src/lib/play/ui/setup-draft.test.ts`, `src/lib/play/tools.test.ts`

**Interfaces:**
- Produces:

```ts
// core/types.ts
export type Participant =
  | { id: string; kind: "user"; name: string; userId: string }
  | { id: string; kind: "regular"; name: string; playerId: string }
  | { id: string; kind: "guest"; name: string };
export type SavedParticipant = {
  kind: "user" | "regular" | "guest";
  name: string;
  userId?: string;
  playerId?: string; // solo kind regular
};
// setup-draft.ts
export type DraftPlayer = { id: string; name: string; deckName: string; commanders: DraftCommander[]; cardBackground?: string; playerId?: string };
export function assignRegular(draft: SetupDraft, index: number, player: { playerId: string; name: string }): SetupDraft;
```

- [ ] **Step 1: Tests que fallan** (`setup-draft.test.ts`, añadir describe):

```ts
describe("habituales en el borrador (fase 6)", () => {
  it("assignRegular fija nombre y playerId; toSetup emite kind regular", () => {
    const draft = assignRegular(newDraft("commander"), 0, { playerId: "j1", name: "Pablo" });
    expect(draft.players[0]).toMatchObject({ name: "Pablo", playerId: "j1" });
    const setup = toSetup(draft, (i) => `J${i + 1}`);
    expect(setup.participants[0]).toMatchObject({ kind: "regular", name: "Pablo", playerId: "j1" });
    expect(setup.participants[1].kind).toBe("guest");
  });

  it("editar el nombre de un asiento asignado lo degrada a invitado", () => {
    const draft = assignRegular(newDraft("commander"), 0, { playerId: "j1", name: "Pablo" });
    const edited = updatePlayer(draft, 0, { name: "Pablo M" });
    expect(edited.players[0].playerId).toBeUndefined();
    expect(toSetup(edited, (i) => `J${i + 1}`).participants[0].kind).toBe("guest");
  });

  it("editar el mazo NO degrada (solo el nombre identifica)", () => {
    const draft = assignRegular(newDraft("commander"), 0, { playerId: "j1", name: "Pablo" });
    expect(updatePlayer(draft, 0, { deckName: "Vampiros" }).players[0].playerId).toBe("j1");
  });

  it("draftFromSetup conserva playerId de los regular", () => {
    const setup = toSetup(assignRegular(newDraft("commander"), 0, { playerId: "j1", name: "Pablo" }), (i) => `J${i + 1}`);
    expect(draftFromSetup(setup).players[0].playerId).toBe("j1");
  });
});
```

En `tools.test.ts`: un participante `{ kind: "regular", playerId: "j1" }` en el fixture → `buildSavedSummary` lo copia (`participants[i].playerId === "j1"`), y guest/user siguen sin la clave (`"playerId" in p === false`).

- [ ] **Step 2: Ver fallar**: `npx vitest run src/lib/play/ui/setup-draft.test.ts src/lib/play/tools.test.ts` — FAIL.

- [ ] **Step 3: Implementar**:

`core/types.ts`: la unión de tres brazos de arriba (documentar: regular referencia a `play_players`; la copia del nombre viaja embebida — renombrar/borrar el habitual no toca logs ni summaries). `SavedParticipant.playerId?`.

`tools.ts` — `buildSavedSummary`, rama de mapeo:

```ts
    participants: state.setup.participants.map((p) => {
      if (p.kind === "user") return { kind: p.kind, name: p.name, userId: p.userId };
      if (p.kind === "regular") return { kind: p.kind, name: p.name, playerId: p.playerId };
      return { kind: p.kind, name: p.name };
    }),
```

`setup-draft.ts`:

```ts
export function assignRegular(
  draft: SetupDraft,
  index: number,
  player: { playerId: string; name: string },
): SetupDraft {
  const players = draft.players.map((p, i) =>
    i === index ? { ...p, name: player.name, playerId: player.playerId } : p,
  );
  return { ...draft, players };
}
```

`updatePlayer`: si `patch.name !== undefined` y el asiento tiene `playerId`, el resultado pierde `playerId` (degrada; regla visible de la spec §6). `toSetup`: `player.playerId ? { id, kind: "regular", name: trimmed(player.name) ?? fallbackName(i), playerId: player.playerId, deckName..., commanders..., cardBackground } : { ...como hoy }` — ojo: `MtgParticipant = Participant & {...}`, el brazo regular lleva también los campos mtg. `draftFromSetup`: copia `playerId` si `participant.kind === "regular"`.

`score-setup-form.tsx` (draft local del fichero): `players: { id, name, playerId? }`; `updatePlayerName` degrada igual; `toScoreSetup` emite regular cuando hay playerId; el prefill de revancha (`draftFromScoreSetup` o equivalente del fichero) copia playerId.

- [ ] **Step 4: Verde**: `npx vitest run src/lib/play` + `npx tsc --noEmit` (arreglar los usos que el nuevo brazo rompa — p. ej. asignaciones `kind: "regular"` sin playerId en tests viejos, si las hay).

- [ ] **Step 5: Commit**

```bash
git add src/lib/play/core/types.ts src/lib/play/tools.ts src/lib/play/tools.test.ts src/lib/play/ui/setup-draft.ts src/lib/play/ui/setup-draft.test.ts src/components/play/score/score-setup-form.tsx
git commit -m "feat(play): participante regular con playerId de punta a punta"
```

---

### Task 6: Chips + «Recordar» en los setups

**Files:**
- Create: `src/lib/play/ui/regular-chips.ts` (lógica pura)
- Create: `src/lib/play/core/use-players.ts` (hook de espejo)
- Create: `src/components/play/regular-picker.tsx` (chips + botón Recordar por asiento)
- Modify: `src/components/play/setup-form.tsx`, `src/components/play/score/score-setup-form.tsx` (montar el picker bajo cada asiento)
- Modify: `messages/es.json` (`play.players.*`, parte de setup)
- Test: `src/lib/play/ui/regular-chips.test.ts`

**Interfaces:**
- Consumes: `listPlayers`, `PlayerRecord` (Task 3), `requestPlayersSync`, `PLAYERS_CHANNEL_PREFIX` (Task 4), `assignRegular` (Task 5), `putPlayer`.
- Produces:

```ts
// regular-chips.ts
export function chipSuggestions(players: PlayerRecord[], takenIds: string[], query: string): PlayerRecord[];
export function canRemember(players: PlayerRecord[], query: string): boolean;
// use-players.ts
export function usePlayers(identity: string): { players: PlayerRecord[]; reload(): void };
// players = [] para anon; espejo vivo (canal + online + sync al montar). reload lo usa la
// gestión (Task 7) para reflejar renombrar/borrar sin esperar al canal; el picker lo ignora.
// regular-picker.tsx
export function RegularPicker(props: {
  identity: string;
  players: PlayerRecord[];        // de usePlayers, lo baja el form (una sola suscripción por pantalla)
  takenIds: string[];             // playerIds ya sentados en la mesa
  query: string;                  // texto actual del input del asiento
  assigned: boolean;              // el asiento ya tiene habitual (oculta chips y Recordar)
  onPick(player: { playerId: string; name: string }): void;
  onRemembered(player: { playerId: string; name: string }): void; // tras crear con Recordar
}): ReactNode | null;
```

- [ ] **Step 1: Tests de la lógica pura** (fallan primero):

```ts
describe("chipSuggestions", () => {
  const players = [p("j1", "Pablo"), p("j2", "Paula"), p("j3", "Marta")]; // p() = PlayerRecord mínimo
  it("excluye a los ya sentados y a los tombstone", () => {
    expect(chipSuggestions([...players, { ...p("j4", "Borrado"), deletedAt: 1 }], ["j2"], "").map((x) => x.playerId))
      .toEqual(["j1", "j3"]);
  });
  it("filtra por prefijo de palabra, case/acentos-insensible", () => {
    expect(chipSuggestions(players, [], "pa").map((x) => x.name)).toEqual(["Pablo", "Paula"]);
    expect(chipSuggestions(players, [], "MAR").map((x) => x.name)).toEqual(["Marta"]);
  });
  it("query vacía muestra todos los disponibles (descubribilidad)", () => {
    expect(chipSuggestions(players, [], "").length).toBe(3);
  });
});

describe("canRemember", () => {
  it("true con texto no vacío que no coincide exacto con un habitual", () => {
    expect(canRemember([p("j1", "Pablo")], "Pablo M")).toBe(true);
  });
  it("false con vacío o coincidencia exacta (case-insensible)", () => {
    expect(canRemember([p("j1", "Pablo")], "")).toBe(false);
    expect(canRemember([p("j1", "Pablo")], "  pablo ")).toBe(false);
  });
});
```

Normalización: `s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")`; «prefijo de palabra» = alguna palabra del nombre empieza por la query normalizada.

- [ ] **Step 2: Implementar la lógica pura y verla verde.**

- [ ] **Step 3: Hook `usePlayers`** — `useSyncExternalStore` NO hace falta; patrón simple de estado + efectos (como `saved-games.tsx`): estado `PlayerRecord[]`, en el efecto de montaje `reload()` (= `listPlayers(identity)` filtrando `deletedAt === null`), `requestPlayersSync(identity)`, canal `PLAYERS_CHANNEL_PREFIX + identity` con `onmessage = reload`, listener `online` → `requestPlayersSync`. `identity === "anon"` → `players: []` sin efectos de red. Devuelve `{ players, reload }` (reload = la misma función del efecto, estable con useCallback). Cleanup completo.

- [ ] **Step 4: `RegularPicker`** — `null` si `identity === "anon"`, si `assigned`, o si (sin sugerencias y `!canRemember`). Chips: fila `flex flex-wrap gap-1.5` de botones pequeños (estilo chip del repo, `rounded-chip border`) con `chipSuggestions(players, takenIds, query)` limitado a 6; toque → `onPick`. «Recordar»: botón texto pequeño (`+ t("players.remember")`) visible si `canRemember(players, query)`; al pulsar: `const playerId = crypto.randomUUID(); await putPlayer({ playerId, identity, v: 1, name: query.trim(), syncStatus: "pending", deletedAt: null }); requestPlayersSync(identity); onRemembered({ playerId, name: query.trim() })`.

- [ ] **Step 5: Montarlo en los dos setups** — bajo el input de nombre de cada asiento: mtg (`setup-form.tsx`) con `onPick/onRemembered` → `setEdited(assignRegular(draft, index, player))`; score con su equivalente local. `takenIds` = playerIds presentes en el draft; `assigned` = el asiento tiene playerId; `query` = texto del input. El form monta UNA vez `usePlayers(identity)` y baja `players` por props. Los setups ya reciben `identity` — verificarlo; si el de mtg no lo recibe, pasarlo desde su página como hace score.

  **Degradación de prefill (spec §6):** al hidratar un draft desde mesa recordada, revancha o reconfiguración, los asientos cuyo `playerId` NO esté en `players` (habitual borrado) se limpian a invitado conservando el nombre — efecto en el form que corre cuando la lista ya cargó: `draft.players.some(p => p.playerId && !ids.has(p.playerId))` → `setEdited` con esos `playerId: undefined`. Cuidado con no pisar ediciones del usuario: correrlo una sola vez por hidratación (ref boolean).

- [ ] **Step 6: i18n** — en `play`, añadir:

```json
"players": {
  "remember": "Recordar como habitual",
  "chipsLabel": "Tus jugadores"
}
```

(El resto del namespace `players.*` llega en Task 7; no crear claves que esta task no use.)

- [ ] **Step 7: Verificación**: `npx vitest run src/lib/play` + `npx tsc --noEmit` + `npm run build`. Manual queda para el controlador.

- [ ] **Step 8: Commit**

```bash
git add src/lib/play/ui/regular-chips.ts src/lib/play/ui/regular-chips.test.ts src/lib/play/core/use-players.ts src/components/play/regular-picker.tsx src/components/play/setup-form.tsx src/components/play/score/score-setup-form.tsx messages/es.json
git commit -m "feat(play): chips de habituales y Recordar en los setups"
```

---

### Task 7: Sheet «Tus jugadores» en el hub

**Files:**
- Create: `src/components/play/players-manager.tsx`
- Modify: `src/app/partidas/page.tsx` (isla bajo la sección de guardadas, mismo patrón Suspense/connection)
- Modify: `messages/es.json` (resto de `play.players.*`)
- Test: cubierto por unit de Tasks 3–4; verificación de UI manual + e2e anon en Task 8

**Interfaces:**
- Consumes: `usePlayers` (Task 6), `putPlayer`, `deletePlayer`, `readPlayer` (Task 3), `requestPlayersSync` (Task 4), `PlaySheet`.
- Produces: `<PlayersManager identity={string} />` — `null` si `identity === "anon"`.

- [ ] **Step 1: Componente** ("use client"). Con sesión: tarjeta/entrada «Tus jugadores» (contador de habituales; visible también vacía — descubribilidad, spec §6) que abre un PlaySheet con:
  - Lista de habituales (de `usePlayers`), cada fila: nombre + badge «Pendiente de subir» si `syncStatus === "pending"` + acciones renombrar/eliminar.
  - **Renombrar**: la fila pasa a input (estado local `editing: playerId | null`) precargado; confirmar → `putPlayer({ ...record, name: nuevo.trim(), syncStatus: "pending" })` + `requestPlayersSync(identity)` (el hook refresca por canal; si el canal no llega —pasada sin cambios—, forzar reload local: el propio `usePlayers` debe exponer... NO: más simple, `putPlayer` no notifica — tras confirmar, actualizar el estado local del sheet con el registro nuevo directamente y dejar que el canal reconcilie). Nombre vacío no confirma.
  - **Eliminar**: `window.confirm(t("players.deleteConfirm"))`; si `syncStatus === "pending"` y nunca subió → `deletePlayer(playerId)`; si no → `putPlayer({ ...record, deletedAt: Date.now() })`; después `requestPlayersSync(identity)`.
  - Vacío: `t("players.empty")`.

  Nota de estado: para que renombrar/borrar se reflejen al instante sin esperar al canal, `usePlayers` (Task 6) expone también `reload` — ajustar su firma a `{ players, reload }` en Task 6 si este componente lo necesita; el picker ignora `reload`.

- [ ] **Step 2: Wiring** — en `page.tsx`, dentro del mismo boundary `Saved()` o en uno gemelo (`await connection(); getCurrentUser()`), render `<PlayersManager identity={...} />` bajo `<SavedGames ... />`.

- [ ] **Step 3: i18n** — añadir a `play.players`:

```json
"title": "Tus jugadores",
"count": "{count, plural, =0 {Ninguno todavía} one {# jugador} other {# jugadores}}",
"empty": "Crea habituales desde una mesa con «Recordar como habitual», o desde aquí cuando montes la próxima.",
"pending": "Pendiente de subir",
"rename": "Renombrar",
"renameConfirm": "Guardar",
"delete": "Eliminar",
"deleteConfirm": "Sus partidas guardadas conservan su nombre. ¿Eliminar?"
```

(Ajustar `empty` si el sheet no permite crear — no lo permite en esta fase: crear es solo desde el setup. La clave de arriba ya lo dice así.)

- [ ] **Step 4: Verificación**: `npx tsc --noEmit` + `npm run build`. Manual del controlador después.

- [ ] **Step 5: Commit**

```bash
git add src/components/play/players-manager.tsx src/app/partidas/page.tsx messages/es.json src/lib/play/core/use-players.ts
git commit -m "feat(play): gestion de jugadores habituales en el hub"
```

---

### Task 8: E2e anon + docs de cierre + issues (+ prod, controlador)

**Files:**
- Modify: `e2e/partidas-puntuacion.spec.ts` O nuevo `e2e/partidas-habituales.spec.ts` (asserts anon)
- Modify: `docs/requirements/backlog.md`, `docs/requirements/decisiones.md` (append, heredoc Bash)

- [ ] **Step 1: E2e anon** (`e2e/partidas-habituales.spec.ts`): en `/partidas/puntuacion/nueva` y `/partidas/mtg/nueva` sin sesión NO existe el botón «Recordar como habitual» ni la fila de chips «Tus jugadores»; en `/partidas` no existe la tarjeta «Tus jugadores»; el flujo de empezar partida sigue intacto (arrancar una score libre y ver el tablero). Correr `fnm use 22; npm run test:e2e -- partidas` completo — sin regresiones.

- [ ] **Step 2: Docs** — backlog: casilla fase 6. decisiones.md (append):

```
## 2026-08-31 — Play fase 6: jugadores habituales
- Habituales solo con sesión: anon monta mesa con invitados, sin espejo anon ni adopción.
- El log y el summary embeben COPIA del nombre: renombrar/borrar un habitual no reescribe
  partidas guardadas. Las stats futuras agregan por playerId.
- planSync y el ejecutor de espejo son genéricos y los comparten guardadas y jugadores:
  un fix de reconciliación se hace UNA vez.
- Editar el nombre de un asiento asignado degrada a invitado; el habitual se renombra solo
  desde gestión (regla visible, sin renombrados por accidente).
```

- [ ] **Step 3: Issues** (3 etiquetas cada una):

```sh
gh issue create --label "area:play,tipo:deuda,P3" --title "play: rename de habitual entre dispositivos es ultimo-gana sin merge" --body "..."
gh issue create --label "area:play,tipo:acta,P3" --title "play: vinculacion habitual-usuario pendiente; linked_user_id existe y esta dormido" --body "..."
gh issue create --label "area:play,tipo:deuda,P3" --title "play: habituales invisibles para identidad anon (decision de fase 6)" --body "..."
```

(La segunda es `tipo:acta`: registra que NO se hizo a propósito y dónde quedó la columna.)

- [ ] **Step 4: Commit**

```bash
git add e2e/partidas-habituales.spec.ts docs/requirements/backlog.md docs/requirements/decisiones.md
git commit -m "test(play): e2e anon de habituales + docs de cierre fase 6"
```

- [ ] **Step 5 (controlador): prod** — aplicar `20260894_play_players.sql` en prod tras e2e verdes, verificar `pg_class`/`pg_policies`, anexar a `schema-baseline.sql` y actualizar `data-model.md` (dev y prod) en el mismo paso.

---

## Self-review del plan

- **Cobertura de spec:** §2 → Task 1; §3 → Task 3; §4 → Tasks 2+4; §5 → Task 5; §6 setup → Task 6, gestión → Task 7; §7 errores → heredados del genérico (tests Task 4); §8 → tests por task + Task 8; §9 → Tasks 1/8. Degradación de mesa recordada (spec §6, habitual borrado): cubierta por diseño — `draftFromSetup` copia `playerId` pero los chips excluyen borrados y `toSetup` no valida contra el espejo; el asiento con playerId de un habitual borrado sigue emitiendo regular con ese id (dato huérfano inofensivo: el summary embebe copia). Si se quiere degradar activamente, es una comprobación en el prefill de los forms contra `usePlayers` — se deja como Minor a juicio del reviewer de Task 6. **Corrección**: la spec pide degradar; Task 6 Step 5 DEBE incluirlo: al montar draft desde mesa recordada/revancha, `playerId`s no presentes en `usePlayers` se limpian (`{ ...player, playerId: undefined }`) cuando la lista de jugadores ya cargó.
- **Placeholders:** los `"..."` de issues (Task 8) los redacta el implementador; el test «rename hecho DURANTE la pasada» de Task 4 lleva su regla exacta en el Step 3.
- **Tipos:** `PlayerRecord`/`PlayPlayerRow`/`MirrorStore`/`MirrorApi` consistentes entre Tasks 2–7; `assignRegular` firma igual en Tasks 5–6; `usePlayers` devuelve `{ players, reload }` (Task 7 lo pide — Task 6 lo implementa así desde el principio y el picker usa solo `players`).
