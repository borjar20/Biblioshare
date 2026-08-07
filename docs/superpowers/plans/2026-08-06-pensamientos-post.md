# Pensamiento (post manual anclado) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un tipo de post autoral al feed —un «Pensamiento»: texto libre anclado a un item, saga o persona, con hilo de comentarios, reacciones multi-emoji, markdown-lite y spoiler.

**Architecture:** El Pensamiento es la primera fuente *autoral* del feed (hoy todo se deriva de acciones). Se añade una tabla `thoughts` que se enchufa como 6ª fuente del fan-out on-read de `getFeed`, y como una nueva clase de `interaction_targets` para reutilizar reacciones/comentarios. En paralelo, la capa de interacciones compartida pasa de un único `like` a una paleta de 4 emojis (el esquema ya lo soporta; sin migración de datos).

**Tech Stack:** Next.js (App Router, RSC + server actions), Supabase (Postgres + RLS), TypeScript, next-intl, Vitest (unit), Playwright (e2e). MCP: `supabase-dev` (migraciones dev primero), `supabase-prod` (después).

## Global Constraints

- **Esquema:** dev primero (`supabase-dev`), prod después. Verificar contra objetos reales (`pg_proc`/`pg_class`), NO el ledger de `list_migrations`.
- **Grants por columna (#375):** toda columna nueva necesita su grant fino o rompe la escritura ENTERA de la tabla (compila, revienta en prod). Correr superficie 6 de `docs/DRIFT-CHECK.md`.
- **Server actions:** NUNCA lanzar `Error` para fallos esperables — Next.js borra `.message` en prod. Devolver resultado discriminado `{ ok: true, ... } | { ok: false, error: string }`.
- **RLS = privacidad:** ningún `use cache` sobre datos filtrados por `auth.uid()` (fuga entre cuentas, #437). Los loaders de este plan NO usan `use cache`.
- **Cadenas de UI:** solo `es`. Añadir claves a `messages/es.json` (NO crear `en.json`). `t()` no cruza a componentes cliente: componer en servidor o pasar strings ya resueltos.
- **Acentos por tipo (Tailwind):** clases enteras, nunca interpoladas (el JIT no ve `bg-${x}`).
- **Tests que protegen:** provoca el bug y comprueba que el test se pone ROJO antes de implementarlo.
- **Cliente Supabase correcto:** `server.ts` en RSC/actions; `service-role.ts` solo servidor y salta RLS (usar únicamente donde el plan lo diga).
- Comandos: unit `npm test` · un fichero `npx vitest run <ruta>` · lint `npm run lint` · e2e `npm run test:e2e`.

---

## Mapa de ficheros

**Fase 1 — Reacciones multi-emoji (capa compartida, app-wide)**
- Modificar: `src/lib/social/interactions.ts` (tipos `ReactionKind`/`ReactionsByKind`; `InteractionSummary` e `InteractionComment` ganan `reactions`; agregación por kind en `getInteractionSummary`)
- Modificar: `src/lib/social/interaction-actions.ts` (`toggleReaction(id, kind)`)
- Modificar: `src/lib/social/interaction-optimistic.ts` (reducer por kind)
- Crear: `src/components/social/reaction-bar.tsx` (paleta reutilizable)
- Modificar: `src/components/social/review-interactions.tsx` (usa `ReactionBar` para target y comentarios)
- Modificar (pass-through de props): los 9 callers de `getInteractionSummary` que hoy leen `reactionCount`/`viewerReacted` siguen funcionando (campos derivados conservados) — no requieren cambio salvo que quieran pintar la paleta.
- Tests: `src/lib/social/interactions.test.ts`, `interaction-actions.test.ts`, `interaction-optimistic.test.ts`

**Fase 2 — Esquema `thoughts`**
- Migración (vía MCP `supabase-dev`): enum `thought_anchor_type`, tabla `thoughts`, clase `thought` en `interaction_targets`, trigger resolutor, RLS, grants
- Modificar: `docs/requirements/data-model.md` (documentar), regenerar `src/lib/supabase/database.types.ts`

**Fase 3 — Feed (6ª fuente)**
- Modificar: `src/lib/social/feed-order.ts` (`FEED_SOURCE_COLUMNS.thoughts`, `FeedSourceKey`)
- Modificar: `src/lib/social/feed.ts` (query, resolución de ancla, mapeo a evento)
- Crear: `src/lib/catalog/anchor.ts` (tipo `AnchorRef`, `anchorHref`, resolución de título/imagen por tipo)
- Tests: `src/lib/social/feed-order.test.ts` (o el fichero de orden existente), `src/lib/catalog/anchor.test.ts`

**Fase 4 — Compositor + `createThought`**
- Crear: `src/lib/social/thought-actions.ts` (`createThought`)
- Crear: `src/lib/social/anchor-search.ts` (autocompletado de ancla)
- Crear: `src/components/social/thought-composer.tsx` (modal + selector de ancla + markdown-lite + spoiler)
- Crear: `src/components/social/thought-composer-trigger.tsx` (botón que abre el modal)
- Modificar: sitio donde vive el trigger (cabecera del feed de Inicio, `src/app/(...)/page.tsx` del feed)
- Tests: `src/lib/social/thought-actions.test.ts`

**Fase 5 — Tarjeta e hilo + markdown-lite**
- Crear: `src/lib/social/rich-text.ts` (parser markdown-lite puro) + `rich-text.test.ts`
- Crear: `src/components/social/rich-text-view.tsx` (render de segmentos)
- Crear: `src/components/social/thought-card.tsx`
- Modificar: `src/lib/social/feed.ts` sólo si la tarjeta necesita un campo extra en el evento (ya cubierto en Fase 3)
- Modificar: el renderizador de entradas del feed para despachar `verb === "thought"` a `ThoughtCard`

**Fase 6 — E2E + cierre documental**
- Crear: `e2e/thoughts.spec.ts`
- Modificar: `docs/requirements/data-model.md` (fecha verif.), `docs/requirements/backlog.md`, `docs/requirements/decisiones.md`, issues de §8 de la spec

---

## FASE 1 — Reacciones multi-emoji (capa compartida)

> Primero y aislado. La capa queda verde antes de tocar nada de Pensamientos. Sin migración de datos: `reactions` ya es única por `(interaction_target_id, user_id, kind)` y las filas actuales son `kind:"like"`.

### Task 1.1: Tipos de reacción y forma de `InteractionSummary`/`InteractionComment`

**Files:**
- Modify: `src/lib/social/interactions.ts`
- Test: `src/lib/social/interactions.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ReactionKind = "like" | "read" | "shock" | "fire";
  export const REACTION_KINDS: readonly ReactionKind[]; // ["like","read","shock","fire"]
  export type ReactionTally = { count: number; viewerReacted: boolean };
  export type ReactionsByKind = Record<ReactionKind, ReactionTally>;
  export function emptyReactions(): ReactionsByKind;
  // InteractionSummary gana:   reactions: ReactionsByKind
  // InteractionComment gana:   reactions: ReactionsByKind
  // Se CONSERVAN reactionCount (= suma de counts) y viewerReacted (= algún kind activo) como derivados.
  ```

- [ ] **Step 1: Escribe el test que falla** (añádelo a `interactions.test.ts`)

```ts
import { REACTION_KINDS, emptyReactions } from "./interactions";

test("emptyReactions da las 4 kinds a cero", () => {
  const r = emptyReactions();
  expect(REACTION_KINDS).toEqual(["like", "read", "shock", "fire"]);
  for (const k of REACTION_KINDS) expect(r[k]).toEqual({ count: 0, viewerReacted: false });
});
```

- [ ] **Step 2: Corre y verifica que falla**

Run: `npx vitest run src/lib/social/interactions.test.ts -t "emptyReactions"`
Expected: FAIL (`emptyReactions is not a function`).

- [ ] **Step 3: Implementa los tipos y el helper en `interactions.ts`**

```ts
export type ReactionKind = "like" | "read" | "shock" | "fire";
export const REACTION_KINDS: readonly ReactionKind[] = ["like", "read", "shock", "fire"];
export type ReactionTally = { count: number; viewerReacted: boolean };
export type ReactionsByKind = Record<ReactionKind, ReactionTally>;
export function emptyReactions(): ReactionsByKind {
  return {
    like: { count: 0, viewerReacted: false },
    read: { count: 0, viewerReacted: false },
    shock: { count: 0, viewerReacted: false },
    fire: { count: 0, viewerReacted: false },
  };
}
```
Añade `reactions: ReactionsByKind` a `InteractionSummary` y a `InteractionComment`. Inicialízalo con `emptyReactions()` donde hoy se crean con `reactionCount: 0, viewerReacted: false` (línea ~102 para summary, ~200 para comentarios).

- [ ] **Step 4: Corre y verifica que pasa**

Run: `npx vitest run src/lib/social/interactions.test.ts -t "emptyReactions"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/interactions.ts src/lib/social/interactions.test.ts
git commit -m "feat(social): tipos de reacción multi-emoji (ReactionsByKind)"
```

### Task 1.2: Agregación por kind en `getInteractionSummary`

**Files:**
- Modify: `src/lib/social/interactions.ts` (bucles de agregación de `reactions`, ~132-138 target y ~la 2ª query de reacciones de comentarios)
- Test: `src/lib/social/interactions.test.ts`

**Interfaces:**
- Consumes: `ReactionKind`, `ReactionsByKind`, `emptyReactions` (Task 1.1)
- Produces: `getInteractionSummary` rellena `reactions[kind]` por target y por comentario; `reactionCount`/`viewerReacted` = derivados de la suma.

- [ ] **Step 1: Test que falla** — la query de reacciones ya selecciona `user_id`; ahora debe traer `kind`. Usa el fake de Supabase del repo (`fake-feed-supabase.ts` o el patrón de los tests existentes de este fichero) para inyectar dos reacciones `like` y una `fire` de otro usuario sobre el mismo target, y afirma:

```ts
test("agrupa reacciones por kind y deriva el total", async () => {
  // ...arrange con el fake: target T con reacciones [{user:A,kind:'like'},{user:B,kind:'like'},{user:B,kind:'fire'}], viewer = A
  const s = (await getInteractionSummary(supabase, "diary_entry", [srcId])).get(srcId)!;
  expect(s.reactions.like).toEqual({ count: 2, viewerReacted: true });
  expect(s.reactions.fire).toEqual({ count: 1, viewerReacted: false });
  expect(s.reactionCount).toBe(3);      // derivado: suma de todos los kinds
  expect(s.viewerReacted).toBe(true);   // derivado: algún kind activo del viewer
});
```

- [ ] **Step 2: Corre y verifica que falla**

Run: `npx vitest run src/lib/social/interactions.test.ts -t "agrupa reacciones por kind"`
Expected: FAIL.

- [ ] **Step 3: Implementa**

En la query de reacciones de target (`.select("interaction_target_id, user_id")`) añade `kind`. En el bucle, en vez de `s.reactionCount += 1; if (viewer) s.viewerReacted = true;`, incrementa `s.reactions[r.kind as ReactionKind]`:

```ts
const kind = (r.kind ?? "like") as ReactionKind;
const tally = s.reactions[kind];
if (!tally) continue; // kind desconocido: ignora, no rompas
tally.count += 1;
if (user && r.user_id === user.id) tally.viewerReacted = true;
```
Tras poblar todos los targets, deriva los totales por summary:
```ts
for (const s of summaries.values()) {
  s.reactionCount = REACTION_KINDS.reduce((n, k) => n + s.reactions[k].count, 0);
  s.viewerReacted = REACTION_KINDS.some((k) => s.reactions[k].viewerReacted);
}
```
Haz lo mismo en la 2ª query (reacciones de comentarios, ~línea 218): selecciona `kind`, agrega en `comment.reactions[kind]`, y deriva `reactionCount`/`viewerReacted` de cada comentario.

- [ ] **Step 4: Corre y verifica que pasa**

Run: `npx vitest run src/lib/social/interactions.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/interactions.ts src/lib/social/interactions.test.ts
git commit -m "feat(social): getInteractionSummary agrega reacciones por kind"
```

### Task 1.3: `toggleReaction(id, kind)`

**Files:**
- Modify: `src/lib/social/interaction-actions.ts` (~27-80)
- Test: `src/lib/social/interaction-actions.test.ts`

**Interfaces:**
- Produces: `export async function toggleReaction(interactionTargetId: string, kind?: ReactionKind): Promise<void>` — `kind` default `"like"` (no rompe llamadas existentes).

- [ ] **Step 1: Test que falla** — con el patrón de mock del fichero, afirma que reaccionar con `"fire"` inserta `{ kind: "fire" }` y que un segundo toggle con `"fire"` lo borra, sin tocar un `like` existente del mismo usuario/target.

```ts
test("toggleReaction inserta y borra por kind sin tocar otros kinds", async () => {
  // arrange: usuario U, target T con un 'like' de U ya existente
  await toggleReaction(T, "fire");   // inserta fire
  // assert: existe {T,U,like} y {T,U,fire}
  await toggleReaction(T, "fire");   // borra fire
  // assert: sigue existiendo {T,U,like}, no {T,U,fire}
});
```

- [ ] **Step 2: Corre y verifica que falla**

Run: `npx vitest run src/lib/social/interaction-actions.test.ts -t "por kind"`
Expected: FAIL.

- [ ] **Step 3: Implementa** — añade el parámetro y sustituye los tres literales `"like"` por `kind`:

```ts
export async function toggleReaction(
  interactionTargetId: string,
  kind: ReactionKind = "like",
): Promise<void> {
  // ...igual, pero .eq("kind", kind) en select/delete e insert { ..., kind }
```
El dedupe de notificación pasa a incluir el kind SOLO si se decide re-notificar por emoji; según la spec §7 se mantiene una notificación por (target, usuario): deja `dedupeKey: reaction:${interactionTargetId}:${user.id}` sin el kind.

- [ ] **Step 4: Corre y verifica que pasa**

Run: `npx vitest run src/lib/social/interaction-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/interaction-actions.ts src/lib/social/interaction-actions.test.ts
git commit -m "feat(social): toggleReaction acepta kind (default like)"
```

### Task 1.4: Reducer optimista por kind

**Files:**
- Modify: `src/lib/social/interaction-optimistic.ts`
- Test: `src/lib/social/interaction-optimistic.test.ts`

**Interfaces:**
- Consumes: `ReactionKind`, `ReactionsByKind` (Task 1.1)
- Produces:
  ```ts
  export type InteractionAction =
    | { type: "toggleTarget"; kind: ReactionKind }
    | { type: "toggleComment"; id: string; kind: ReactionKind }
    | { type: "addComment"; comment: InteractionComment }
    | { type: "deleteComment"; id: string };
  ```

- [ ] **Step 1: Test que falla**

```ts
test("toggleTarget alterna el kind indicado y ajusta derivados", () => {
  const base: InteractionSummary = {
    interactionTargetId: "t", reactionCount: 0, viewerReacted: false,
    commentCount: 0, comments: [], reactions: emptyReactions(),
  };
  const s = interactionReducer(base, { type: "toggleTarget", kind: "fire" });
  expect(s.reactions.fire).toEqual({ count: 1, viewerReacted: true });
  expect(s.reactionCount).toBe(1);
  expect(s.viewerReacted).toBe(true);
});
```

- [ ] **Step 2: Corre y verifica que falla**

Run: `npx vitest run src/lib/social/interaction-optimistic.test.ts -t "toggleTarget alterna"`
Expected: FAIL.

- [ ] **Step 3: Implementa** — en `toggleTarget`/`toggleComment` alterna `reactions[action.kind]` y recomputa `reactionCount`/`viewerReacted`. Helper local:

```ts
function toggleKind(r: ReactionsByKind, kind: ReactionKind): ReactionsByKind {
  const cur = r[kind];
  const next = { count: cur.count + (cur.viewerReacted ? -1 : 1), viewerReacted: !cur.viewerReacted };
  const merged = { ...r, [kind]: next };
  return merged;
}
function derive<T extends { reactions: ReactionsByKind }>(x: T): T {
  return { ...x,
    reactionCount: REACTION_KINDS.reduce((n, k) => n + x.reactions[k].count, 0),
    viewerReacted: REACTION_KINDS.some((k) => x.reactions[k].viewerReacted),
  } as T;
}
```
`toggleTarget`: `return derive({ ...state, reactions: toggleKind(state.reactions, action.kind) })`.
`toggleComment`: mapea el comentario y aplica `derive(toggleKind(...))`.

- [ ] **Step 4: Corre y verifica que pasa**

Run: `npx vitest run src/lib/social/interaction-optimistic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/interaction-optimistic.ts src/lib/social/interaction-optimistic.test.ts
git commit -m "feat(social): reducer optimista de reacciones por kind"
```

### Task 1.5: `<ReactionBar>` y su uso en `ReviewInteractions`

**Files:**
- Create: `src/components/social/reaction-bar.tsx`
- Modify: `src/components/social/review-interactions.tsx`
- Modify: `messages/es.json` (etiquetas de emojis para aria-label)

**Interfaces:**
- Consumes: `ReactionsByKind`, `REACTION_KINDS` (Task 1.1); `toggleReaction(id, kind)` (1.3); reducer actions (1.4)
- Produces:
  ```ts
  // reaction-bar.tsx
  export function ReactionBar({
    reactions, disabled, onToggle,
  }: { reactions: ReactionsByKind; disabled?: boolean;
       onToggle: (kind: ReactionKind) => void }): JSX.Element;
  ```

- [ ] **Step 1: Test que falla** (componente cliente → test con `@testing-library/react`, patrón de los tests `.test.tsx` del repo si existen; si no, un test de render mínimo)

```tsx
test("ReactionBar pinta las 4 kinds y emite onToggle con el kind", async () => {
  const onToggle = vi.fn();
  render(<ReactionBar reactions={emptyReactions()} onToggle={onToggle} />);
  const fire = screen.getByRole("button", { name: /🔥|fire/i });
  await userEvent.click(fire);
  expect(onToggle).toHaveBeenCalledWith("fire");
});
```
> Si el repo no tiene runner de componentes configurado (revísalo: ¿hay `.test.tsx`?), degrada este test a uno unitario de un helper puro `reactionMeta(kind)` que devuelva `{emoji,label}`, y verifica la UI en el e2e de Fase 6. No inventes infraestructura de test.

- [ ] **Step 2: Corre y verifica que falla**

Run: `npx vitest run src/components/social/reaction-bar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementa** — emojis: `like:♡`, `read:📖`, `shock:😱`, `fire:🔥`. Píldora por kind con estado activo (borde/acento) y count si `>0`; misma estética que el botón heart actual (clases del mockup traducidas a las utilidades del repo). `aria-pressed={tally.viewerReacted}`, `aria-label` desde `messages/es.json` (`social.reaction.like`, etc.).

- [ ] **Step 4: En `review-interactions.tsx`, sustituye los dos botones de corazón por `ReactionBar`:**
  - Target: `state.reactions` → `<ReactionBar reactions={state.reactions} disabled={isPending} onToggle={(kind) => run({ type: "toggleTarget", kind }, () => toggleReaction(interactionTargetId, kind))} />` (respeta `showTargetReaction`).
  - Cada comentario: `<ReactionBar reactions={c.reactions} disabled={isPending} onToggle={(kind) => run({ type: "toggleComment", id: c.id, kind }, () => toggleReaction(c.interactionTargetId, kind))} />`.
  - Props del componente: `reactionCount`/`viewerReacted` siguen llegando (derivados) pero el render ya no los usa para el botón; mantenlos para el estado no-logueado (muestra el total).
  - El estado optimista inicial (`useOptimisticAction`) debe incluir `reactions`: pásalo desde el summary. Añade `reactions: ReactionsByKind` a las props del componente y a los 9 callers (pass-through desde su summary; cambio mecánico).

- [ ] **Step 5: Corre lint + unit + typecheck-por-lint y commitea**

Run: `npm run lint && npm test`
Expected: PASS. Luego:
```bash
git add src/components/social/reaction-bar.tsx src/components/social/review-interactions.tsx messages/es.json
git commit -m "feat(social): paleta de reacciones (ReactionBar) en todo el feed"
```

> **Checkpoint Fase 1:** la app entera usa la paleta. Verifica manualmente/e2e existente que las reacciones antiguas (`like`) siguen contando. No sigas a Fase 2 sin `npm test` verde.

---

## FASE 2 — Esquema `thoughts` (dev primero)

### Task 2.1: Migración de esquema en dev

**Files:**
- Migración vía MCP `supabase-dev` `apply_migration` (nombre: `YYYYMMDDHHMMSS_thoughts.sql`)

**Interfaces:**
- Produces: tabla `thoughts`, enum `thought_anchor_type`, clase `thought` en `interaction_targets`, trigger resolutor, RLS, grants.

- [ ] **Step 1: `list_tables` en dev** para confirmar el enum de `interaction_targets.kind`, la firma del trigger resolutor existente (`private.resolve_interaction_target`) y las columnas exactas de `interaction_targets` (`owner_id, commentable, reactable, *_notification_type`). No asumas: cópialo del objeto real.

- [ ] **Step 2: Escribe la migración** (SQL, espejo de la clase `pass`/`club_activities`):

```sql
create type thought_anchor_type as enum ('book','movie','series','saga','person');

create table public.thoughts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  anchor_type thought_anchor_type not null,
  anchor_id uuid not null,
  body text not null check (char_length(body) <= 2000 and char_length(btrim(body)) > 0),
  is_spoiler boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index thoughts_user_id_created_at_idx on public.thoughts (user_id, created_at desc);
create index thoughts_anchor_idx on public.thoughts (anchor_type, anchor_id);

alter table public.thoughts enable row level security;

-- SELECT: dueño o quien pueda ver su perfil (misma función que las fuentes del feed)
create policy "thoughts_select_visible" on public.thoughts for select
  using (can_view_profile(user_id));   -- confirma el nombre exacto en dev
-- Escritura: solo el dueño
create policy "thoughts_insert_own" on public.thoughts for insert
  with check (user_id = auth.uid());
create policy "thoughts_update_own" on public.thoughts for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "thoughts_delete_own" on public.thoughts for delete
  using (user_id = auth.uid());

-- updated_at (reutiliza el trigger genérico si existe, p.ej. set_updated_at)
create trigger thoughts_set_updated_at before update on public.thoughts
  for each row execute function set_updated_at();  -- confirma el nombre en dev

-- interaction_targets: añade la clase 'thought'
alter type interaction_target_kind add value if not exists 'thought'; -- confirma el NOMBRE del enum en dev

-- trigger resolutor: al insertar un thought, materializa su interaction_target
create trigger trg_thoughts_resolve_interaction_target
  after insert on public.thoughts
  for each row execute function private.resolve_interaction_target(); -- adapta a la firma real
```
> **CRÍTICO:** el nombre del enum de `kind`, la función resolutora y `can_view_profile`/`set_updated_at` DEBEN copiarse de los objetos reales de dev (Step 1). Si el resolutor genérico necesita saber `owner_id`/notification types por clase, replica exactamente lo que hacen `pass`/`club_activities` (revisa sus triggers). Añade los valores de `*_notification_type` (`thought_comment`, `thought_reaction`) al enum correspondiente si el patrón lo exige.

- [ ] **Step 3: Grants por columna (#375)** — otorga a `authenticated` los grants finos que el resto de tablas usan (SELECT/INSERT/UPDATE/DELETE por columna según el patrón). Corre la **superficie 6 de `docs/DRIFT-CHECK.md`** contra dev y confirma que `thoughts` no aparece con columnas sin grant.

- [ ] **Step 4: Aplica en dev** vía `apply_migration` y **verifica contra objetos reales**:
```sql
select to_regclass('public.thoughts');                 -- no null
select unnest(enum_range(null::thought_anchor_type));   -- 5 valores
select 'thought' = any(enum_range(null::interaction_target_kind)::text[]); -- true
```

- [ ] **Step 5: Matriz RLS mínima** — con dos usuarios de prueba en dev (patrón `supabase/tests/social_phase1_interaction_targets.sql`): el dueño ve/inserta su thought; un tercero que NO le sigue no lo ve; un seguidor aceptado sí. Deja el SQL de la matriz en `supabase/tests/thoughts_rls.sql`.

- [ ] **Step 6: Commit** (solo el fichero de migración local + el test SQL; la migración ya está aplicada en dev)
```bash
git add supabase/migrations/*_thoughts.sql supabase/tests/thoughts_rls.sql
git commit -m "feat(db): tabla thoughts + clase de interacción thought (dev)"
```

### Task 2.2: Regenerar tipos + documentar

**Files:**
- Modify: `src/lib/supabase/database.types.ts` (regenerar, acotado a las adiciones de esta feature)
- Modify: `docs/requirements/data-model.md`

- [ ] **Step 1** Regenera tipos con `generate_typescript_types` (dev). **Acota el diff a las adiciones de `thoughts`** (`git checkout origin/main -- src/lib/supabase/database.types.ts` y reaplica a mano si el regen arrastra esquema ajeno — trampa registrada). Antes, `git fetch` (main local desfasado finge drift).

- [ ] **Step 2** Documenta en `docs/requirements/data-model.md`: tabla `thoughts`, ancla polimórfica sin FK, clase `thought` de `interaction_targets`, kinds de `reactions`. Actualiza fecha de verificación.

- [ ] **Step 3: Commit**
```bash
git add src/lib/supabase/database.types.ts docs/requirements/data-model.md
git commit -m "chore(db): tipos y doc de thoughts"
```

---

## FASE 3 — Feed (6ª fuente)

### Task 3.1: Resolución de ancla (`anchor.ts`)

**Files:**
- Create: `src/lib/catalog/anchor.ts`
- Test: `src/lib/catalog/anchor.test.ts`

**Interfaces:**
- Consumes: `itemHref`, `personHref`, `sagaHref` (de `item-href.ts`)
- Produces:
  ```ts
  export type AnchorType = "book" | "movie" | "series" | "saga" | "person";
  export type AnchorRef = {
    type: AnchorType; id: string;
    title: string; imageUrl: string | null; subtitle: string | null;
  };
  export function anchorHref(type: AnchorType, id: string): string;
  ```

- [ ] **Step 1: Test que falla**

```ts
import { anchorHref } from "./anchor";
test("anchorHref enruta por tipo", () => {
  expect(anchorHref("book", "1")).toBe("/libro/1");
  expect(anchorHref("saga", "2")).toBe("/saga/2");
  expect(anchorHref("person", "3")).toBe("/persona/3");
});
```

- [ ] **Step 2: Corre y verifica que falla**

Run: `npx vitest run src/lib/catalog/anchor.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementa** `anchorHref` (delega en los helpers existentes; `book/movie/series` → `itemHref`, `saga` → `sagaHref`, `person` → `personHref`) y el tipo `AnchorRef`. La resolución batch (título/imagen por tipo) se implementa en la Task 3.3 dentro de `feed.ts`; aquí sólo el tipo y el href.

- [ ] **Step 4: Corre y verifica que pasa** — Run: `npx vitest run src/lib/catalog/anchor.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/catalog/anchor.ts src/lib/catalog/anchor.test.ts
git commit -m "feat(catalog): AnchorRef y anchorHref polimórfico"
```

### Task 3.2: 6ª fuente en `feed-order.ts`

**Files:**
- Modify: `src/lib/social/feed-order.ts` (`FeedSourceKey`, `FEED_SOURCE_COLUMNS`)
- Test: el fichero de tests de orden del feed existente (busca `feed-order`/`feed-cursor-bounds`)

**Interfaces:**
- Produces: `FEED_SOURCE_COLUMNS.thoughts` con `{ dateColumn: "created_at", stampColumn: "created_at", kind: "timestamptz", eventIdPrefix: "thoughts:" }`; `FeedSourceKey` gana `"thoughts"`.

- [ ] **Step 1: Test que falla** — añade `thoughts` a la aserción que fija los prefijos/columnas de todas las fuentes (hay un test que enumera `FEED_SOURCE_COLUMNS`). Afirma que su forma es idéntica a `added`/`clubs` (timestamptz, misma columna orden y stamp) y prefijo `"thoughts:"`.

- [ ] **Step 2: Corre y verifica que falla** — `npx vitest run <fichero-de-orden>` → FAIL.

- [ ] **Step 3: Implementa** — añade la entrada a `FEED_SOURCE_COLUMNS` y `"thoughts"` a `FeedSourceKey`. `KNOWN_EVENT_ID_PREFIXES` se deriva solo.

- [ ] **Step 4: Corre y verifica que pasa** — PASS. Corre TODO el fichero de orden para asegurar que el cursor/empate cruzado sigue verde con 6 fuentes.

- [ ] **Step 5: Commit**
```bash
git add src/lib/social/feed-order.ts src/lib/social/*order*.test.ts
git commit -m "feat(social): thoughts como 6ª fuente de orden del feed"
```

### Task 3.3: Fan-out de `thoughts` en `getFeed`

**Files:**
- Modify: `src/lib/social/feed.ts`
- Test: `src/lib/social/feed.ts` tiene tests con el fake (`fake-feed-supabase.ts`); añade uno.

**Interfaces:**
- Consumes: `FEED_SOURCE_COLUMNS.thoughts` (3.2), `AnchorType` (3.1)
- Produces: `FeedVerb` gana `"thought"`; el evento de un thought lleva `verb:"thought"`, `interactionTarget:{targetType:"thought",targetId}` y un nuevo campo del evento:
  ```ts
  // en FeedEvent:
  thought: { body: string; isSpoiler: boolean; anchor: AnchorRef } | null;
  ```

- [ ] **Step 1: Test que falla** — con el fake, un `thoughts` de un seguido con ancla `book` conocido produce una `FeedEntry` `source:"person"` con `verb:"thought"`, `event.thought.body`, `event.thought.anchor.title` y `interactionTarget.targetType === "thought"`.

- [ ] **Step 2: Corre y verifica que falla** — FAIL.

- [ ] **Step 3: Implementa** en `getFeed`:
  1. `FeedVerb` gana `"thought"`; `FeedEvent` gana el campo `thought` (y `null` en todos los demás eventos existentes — añádelo a cada `events.push({...})`).
  2. Nueva bandera `includeThoughts = includePerson` (los thoughts NO se filtran por `reviewsOnly` ni por `itemTypes` de pantalla en v1: un pensamiento sobre una saga/persona no tiene item_type; decisión: los thoughts aparecen sólo cuando `filter === undefined` o cuando su `anchor_type` coincide con el filtro `book`/`screen`. Para v1, **inclúyelos solo con `filter === undefined`** y abre issue para el filtrado fino).
  3. Query fuente (espejo de `added`):
     ```ts
     supabase.from("thoughts")
       .select("id, user_id, anchor_type, anchor_id, body, is_spoiler, created_at")
       .in("user_id", followedIds)
       .order("created_at", { ascending: false })
       .order("id", { ascending: false })
       .limit(fetchLimit);
     // if (cursor) q = q.or(cursorSourceFilter(FEED_SOURCE_COLUMNS.thoughts, cursor));
     ```
  4. Resolución de ancla batch: agrupa `anchor_id` por `anchor_type`; añade `sagas` (`id,title,cover_url` — confirma columnas) y `people` (`id,name,photo_url/avatar` — confirma) a las consultas de catálogo que ya hace `getFeed` para `books/movies/series`. Construye `AnchorRef` por cada thought; si el ancla no resuelve, **descarta el evento** (igual que los eventos sin catálogo).
  5. `events.push({... verb:"thought", id:`thoughts:${r.id}`, orderDate:r.created_at, sortDate:r.created_at, eventDate:r.created_at, thought:{body,isSpoiler,anchor}, interactionTarget:{targetType:"thought", targetId:r.id, interactionTargetId:null}, ...ceros})`.
  6. Añade `thoughts` a `allExhausted`, a `sourceLimitHit` (prefijo `thoughts:`), y a la resolución de interacciones (`thoughtTargetIds` → `getInteractionSummary(supabase,"thought",...)`).
  7. `itemType` del evento thought: usa el `anchor.type` cuando sea catálogo; para saga/person, el feed nunca lo agrupa por tipo de item — asegúrate de que la agrupación (`descriptorForEvent`) NO agrupe thoughts (devuélvele `null`, como a los clubs).

- [ ] **Step 4: Corre y verifica que pasa** — `npx vitest run src/lib/social/feed.ts` → PASS (y toda la suite social).

- [ ] **Step 5: Commit**
```bash
git add src/lib/social/feed.ts src/lib/social/interactions.ts
git commit -m "feat(social): getFeed incluye pensamientos (6ª fuente)"
```

> Nota: `getInteractionSummary` acepta `TargetType`. Confirma que `"thought"` entra en `CanonicalTargetType`; si el tipo se deriva de `database.types.ts`, ya estará tras Fase 2.2. Si es una unión manual, añádelo.

---

## FASE 4 — Compositor + `createThought`

### Task 4.1: `createThought` (server action)

**Files:**
- Create: `src/lib/social/thought-actions.ts`
- Test: `src/lib/social/thought-actions.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type CreateThoughtInput = {
    anchorType: AnchorType; anchorId: string; body: string; isSpoiler: boolean;
  };
  export type CreateThoughtResult = { ok: true; id: string } | { ok: false; error: string };
  export async function createThought(input: CreateThoughtInput): Promise<CreateThoughtResult>;
  ```

- [ ] **Step 1: Test que falla** — body vacío → `{ ok:false, error:"empty" }`; body >2000 → `{ ok:false, error:"too_long" }`; ancla inexistente → `{ ok:false, error:"anchor_not_found" }`; feliz → `{ ok:true, id }` e inserta la fila. Usa el patrón de mock de `interaction-actions.test.ts`.

- [ ] **Step 2: Corre y verifica que falla** — FAIL.

- [ ] **Step 3: Implementa** (`"use server"`): `getUser` → si no, `{ok:false,error:"unauthenticated"}`. Valida body (`btrim` no vacío, ≤2000). **Resuelve el ancla**: `select id from <tabla-según-anchorType> where id = anchorId` (mapa `book→books, movie→movies, series→series, saga→sagas, person→people`); si no existe → `{ok:false,error:"anchor_not_found"}`. Inserta en `thoughts` con `service`-no: usa el cliente de sesión (RLS `insert_own` aplica). Devuelve el `id`. `revalidateFeed()` de `@/lib/reactivity/revalidate`. **NUNCA lanzes**: envuelve fallos inesperados en `{ok:false,error:"unknown"}` con `console.error`.

- [ ] **Step 4: Corre y verifica que pasa** — `npx vitest run src/lib/social/thought-actions.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/social/thought-actions.ts src/lib/social/thought-actions.test.ts
git commit -m "feat(social): server action createThought (resultado discriminado)"
```

### Task 4.2: Búsqueda de ancla (autocompletado)

**Files:**
- Create: `src/lib/social/anchor-search.ts`
- Test: `src/lib/social/anchor-search.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function searchAnchors(
    supabase: SupabaseServerClient, viewerId: string, query: string,
  ): Promise<AnchorRef[]>;  // items desde biblioteca del viewer; sagas y personas global; máx ~8, mezclados
  ```

- [ ] **Step 1: Test que falla** — query "dun" devuelve items de la biblioteca del viewer que casan por título, más sagas/personas globales que casan por nombre, cada uno con `type` correcto y `href` resoluble; query vacía → `[]`.

- [ ] **Step 2: Corre y verifica que falla** — FAIL.

- [ ] **Step 3: Implementa** — items: join `passes` del viewer → catálogo, `ilike` sobre título, limit; sagas: `sagas` `ilike` nombre global; personas: `people` `ilike` name global. Normaliza a `AnchorRef`. Ordena items primero. `q.trim()===""` → `[]`.

- [ ] **Step 4: Corre y verifica que pasa** — PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/social/anchor-search.ts src/lib/social/anchor-search.test.ts
git commit -m "feat(social): searchAnchors (biblioteca + sagas/personas)"
```

### Task 4.3: Compositor (UI) + trigger

**Files:**
- Create: `src/components/social/thought-composer.tsx` (cliente)
- Create: `src/components/social/thought-composer-trigger.tsx` (cliente, botón + modal)
- Modify: cabecera del feed de Inicio para montar el trigger (localiza el page/componente que renderiza el feed en `/` — busca dónde se llama a `getFeed` para la home)
- Modify: `messages/es.json` (copys del compositor)
- Server action de búsqueda: crea un thin `"use server"` wrapper `searchAnchorsAction(query)` (en `thought-actions.ts`) que resuelve `viewerId` y llama a `searchAnchors`, para que el cliente lo invoque.

**Interfaces:**
- Consumes: `createThought` (4.1), `searchAnchorsAction` (4.2 wrapper), `AnchorRef`, `useOptimisticAction`.

- [ ] **Step 1** Implementa `thought-composer.tsx`: selector de ancla (input con debounce → `searchAnchorsAction`, lista de resultados con miniatura; al elegir, chip con ✕), textarea (≤2000, contador), barra markdown-lite (botones que insertan `**texto**`/`*texto*` y prefijo `- `), toggle spoiler, botón Publicar (deshabilitado sin ancla o sin texto). Al publicar: llama `createThought`; si `ok`, cierra modal y limpia; si `!ok`, muestra el error mapeado a copy de `es.json`. Sin ancla NO publica (la spec: ancla obligatoria).

- [ ] **Step 2** `thought-composer-trigger.tsx`: botón que abre `thought-composer` en modal/hoja (reutiliza el patrón de modal del repo — busca un `Dialog`/`Sheet` existente, p.ej. en clubs `activity-composer`). Móntalo en la cabecera del feed de Inicio.

- [ ] **Step 3** `npm run lint && npm test` verdes (los tests unitarios de acciones ya cubren la lógica; la UI se valida en e2e Fase 6).

- [ ] **Step 4: Commit**
```bash
git add src/components/social/thought-composer.tsx src/components/social/thought-composer-trigger.tsx src/lib/social/thought-actions.ts messages/es.json src/app/**
git commit -m "feat(social): compositor de pensamiento (acción dedicada)"
```

---

## FASE 5 — Tarjeta e hilo + markdown-lite

### Task 5.1: Parser markdown-lite (puro)

**Files:**
- Create: `src/lib/social/rich-text.ts`
- Test: `src/lib/social/rich-text.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Segment =
    | { kind: "plain"; text: string }
    | { kind: "bold"; text: string }
    | { kind: "italic"; text: string }
    | { kind: "mention"; text: string };   // incluye la @
  export type Line = { isList: boolean; segments: Segment[] };
  export function parseRichText(input: string): Line[];
  ```

- [ ] **Step 1: Test que falla** (espeja el `parseLines` del mockup)

```ts
import { parseRichText } from "./rich-text";
test("parsea negrita, cursiva, mención y viñeta", () => {
  const [l0] = parseRichText("- hola **mundo** *ok* @borja");
  expect(l0.isList).toBe(true);
  expect(l0.segments).toEqual([
    { kind: "plain", text: "hola " },
    { kind: "bold", text: "mundo" },
    { kind: "plain", text: " " },
    { kind: "italic", text: "ok" },
    { kind: "plain", text: " " },
    { kind: "mention", text: "@borja" },
  ]);
});
test("token sin cerrar queda plano", () => {
  expect(parseRichText("**a")).toEqual([{ isList: false, segments: [{ kind: "plain", text: "**a" }] }]);
});
```

- [ ] **Step 2: Corre y verifica que falla** — FAIL.

- [ ] **Step 3: Implementa** — porta `parseLines` del mockup a TS: split por `\n`; detecta `^\s*-\s+`; regex `(\*\*[^*]+\*\*|\*[^*]+\*|@[A-Za-z0-9_]+)`; segmenta. Token sin cerrar → parte del `plain` (la regex ya no casa, cae a texto). Línea vacía → un `plain` "".

- [ ] **Step 4: Corre y verifica que pasa** — `npx vitest run src/lib/social/rich-text.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/social/rich-text.ts src/lib/social/rich-text.test.ts
git commit -m "feat(social): parser markdown-lite puro"
```

### Task 5.2: `<RichTextView>`

**Files:**
- Create: `src/components/social/rich-text-view.tsx`

**Interfaces:**
- Consumes: `parseRichText`, `Segment` (5.1); `MentionText`/`knownUsernames` para linkificar menciones existentes.
- Produces: `export function RichTextView({ text, knownUsernames }: { text: string; knownUsernames?: string[] }): JSX.Element;`

- [ ] **Step 1** Implementa: `parseRichText(text)` → renderiza líneas (viñeta `•` si `isList`) y segmentos (`<b>`/`<i>`/mención con acento; si la mención está en `knownUsernames`, enlaza a `/u/<username>` sin la @). Es presentación pura; sin test de componente si no hay runner — cubierto por e2e.

- [ ] **Step 2** `npm run lint` verde.

- [ ] **Step 3: Commit**
```bash
git add src/components/social/rich-text-view.tsx
git commit -m "feat(social): RichTextView"
```

### Task 5.3: `<ThoughtCard>` + despacho en el feed

**Files:**
- Create: `src/components/social/thought-card.tsx`
- Modify: el componente que mapea `FeedEntry` → tarjeta (busca dónde se renderiza el feed: un `feed-list`/switch por `verb`/`source`). Añade la rama `source==="person" && event.verb==="thought"` → `<ThoughtCard>`.

**Interfaces:**
- Consumes: `FeedEvent` (con `thought`), `anchorHref`, `RichTextView`, `ReviewInteractions` (target `thought`), `ReactionBar`.

- [ ] **Step 1** Implementa `ThoughtCard` según el mockup: cabecera (avatar + «{autor} compartió un pensamiento» + píldora «Pensamiento»), chip de ancla (imagen + título, enlazado con `anchorHref(anchor.type, anchor.id)`), spoiler blur+reveal si `thought.isSpoiler` (estado local `revealed`), cuerpo con `<RichTextView text={thought.body} knownUsernames={...} />`, y el hilo vía `<ReviewInteractions interactionTargetId={event.interactionTarget.interactionTargetId} reactions={...} reactionCount viewerReacted commentCount comments viewerLoggedIn knownUsernames />`.

- [ ] **Step 2** Despacha en el renderizador del feed. Asegura que el `knownUsernames` del `FeedPage` se pasa (el feed ya resuelve menciones de `reviewExcerpt`/comentarios; **añade `thought.body` a la lista que `resolveKnownMentions` recibe** en `getFeed`, junto a `reviewExcerpt`).

- [ ] **Step 3** `npm run lint && npm test` verdes.

- [ ] **Step 4: Commit**
```bash
git add src/components/social/thought-card.tsx src/components/social/*feed* src/lib/social/feed.ts
git commit -m "feat(social): ThoughtCard y despacho en el feed"
```

---

## FASE 6 — E2E + cierre

### Task 6.1: E2E

**Files:**
- Create: `e2e/thoughts.spec.ts`

- [ ] **Step 1** Escribe el e2e (Playwright, patrón del club desechable — crea sus propios datos): logueado, abre el compositor desde la cabecera del feed → busca y ancla un libro de la biblioteca → escribe con `**negrita**` y marca spoiler → Publica. Verifica: la tarjeta «Pensamiento» aparece arriba con el chip del ancla; el cuerpo está blurreado hasta pulsar «Ver spoiler»; comentar añade el comentario; reaccionar con 🔥 en el post y en el comentario incrementa el contador; recargar (build de prod) persiste. Repite el anclaje con una saga y una persona (sólo que aparezca el chip correcto).

- [ ] **Step 2** Corre contra build de producción (no solo `next dev`): `npm run build && npm run start` en un puerto y `npm run test:e2e`. (Trampas registradas: PPR/`notFound`, `use cache` sólo fallan en build.)

- [ ] **Step 3: Commit**
```bash
git add e2e/thoughts.spec.ts
git commit -m "test(e2e): publicar y comentar un pensamiento"
```

### Task 6.2: Prod + cierre documental

- [ ] **Step 1** Aplica la migración de Fase 2 en **prod** (`supabase-prod`), verificando contra objetos reales. Regenera tipos si difieren. Corre los advisors de seguridad (RLS/grants) en prod.
- [ ] **Step 2** `docs/requirements/data-model.md`: fecha de verificación en prod. `docs/requirements/backlog.md`: marca la casilla de «Pensamiento». `docs/requirements/decisiones.md`: **append** con las dos decisiones de forma (paleta app-wide; ancla polimórfica sin FK).
- [ ] **Step 3** Abre las **issues** de la spec §8 (con sus tres etiquetas cada una): «pensamientos sobre esta entidad» en fichas (`area:social,tipo:feature,P3`), filtrado fino de thoughts por `filter` book/screen (`area:social,tipo:deuda,P2`), edición/borrado de thought desde la tarjeta (`area:social,tipo:feature,P3`).
- [ ] **Step 4: Commit**
```bash
git add docs/requirements/*.md
git commit -m "docs(social): cierre documental de pensamientos"
```

---

## Self-review (cobertura de la spec)

- §3.1 tabla `thoughts` → Task 2.1 ✓ · §3.2 clase `thought` → 2.1 ✓ · §3.3 RLS → 2.1 ✓
- §4 feed 6ª fuente → 3.2/3.3 ✓ · resolución de ancla → 3.1/3.3 ✓
- §5 compositor dedicado → 4.1/4.2/4.3 ✓ · resultado discriminado → 4.1 ✓
- §6 tarjeta/hilo/spoiler/menciones → 5.2/5.3 ✓ · markdown-lite → 5.1/5.2 ✓
- §7 reacciones multi-emoji app-wide → Fase 1 (1.1–1.5) ✓ · dedupe notif → 1.3 ✓
- §8 fuera de alcance → issues en 6.2 ✓
- §9 testing (parser, feed-order, multi-kind, e2e) → 5.1/3.2/1.x/6.1 ✓
- §10 definición de hecho → 2.2/6.2 ✓
- Constraint dev→prod → 2.1/6.2 ✓ · grants #375 → 2.1 ✓ · i18n es → 1.5/4.3 ✓
