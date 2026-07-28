# Sagas · timeline con los cuatro estados — fase 3: la ventana completa (`motivo` + mini-track) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que una ventana recomendada deje de ser dos nombres sueltos («después de X, antes de Y») y pase a decir **por qué** existe el tramo —spoilers o contexto— y **dónde estás tú dentro de él**, con una barra que sitúa la ventana sobre la saga entera. Sin tocar el progreso y sin que la ficha deje de funcionar para quien no ha iniciado sesión.

**Architecture:** una columna `motivo` en `saga_placement_windows` (enum nuevo, **nullable**, sin backfill) que viaja dentro del `p_windows` que el RPC ya recibe — así que **esta fase NO tiene baile de sobrecarga**: `p_windows` es un `jsonb` y añadirle una clave no cambia la firma. El motivo cruza hasta la ficha por el camino que ya recorren las anclas (`resolveWindows` → nodo del grafo → fila del timeline). El mini-track es una función **pura** nueva, `windowTrack`, que sitúa las dos anclas y la posición del lector sobre la columna curada; la posición se LEE con el predicado único de `completion.ts`, nunca se reimplementa.

**Tech Stack:** Postgres (Supabase), plpgsql, Next.js 16 (RSC + server actions), TypeScript, Tailwind v4, next-intl, Vitest, Playwright.

**Documento de origen:** `docs/superpowers/specs/2026-07-28-sagas-timeline-estados-design.md`, fase 3 de su tabla de fases. Las fases 0, 1 y 2 están hechas y desplegadas (PR #218, #223, #224). Las fases 4 a 6 siguen pendientes, con plan propio cada una.

## Global Constraints

- **El progreso no se toca.** `src/lib/sagas/progress.ts` sale de esta fase byte a byte como entró. El mini-track **LEE** lo completado; no mueve el denominador, no crea un segundo recuento y no inventa un predicado nuevo de «completado» — usa el de `completion.ts`, que es el que cerró el #91 y su primo el #170.
- **Ni una tercera ancla, ni dos ventanas por entrada.** Es el límite duro que fijó la fase 2b y que la spec repite. `motivo` es un adjetivo de la ventana que ya existe, no una tercera coordenada. Si al construir apetece una tercera ancla, **para y dilo en voz alta**.
- **Esta fase NO añade una sobrecarga.** `motivo` viaja como una clave más dentro de `p_windows`, que ya es `jsonb`. `create or replace function` con la **MISMA** lista de siete parámetros es un reemplazo de verdad. **No vuelvas a crear el envoltorio de seis argumentos**: se borró en `20260802_drop_save_saga_sequence_v6.sql` y en dev y prod hay hoy **una sola** firma.
- **Migración ANTES del despliegue, y esta vez también antes del merge.** El bundle nuevo manda `motivo` en cada fila de `p_windows`; si la columna no existe todavía, el `insert` revienta y aborta el guardado entero. Al revés es inofensivo (el bundle viejo no manda la clave, `w->>'motivo'` da NULL). En la fase 2 esto se hizo al revés por accidente y hubo una ventana de minutos en la que producción no podía guardar una secuencia — está escrito en `docs/requirements/decisiones.md`. **Aquí se aplica a prod ANTES de mergear** (Task 10), y por eso esa tarea va antes de la del PR.
- **Dev primero, prod después**, y la verificación es contra los objetos reales (`pg_type`, `pg_attribute`/`information_schema.columns`, `pg_proc`), **nunca** `list_migrations`.
- **La ficha es pública.** Todo lo que se construya tiene que verse entero sin sesión: la barra con su tramo, el motivo, las anclas. Lo único que desaparece sin sesión es el marcador de posición y el aviso. Es fácil construirlo mirando solo la vista con sesión — la spec lo marca como riesgo 5.
- **Idioma:** texto de usuario en `messages/es.json`, namespaces `saga` (ficha) y `sagaEditor` (editor). Único locale.
- **Node 22:** `eval "$(fnm env --shell bash)"; fnm use 22` antes de `npm test` — el shell abre con v20 y rompe Vitest.
- **Un solo `next dev`, en el puerto 3000.** Playwright reutiliza el que haya. El worktree necesita `.env.local` copiado y `node_modules` (junction al checkout principal).

---

## Lo que ya está medido (no lo vuelvas a averiguar)

Todo esto son `SELECT` de solo lectura corridos el 2026-07-28, al escribir este plan.

| Dato | Valor | Cómo se comprobó |
|---|---|---|
| Enum `saga_window_reason` | **no existe**, ni en dev ni en prod | `select count(*) from pg_type where typname='saga_window_reason'` → 0 en los dos |
| Columna `saga_placement_windows.motivo` | **no existe**, ni en dev ni en prod | `information_schema.columns` → 0 en los dos |
| Ventanas en producción | **4** | `select count(*) from saga_placement_windows` en prod |
| Ventanas en dev **en reposo** | **0** | ídem en dev. Los e2e de ventanas las crean y las limpian; fuera de una pasada no queda ninguna. **Esto importa**: no hay dato de dev sobre el que mirar la interfaz nueva, hay que sembrarlo |
| Firmas de `save_saga_sequence` | **1** en dev, **1** en prod | `select count(*) from pg_proc where proname='save_saga_sequence'` |
| Tándems en producción | **1** (Trono de Cristal, hueco 5) | `select count(*) from saga_tandems` en prod |
| Sitios que consultan `saga_placement_windows` | **3** `select` | `get-saga-detail.ts:535`, `get-saga-sequence.ts:65`, `get-saga-sequence.ts:145` |
| Sitios que montan `WindowEditor` | **3** | `shell-desktop.tsx:134`, `shell-mobile.tsx:145`, `block-windows-drawer.tsx:44` |
| El RPC se llama con `p_windows` sin transformar | sí | `sequence-actions.ts:88` — `p_windows: payload.windows`. **Ese fichero no se toca en toda la fase** |
| `TimelineRow.kind === "window"` ya existe con `reason`/`track` a `null` | sí | fase 1, `derive-timeline.ts:54-63` |
| El nodo del grafo ya lleva `status` | sí | `map-types.ts:19`, `MemberStatus = "completed" \| "in_progress" \| null` |
| **Trampa:** sin sesión, `status` es `null` en TODOS los nodos | sí | `get-saga-detail.ts:391` — los pases solo se consultan `if (user)`. Por eso «hay sesión» **no se puede deducir** de los estados: viaja como flag explícito (`detail.isAuthenticated`, que ya existe) |

### Las 4 ventanas de producción, para poder mirarlas

De la spec (medidas el 2026-07-28): *Nacidos de la Bruma. Era 2* (bloque, bajo Cosmere), *El Hombre Iluminado* (bajo Novelas secretas), *Esquirla del Amanecer* (bajo El Archivo), *La Espada de la Asesina* (bajo Trono de Cristal). Ninguna tendrá `motivo` al acabar esta fase: **no hay backfill**, y curarlas es decisión del responsable, no del plan.

---

## Decisiones de esta fase, con su porqué

1. **`motivo` va en `p_windows`, no en un octavo argumento.** `p_windows` ya es un array de `jsonb` con la forma de la tabla; una clave más no cambia la firma de la función. Un argumento nuevo sí, y traería el baile de la sobrecarga que ya se ha pagado tres veces (2b, 4 y 2). La regla que queda escrita: **una columna nueva de una tabla que ya viaja en un payload `jsonb` nunca justifica un argumento nuevo.**

2. **El motivo vive en el NODO del grafo, como el tándem.** `deriveTimeline` no vuelve a consultar nada: lee las anclas de las aristas que ya resolvió `deriveSagaMap` (fase 1) y ahora leerá el motivo del nodo sujeto. Resolver el mismo dato dos veces por dos caminos es la familia del #91/#185/#203.

3. **Solo un sujeto OBRA recibe motivo en el nodo.** Un sujeto BLOQUE se resuelve a la primera obra del bloque, y esa obra es una fila normal de la columna: colgarle ahí el motivo pintaría una ventana donde no la hay. Es el mismo límite que la fase 1 ya asumió y que sigue abierto en la issue #221.

4. **`windowTrack` devuelve el tramo SIEMPRE, y la posición solo con sesión.** La spec dice las dos cosas en dos sitios («Sin sesión, `null`» en §«windowTrack»; «la barra se pinta sin marcador y sin aviso» en §5). Se resuelve así: lo que es `null` sin sesión son `youPct` y `notice`, no el track entero. Es lo que hace que la ficha pública siga enseñando el tramo, que es el 80 % de lo que la ventana comunica.

5. **Un ancla que no está en la columna abre ese extremo.** Un ancla puede resolver a una obra `libre` (sin `orderNo`), que no tiene sitio en la barra. En vez de inventarle uno, ese extremo se pinta abierto (0 % o 100 %). Determinista y honesto.

6. **Una ventana al revés (`from > to`) no pinta track.** El curador ancló «después de» a algo posterior a «antes de». Pintar una banda de anchura negativa es peor que no pintarla; el texto de las anclas sigue estando, que es lo que deja verlo y corregirlo.

7. **`WindowReason` y `TandemMode` pasan a vivir en `types.ts`, con re-export.** Hoy `TandemMode` está declarado DOS veces (`types.ts:45` y `derive-timeline.ts:24`) con el mismo contenido: dos definiciones de la misma unión que nada obliga a coincidir. Se unifican de paso, porque esta fase ya toca esa cabecera. No es scope creep: es no crear la tercera.

---

## File Structure

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20260803_saga_window_reason.sql` (crear) | Enum `saga_window_reason` y la columna `motivo`, nullable. |
| `supabase/migrations/20260804_save_saga_sequence_motivo.sql` (crear) | **Reemplazo** de la de 7 argumentos (misma firma) que escribe `motivo`. |
| `src/lib/supabase/database.types.ts` (regenerar) | Columna y enum nuevos. |
| `src/lib/sagas/types.ts` (modificar) | `WindowReason`, junto a `TandemMode`. `ResolvedWindow.reason`. |
| `src/lib/sagas/derive-timeline.ts` (modificar) | Deja de declarar sus propias uniones (re-export), rellena `reason` y `track` de la fila `window`, y acepta `authenticated`. |
| `src/lib/sagas/window-track.ts` (crear) | `windowTrack` — la función pura del mini-track. |
| `src/lib/sagas/window-track.test.ts` (crear) | Sus unitarias: tres avisos, sin sesión, anclas fuera de la columna, ventana al revés. |
| `src/lib/sagas/completion.ts` (modificar) | `isStatusCompleted`, y `isMemberCompleted` pasa a delegar en ella. Un solo predicado, dos formas de entrada. |
| `src/lib/sagas/sequence-draft.ts` (modificar) | `DraftWindow.reason`, `setWindowReason`, `motivo` en el payload. |
| `src/lib/sagas/sequence-draft.test.ts` (modificar) | Unitarias del borrador. |
| `src/lib/sagas/get-saga-sequence.ts` (modificar) | `RawWindowRow.motivo`, los dos `select`, y `hydrateWindows` lo hidrata. |
| `src/lib/sagas/get-saga-sequence.test.ts` (modificar) | Unitarias de la hidratación. |
| `src/lib/sagas/get-saga-detail.ts` (modificar) | El tercer `select`, y `resolveWindows` propaga el motivo. |
| `src/lib/sagas/get-saga-detail.test.ts` (modificar) | Unitarias de `resolveWindows`. |
| `src/lib/sagas/map-types.ts` (modificar) | `SagaGraphNode.windowReason`. |
| `src/lib/sagas/derive-map.ts` (modificar) | Rellenarlo al construir las aristas de ventana. |
| `src/lib/sagas/derive-map.test.ts`, `derive-timeline.test.ts` (modificar) | Los literales de nodo ganan el campo nuevo. |
| `src/components/saga/sequence/window-editor.tsx` (modificar) | Las tres pastillas del motivo, bajo las anclas. |
| `src/components/saga/sequence/{shell-desktop,shell-mobile,block-windows-drawer}.tsx` (modificar) | Cablear `onSetReason`. |
| `src/components/saga/sequence/use-sequence-draft.ts` (modificar) | La operación `setWindowReason`. |
| `src/components/saga/timeline/window-track-bar.tsx` (crear) | La barra: banda, topes, marcador, etiquetas. Pieza propia porque es la única con geometría. |
| `src/components/saga/timeline/timeline-window-row.tsx` (modificar) | Montar la barra, el aviso y el motivo. |
| `src/components/saga/timeline/timeline-labels.ts` (modificar) | Las etiquetas nuevas. |
| `src/components/saga/{saga-map-tab,route-view}.tsx` (modificar) | Pasar `authenticated` a `deriveTimeline`. |
| `messages/es.json` (modificar) | Copy del motivo, los tres avisos y las etiquetas de la barra. |
| `e2e/sagas-ventana-motivo-track.spec.ts` (crear) | El e2e de la fase. |
| `docs/requirements/data-model.md`, `backlog.md`, `decisiones.md`, `supabase/schema-baseline.sql` (modificar) | La doc canónica, al cerrar. |

---

## Interfaces — lo que cada tarea publica

Copiado aquí para que quien implemente una tarea sin ver las otras sepa los nombres exactos:

```ts
// types.ts
export type WindowReason = "spoiler" | "contexto";
export type ResolvedWindow = {
  afterTitle: string | null; beforeTitle: string | null;
  afterKey: string | null; beforeKey: string | null;
  reason: WindowReason | null;                       // ← nuevo
};

// map-types.ts
export type SagaGraphNode = { /* … */ windowReason: WindowReason | null };

// sequence-draft.ts
export type DraftWindow = { after: DraftAnchor | null; before: DraftAnchor | null; reason: WindowReason | null };
export function setWindowReason(d: SequenceDraft, key: string, reason: WindowReason | null): SequenceDraft;
// SequencePayload["windows"][number] gana:  motivo: WindowReason | null

// completion.ts
export function isStatusCompleted(status: MemberStatus): boolean;

// window-track.ts
export function windowTrack(
  graph: SagaGraph,
  anchors: { after: SagaGraphNode | null; before: SagaGraphNode | null },
  opts: { authenticated: boolean },
): TimelineTrack | null;

// derive-timeline.ts
export type TimelineTrack = {
  fromPct: number; toPct: number;
  youPct: number | null;                             // null sin sesión
  notice: "antes" | "dentro" | "pasada" | null;      // null sin sesión  ← cambia respecto a la fase 1
};
export function deriveTimeline(
  graph: SagaGraph,
  opts?: { spine?: TimelineSpine; authenticated?: boolean },
): TimelineSection[];
```

---

## Task 1: la columna `motivo` y su enum

**Files:**
- Create: `supabase/migrations/20260803_saga_window_reason.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerado, no a mano)

**Interfaces:**
- Consumes: nada.
- Produces: el tipo `public.saga_window_reason` y la columna `public.saga_placement_windows.motivo`, ambos en **dev**.

- [ ] **Step 1: Escribir la migración**

```sql
-- Motivo de una ventana recomendada (spec 2026-07-28, fase 3): POR QUÉ el
-- tramo es el que es. Es lo que convierte «entre X e Y» en una recomendación
-- que se puede razonar — el mockup lo dice en el frame B: «fuera de ella hay
-- spoilers en ambos sentidos».
--
-- NULLABLE y SIN BACKFILL, a propósito. Las 4 ventanas que hay hoy en
-- producción se curaron antes de que esta columna existiera, y nadie decidió
-- su motivo. Rellenarlas «por defecto» sería poner en boca del curador una
-- afirmación que no hizo — exactamente el error que la fase 2 evitó dejando
-- `saga_tandems.modo` nullable, y que antes de ella cometía la interfaz al
-- afirmar «se leen a la vez» de todos los tándems.
--
-- Sin CHECK nuevo: `saga_placement_windows_needs_anchor` ya impide una fila
-- sin ninguna ancla, así que un motivo nunca puede existir sin su tramo.
-- Y sin tocar RLS: las policies de esta tabla son de tabla, no de columna.
create type public.saga_window_reason as enum ('spoiler', 'contexto');

alter table public.saga_placement_windows
  add column motivo public.saga_window_reason;
```

- [ ] **Step 2: Aplicarla a DEV**

Con `mcp__supabase-dev__apply_migration`, nombre `20260803_saga_window_reason`, el cuerpo de arriba.

- [ ] **Step 3: Verificar contra los objetos reales, no contra el ledger**

```sql
select
  (select array_agg(enumlabel order by enumsortorder)
     from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'saga_window_reason')                              as valores,
  (select data_type || ' / ' || udt_name || ' / nullable=' || is_nullable
     from information_schema.columns
    where table_name = 'saga_placement_windows' and column_name = 'motivo') as columna,
  (select count(*) from saga_placement_windows where motivo is not null)  as con_motivo;
```

Esperado: `valores = {spoiler,contexto}`, `columna = USER-DEFINED / saga_window_reason / nullable=YES`, `con_motivo = 0`.

- [ ] **Step 4: Regenerar los tipos**

```bash
eval "$(fnm env --shell bash)"; fnm use 22
npx supabase gen types typescript --project-id <dev> > src/lib/supabase/database.types.ts
```

(o `mcp__supabase-dev__generate_typescript_types` y volcar el resultado). Comprobar que aparece `motivo: Database["public"]["Enums"]["saga_window_reason"] | null` en `saga_placement_windows`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260803_saga_window_reason.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): motivo de la ventana recomendada, nullable y sin backfill"
```

---

## Task 2: el RPC guarda `motivo` — misma firma, sin sobrecarga

**Files:**
- Create: `supabase/migrations/20260804_save_saga_sequence_motivo.sql`

**Interfaces:**
- Consumes: la columna de la Task 1.
- Produces: `save_saga_sequence` de **7 argumentos** (los mismos) escribiendo `motivo` desde cada elemento de `p_windows`.

- [ ] **Step 1: Escribir la migración**

Es el cuerpo actual con dos líneas más (la columna en el `insert` y el cast en el `select`). Se copia entero porque `create or replace` reemplaza el cuerpo completo:

```sql
-- `motivo` en el guardado (spec 2026-07-28, fase 3).
--
-- ⚠️ Esto NO es una sobrecarga: la lista de parámetros es EXACTAMENTE la misma
-- que la de 20260801_save_saga_sequence_tandems.sql, así que `create or
-- replace` reemplaza de verdad. `motivo` viaja como una clave más dentro de
-- `p_windows`, que ya es jsonb — una columna nueva de una tabla que ya viaja en
-- un payload jsonb nunca justifica un argumento nuevo. NO recrees el envoltorio
-- de seis argumentos: se borró en 20260802_drop_save_saga_sequence_v6.sql y hoy
-- hay una sola firma en dev y en prod.
--
-- El orden que sí importa sigue importando: esta migración va ANTES del
-- despliegue. El bundle nuevo manda `motivo` en cada fila; sin la columna, el
-- insert revienta y aborta el guardado entero. Al revés es inofensivo: el
-- bundle viejo no manda la clave y `w->>'motivo'` da NULL.
create or replace function public.save_saga_sequence(
  p_saga_id uuid,
  p_entries jsonb,
  p_blocks jsonb,
  p_removed jsonb,
  p_windows jsonb,
  p_window_subjects jsonb,
  p_tandems jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.has_min_role('collaborator') then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from sagas where id = p_saga_id) then
    raise exception 'saga % not found', p_saga_id;
  end if;

  if exists (
    select 1
      from (
        select w as x from jsonb_array_elements(coalesce(p_windows, '[]'::jsonb)) as w
        union all
        select s as x from jsonb_array_elements(coalesce(p_window_subjects, '[]'::jsonb)) as s
      ) t
     where (t.x->>'saga_id')::uuid <> p_saga_id
       and not exists (
         select 1 from sagas c
          where c.id = (t.x->>'saga_id')::uuid and c.parent_saga_id = p_saga_id
       )
  ) then
    raise exception 'window saga out of scope';
  end if;

  insert into saga_items (saga_id, item_type, item_id, position, placement, optional, role, is_primary)
  select
    p_saga_id,
    (e->>'item_type')::public.item_type,
    (e->>'item_id')::uuid,
    (e->>'position')::integer,
    (e->>'placement')::public.saga_placement,
    coalesce((e->>'optional')::boolean, false),
    (e->>'role')::public.saga_item_role,
    not exists (
      select 1 from saga_items p
      where p.item_type = (e->>'item_type')::public.item_type
        and p.item_id = (e->>'item_id')::uuid
        and p.is_primary
    )
  from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) as e
  on conflict (saga_id, item_type, item_id) do update
    set position  = excluded.position,
        placement = excluded.placement,
        optional  = excluded.optional,
        role      = excluded.role;

  update sagas s
     set position_in_parent  = (b->>'position_in_parent')::integer,
         placement_in_parent = (b->>'placement_in_parent')::public.saga_placement,
         optional_in_parent  = coalesce((b->>'optional_in_parent')::boolean, false)
    from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) as b
   where s.id = (b->>'child_saga_id')::uuid
     and s.parent_saga_id = p_saga_id;

  delete from saga_items si
   using jsonb_array_elements(coalesce(p_removed, '[]'::jsonb)) as r
   where si.saga_id = p_saga_id
     and si.item_type = (r->>'item_type')::public.item_type
     and si.item_id = (r->>'item_id')::uuid;

  delete from saga_placement_windows w
   using jsonb_array_elements(coalesce(p_window_subjects, '[]'::jsonb)) as s
   where w.saga_id = (s->>'saga_id')::uuid
     and w.item_type is not distinct from (s->>'item_type')::public.item_type
     and w.item_id is not distinct from (s->>'item_id')::uuid
     and w.child_saga_id is not distinct from (s->>'child_saga_id')::uuid;

  insert into saga_placement_windows (
    saga_id, item_type, item_id, child_saga_id,
    after_item_type, after_item_id, after_child_saga_id,
    before_item_type, before_item_id, before_child_saga_id,
    motivo
  )
  select
    (w->>'saga_id')::uuid,
    (w->>'item_type')::public.item_type, (w->>'item_id')::uuid, (w->>'child_saga_id')::uuid,
    (w->>'after_item_type')::public.item_type, (w->>'after_item_id')::uuid, (w->>'after_child_saga_id')::uuid,
    (w->>'before_item_type')::public.item_type, (w->>'before_item_id')::uuid, (w->>'before_child_saga_id')::uuid,
    -- Cadena vacía a NULL antes del cast: un `''::public.saga_window_reason`
    -- lanza 22P02 y aborta la transacción ENTERA. La interfaz manda null, pero
    -- el RPC no puede confiar en su único llamante de hoy.
    nullif(btrim(coalesce(w->>'motivo', '')), '')::public.saga_window_reason
  from jsonb_array_elements(coalesce(p_windows, '[]'::jsonb)) as w;

  -- Metadatos de los huecos en tándem. Reemplazo por saga: un hueco que deja de
  -- ser tándem —o que se renumera— pierde su fila en la MISMA transacción en la
  -- que se reescribe la secuencia.
  --
  -- Por qué aquí SÍ vale el reemplazo por saga y en las ventanas no: las
  -- ventanas necesitaron sujetos explícitos (`p_window_subjects`) desde la
  -- fase 4 porque DOS pantallas escriben la misma fila —el editor del padre
  -- cura la ventana de una obra de su hija—. Un hueco, en cambio, pertenece a
  -- la secuencia de UNA saga, y solo el editor de esa saga lo escribe.
  delete from saga_tandems where saga_id = p_saga_id;

  insert into saga_tandems (saga_id, position, modo, nota)
  select
    p_saga_id,
    (t->>'position')::integer,
    (t->>'modo')::public.saga_tandem_mode,
    nullif(btrim(coalesce(t->>'nota', '')), '')
  from jsonb_array_elements(coalesce(p_tandems, '[]'::jsonb)) as t
  where (t->>'modo') is not null
     or nullif(btrim(coalesce(t->>'nota', '')), '') is not null;
end;
$function$;
```

- [ ] **Step 2: Aplicarla a DEV**

`mcp__supabase-dev__apply_migration`, nombre `20260804_save_saga_sequence_motivo`.

- [ ] **Step 3: Verificar que sigue habiendo UNA sola firma**

```sql
select count(*) as firmas,
       string_agg(pg_get_function_identity_arguments(oid), ' || ') as args,
       bool_and(prosecdef) as todas_security_definer
  from pg_proc where proname = 'save_saga_sequence';
```

Esperado: `firmas = 1`. **Si sale 2, has creado una sobrecarga por accidente** — la lista de parámetros no coincide con la anterior. Para, compárala carácter a carácter y arréglalo antes de seguir.

- [ ] **Step 4: Probar el camino completo a mano, contra dev**

```sql
select public.save_saga_sequence(
  '<saga_qa>'::uuid, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  '[{"saga_id":"<saga_qa>","item_type":"book","item_id":"<obra>","child_saga_id":null,
     "after_item_type":"book","after_item_id":"<ancla>","after_child_saga_id":null,
     "before_item_type":null,"before_item_id":null,"before_child_saga_id":null,
     "motivo":"spoiler"}]'::jsonb,
  '[{"saga_id":"<saga_qa>","item_type":"book","item_id":"<obra>","child_saga_id":null}]'::jsonb,
  '[]'::jsonb
);
select item_id, motivo from saga_placement_windows where saga_id = '<saga_qa>';
```

Esperado: una fila con `motivo = spoiler`. Después, **limpia**: `delete from saga_placement_windows where saga_id = '<saga_qa>'` — dev estaba a 0 ventanas y tiene que volver a 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260804_save_saga_sequence_motivo.sql
git commit -m "feat(db): save_saga_sequence escribe el motivo de la ventana"
```

---

## Task 3: `motivo` en el borrador (todo puro)

**Files:**
- Modify: `src/lib/sagas/types.ts`, `src/lib/sagas/derive-timeline.ts` (solo la cabecera de tipos), `src/lib/sagas/sequence-draft.ts`, `src/lib/sagas/get-saga-sequence.ts`
- Test: `src/lib/sagas/sequence-draft.test.ts`, `src/lib/sagas/get-saga-sequence.test.ts`

**Interfaces:**
- Consumes: la columna de la Task 1.
- Produces: `WindowReason` (en `types.ts`), `DraftWindow.reason`, `setWindowReason`, `SequencePayload["windows"][n].motivo`, `RawWindowRow.motivo`.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/sagas/sequence-draft.test.ts`:

```ts
import { setWindowReason, setAnchor, clearAnchor, toPayload } from "./sequence-draft";

const ancla = { kind: "item" as const, itemType: "book" as const, itemId: "a1", childSagaId: null, title: "A" };

describe("setWindowReason", () => {
  it("declara el motivo de una entrada libre que YA tiene ventana", () => {
    const d0 = setAnchor(draftConUnaLibre("i:book:x"), "i:book:x", "after", ancla);
    const d = setWindowReason(d0, "i:book:x", "spoiler");
    expect(d.free[0].window).toEqual({ after: ancla, before: null, reason: "spoiler" });
  });

  it("es un no-op si el sujeto no tiene ventana: sin tramo no hay motivo del que hablar", () => {
    const d0 = draftConUnaLibre("i:book:x");
    expect(setWindowReason(d0, "i:book:x", "contexto").free[0].window).toBeNull();
  });

  it("el motivo muere con la última ancla", () => {
    const d0 = setWindowReason(setAnchor(draftConUnaLibre("i:book:x"), "i:book:x", "after", ancla), "i:book:x", "spoiler");
    expect(clearAnchor(d0, "i:book:x", "after").free[0].window).toBeNull();
  });

  it("también vale para un sujeto anidado", () => {
    const d0 = setAnchor(draftConAnidada("i:book:n"), "i:book:n", "before", ancla);
    const d = setWindowReason(d0, "i:book:n", "contexto");
    expect(d.nested[0].window?.reason).toBe("contexto");
  });
});

describe("toPayload · motivo", () => {
  it("manda el motivo con su fila de ventana", () => {
    const d = setWindowReason(setAnchor(draftConUnaLibre("i:book:x"), "i:book:x", "after", ancla), "i:book:x", "spoiler");
    expect(toPayload(d, "s1").windows[0].motivo).toBe("spoiler");
  });

  it("una ventana sin motivo declarado manda null, no lo omite", () => {
    const d = setAnchor(draftConUnaLibre("i:book:x"), "i:book:x", "after", ancla);
    expect(toPayload(d, "s1").windows[0]).toHaveProperty("motivo", null);
  });
});
```

(`draftConUnaLibre` / `draftConAnidada` son los helpers que el fichero ya usa para montar borradores; reutiliza los que haya en vez de escribir otros.)

En `src/lib/sagas/get-saga-sequence.test.ts`:

```ts
it("hydrateWindows trae el motivo de la fila", () => {
  const out = hydrateWindows(
    [{ item_type: "book", item_id: "x", child_saga_id: null,
       after_item_type: "book", after_item_id: "a1", after_child_saga_id: null,
       before_item_type: null, before_item_id: null, before_child_saga_id: null,
       motivo: "contexto", created_at: "2026-01-01T00:00:00Z" }],
    new Map([["i:book:a1", "A"]]),
  );
  expect(out.get("i:book:x")?.reason).toBe("contexto");
});

it("una fila sin motivo hidrata a null, no a undefined", () => {
  const out = hydrateWindows(
    [{ item_type: "book", item_id: "x", child_saga_id: null,
       after_item_type: "book", after_item_id: "a1", after_child_saga_id: null,
       before_item_type: null, before_item_id: null, before_child_saga_id: null,
       motivo: null, created_at: "2026-01-01T00:00:00Z" }],
    new Map([["i:book:a1", "A"]]),
  );
  expect(out.get("i:book:x")).toEqual({ after: expect.anything(), before: null, reason: null });
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

```bash
eval "$(fnm env --shell bash)"; fnm use 22
npx vitest run src/lib/sagas/sequence-draft.test.ts src/lib/sagas/get-saga-sequence.test.ts
```

Esperado: FAIL — `setWindowReason is not a function` y `reason`/`motivo` no existen en los tipos.

- [ ] **Step 3: `WindowReason` en `types.ts`, junto a `TandemMode`**

En `src/lib/sagas/types.ts`, justo debajo de `TandemMode` (línea 45):

```ts
/** Por qué existe el tramo de una ventana recomendada
 *  (`saga_placement_windows.motivo`, fase 3). Nullable en BD y aquí: las
 *  ventanas curadas antes de esta fase no lo declararon, y nadie decidió por
 *  ellas. */
export type WindowReason = "spoiler" | "contexto";
```

- [ ] **Step 4: `derive-timeline.ts` deja de declarar sus propias uniones**

Sustituir las líneas 21-29 (las dos declaraciones locales `TandemMode` y `WindowReason`) por:

```ts
// Las dos uniones viven en `types.ts`, con el resto del vocabulario de la
// curación. Estaban declaradas AQUÍ además de allí (`TandemMode`, idéntica en
// las dos): dos definiciones de la misma unión que nada obliga a mantener
// iguales. Se reexportan para no romper a quien ya las importa de este módulo.
import type { TandemMode, WindowReason } from "./types";
export type { TandemMode, WindowReason };
```

Y en el mismo bloque, `TimelineTrack` gana un `notice` nullable:

```ts
/** Mini-track de la ventana (fase 3): dónde cae el tramo sobre la columna
 *  curada, y dónde está el lector dentro de él.
 *
 *  `youPct` y `notice` son null SIN SESIÓN, y el track no: la ficha es
 *  pública, así que el tramo se pinta igual — lo que desaparece es el
 *  marcador y el aviso. Deducir «hay sesión» de los estados NO vale: sin
 *  usuario, `get-saga-detail` ni siquiera consulta los pases y todos los
 *  nodos llegan con `status: null`, que es indistinguible de «no ha
 *  terminado nada». */
export type TimelineTrack = {
  fromPct: number;
  toPct: number;
  youPct: number | null;
  notice: "antes" | "dentro" | "pasada" | null;
};
```

- [ ] **Step 5: `DraftWindow.reason` y `setWindowReason`**

En `src/lib/sagas/sequence-draft.ts`, importar `WindowReason` de `./types` y cambiar el tipo:

```ts
/** Como máximo dos anclas, y al menos una: una ventana sin ninguna no existe
 *  (lo impone también un CHECK). `null` en las dos = no hay ventana. */
export type DraftWindow = {
  after: DraftAnchor | null;
  before: DraftAnchor | null;
  /** Por qué existe el tramo (fase 3). `null` = el curador no lo declaró.
   *  Muere CON la ventana: `clearAnchor` la devuelve entera a `null` al quitar
   *  la última ancla, así que un motivo sin tramo del que hablar no puede
   *  sobrevivir a la operación que lo dejaría huérfano. */
  reason: WindowReason | null;
};

/** Una ventana recién nacida: sin anclas y sin motivo. Existe para que los
 *  sitios que creaban `{ after: null, before: null }` a mano no se olviden de
 *  un campo cuando la forma crezca otra vez. */
const EMPTY_WINDOW: DraftWindow = { after: null, before: null, reason: null };
```

En `setAnchor`, los dos `?? { after: null, before: null }` pasan a `?? EMPTY_WINDOW`.

Y la operación nueva, justo debajo de `clearAnchor`:

```ts
/** Declara por qué existe la ventana de un sujeto. NO crea ventana: sin
 *  ninguna ancla no hay tramo del que hablar, y la fila ni siquiera pasaría el
 *  CHECK `saga_placement_windows_needs_anchor`. Un sujeto sin ventana es un
 *  no-op silencioso, igual que `setTandemMeta` con un hueco de una sola obra:
 *  la interfaz tampoco ofrece el control ahí. */
export function setWindowReason(
  d: SequenceDraft,
  key: string,
  reason: WindowReason | null,
): SequenceDraft {
  const put = (w: DraftWindow | null): DraftWindow | null => (w === null ? null : { ...w, reason });
  if (d.nested.some((n) => n.key === key)) {
    return { ...d, nested: d.nested.map((n) => (n.key === key ? { ...n, window: put(n.window) } : n)) };
  }
  if (!d.free.some((e) => e.key === key)) return d;
  return mapEntry(d, key, (e) => ({ ...e, window: put(e.window) }));
}
```

- [ ] **Step 6: `motivo` en el payload**

En `SequencePayload["windows"]`, añadir el campo al final de la forma de fila:

```ts
    before_child_saga_id: string | null;
    motivo: WindowReason | null;
```

Y en `windowRow` (dentro de `toPayload`), añadir la última clave:

```ts
      before_child_saga_id: before.childSagaId,
      motivo: w.reason,
```

- [ ] **Step 7: hidratar el motivo**

En `src/lib/sagas/get-saga-sequence.ts`:

1. `RawWindowRow` gana el campo, antes de `created_at`:

```ts
  before_child_saga_id: string | null;
  /** Motivo de la ventana (fase 3). `null` = no declarado. */
  motivo: WindowReason | null;
```

2. Los **dos** `select` de esta tabla (líneas 65 y 145) añaden `, motivo` antes de `, created_at`.

3. En `hydrateWindows`, la única línea que construye el resultado:

```ts
    result.set(subjectKey, { after, before, reason: r.motivo });
```

- [ ] **Step 8: Correr los tests hasta verde**

```bash
npx vitest run src/lib/sagas/
```

Esperado: PASS. Si `sequence-draft.test.ts` se queja de literales `{ after, before }` sin `reason` en tests viejos, **arréglalos añadiendo `reason: null`** — es la forma nueva, y que el compilador los señale es justo lo que se quería.

- [ ] **Step 9: Commit**

```bash
git add src/lib/sagas/types.ts src/lib/sagas/derive-timeline.ts src/lib/sagas/sequence-draft.ts src/lib/sagas/sequence-draft.test.ts src/lib/sagas/get-saga-sequence.ts src/lib/sagas/get-saga-sequence.test.ts
git commit -m "feat(sagas): el motivo de la ventana viaja en el borrador y en el payload"
```

---

## Task 4: el control del motivo en el editor

**Files:**
- Modify: `src/components/saga/sequence/window-editor.tsx`, `shell-desktop.tsx`, `shell-mobile.tsx`, `block-windows-drawer.tsx`, `use-sequence-draft.ts`, `messages/es.json`

**Interfaces:**
- Consumes: `setWindowReason`, `DraftWindow.reason` (Task 3).
- Produces: `data-testid="window-reason"`, y la prop `onSetReason: (reason: WindowReason | null) => void` de `WindowEditor`.

- [ ] **Step 1: Las claves de i18n**

En `messages/es.json`, namespace `sagaEditor`, junto a las `window*` que ya hay (líneas ~1214-1222):

```json
    "windowReasonTitle": "Por qué esta ventana",
    "windowReasonNone": "Sin declarar",
    "windowReasonSpoiler": "Spoilers",
    "windowReasonContexto": "Contexto",
    "windowReasonAria": "Por qué la ventana de {title}",
```

- [ ] **Step 2: Las pastillas en `WindowEditor`**

El control **solo se monta si ya hay ventana** (`draftWindow !== null`): sin tramo no hay motivo. Añadir al final del `return`, envolviendo lo que hay hoy en un fragmento con un contenedor en columna:

```tsx
const REASONS = [null, "spoiler", "contexto"] as const;
```

```tsx
  return (
    <div className="mt-1.5 grid gap-1.5">
      {/* `data-testid` nuevo, y NO decorativo: ver el Step 5 de esta tarea. */}
      <div data-testid="window-anchors" className="flex flex-wrap items-center gap-1.5">
        {after && chip("after", after)}
        {before && chip("before", before)}
        {!bothSet && (
          /* …el botón de añadir, exactamente como está hoy (líneas 70-82):
             `onClick={() => setPicking(after ? "before" : "after")}`, el
             `aria-label` de tres ramas y el texto de tres ramas. No lo
             reescribas: solo se mueve dentro del nuevo contenedor. */
        )}
      </div>

      {/* Solo con ventana viva: `setWindowReason` ignoraría el cambio
          igualmente, pero la interfaz tampoco debe ofrecer el control.
          «Sin declarar» es una opción de verdad, no un placeholder — es lo
          que distingue «no lo sabemos» de «da igual», el mismo criterio que
          el modo del tándem en la fase 2. */}
      {draftWindow !== null && (
        <div data-testid="window-reason" className="grid gap-1">
          <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
            {t("windowReasonTitle")}
          </span>
          <div role="group" aria-label={t("windowReasonAria", { title: subject.title })} className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button
                key={r ?? "none"}
                type="button"
                onClick={() => onSetReason(r)}
                aria-pressed={(draftWindow.reason ?? null) === r}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${
                  (draftWindow.reason ?? null) === r
                    ? "border-accent bg-accent/10 font-semibold"
                    : "border-border text-muted-foreground"
                }`}
              >
                {r === null ? t("windowReasonNone") : r === "spoiler" ? t("windowReasonSpoiler") : t("windowReasonContexto")}
              </button>
            ))}
          </div>
        </div>
      )}

      {picking && (
        /* …el AnchorPicker, tal cual está hoy… */
      )}
    </div>
  );
```

Y la prop nueva en la firma:

```ts
  onSetReason: (reason: WindowReason | null) => void;
```

- [ ] **Step 3: La operación en el hook**

En `src/components/saga/sequence/use-sequence-draft.ts`, importar `setWindowReason` del borrador y añadir, junto a `clearAnchor`:

```ts
      setWindowReason: (key: string, reason: WindowReason | null) =>
        touch((d) => setWindowReason(d, key, reason)),
```

- [ ] **Step 4: Cablear los TRES sitios que montan `WindowEditor`**

- `shell-desktop.tsx:134` y `shell-mobile.tsx:145` (zona «Cuando quieras»):
  ```tsx
    onSetReason={(reason) => ops.setWindowReason(e.key, reason)}
  ```
  y el tipo de `ops` en cada cáscara gana `setWindowReason: (key: string, reason: WindowReason | null) => void;`.

- `block-windows-drawer.tsx:44` (cajón de sujetos anidados): la prop se propaga igual que `onSetAnchor`/`onClearAnchor` —
  ```tsx
    onSetReason: (key: string, reason: WindowReason | null) => void;
    // …
    onSetReason={(reason) => onSetReason(n.key, reason)}
  ```
  y quien monta el cajón (`shell-desktop.tsx:78`, `shell-mobile.tsx:71`) le pasa `ops.setWindowReason`.

- [ ] **Step 5: Arreglar el assert de `sagas-ventanas.spec.ts` que estas pastillas rompen**

**Esto no es opcional y no se descubre solo:** `e2e/sagas-ventanas.spec.ts:238` comprueba

```ts
await expect(windowEditor.getByRole("button")).toHaveCount(2);
```

y su comentario dice por qué cuenta el total en vez de buscar un texto: es lo que demuestra que **no hay ninguna vía de añadir una tercera ancla**, «ni con esta redacción ni con otra futura». Con las tres pastillas dentro del mismo componente ese total pasa a 5 y el test cae — y caería **por el motivo equivocado**, porque no hay ninguna tercera ancla.

Arreglarlo **sin perder la intención**: acotar la cuenta a la fila de anclas, no relajarla.

```ts
    // El tope: con `bothSet`, `WindowEditor` no pinta NINGÚN botón de alta —
    // los dos únicos botones de la FILA DE ANCLAS son las ✕ de cada chip
    // (`windowRemoveAnchor`). Se cuenta el total DE ESA FILA, no el del
    // componente entero: desde la fase 3 el componente lleva además las tres
    // pastillas del motivo, que no son una vía de añadir anclas. Contar por
    // total sigue siendo lo que demuestra que no hay una tercera, ni con esta
    // redacción ni con otra futura.
    await expect(windowEditor.locator('[data-testid="window-anchors"]').getByRole("button")).toHaveCount(2);
```

- [ ] **Step 6: Comprobar que compila y que la suite sigue verde**

```bash
npx tsc --noEmit
npx vitest run
npm run test:e2e -- sagas-ventanas
```

- [ ] **Step 7: Mirarlo en dev**

Un solo `next dev` en el 3000. Editor de `[QA Sagas v2] Era Uno`, una obra en «Cuando quieras», ancla, y comprobar que aparecen las tres pastillas y que **desaparecen** al quitar la última ancla.

- [ ] **Step 8: Commit**

```bash
git add src/components/saga/sequence messages/es.json
git commit -m "feat(sagas): declarar por qué existe una ventana desde el editor"
```

---

## Task 5: el motivo llega hasta la fila del timeline

**Files:**
- Modify: `src/lib/sagas/types.ts`, `get-saga-detail.ts`, `map-types.ts`, `derive-map.ts`, `derive-timeline.ts`
- Test: `src/lib/sagas/get-saga-detail.test.ts`, `derive-map.test.ts`, `derive-timeline.test.ts`

**Interfaces:**
- Consumes: `WindowReason` (Task 3), la columna (Task 1).
- Produces: `ResolvedWindow.reason`, `SagaGraphNode.windowReason`, y `TimelineRow.reason` deja de ser siempre `null`.

- [ ] **Step 1: Los tests que fallan**

En `get-saga-detail.test.ts`, sobre `resolveWindows`:

```ts
it("resolveWindows propaga el motivo", () => {
  const out = resolveWindows(
    [{ item_type: "book", item_id: "x", child_saga_id: null,
       after_item_type: "book", after_item_id: "a1", after_child_saga_id: null,
       before_item_type: null, before_item_id: null, before_child_saga_id: null,
       motivo: "spoiler", created_at: "2026-01-01T00:00:00Z" }],
    new Map([["i:book:a1", "A"]]),
  );
  expect(out["i:book:x"].reason).toBe("spoiler");
});
```

En `derive-map.test.ts`:

```ts
it("el nodo sujeto de una ventana lleva su motivo", () => {
  const g = deriveSagaMap(grupos, { "i:book:libre": win({ afterKey: "i:book:o1", reason: "contexto" }) }, lookup);
  expect(g.nodes.find((n) => n.id === "i:book:libre")!.windowReason).toBe("contexto");
});

it("un sujeto BLOQUE no cuelga su motivo de la primera obra del bloque", () => {
  // Esa obra es una fila normal de la columna: colgarle el motivo pintaría una
  // ventana donde no la hay (límite de la fase 1, issue #221).
  const g = deriveSagaMap(grupos, { "s:hija": win({ afterKey: "i:book:o1", reason: "spoiler" }) }, lookup);
  expect(g.nodes.every((n) => n.windowReason === null)).toBe(true);
});
```

En `derive-timeline.test.ts`:

```ts
it("la fila de ventana lleva el motivo del nodo", () => {
  const tl = deriveTimeline(graph(
    [node("o1", { orderNo: 0 }), node("w", { orderNo: null, windowReason: "spoiler" })],
    [{ id: "e1", source: "o1", target: "w", type: "requisito", accent: "beige" }],
  ));
  const fila = tl[0].rows.find((r) => r.kind === "window")!;
  expect(fila.reason).toBe("spoiler");
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

```bash
npx vitest run src/lib/sagas/
```

Esperado: FAIL — `reason` / `windowReason` no existen.

- [ ] **Step 3: `ResolvedWindow.reason`**

En `src/lib/sagas/types.ts`:

```ts
export type ResolvedWindow = {
  afterTitle: string | null;
  beforeTitle: string | null;
  afterKey: string | null;
  beforeKey: string | null;
  /** Motivo declarado de la ventana (fase 3), o null. A diferencia de las
   *  anclas, NO puede «romperse»: no apunta a nada que pueda desaparecer. */
  reason: WindowReason | null;
};
```

- [ ] **Step 4: `get-saga-detail.ts`**

1. El `select` de la línea 535 añade `, motivo` antes de `, created_at`.
2. En `resolveWindows`, la construcción del resultado:

```ts
    result[subjectKey] = {
      afterTitle,
      beforeTitle,
      afterKey: afterTitle === null ? null : keyOf(r.after_item_type, r.after_item_id, r.after_child_saga_id),
      beforeKey: beforeTitle === null ? null : keyOf(r.before_item_type, r.before_item_id, r.before_child_saga_id),
      reason: r.motivo,
    };
```

- [ ] **Step 5: `SagaGraphNode.windowReason`**

En `src/lib/sagas/map-types.ts`, importar `WindowReason` de `./types` y añadir junto a `tandem`:

```ts
  /** Motivo de la ventana de la que este nodo es SUJETO
   *  (`saga_placement_windows.motivo`, fase 3). `null` si el nodo no es sujeto
   *  de ninguna ventana, o si el curador no declaró el motivo. Se resuelve en
   *  `deriveSagaMap`, donde ya se sabe QUÉ nodo es el sujeto — `deriveTimeline`
   *  no vuelve a mirar la tabla ni a resolver la clave: dos resoluciones del
   *  mismo dato acaban discrepando (#91/#185/#203). */
  windowReason: WindowReason | null;
```

- [ ] **Step 6: `derive-map.ts` lo rellena**

1. `makeNode` (línea ~151, donde pone `tandem: null`) añade `windowReason: null` — el valor por defecto de todo nodo.
2. En el bucle de aristas de ventana, justo después de resolver el sujeto:

```ts
    const subject = resolveEntry(subjectKey, "first");
    if (subject === null) continue;

    // El motivo se cuelga del nodo SUJETO, y solo si el sujeto es una OBRA.
    // Un sujeto BLOQUE se resuelve a la primera obra del bloque, que es una
    // fila normal de la columna: colgarle ahí el motivo pintaría una ventana
    // donde no la hay. Es el mismo límite que la fase 1 asumió al no producir
    // fila `window` para un bloque, abierto en la issue #221.
    if (subjectSagaId === null) {
      const subjectNode = byId.get(subject);
      if (subjectNode) subjectNode.windowReason = w.reason;
    }
```

- [ ] **Step 7: `derive-timeline.ts` lo lee**

La única línea que construye la fila `window` (hoy `reason: null`):

```ts
    const row: TimelineRow = {
      kind: "window", no: null, node: n, after, before,
      reason: n.windowReason,
      track: null, // Task 6
    };
```

- [ ] **Step 8: Los literales de nodo de los tests**

`derive-timeline.test.ts:26` (la factoría `node`), `:403`, `:406`, y `get-saga-detail.test.ts:268` ganan `windowReason: null`. Que TypeScript los señale uno a uno es la comprobación de que no queda ninguno sin actualizar.

- [ ] **Step 9: Verde**

```bash
npx tsc --noEmit && npx vitest run
```

- [ ] **Step 10: Commit**

```bash
git add src/lib/sagas
git commit -m "feat(sagas): el motivo de la ventana llega del grafo a la fila del timeline"
```

---

## Task 6: `windowTrack`, la función pura del mini-track

**Files:**
- Create: `src/lib/sagas/window-track.ts`, `src/lib/sagas/window-track.test.ts`
- Modify: `src/lib/sagas/completion.ts`, `src/lib/sagas/derive-timeline.ts`
- Test: `src/lib/sagas/derive-timeline.test.ts`

**Interfaces:**
- Consumes: `SagaGraph`, `TimelineTrack` (Task 3).
- Produces: `windowTrack(graph, anchors, opts)`, `isStatusCompleted(status)`, y `deriveTimeline(graph, { spine, authenticated })`.

- [ ] **Step 1: Los tests que fallan**

`src/lib/sagas/window-track.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SagaGraph, SagaGraphNode } from "./map-types";
import { windowTrack } from "./window-track";

// Columna de 4 obras: 25 % / 50 % / 75 % / 100 %.
const n = (id: string, orderNo: number | null, status: SagaGraphNode["status"] = null): SagaGraphNode => ({
  id, kind: "item", x: 0, y: 0, level: "principal", orderNo, label: id, accent: "beige",
  status, role: null, coverUrl: null, covers: [], href: `/${id}`, memberCount: null,
  groupSagaId: "g", groupName: "G", step: null, tandem: null, windowReason: null,
});
const g = (nodes: SagaGraphNode[]): SagaGraph => ({ nodes, edges: [] });
const cuatro = (...done: string[]) =>
  g(["o1", "o2", "o3", "o4"].map((id, i) => n(id, i, done.includes(id) ? "completed" : null)));

describe("windowTrack", () => {
  it("sitúa el tramo entre sus dos anclas", () => {
    const t = windowTrack(cuatro(), { after: n("o1", 0), before: n("o3", 2) }, { authenticated: true })!;
    expect([t.fromPct, t.toPct]).toEqual([25, 75]);
  });

  it("sin ancla «después de», el tramo empieza abierto", () => {
    const t = windowTrack(cuatro(), { after: null, before: n("o2", 1) }, { authenticated: true })!;
    expect([t.fromPct, t.toPct]).toEqual([0, 50]);
  });

  it("sin ancla «antes de», el tramo acaba abierto", () => {
    const t = windowTrack(cuatro(), { after: n("o2", 1), before: null }, { authenticated: true })!;
    expect([t.fromPct, t.toPct]).toEqual([50, 100]);
  });

  it("un ancla que no está en la columna abre ese extremo", () => {
    // Una obra `libre` no tiene orderNo, así que no tiene sitio en la barra.
    const t = windowTrack(cuatro(), { after: n("suelta", null), before: n("o3", 2) }, { authenticated: true })!;
    expect(t.fromPct).toBe(0);
  });

  it("aún no: lo completado se queda antes del tramo", () => {
    const t = windowTrack(cuatro("o1"), { after: n("o3", 2), before: n("o4", 3) }, { authenticated: true })!;
    expect(t.notice).toBe("antes");
    expect(t.youPct).toBe(25);
  });

  it("dentro: lo completado cae en el tramo", () => {
    const t = windowTrack(cuatro("o1", "o2"), { after: n("o1", 0), before: n("o3", 2) }, { authenticated: true })!;
    expect(t.notice).toBe("dentro");
  });

  it("pasada: lo completado va más allá del tramo", () => {
    const t = windowTrack(cuatro("o1", "o2", "o3", "o4"), { after: n("o1", 0), before: n("o2", 1) }, { authenticated: true })!;
    expect(t.notice).toBe("pasada");
  });

  it("sin nada completado, el lector está al principio", () => {
    const t = windowTrack(cuatro(), { after: n("o2", 1), before: n("o3", 2) }, { authenticated: true })!;
    expect(t.youPct).toBe(0);
    expect(t.notice).toBe("antes");
  });

  it("SIN SESIÓN pinta el tramo pero ni marcador ni aviso", () => {
    const t = windowTrack(cuatro(), { after: n("o1", 0), before: n("o3", 2) }, { authenticated: false })!;
    expect([t.fromPct, t.toPct]).toEqual([25, 75]);
    expect(t.youPct).toBeNull();
    expect(t.notice).toBeNull();
  });

  it("una ventana al revés no pinta track", () => {
    // «después de o3» y «antes de o1»: una banda de anchura negativa es peor
    // que ninguna. El texto de las anclas sigue estando en la fila.
    expect(windowTrack(cuatro(), { after: n("o3", 2), before: n("o1", 0) }, { authenticated: true })).toBeNull();
  });

  it("sin columna no hay barra sobre la que situar nada", () => {
    expect(windowTrack(g([]), { after: null, before: null }, { authenticated: true })).toBeNull();
  });
});
```

Y en `derive-timeline.test.ts`:

```ts
it("la fila de ventana trae su track cuando hay sesión", () => {
  const tl = deriveTimeline(
    graph([node("o1", { orderNo: 0 }), node("w", { orderNo: null })],
          [{ id: "e1", source: "o1", target: "w", type: "requisito", accent: "beige" }]),
    { authenticated: true },
  );
  const fila = tl[0].rows.find((r) => r.kind === "window")!;
  expect(fila.track).not.toBeNull();
  expect(fila.track!.notice).not.toBeNull();
});

it("sin sesión la fila de ventana sigue trayendo track, sin marcador", () => {
  const tl = deriveTimeline(
    graph([node("o1", { orderNo: 0 }), node("w", { orderNo: null })],
          [{ id: "e1", source: "o1", target: "w", type: "requisito", accent: "beige" }]),
    { authenticated: false },
  );
  const fila = tl[0].rows.find((r) => r.kind === "window")!;
  expect(fila.track!.youPct).toBeNull();
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

```bash
npx vitest run src/lib/sagas/window-track.test.ts src/lib/sagas/derive-timeline.test.ts
```

Esperado: FAIL — no existe `./window-track`.

- [ ] **Step 3: El predicado, con dos formas de entrada y un solo cuerpo**

En `src/lib/sagas/completion.ts`:

```ts
import type { DetailMember, MemberStatus } from "./types";

/** El predicado, sobre el estado desnudo. Existe porque el mini-track de la
 *  fase 3 mira nodos del grafo (`SagaGraphNode.status`), no `DetailMember`, y
 *  escribir ahí un `=== "completed"` suelto sería el segundo sitio que define
 *  «completado» — que es literalmente el #91. */
export function isStatusCompleted(status: MemberStatus): boolean {
  return status === "completed";
}

// Una relectura es in_progress y completada a la vez; aquí manda el estado del
// pase activo, igual que antes de extraer la función.
export function isMemberCompleted(member: DetailMember | undefined): boolean {
  return isStatusCompleted(member?.status ?? null);
}
```

- [ ] **Step 4: `window-track.ts`**

```ts
import { isStatusCompleted } from "./completion";
import type { TimelineTrack } from "./derive-timeline";
import type { SagaGraph, SagaGraphNode } from "./map-types";

// El mini-track del frame B: sitúa la ventana sobre la saga ENTERA y marca
// dónde está el lector. Puro, y con el grafo como única entrada — no consulta
// nada ni recibe `DetailMember`s: el nodo ya trae `status`.
//
// **NO toca el progreso.** Lee lo completado con el predicado único
// (`isStatusCompleted`), no cuenta nada, no divide por nada y no aparece en
// ningún denominador. La spec lo pone como límite duro de la feature entera:
// reabrir el denominador es la familia del #91 y del #185.
export function windowTrack(
  graph: SagaGraph,
  anchors: { after: SagaGraphNode | null; before: SagaGraphNode | null },
  opts: { authenticated: boolean },
): TimelineTrack | null {
  // La barra ES la columna curada: las obras con hueco, en su orden. Mismo
  // criterio de desempate que `deriveTimeline` (orderNo, y label para el
  // empate de un tándem) para que las dos vean la misma columna.
  const spine = graph.nodes
    .filter((n) => n.kind === "item" && n.orderNo !== null)
    .sort((a, b) => a.orderNo! - b.orderNo! || a.label.localeCompare(b.label));
  if (spine.length === 0) return null;

  const idx = new Map(spine.map((n, i) => [n.id, i] as const));
  const pct = (i: number) => ((i + 1) / spine.length) * 100;

  // Un ancla que no está en la columna (resolvió a una obra `libre`, sin
  // hueco) no tiene sitio en la barra: ese extremo se pinta ABIERTO en vez de
  // inventarle una posición.
  const at = (n: SagaGraphNode | null, open: number): number => {
    if (n === null) return open;
    const i = idx.get(n.id);
    return i === undefined ? open : pct(i);
  };

  const fromPct = at(anchors.after, 0);
  const toPct = at(anchors.before, 100);
  // Ventana al revés: el curador ancló «después de» a algo posterior a «antes
  // de». Una banda de anchura negativa es peor que ninguna, y la fila sigue
  // diciendo las dos anclas por su nombre, que es lo que permite verlo.
  if (fromPct > toPct) return null;

  // La ficha es pública: el tramo se pinta igual. Lo que desaparece sin sesión
  // es el marcador y el aviso — y hay que preguntarlo, no deducirlo: sin
  // usuario, `get-saga-detail` ni consulta los pases y TODOS los nodos llegan
  // con `status: null`, indistinguible de «no ha terminado nada».
  if (!opts.authenticated) return { fromPct, toPct, youPct: null, notice: null };

  let last = -1;
  for (const n of spine) {
    if (!isStatusCompleted(n.status)) continue;
    const i = idx.get(n.id)!;
    if (i > last) last = i;
  }
  // Nada completado = el lector está en la salida, no fuera de la barra.
  const youPct = last === -1 ? 0 : pct(last);
  const notice = youPct < fromPct ? "antes" : youPct > toPct ? "pasada" : "dentro";

  return { fromPct, toPct, youPct, notice };
}
```

- [ ] **Step 5: `deriveTimeline` lo llama**

Firma y arranque:

```ts
export function deriveTimeline(
  graph: SagaGraph,
  opts: { spine?: TimelineSpine; authenticated?: boolean } = {},
): TimelineSection[] {
  const spineMode = opts.spine ?? "curation";
  const authenticated = opts.authenticated ?? false;
```

Y la fila:

```ts
    const row: TimelineRow = {
      kind: "window", no: null, node: n, after, before,
      reason: n.windowReason,
      track: windowTrack(graph, { after, before }, { authenticated }),
    };
```

Con el import correspondiente. **`authenticated` por defecto `false`** a propósito: quien no lo pase obtiene la vista pública, que es la segura — nunca al revés.

- [ ] **Step 6: Verde**

```bash
npx tsc --noEmit && npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/sagas/window-track.ts src/lib/sagas/window-track.test.ts src/lib/sagas/completion.ts src/lib/sagas/derive-timeline.ts src/lib/sagas/derive-timeline.test.ts
git commit -m "feat(sagas): windowTrack sitúa la ventana y al lector sobre la columna"
```

---

## Task 7: pintar el tramo, el aviso y el motivo

**Files:**
- Create: `src/components/saga/timeline/window-track-bar.tsx`
- Modify: `src/components/saga/timeline/timeline-window-row.tsx`, `timeline-labels.ts`, `src/components/saga/saga-map-tab.tsx`, `route-view.tsx`, `messages/es.json`

**Interfaces:**
- Consumes: `TimelineRow.reason`/`track` (Tasks 5 y 6), `detail.isAuthenticated`.
- Produces: `data-testid="window-track"`, `data-testid="window-notice"`, `data-testid="window-reason-note"`.

- [ ] **Step 1: Las claves de i18n**

En `messages/es.json`, namespace `saga`, junto a las `timelineWindow*` (líneas ~1026-1029):

```json
    "timelineWindowReasonSpoiler": "Fuera de la ventana hay spoilers en los dos sentidos.",
    "timelineWindowReasonContexto": "Dentro de la ventana se entiende mejor: fuera pierdes contexto.",
    "timelineWindowNoticeAntes": "Aún no: la ventana se abre más adelante.",
    "timelineWindowNoticeDentro": "Estás dentro de la ventana. Buen momento para leerlo.",
    "timelineWindowNoticePasada": "Te has pasado de la ventana. Sigue siendo legible.",
    "timelineWindowTrackAria": "Tramo de la ventana de {title} sobre el orden de lectura",
    "timelineWindowTrackStart": "Inicio",
    "timelineWindowTrackEnd": "Final",
```

- [ ] **Step 2: `timeline-labels.ts`**

Añadir al tipo y al constructor:

```ts
  windowReason: (reason: "spoiler" | "contexto") => string;
  windowNotice: (notice: "antes" | "dentro" | "pasada") => string;
  windowTrackAria: (title: string) => string;
  windowTrackStart: string;
  windowTrackEnd: string;
```

```ts
    windowReason: (reason) =>
      reason === "spoiler" ? t("timelineWindowReasonSpoiler") : t("timelineWindowReasonContexto"),
    windowNotice: (notice) =>
      notice === "antes"
        ? t("timelineWindowNoticeAntes")
        : notice === "dentro"
          ? t("timelineWindowNoticeDentro")
          : t("timelineWindowNoticePasada"),
    windowTrackAria: (title) => t("timelineWindowTrackAria", { title }),
    windowTrackStart: t("timelineWindowTrackStart"),
    windowTrackEnd: t("timelineWindowTrackEnd"),
```

- [ ] **Step 3: La barra**

`src/components/saga/timeline/window-track-bar.tsx`:

```tsx
import type { TimelineTrack } from "@/lib/sagas/derive-timeline";

// La barra del frame B: el orden de lectura entero como carril, el tramo de la
// ventana como banda, y el lector como marcador. Pieza propia porque es lo
// único del timeline con geometría — el resto de las filas son texto y tarjeta.
//
// Sin sesión, `youPct` es null y NO se pinta marcador: la ficha es pública y el
// tramo vale igual. Ese caso NO es una variante secundaria, es la vista por
// defecto de cualquiera que llegue de fuera.
export function WindowTrackBar({
  track,
  ariaLabel,
  startLabel,
  endLabel,
}: {
  track: TimelineTrack;
  ariaLabel: string;
  startLabel: string;
  endLabel: string;
}) {
  return (
    <div data-testid="window-track" className="mt-2.5 border-t border-border pt-2">
      <div
        role="img"
        aria-label={ariaLabel}
        className="relative my-1.5 h-[18px]"
      >
        <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full bg-surface-muted">
          <span
            className="absolute inset-y-0 bg-accent/30"
            style={{ left: `${track.fromPct}%`, right: `${100 - track.toPct}%` }}
          />
        </div>
        <span className="absolute top-0 h-[18px] w-[2.5px] rounded-full bg-accent" style={{ left: `${track.fromPct}%` }} />
        <span className="absolute top-0 h-[18px] w-[2.5px] rounded-full bg-accent" style={{ left: `${track.toPct}%` }} />
        {track.youPct !== null && (
          <span
            data-testid="window-track-you"
            className="absolute top-[-2px] h-[22px] w-[10px] -translate-x-1/2 rounded border-[2.5px] border-foreground bg-surface"
            style={{ left: `${track.youPct}%` }}
          />
        )}
      </div>
      <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.04em] text-muted-foreground">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Montarla en la fila**

En `timeline-window-row.tsx`, importar la pieza (`import { WindowTrackBar } from "./window-track-bar";`) y montarla debajo del párrafo de las anclas que ya existe:

```tsx
        {row.track && (
          <WindowTrackBar
            track={row.track}
            ariaLabel={labels.windowTrackAria(row.node.label)}
            startLabel={labels.windowTrackStart}
            endLabel={labels.windowTrackEnd}
          />
        )}
        {row.track?.notice && (
          <p data-testid="window-notice" className="mt-1.5 text-[11px] font-semibold">
            {labels.windowNotice(row.track.notice)}
          </p>
        )}
        {row.reason && (
          <p data-testid="window-reason-note" className="mt-1 text-[11px] text-muted-foreground">
            {labels.windowReason(row.reason)}
          </p>
        )}
```

Y actualizar el comentario de cabecera del fichero: ya no es cierto que `track`/`reason` sean null hasta la fase 3.

- [ ] **Step 5: Pasar `authenticated` en los DOS sitios que derivan el timeline**

- `saga-map-tab.tsx:101` y `:114`:
  ```tsx
    <ReadingTimeline sections={deriveTimeline(graph, { authenticated: detail.isAuthenticated })} />
  ```
- `route-view.tsx:102`:
  ```tsx
    const timelineSections = graph === null
      ? null
      : deriveTimeline(graph, { spine: "route", authenticated: detail.isAuthenticated });
  ```
  (En modo `route` no se producen filas `window`, así que el flag no cambia nada hoy; se pasa igualmente para que no haya un sitio que lo olvide cuando sí las produzca.)

- [ ] **Step 6: Mirarlo en dev, CON sesión y SIN ella**

Sembrar una ventana con motivo en dev (dev está a 0 ventanas), abrir la ficha del universo QA con `show_map`, y comprobar:
- con sesión: banda, dos topes, marcador y aviso;
- en ventana de incógnito: banda y topes, **sin** marcador y **sin** aviso, y el motivo se sigue leyendo.

Luego limpiar la ventana sembrada.

- [ ] **Step 7: Verde y commit**

```bash
npx tsc --noEmit && npx vitest run
git add src/components/saga messages/es.json
git commit -m "feat(sagas): la ventana dice por qué existe y dónde estás dentro de ella"
```

---

## Task 8: el e2e

**Files:**
- Create: `e2e/sagas-ventana-motivo-track.spec.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada que consuma otra tarea.

Patrón calcado de `e2e/sagas-tandem-metadatos.spec.ts`: `fetch` nativo (no el fixture `request`, que muere con el contexto y dejaría filas huérfanas en un timeout), `res.ok` comprobado en cada escritura (#180/#182), y la semilla devuelta a como estaba en un `finally`.

- [ ] **Step 1: Escribir el spec**

```ts
import { expect, test, type Page } from "@playwright/test";

// E2E de la fase 3: el MOTIVO de una ventana y su mini-track. Lo que cubre y
// las unitarias no pueden: que el motivo llega a BD por el `p_windows` del RPC
// (sin argumento nuevo), que sobrevive a una recarga del editor, y que la ficha
// PÚBLICA pinta el tramo sin marcador para quien no ha iniciado sesión — que es
// el riesgo 5 de la spec y lo único que ninguna unitaria ve entero.
const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab"; // [QA Sagas v2] Era Uno
const UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039"; // el único universo QA con show_map
const RARO_ID = "d6d61eab-6ef4-4691-a8f0-b89068508fd4";     // Libro raro sin match
const RAYUELA_ID = "b397333b-7f8c-40a2-b62e-2aa3eb6bf64a";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json", ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText} — ${await res.text()}`);
  return res;
}

const fetchWindows = async (): Promise<Array<{ item_id: string; motivo: string | null }>> =>
  (await api(`saga_placement_windows?saga_id=eq.${ERA_UNO_ID}&select=item_id,motivo`)).json();

type ItemRow = { item_id: string; position: number | null; placement: string | null };
const fetchItems = async (): Promise<ItemRow[]> =>
  (await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&select=item_id,position,placement`)).json();

/** Devuelve Era Uno a su línea base: un guardado real renumera TODA la lista. */
async function restore(items: ItemRow[]) {
  for (const r of items) {
    await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${r.item_id}`, {
      method: "PATCH",
      body: JSON.stringify({ position: r.position, placement: r.placement }),
    });
  }
  await api(`saga_placement_windows?saga_id=eq.${ERA_UNO_ID}`, { method: "DELETE" });
}

async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

const RARO_TITLE = "Libro raro sin match";
const RAYUELA_TITLE = "Rayuela";

// Las dos cáscaras del editor se montan A LA VEZ y se ocultan por breakpoint
// (regla de los dos árboles): sin `:visible`, ambigüedad segura. El editor de
// ventana es el hermano siguiente de la fila, igual que en
// `sagas-ventanas.spec.ts`, de donde sale todo el gesto de anclar.
const raroRow = (page: Page) =>
  page.locator(`[data-testid="sequence-row"][data-key="i:book:${RARO_ID}"]:visible`);
const windowEditor = (page: Page) => raroRow(page).locator("xpath=following-sibling::div[1]");
const reasonBox = (page: Page) => windowEditor(page).locator('[data-testid="window-reason"]');
const save = async (page: Page) => {
  await page.getByRole("button", { name: "Guardar secuencia" }).locator("visible=true").click();
  await expect(page.getByText("Guardado", { exact: true }).locator("visible=true")).toBeVisible();
};

/** Manda «Libro raro sin match» a «Cuando quieras» y le pone el ancla «a partir
 *  de Rayuela». Gesto calcado de `sagas-ventanas.spec.ts:193-218`, incluido lo
 *  que allí costó descubrir: el botón de alta lleva `aria-label` propio
 *  (`windowAddFor`), que PISA el texto visible «+ Añadir ventana» como nombre
 *  accesible, y el <dialog> de `AnchorPicker` sí usa el texto visible. */
async function libreConAncla(page: Page) {
  await raroRow(page).getByRole("button", { name: /^Acciones de /, exact: false }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cuando quieras" }).click();
  await windowEditor(page)
    .getByRole("button", { name: `Añadir ventana a ${RARO_TITLE}`, exact: true })
    .click();
  const dlg = page.getByRole("dialog", { name: "+ A partir de…" });
  // Clic en el <li>, no en el radio: vive `sr-only` dentro del <label>.
  await dlg.locator("li").filter({ hasText: RAYUELA_TITLE }).click();
  await dlg.getByRole("button", { name: "+ A partir de…", exact: true }).click();
}

test("declarar el motivo de una ventana persiste tras recargar", async ({ page }) => {
  const items = await fetchItems();
  try {
    await loginAsDevtest(page);
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);

    // Sin ancla no hay ventana, y sin ventana no hay control de motivo: esa
    // mitad del test la prueba este `toHaveCount(0)`, ANTES de anclar.
    await raroRow(page).getByRole("button", { name: /^Acciones de /, exact: false }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cuando quieras" }).click();
    await expect(reasonBox(page)).toHaveCount(0);

    await windowEditor(page)
      .getByRole("button", { name: `Añadir ventana a ${RARO_TITLE}`, exact: true })
      .click();
    const dlg = page.getByRole("dialog", { name: "+ A partir de…" });
    await dlg.locator("li").filter({ hasText: RAYUELA_TITLE }).click();
    await dlg.getByRole("button", { name: "+ A partir de…", exact: true }).click();

    await expect(reasonBox(page)).toHaveCount(1);
    await reasonBox(page).getByRole("button", { name: "Spoilers", exact: true }).click();
    await save(page);

    // Contra BD, no contra la pantalla: es lo único que demuestra que el motivo
    // viajó DENTRO de `p_windows` y que el RPC lo escribió.
    expect(await fetchWindows()).toEqual([{ item_id: RARO_ID, motivo: "spoiler" }]);

    await page.reload();
    await expect(reasonBox(page).getByRole("button", { name: "Spoilers", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
  } finally {
    await restore(items);
  }
});

test("quitar la última ancla se lleva el motivo por delante", async ({ page }) => {
  const items = await fetchItems();
  try {
    await loginAsDevtest(page);
    await page.goto(`/saga/${ERA_UNO_ID}/editar`);
    await libreConAncla(page);
    await reasonBox(page).getByRole("button", { name: "Contexto", exact: true }).click();

    // Quitar la única ancla: la ventana entera muere, y el motivo con ella. No
    // hay CHECK que pueda imponerlo (`saga_placement_windows_needs_anchor`
    // rechaza la fila sin anclas, pero nadie borra la que ya existe): lo
    // sostiene `clearAnchor` en el borrador, y el guardado tiene que reflejarlo.
    await windowEditor(page)
      .getByRole("button", { name: `Quitar «${RAYUELA_TITLE}» de ${RARO_TITLE}`, exact: true })
      .click();
    await expect(reasonBox(page)).toHaveCount(0);
    await save(page);

    expect(await fetchWindows()).toEqual([]);
  } finally {
    await restore(items);
  }
});

test("la ficha pública pinta el tramo, y SIN sesión no marca posición", async ({ browser }) => {
  const items = await fetchItems();
  try {
    // Semilla por REST: aísla el render de la UI de curación, que ya cubren los
    // dos tests de arriba.
    await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_id=eq.${RARO_ID}`, {
      method: "PATCH", body: JSON.stringify({ position: null, placement: "libre" }),
    });
    await api("saga_placement_windows", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        saga_id: ERA_UNO_ID, item_type: "book", item_id: RARO_ID,
        after_item_type: "book", after_item_id: RAYUELA_ID, motivo: "spoiler",
      }),
    });

    // Contexto NUEVO y sin sesión: la ficha es pública, y esta es la vista por
    // defecto de cualquiera que llegue de fuera.
    const anon = await browser.newContext();
    const page = await anon.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&ruta=lectura`);

    const fila = page.locator('[data-testid="timeline-window"]:visible').first();
    await expect(fila).toBeVisible();
    await expect(fila.locator('[data-testid="window-track"]')).toBeVisible();
    await expect(fila.locator('[data-testid="window-reason-note"]')).toContainText("spoilers");
    // Sin sesión: ni marcador ni aviso.
    await expect(fila.locator('[data-testid="window-track-you"]')).toHaveCount(0);
    await expect(fila.locator('[data-testid="window-notice"]')).toHaveCount(0);
    await anon.close();
  } finally {
    await restore(items);
  }
});
```

- [ ] **Step 2: Correrlo**

```bash
npm run test:e2e -- sagas-ventana-motivo-track
```

Esperado: 3 passed. Si un locator no casa, recuerda lo que costó una pasada entera en la fase 2: **un locator que no casa se agota como TIMEOUT del test, no como fallo claro**. Compara el nombre accesible real (`aria-label`) con el que buscas antes de sospechar del producto.

- [ ] **Step 3: La suite entera, para ver qué rompió**

```bash
npm run test:e2e
```

Vigila `sagas-ventanas.spec.ts` y `sagas-mapa-derivado.spec.ts`: la fila de ventana ha ganado contenido y alguno de sus asserts de texto puede volverse ambiguo. El de `sagas-ventanas.spec.ts:238` (la cuenta de botones) ya lo arregló la Task 4, Step 5 — si vuelve a fallar, es otro. Si alguno cae, **actualízalo dejando escrito por qué** (como se hizo en la fase 1 con la rama «Requisito»), no lo relajes.

Si aparece el fallo intermitente de `sagas-ventanas.spec.ts:279`, es la issue **#219**, ya abierta: anótalo ahí, no lo diagnostiques otra vez.

- [ ] **Step 4: Commit**

```bash
git add e2e/
git commit -m "test(e2e): el motivo de la ventana y el mini-track sin sesión"
```

---

## Task 9: inyección de fallo

Igual que en las fases 1, 2 y 4: **romper el producto por tres sitios, de uno en uno, y comprobar que cae exactamente el test que debe.** Si una rotura no tumba ningún test, el test no vale y hay que arreglarlo — eso es lo que destapó el #214 y lo que en la fase 1 obligó a reescribir un assert que pasaba con la numeración rota.

- [ ] **Step 1: Rotura 1 — el RPC ignora el motivo**

Quitar `motivo` del `insert` del RPC en dev (dejando la columna). Correr `sagas-ventana-motivo-track`.
Esperado: **cae** el test 1 con `motivo: null` en vez de `"spoiler"`. Restaurar.

- [ ] **Step 2: Rotura 2 — el track ignora la sesión**

En `window-track.ts`, borrar el corte `if (!opts.authenticated) return …` (que siempre calcule `youPct`). Correr la suite.
Esperado: **cae** el test 3 (`window-track-you` aparece sin sesión) **y** la unitaria «SIN SESIÓN pinta el tramo pero ni marcador ni aviso». Restaurar.

- [ ] **Step 3: Rotura 3 — el motivo no muere con la ventana**

En `sequence-draft.ts`, hacer que `clearAnchor` devuelva `{ ...w, [side]: null }` sin el corte que anula la ventana entera.
Esperado: **cae** la unitaria «el motivo muere con la última ancla» **y** el e2e 2 (queda fila en BD). Restaurar.

- [ ] **Step 4: Anotar el resultado**

Si alguna rotura NO tumba ningún test, arregla el test **antes** de seguir y déjalo dicho en el cuerpo del PR. Si lo tumba con un mensaje confuso (un timeout en vez de una aserción), mejora el assert.

- [ ] **Step 5: Verificar que dev queda como estaba**

```sql
select count(*) as ventanas_dev from saga_placement_windows;   -- esperado: 0
select count(*) as firmas from pg_proc where proname='save_saga_sequence';  -- esperado: 1
```

---

## Task 10: producción — **antes** del merge

Esta tarea va aquí **a propósito**. En la fase 2 el merge desplegó el bundle nuevo antes de que las migraciones estuvieran en prod y hubo una ventana de minutos en la que un guardado de secuencia rebotaba con «function does not exist». Aquí el riesgo es el mismo con otro nombre: sin la columna `motivo`, el `insert` del RPC nuevo revienta. **La migración va primero.**

Y aplicarla antes es **seguro**: el bundle que hay desplegado hoy no manda la clave `motivo`, así que `w->>'motivo'` da NULL y el RPC nuevo se comporta exactamente igual que el viejo para él.

- [ ] **Step 1: Estado de prod, antes**

```sql
select
  (select count(*) from pg_type where typname='saga_window_reason') as enum_,
  (select count(*) from information_schema.columns
    where table_name='saga_placement_windows' and column_name='motivo') as col,
  (select count(*) from saga_placement_windows) as ventanas,
  (select count(*) from pg_proc where proname='save_saga_sequence') as firmas;
```

Esperado antes: `0, 0, 4, 1`.

- [ ] **Step 2: Aplicar las DOS migraciones a prod, en orden**

`mcp__supabase-prod__apply_migration` con `20260803_saga_window_reason` y después `20260804_save_saga_sequence_motivo`.

- [ ] **Step 3: Verificar**

La misma consulta. Esperado: `1, 1, 4, 1`. Las **4 ventanas siguen ahí** y **ninguna** tiene motivo:

```sql
select count(*) filter (where motivo is not null) as con_motivo,
       count(*) as total
  from saga_placement_windows;
```

Esperado: `0, 4`. Si `total` ha cambiado, **para**: algo ha borrado ventanas y eso no lo hace ninguna de estas dos migraciones.

- [ ] **Step 4: Comprobar que el bundle VIEJO sigue guardando**

Con la migración aplicada y el despliegue todavía sin actualizar, guardar una secuencia cualquiera desde producción (o llamar al RPC con un `p_windows` **sin** la clave `motivo`) y ver que no falla. Es la comprobación de que el orden elegido es realmente el inofensivo.

---

## Task 11: doc, PR y cierre

**Files:**
- Modify: `docs/requirements/data-model.md`, `docs/requirements/backlog.md`, `docs/requirements/decisiones.md`, `supabase/schema-baseline.sql`, `docs/architecture/graph.json`

Regla de oro de `AGENTS.md`: un cambio no está hecho hasta que el doc canónico vuelve a ser cierto.

- [ ] **Step 1: `data-model.md`**

Sección de `saga_placement_windows`: la columna `motivo`, su enum, que es **nullable y sin backfill**, y que viaja dentro de `p_windows` (no en un argumento nuevo). Actualizar la fecha de verificación de la cabecera, diciendo **dev y prod**.

- [ ] **Step 2: `backlog.md`**

Marcar la fase 3 del timeline con estados. La narrativa de *cómo* se hizo va en la spec, **nunca** aquí — eso es lo que pudrió el backlog antes.

- [ ] **Step 3: `decisiones.md`** (append-only, al final)

Dos entradas:
1. **Una columna nueva de una tabla que ya viaja en un payload `jsonb` no justifica un argumento nuevo en el RPC.** Con el porqué: el baile de la sobrecarga se ha pagado tres veces (2b, 4, 2) y aquí no hacía falta.
2. **La migración a prod se aplicó ANTES del merge**, invirtiendo lo que pasó en la fase 2. Con la asimetría que lo hace seguro: columna-antes-que-bundle es inofensivo, bundle-antes-que-columna rompe el guardado.

- [ ] **Step 4: `schema-baseline.sql`**

Anexo con la fecha, como el `ANEXO 2026-07-28` de la fase 2.

- [ ] **Step 5: Mapa de arquitectura**

Correr el chequeo de deriva (`/drift-check`) o regenerar `docs/architecture/graph.json` según `docs/architecture/README.md`: hay un fichero nuevo (`window-track.ts`) y un flujo que cambia.

- [ ] **Step 6: Issues de lo que quede**

Todo lo pendiente vive como issue. Como mínimo, revisar si hay que abrir:
- **Las 4 ventanas de producción no tienen motivo.** Decisión del responsable, no del plan: issue con la lista de las cuatro y qué habría que decidir en cada una.
- **La línea de ventana de `saga-info.tsx`** (la ficha fuera del mapa) sigue sin decir el motivo. Límite asumido de esta fase: el alcance era el timeline. Issue con lo que costaría.
- Lo que aparezca en la Task 9 si alguna rotura no tumbó su test.

- [ ] **Step 7: PR**

```bash
git push -u origin worktree-sagas-fase-3-ventana
gh pr create --draft --title "Sagas fase 3: la ventana dice por qué, y dónde estás" --body "…"
```

En el cuerpo: qué entra, la tabla de antes/después de dev y prod, el resultado de las tres inyecciones de fallo, y **que las migraciones ya están aplicadas en prod** (con la fecha), para que quien mergee sepa que no hay nada que aplicar después.

- [ ] **Step 8: Higiene**

Sin `next dev` colgando, puerto 3000 libre, y el worktree fuera cuando el PR esté mergeado (`git worktree remove`, y borrar a mano la carpeta si sobrevive al `prune`).

---

## Lo que NO entra, y hay que decirlo en voz alta si apetece

- **Una tercera ancla.** Límite de la 2b, repetido en la spec.
- **Que el motivo mueva el progreso.** Nada de esta fase toca `progress.ts`.
- **Backfill de las 4 ventanas de producción.** Sin decisión del curador, poner un motivo es inventarlo.
- **Pintar la ventana de un BLOQUE.** Sigue siendo la issue #221.
- **El motivo en `saga-info.tsx`** (la línea de la ficha fuera del mapa). Issue, no scope creep.
- **Los estados en el grafo 2D.** Es la fase 6.
