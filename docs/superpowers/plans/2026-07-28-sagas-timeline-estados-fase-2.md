# Sagas · timeline con los cuatro estados — fase 2: metadatos del tándem — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que un tándem pueda decir **qué clase de tándem es** — «a la vez» o «cualquier orden» — y **por qué**, con una nota corta del curador, sin que la pertenencia al tándem deje de tener una sola fuente de verdad.

**Architecture:** tabla nueva `saga_tandems` con PK `(saga_id, position)` — metadatos **del HUECO**, no de las obras. La pertenencia sigue siendo lo que ya es: el empate de `position` en `saga_items`. `save_saga_sequence` crece a 7 argumentos y escribe esos metadatos en la misma transacción que reescribe la secuencia, así que renumerar no puede mover el hueco bajo los pies. El borrador del editor pasa de `DraftEntry[][]` a `DraftSlot[]` para que los metadatos viajen CON el hueco al reordenar. El timeline rellena `mode`/`note`, que la fase 1 dejó preparados en `TimelineRow`.

**Tech Stack:** Postgres (Supabase), plpgsql, Next.js 16 (RSC + server actions), TypeScript, Tailwind v4, next-intl, Vitest, Playwright.

**Documento de origen:** `docs/superpowers/specs/2026-07-28-sagas-timeline-estados-design.md`, fase 2 de su tabla de fases. La fase 0 y la fase 1 están hechas y desplegadas (PR #218). Las fases 3 a 6 siguen pendientes, con plan propio cada una.

## Global Constraints

- **El progreso no se toca.** `src/lib/sagas/progress.ts` sale de esta fase byte a byte como entró. Ni `mode`, ni `note`, ni el tándem mueven el denominador.
- **La pertenencia al tándem NO cambia de fuente.** Sigue siendo el empate de `position` en `saga_items`. `saga_tandems` solo añade metadatos del hueco. Si en algún momento hace falta una columna que diga QUIÉN está en el tándem, para y dilo en voz alta: eso es la familia del #91, el #185 y el #203 (dos fuentes que pueden contradecirse y ningún CHECK puede atarlas porque cruzan filas).
- **El baile de la sobrecarga, otra vez.** Crear la de 7 argumentos → desplegar el bundle que ya llama con 7 → y SOLO entonces borrar la de 6. Ya se ha pagado dos veces (fases 2b y 4). Nunca al revés.
- **Dev primero, prod después.** `supabase-dev` y luego `supabase-prod`, y la verificación es contra los objetos reales (`pg_proc`, `pg_class`, `pg_constraint`, `pg_policies`), **nunca** `list_migrations`.
- **Ni una tercera ancla, ni dos ventanas por entrada** (límite de la 2b), ni roles personalizados. Nada de eso entra aquí.
- **Idioma:** texto de usuario en `messages/es.json`, namespace `saga`. Único locale.
- **Node 22:** `eval "$(fnm env --shell bash)"; fnm use 22` antes de `npm test` — el shell abre con v20 y rompe Vitest.
- **Un solo `next dev`, en el puerto 3000.** Playwright reutiliza el que haya. Y el worktree necesita `.env.local` copiado y `node_modules` (junction al checkout principal).

---

## Lo que ya está medido (no lo vuelvas a averiguar)

| Dato | Valor | Cómo se comprobó |
|---|---|---|
| Tándems en TODA la producción | **1** | `SELECT` contra prod 2026-07-28: Trono de Cristal `8782f667-0d83-431a-a1bf-dca0f3fad1c3`, `position = 5`, *Imperio de Tormentas* (`904831cf-…`) + *Torre del Alba* (`4bda8a78-…`) |
| Firma de `save_saga_sequence` hoy | **una sola**, 6 argumentos | `pg_proc` en dev: `(p_saga_id uuid, p_entries jsonb, p_blocks jsonb, p_removed jsonb, p_windows jsonb, p_window_subjects jsonb)` |
| El hueco ya es un array en el borrador | `slots: DraftEntry[][]` | `src/lib/sagas/sequence-draft.ts:95` — el tándem ya es de primera clase, lo que falta son sus metadatos |
| Sitios que tocan `slots` | 10 | `get-saga-sequence.ts:294`, `sequence-draft.ts` (extract/moveSlot/sendTo/pairWith/unpair/mapEntry/toPayload), `sequence-editor.tsx:115,121,140,154`, `shell-desktop.tsx:45,87,93`, `shell-mobile.tsx:43,98`, `tandem-picker.tsx:15,26`, `use-sequence-draft.ts:88` |
| Formas que el timeline ya tiene preparadas | `TimelineRow.kind === "tandem"` con `mode`/`note` a `null` | fase 1, `src/lib/sagas/derive-timeline.ts` |

---

## File Structure

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20260801_saga_tandems.sql` (crear) | Tabla, enum `saga_tandem_mode`, índices y RLS. |
| `supabase/migrations/20260801_save_saga_sequence_tandems.sql` (crear) | La sobrecarga de 7 argumentos. |
| `supabase/migrations/20260802_drop_save_saga_sequence_v6.sql` (crear) | El `drop` de la de 6, que se aplica **después** del despliegue. |
| `src/lib/supabase/database.types.ts` (regenerar) | Tipos de la tabla y la firma nuevas. |
| `src/lib/sagas/types.ts` (modificar) | `TandemMode`, reexportado desde donde ya viven `SagaPlacement`/`SagaItemRole`. |
| `src/lib/sagas/sequence-draft.ts` (modificar) | `DraftSlot`, y todas las operaciones que hoy tratan un hueco como array. |
| `src/lib/sagas/sequence-draft.test.ts` (modificar) | Unitarias del borrador. |
| `src/lib/sagas/get-saga-sequence.ts` (modificar) | Hidratar `mode`/`note` desde `saga_tandems`. |
| `src/lib/sagas/validate-sequence-draft.ts` (modificar) | Rechazar una nota fuera de rango y metadatos en un hueco de una sola obra. |
| `src/components/saga/sequence/tandem-meta-editor.tsx` (crear) | Los dos controles (modo, nota) bajo un hueco con ≥2 obras. |
| `src/components/saga/sequence/{shell-desktop,shell-mobile,sequence-editor}.tsx` (modificar) | Montarlo y cablear la operación. |
| `src/components/saga/sequence/use-sequence-draft.ts` (modificar) | La operación `setTandemMeta`. |
| `src/lib/sagas/map-types.ts` (modificar) | `SagaGraphNode.tandem`. |
| `src/lib/sagas/derive-map.ts` (modificar) | Rellenarlo desde el lookup nuevo. |
| `src/lib/sagas/derive-timeline.ts` (modificar) | `mode`/`note` de la fila `tandem` dejan de ser `null`. |
| `src/lib/sagas/get-saga-detail.ts` (modificar) | Cargar `saga_tandems` del subárbol y pasarlo a `deriveSagaMap`. |
| `src/components/saga/timeline/timeline-tandem-row.tsx` (modificar) | Pintar el modo y la nota. |
| `messages/es.json` (modificar) | Textos nuevos. |
| `e2e/sagas-tandem-metadatos.spec.ts` (crear) | E2E + inyección de fallo. |

---

## Task 1: La tabla `saga_tandems` (solo dev)

**Files:**
- Create: `supabase/migrations/20260801_saga_tandems.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerado, no a mano)

**Interfaces:**
- Produces: tabla `public.saga_tandems`, enum `public.saga_tandem_mode`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Metadatos del HUECO compartido (spec 2026-07-28, fase 2). Lo que esta tabla
-- NO hace: decir quién está en el tándem. Eso lo dice —y lo seguirá diciendo—
-- el empate de `position` en `saga_items`. Aquí solo se guarda QUÉ CLASE de
-- tándem es ese hueco y por qué.
--
-- ⚠️ Descartado a sabiendas: `tandem_id` en `saga_items`. Daría identidad
-- estable, pero deja DOS fuentes de verdad sobre la pertenencia (mismo
-- `position` y mismo `tandem_id`) que pueden contradecirse, y ningún CHECK
-- puede atarlas porque cruzan filas. Es la familia del #91, el #185 y el #203.
-- Si alguna vez se propone, hay que decirlo en voz alta.
create type public.saga_tandem_mode as enum ('simultaneo', 'indistinto');

create table public.saga_tandems (
  saga_id uuid not null references public.sagas(id) on delete cascade,
  -- El hueco. No hay FK posible contra `saga_items` (la pertenencia es un
  -- empate entre N filas, no una fila), y por eso el RPC es el único que
  -- escribe aquí: reescribe la secuencia y estos metadatos en la MISMA
  -- transacción, así que renumerar no puede dejar la fila apuntando a un hueco
  -- que ya no existe.
  position integer not null,
  modo public.saga_tandem_mode,
  nota text,
  created_at timestamptz not null default now(),
  primary key (saga_id, position),
  -- Una fila que no dice NADA no debe existir: es ruido que sobrevive a
  -- renumeraciones y confunde al siguiente que mire la tabla.
  constraint saga_tandems_says_something check (modo is not null or nota is not null),
  -- La nota es una línea, no un ensayo: la fila del timeline la pinta entera.
  constraint saga_tandems_nota_len check (nota is null or char_length(nota) <= 200)
);

create index saga_tandems_saga_idx on public.saga_tandems (saga_id);

alter table public.saga_tandems enable row level security;

-- Forma calcada de `saga_placement_windows` (20260727_saga_placement_windows.sql):
-- lectura pública para anon+authenticated, escritura solo para collaborator+.
create policy "saga tandems readable by all" on public.saga_tandems
  for select to anon, authenticated using (true);
create policy "saga tandems writable by collaborators" on public.saga_tandems
  for all to authenticated
  using (public.has_min_role('collaborator'))
  with check (public.has_min_role('collaborator'));
```

- [ ] **Step 2: Aplicarla a DEV**

Usa `mcp__supabase-dev__apply_migration` con el nombre `20260801_saga_tandems` y ese cuerpo. **Dev primero, prod en la Task 8.**

- [ ] **Step 3: Verificar contra los objetos reales, no el ledger**

Run (`mcp__supabase-dev__execute_sql`):

```sql
select to_regclass('public.saga_tandems') as tabla,
       (select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='saga_tandem_mode') as valores_enum,
       (select count(*) from pg_policies where tablename='saga_tandems') as policies,
       (select count(*) from pg_constraint where conrelid='public.saga_tandems'::regclass) as constraints;
```

Expected: `tabla` no nula, `valores_enum = 2`, `policies = 2`, `constraints ≥ 4` (PK + FK + los dos CHECK).

- [ ] **Step 4: Comprobar que los dos CHECK muerden**

Run:

```sql
insert into public.saga_tandems (saga_id, position) values ('8782f667-0d83-431a-a1bf-dca0f3fad1c3', 5);
```

Expected: **error** `saga_tandems_says_something`. Si entra, el CHECK está mal escrito — la fase 1 del orden unificado ya se quemó con un CHECK de ramas unidas por OR donde comparar con NULL daba NULL y la fila imposible pasaba.

Y luego:

```sql
insert into public.saga_tandems (saga_id, position, nota)
values ('8782f667-0d83-431a-a1bf-dca0f3fad1c3', 5, repeat('x', 201));
```

Expected: **error** `saga_tandems_nota_len`.

- [ ] **Step 5: Regenerar los tipos**

Usa `mcp__supabase-dev__generate_typescript_types` y vuelca el resultado en `src/lib/supabase/database.types.ts`. Esto además retira de ese fichero las tres definiciones muertas que el backlog ya señalaba (`saga_nodes`, `saga_edges`, `save_saga_graph`).

Run: `fnm use 22; npx tsc --noEmit`
Expected: limpio. Si algo se rompe por las definiciones retiradas, arréglalo aquí — es deuda conocida, no un daño nuevo.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260801_saga_tandems.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): saga_tandems, metadatos del hueco compartido (solo dev)"
```

---

## Task 2: `save_saga_sequence` con 7 argumentos (sobrecarga, solo dev)

**Files:**
- Create: `supabase/migrations/20260801_save_saga_sequence_tandems.sql`

**Interfaces:**
- Consumes: `saga_tandems` (Task 1).
- Produces: `save_saga_sequence(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)` — el 7º es `p_tandems`.

**Cómo se da de baja un tándem, y por qué así.** El cuerpo hace `delete from saga_tandems where saga_id = p_saga_id` y reinserta `p_tandems`. Es reemplazo por saga, **no** la lista de sujetos que usan las ventanas — y es correcto aquí por un motivo que hay que dejar escrito: las ventanas necesitaron sujetos explícitos en la fase 4 porque **dos pantallas escriben la misma fila** (el editor del padre cura la ventana de una obra de su hija). Un tándem no tiene ese problema: un hueco pertenece a la secuencia de UNA saga, y solo el editor de esa saga lo escribe — el editor del padre no toca la secuencia de la hija (#187 sigue cerrada). Con un único escritor por `saga_id`, el reemplazo da la garantía que pide la spec («un hueco que deja de ser tándem borra su fila en la MISMA transacción») sin inventar un octavo argumento.

- [ ] **Step 1: Escribir la migración**

Copia el cuerpo ACTUAL de la función (está en `pg_proc`; el fichero de referencia más cercano es `20260730_save_saga_sequence_subjects.sql`) y añádele el parámetro y el bloque nuevos. No reescribas el resto: cualquier cambio no pedido en el cuerpo viaja a producción sin que nadie lo haya revisado.

```sql
-- Séptimo argumento: los metadatos de los huecos en tándem (fase 2).
--
-- ⚠️ SOBRECARGA, no reemplazo. `create or replace function` con otra lista de
-- parámetros NO sustituye a la existente: crea una función nueva. La de SEIS
-- argumentos sigue viva hasta que el bundle que llama con siete esté desplegado
-- (`20260802_drop_save_saga_sequence_v6.sql`). Al revés, el bundle desplegado
-- se queda sin función en el primer guardado. Ya se pagó en las fases 2b y 4.
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
  -- … cuerpo IDÉNTICO al de seis argumentos, hasta el insert de ventanas …

  -- Metadatos de los huecos en tándem. Reemplazo por saga: un hueco que deja de
  -- ser tándem (o que se renumera) pierde su fila en la MISMA transacción en la
  -- que se reescribe la secuencia. Es seguro porque solo el editor de ESTA saga
  -- escribe estos huecos — a diferencia de las ventanas, que desde la fase 4
  -- tienen dos pantallas escritoras y por eso necesitan sujetos explícitos.
  delete from saga_tandems where saga_id = p_saga_id;

  insert into saga_tandems (saga_id, position, modo, nota)
  select
    p_saga_id,
    (t->>'position')::integer,
    (t->>'modo')::public.saga_tandem_mode,
    nullif(btrim(coalesce(t->>'nota', '')), '')
  from jsonb_array_elements(coalesce(p_tandems, '[]'::jsonb)) as t
  -- Una fila que no dice nada no se guarda: el CHECK la rechazaría y abortaría
  -- la transacción entera, así que se filtra aquí en vez de reventar el
  -- guardado por un control que el curador dejó vacío.
  where (t->>'modo') is not null
     or nullif(btrim(coalesce(t->>'nota', '')), '') is not null;
end;
$function$;

-- La de SEIS pasa a delegar, para que un bundle viejo no borre lo que el nuevo
-- acaba de guardar. Sin esto, el riesgo no es teórico: un guardado desde el
-- bundle antiguo llamaría a la de seis, que no sabe de tándems, y la fila
-- sobreviviría — pero un guardado que SÍ renumera dejaría los metadatos
-- apuntando a un hueco equivocado. Delegando con '[]' se comporta como el
-- reemplazo que es: sin tándems declarados, no hay metadatos.
create or replace function public.save_saga_sequence(
  p_saga_id uuid,
  p_entries jsonb,
  p_blocks jsonb,
  p_removed jsonb,
  p_windows jsonb,
  p_window_subjects jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.save_saga_sequence(p_saga_id, p_entries, p_blocks, p_removed, p_windows, p_window_subjects, '[]'::jsonb);
end;
$function$;
```

> **Riesgo conocido y aceptado mientras el envoltorio viva**, el mismo que documentó la 2b: un guardado desde el bundle VIEJO manda `p_tandems = '[]'` sin saberlo y borra los metadatos que el editor nuevo hubiera guardado. Ventana de minutos entre migración y despliegue, con **un solo tándem en producción**. Escríbelo en `decisiones.md` (Task 9), no solo aquí.

- [ ] **Step 2: Aplicarla a DEV y verificar las dos firmas**

Run (`mcp__supabase-dev__execute_sql`):

```sql
select p.oid::regprocedure as firma, p.prosecdef, p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.proname='save_saga_sequence' and n.nspname='public' order by 1;
```

Expected: **dos** filas (6 y 7 argumentos), las dos con `prosecdef = true` y `proconfig = {search_path=public}`.

- [ ] **Step 3: Probar el reemplazo con datos reales de dev**

Run: guarda un tándem por RPC y comprueba que la segunda llamada sin él lo borra.

```sql
select public.save_saga_sequence(
  '<saga QA con un tándem>'::uuid, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  '[{"position": 5, "modo": "simultaneo", "nota": "prueba"}]'::jsonb);
select count(*) from saga_tandems where saga_id = '<saga QA>';
```

Expected: 1. Repite con `'[]'::jsonb` como séptimo argumento y vuelve a contar: **0**.

- [ ] **Step 4: Comprobar que el envoltorio de 6 sigue funcionando**

Run: la misma llamada sin el séptimo argumento.
Expected: no falla (es lo que protege al bundle desplegado durante el despliegue).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260801_save_saga_sequence_tandems.sql
git commit -m "feat(db): save_saga_sequence gana p_tandems (sobrecarga, solo dev)"
```

---

## Task 3: El borrador guarda los metadatos DEL HUECO

**Files:**
- Modify: `src/lib/sagas/types.ts`, `src/lib/sagas/sequence-draft.ts`
- Test: `src/lib/sagas/sequence-draft.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type TandemMode = "simultaneo" | "indistinto";            // src/lib/sagas/types.ts
  export type DraftSlot = { entries: DraftEntry[]; mode: TandemMode | null; note: string | null };
  export type SequenceDraft = { slots: DraftSlot[]; /* …resto igual… */ };
  export function setTandemMeta(d: SequenceDraft, index: number, meta: { mode?: TandemMode | null; note?: string | null }): SequenceDraft;
  // SequencePayload gana:
  //   tandems: Array<{ position: number; modo: TandemMode | null; nota: string | null }>
  ```

**Por qué el hueco pasa de array a objeto, y no se guarda la metadata aparte.** Guardarla en un `Map` o un array paralelo indexado por posición del hueco parece más barato, y es exactamente el error: `moveSlot`, `pairWith`, `unpair` y `extract` **cambian los índices**, y `extract` puede además eliminar un hueco entero. Cualquier estructura indexada por posición se desincroniza en el primer reordenamiento, en silencio, y el curador ve la nota de un hueco bajo otro. Con `DraftSlot`, la metadata se mueve con su hueco porque **es** su hueco.

- [ ] **Step 1: Adaptar el helper del test, y escribir los tests que fallan**

`src/lib/sagas/sequence-draft.test.ts` ya trae los helpers `work(id)`, `block(id)` y `draft(slots, free, unclassified, nested)`, y ese último recibe hoy `DraftEntry[][]`. **Conserva esa ergonomía** y envuelve dentro — así los ~20 tests que ya existen solo cambian donde INSPECCIONAN un hueco (`d.slots[0]` → `d.slots[0].entries`), no donde lo construyen:

```ts
const draft = (
  slots: DraftEntry[][],
  free: DraftEntry[] = [],
  unclassified: DraftEntry[] = [],
  nested: SequenceDraft["nested"] = [],
): SequenceDraft => ({
  slots: slots.map((entries) => ({ entries, mode: null, note: null })),
  free, unclassified, removed: [], nested,
});
```

Y añade los casos nuevos, construyendo los borradores con esos mismos helpers:

```ts
const tandemDraft = () => draft([[work("a"), work("b")]]);
const tandemDraftPlusOne = () => draft([[work("a"), work("b")], [work("c")]]);
const draftWith2Slots = () => draft([[work("a"), work("b")], [work("c"), work("d")]]);
```

```ts
describe("metadatos del hueco (fase 2)", () => {
  it("setTandemMeta guarda modo y nota en el hueco", () => {
    const d = setTandemMeta(draftWith2Slots(), 0, { mode: "simultaneo", note: "Dos caras del mismo asedio" });
    expect(d.slots[0].mode).toBe("simultaneo");
    expect(d.slots[0].note).toBe("Dos caras del mismo asedio");
    expect(d.slots[1].mode).toBeNull();
  });

  it("mover un hueco se lleva SUS metadatos, no los del vecino", () => {
    const d = setTandemMeta(draftWith2Slots(), 0, { mode: "indistinto", note: "cualquiera de los dos" });
    const moved = moveSlot(d, 0, 1);
    expect(moved.slots[1].mode).toBe("indistinto");
    expect(moved.slots[1].note).toBe("cualquiera de los dos");
    expect(moved.slots[0].mode).toBeNull();
  });

  it("deshacer el tándem (unpair) descarta los metadatos: ya no hay hueco compartido", () => {
    const d = setTandemMeta(tandemDraft(), 0, { mode: "simultaneo", note: "a la vez" });
    const split = unpair(d, 0);
    expect(split.slots).toHaveLength(2);
    expect(split.slots.every((s) => s.mode === null && s.note === null)).toBe(true);
  });

  it("sacar una obra deja al hueco con una sola: los metadatos se van con el tándem", () => {
    const d = setTandemMeta(tandemDraft(), 0, { mode: "simultaneo", note: "a la vez" });
    const out = sendTo(d, d.slots[0].entries[1].key, "free");
    expect(out.slots[0].entries).toHaveLength(1);
    expect(out.slots[0].mode).toBeNull();
    expect(out.slots[0].note).toBeNull();
  });

  it("toPayload solo emite tándems: un hueco de una sola obra no produce fila", () => {
    const d = setTandemMeta(tandemDraft(), 0, { mode: "simultaneo", note: "a la vez" });
    const p = toPayload(d, "saga-1");
    expect(p.tandems).toEqual([{ position: 1, modo: "simultaneo", nota: "a la vez" }]);
  });

  it("toPayload omite un hueco en tándem sin nada declarado", () => {
    const p = toPayload(tandemDraft(), "saga-1");
    expect(p.tandems).toEqual([]);
  });

  it("el número del payload es el del HUECO, así que un tándem no descuadra los siguientes", () => {
    const d = setTandemMeta(tandemDraftPlusOne(), 0, { mode: "simultaneo", note: null });
    const p = toPayload(d, "saga-1");
    expect(p.tandems[0].position).toBe(1);
    expect(p.entries.filter((e) => e.position === 1)).toHaveLength(2);
    expect(p.entries.filter((e) => e.position === 2)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `fnm use 22; npx vitest run src/lib/sagas/sequence-draft.test.ts`
Expected: FAIL — `setTandemMeta` no existe y `slots[0].mode` es `undefined`.

- [ ] **Step 3: Cambiar el tipo del hueco**

En `src/lib/sagas/types.ts`, junto a `SagaPlacement`/`SagaItemRole`:

```ts
/** Qué clase de tándem es un hueco compartido (`saga_tandems.modo`, fase 2).
 *  `simultaneo` = «a la vez»; `indistinto` = «cualquier orden». */
export type TandemMode = "simultaneo" | "indistinto";
```

En `src/lib/sagas/sequence-draft.ts`:

```ts
/** Un HUECO de la secuencia: una o más entradas, más los metadatos que solo
 *  tienen sentido cuando son varias. Es un objeto y no un array (como era hasta
 *  la fase 2) para que `mode`/`note` viajen CON el hueco: `moveSlot`,
 *  `pairWith`, `unpair` y `extract` cambian los índices —y `extract` puede
 *  borrar un hueco entero—, así que cualquier estructura paralela indexada por
 *  posición se desincroniza al primer reordenamiento, en silencio. */
export type DraftSlot = {
  entries: DraftEntry[];
  /** `null` hasta que el curador lo declare. Un hueco de UNA sola obra los
   *  tiene siempre a null: no hay tándem del que hablar. */
  mode: TandemMode | null;
  note: string | null;
};
```

y `SequenceDraft.slots: DraftSlot[]`.

- [ ] **Step 4: Adaptar las operaciones, una a una**

`extract`: al quitar una entrada, el hueco conserva su identidad **pero pierde los metadatos si deja de ser tándem**:

```ts
  for (let i = 0; i < d.slots.length; i++) {
    const found = d.slots[i].entries.find((e) => e.key === key);
    if (!found) continue;
    const rest = d.slots[i].entries.filter((e) => e.key !== key);
    // Un hueco que baja a una sola obra ya no es un tándem: sus metadatos
    // hablaban de una relación que acaba de dejar de existir, y conservarlos
    // los resucitaría en cuanto alguien volviera a emparejar ahí otra obra
    // distinta.
    const slots = rest.length > 0
      ? d.slots.map((s, j) => (j === i ? { ...s, entries: rest, ...(rest.length < 2 ? { mode: null, note: null } : {}) } : s))
      : d.slots.filter((_, j) => j !== i);
    return [{ ...d, slots }, found];
  }
```

`unpair`: cada trozo nace sin metadatos.

```ts
export function unpair(d: SequenceDraft, index: number): SequenceDraft {
  const slot = d.slots[index];
  if (!slot || slot.entries.length < 2) return d;
  const exploded = slot.entries.map((e) => ({ entries: [e], mode: null, note: null }));
  return { ...d, slots: [...d.slots.slice(0, index), ...exploded, ...d.slots.slice(index + 1)] };
}
```

`sendTo` (rama `sequence`): `slots: [...without.slots, { entries: [clean], mode: null, note: null }]`.

`pairWith`: resuelve el hueco por identidad igual que hoy, y añade la entrada a `entries` conservando `mode`/`note` — emparejar CON un tándem que ya tiene modo declarado no lo borra.

`moveSlot` y `mapEntry`: cambian solo en que recorren `s.entries` en vez de `s`.

`setTandemMeta`, nueva:

```ts
/** Declara qué clase de tándem es un hueco. Un hueco de una sola obra se ignora
 *  en silencio, igual que `setRole` ignora un rol en un bloque: la interfaz ni
 *  siquiera ofrece el control ahí. */
export function setTandemMeta(
  d: SequenceDraft,
  index: number,
  meta: { mode?: TandemMode | null; note?: string | null },
): SequenceDraft {
  const slot = d.slots[index];
  if (!slot || slot.entries.length < 2) return d;
  const next: DraftSlot = {
    ...slot,
    mode: meta.mode === undefined ? slot.mode : meta.mode,
    note: meta.note === undefined ? slot.note : meta.note,
  };
  return { ...d, slots: d.slots.map((s, j) => (j === index ? next : s)) };
}
```

- [ ] **Step 5: Emitir los tándems en el payload**

En `SequencePayload`:

```ts
  /** Metadatos por HUECO compartido. Solo los huecos con dos o más entradas y
   *  con algo declarado: una fila vacía la rechazaría el CHECK
   *  `saga_tandems_says_something` y abortaría la transacción entera. */
  tandems: Array<{ position: number; modo: TandemMode | null; nota: string | null }>;
```

y en `toPayload`, junto al recorrido de huecos:

```ts
  d.slots.forEach((slot, i) => slot.entries.forEach((e) => push(e, i + 1, "fijo")));

  const tandems: SequencePayload["tandems"] = [];
  d.slots.forEach((slot, i) => {
    if (slot.entries.length < 2) return;
    const nota = slot.note?.trim() ? slot.note.trim() : null;
    if (slot.mode === null && nota === null) return;
    tandems.push({ position: i + 1, modo: slot.mode, nota });
  });
```

y devuélvelo en el objeto final.

- [ ] **Step 6: Correr los tests**

Run: `fnm use 22; npx vitest run src/lib/sagas/sequence-draft.test.ts && npx tsc --noEmit`
Expected: los nuevos PASS. `tsc` fallará en los consumidores de `slots` (editor, shells, tandem-picker, get-saga-sequence): se arreglan en las Tasks 4 y 5, y ese error es el mapa exacto de lo que queda.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sagas/types.ts src/lib/sagas/sequence-draft.ts src/lib/sagas/sequence-draft.test.ts
git commit -m "feat(sagas): el hueco del borrador guarda qué clase de tándem es"
```

---

## Task 4: Hidratación y validación

**Files:**
- Modify: `src/lib/sagas/get-saga-sequence.ts:294`
- Modify: `src/lib/sagas/validate-sequence-draft.ts`
- Modify: `src/lib/sagas/sequence-actions.ts:83` (la llamada al RPC)
- Test: `src/lib/sagas/get-saga-sequence.test.ts`, `src/lib/sagas/validate-sequence-draft.test.ts`

**Interfaces:**
- Consumes: `DraftSlot`, `SequencePayload.tandems` (Task 3).

- [ ] **Step 1: Escribir los tests que fallan**

En `validate-sequence-draft.test.ts`:

```ts
it("rechaza una nota de tándem de más de 200 caracteres", () => {
  const p = payloadWithTandem({ position: 1, modo: null, nota: "x".repeat(201) });
  expect(validateSequenceDraft(p).errors).toContain("tandemNoteTooLong");
});

it("rechaza metadatos para un hueco que no tiene dos entradas", () => {
  const p = payloadWithTandem({ position: 3, modo: "simultaneo", nota: null }); // el hueco 3 tiene una sola
  expect(validateSequenceDraft(p).errors).toContain("tandemNotShared");
});

it("acepta un tándem declarado sobre un hueco compartido", () => {
  expect(validateSequenceDraft(payloadWithSharedSlot()).errors).toEqual([]);
});
```

En `get-saga-sequence.test.ts`, un caso que compruebe que `mode`/`note` llegan al hueco correcto por `position`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `fnm use 22; npx vitest run src/lib/sagas/validate-sequence-draft.test.ts src/lib/sagas/get-saga-sequence.test.ts`
Expected: FAIL.

- [ ] **Step 3: Hidratar desde `saga_tandems`**

En `get-saga-sequence.ts`, junto a la carga de ventanas, lee los tándems de la saga y móntalos al construir `slots`:

```ts
  const { data: tandemRows } = await supabase
    .from("saga_tandems")
    .select("position, modo, nota")
    .eq("saga_id", sagaId);
  const tandemByPosition = new Map((tandemRows ?? []).map((t) => [t.position, t]));

  // `byPosition` ya agrupa las entradas por hueco; el índice del array es el
  // hueco 1..N tras ordenar, pero la CLAVE de `saga_tandems` es la `position`
  // guardada, no el índice. Se casa por position ANTES de perderla.
  const slots: DraftSlot[] = [...byPosition.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([position, entries]) => {
      const meta = entries.length >= 2 ? tandemByPosition.get(position) : undefined;
      return { entries, mode: meta?.modo ?? null, note: meta?.nota ?? null };
    });
```

> **Trampa medida:** la `position` guardada y el índice del hueco NO tienen por qué coincidir si la secuencia tiene huecos numerados con saltos. Casar por `position` (la clave real) y no por índice es lo único correcto; el payload vuelve a numerar 1..N al guardar, que es lo que reasienta la tabla.

- [ ] **Step 4: Validar**

En `validate-sequence-draft.ts`, sobre `payload.tandems`:

```ts
  // Los metadatos hablan de un hueco COMPARTIDO. Un `position` con una sola
  // entrada no es un tándem, y guardar ahí una nota dejaría una fila que
  // reaparecería sobre otras obras en cuanto alguien emparejara en ese hueco.
  const sharedPositions = new Set(
    [...countBy(payload.entries.concat(payload.blocks.map(asEntry)), (e) => e.position)]
      .filter(([position, n]) => position !== null && n >= 2)
      .map(([position]) => position),
  );
  for (const t of payload.tandems) {
    if (!sharedPositions.has(t.position)) errors.push("tandemNotShared");
    if ((t.nota?.length ?? 0) > 200) errors.push("tandemNoteTooLong");
  }
```

(Si `countBy` no existe en el fichero, escribe el conteo a mano — no añadas una dependencia por esto.)

- [ ] **Step 5: Mandar el argumento nuevo al RPC**

En `sequence-actions.ts`, en la llamada:

```ts
  const { error } = await supabase.rpc("save_saga_sequence", {
    p_saga_id: sagaId,
    p_entries: payload.entries,
    p_blocks: payload.blocks,
    p_removed: payload.removed,
    p_windows: payload.windows,
    p_window_subjects: payload.windowSubjects,
    p_tandems: payload.tandems,
  });
```

- [ ] **Step 6: Correr los tests**

Run: `fnm use 22; npx vitest run && npx tsc --noEmit`
Expected: las unitarias PASS. `tsc` puede seguir señalando el editor (Task 5).

- [ ] **Step 7: Commit**

```bash
git add src/lib/sagas/get-saga-sequence.ts src/lib/sagas/validate-sequence-draft.ts src/lib/sagas/sequence-actions.ts src/lib/sagas/*.test.ts
git commit -m "feat(sagas): hidratar y validar los metadatos del tándem"
```

---

## Task 5: Los controles en el editor de secuencia

**Files:**
- Create: `src/components/saga/sequence/tandem-meta-editor.tsx`
- Modify: `src/components/saga/sequence/use-sequence-draft.ts`, `sequence-editor.tsx`, `shell-desktop.tsx`, `shell-mobile.tsx`, `tandem-picker.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `setTandemMeta` (Task 3).
- Produces: `ops.setTandemMeta(index, meta)` en `use-sequence-draft.ts`.

- [ ] **Step 1: Textos**

En `messages/es.json`, namespace `saga`:

```json
    "tandemMetaTitle": "Cómo se leen",
    "tandemModeSimultaneo": "A la vez",
    "tandemModeIndistinto": "Cualquier orden",
    "tandemModeNone": "Sin declarar",
    "tandemNotePlaceholder": "Por qué van juntos (opcional)",
    "tandemNoteTooLong": "La nota del tándem no puede pasar de 200 caracteres",
    "tandemNotShared": "Hay metadatos de tándem en un hueco que ya no comparte dos obras",
```

- [ ] **Step 2: Escribir el componente**

Crear `src/components/saga/sequence/tandem-meta-editor.tsx` — cliente, controlado por el borrador:

```tsx
"use client";

import type { TandemMode } from "@/lib/sagas/types";

// Los dos únicos metadatos de un hueco compartido (fase 2). Se monta SOLO bajo
// un hueco con dos o más obras: en un hueco de una, no hay tándem del que
// hablar, y `setTandemMeta` ignoraría el cambio de todos modos.
export function TandemMetaEditor({
  mode,
  note,
  labels,
  onChange,
}: {
  mode: TandemMode | null;
  note: string | null;
  labels: {
    title: string;
    none: string;
    simultaneo: string;
    indistinto: string;
    notePlaceholder: string;
  };
  onChange: (meta: { mode?: TandemMode | null; note?: string | null }) => void;
}) {
  return (
    <div data-testid="tandem-meta" className="ml-9 mt-1 flex flex-col gap-1.5 rounded-lg border border-dashed border-border p-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{labels.title}</span>
      <div className="flex gap-1.5">
        {([null, "simultaneo", "indistinto"] as const).map((m) => (
          <button
            key={m ?? "none"}
            type="button"
            onClick={() => onChange({ mode: m })}
            aria-pressed={mode === m}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${
              mode === m ? "border-accent bg-accent/10 font-semibold" : "border-border text-muted-foreground"
            }`}
          >
            {m === null ? labels.none : m === "simultaneo" ? labels.simultaneo : labels.indistinto}
          </button>
        ))}
      </div>
      <input
        type="text"
        maxLength={200}
        value={note ?? ""}
        onChange={(e) => onChange({ note: e.target.value })}
        placeholder={labels.notePlaceholder}
        className="rounded-lg border border-border bg-surface px-2 py-1 text-[12px]"
      />
    </div>
  );
}
```

- [ ] **Step 3: Cablear la operación**

En `use-sequence-draft.ts`, junto a las demás ops:

```ts
    setTandemMeta: (index: number, meta: { mode?: TandemMode | null; note?: string | null }) =>
      setDraft((d) => setTandemMetaPure(d, index, meta)),
```

(importando `setTandemMeta as setTandemMetaPure` de `sequence-draft.ts`). Y en `use-sequence-draft.ts:88`, el mapeo que marca `isNew: false` pasa a recorrer `s.entries` conservando el resto del hueco:

```ts
        slots: d.slots.map((s) => ({ ...s, entries: s.entries.map((e) => ({ ...e, isNew: false })) })),
```

- [ ] **Step 4: Montarlo en las dos cáscaras**

En `shell-desktop.tsx` y `shell-mobile.tsx`, donde hoy hacen `draft.slots.map((slot, i) => …)`, el `slot` pasa a ser objeto: recorre `slot.entries` para las filas y, **después de ellas**, monta el editor si `slot.entries.length >= 2`:

```tsx
{slot.entries.length >= 2 && (
  <TandemMetaEditor
    mode={slot.mode}
    note={slot.note}
    labels={{
      title: t("tandemMetaTitle"),
      none: t("tandemModeNone"),
      simultaneo: t("tandemModeSimultaneo"),
      indistinto: t("tandemModeIndistinto"),
      notePlaceholder: t("tandemNotePlaceholder"),
    }}
    onChange={(meta) => ops.setTandemMeta(i, meta)}
  />
)}
```

En `sequence-editor.tsx` (líneas 115, 121, 140, 154) y `tandem-picker.tsx` (15, 26), cambia `slot` → `slot.entries` donde corresponda. `tandem-picker` recibe `slots: DraftSlot[]` y filtra igual que hoy.

- [ ] **Step 5: Compilar, lint y unitarias**

Run: `fnm use 22; npx tsc --noEmit; npx eslint src; npx vitest run`
Expected: todo limpio (salvo los dos avisos preexistentes de `generate-route-button.tsx` y el error preexistente de `signup-form.tsx`).

- [ ] **Step 6: Verlo funcionar**

Arranca el dev server del worktree (uno solo, en 3000) y abre `/saga/<id con tándem>/editar`: bajo el hueco compartido tienen que salir las tres pastillas y el campo de nota; guardar y recargar tiene que conservarlos. Comprueba también que **deshacer el tándem** hace desaparecer el bloque de controles.

- [ ] **Step 7: Commit**

```bash
git add src/components/saga/sequence messages/es.json
git commit -m "feat(sagas): el editor declara qué clase de tándem es un hueco"
```

---

## Task 6: El timeline pinta el modo y la nota

**Files:**
- Modify: `src/lib/sagas/map-types.ts`, `src/lib/sagas/derive-map.ts`, `src/lib/sagas/derive-timeline.ts`, `src/lib/sagas/get-saga-detail.ts`
- Modify: `src/components/saga/timeline/timeline-tandem-row.tsx`, `messages/es.json`
- Test: `src/lib/sagas/derive-map.test.ts`, `src/lib/sagas/derive-timeline.test.ts`

**Interfaces:**
- Produces: `SagaGraphNode.tandem: { mode: TandemMode | null; note: string | null } | null`; `deriveSagaMap(groups, windows, lookup, routeKeys?, tandems?)`.

**Cómo llega el dato hasta la fila.** La fila `tandem` del timeline nace de un empate de `orderNo`, pero la clave de `saga_tandems` es `(saga_id, position)` — y un nodo del mapa NO lleva `position`. Antes de inventar nada: el nodo sí lleva `groupSagaId`, y `deriveSagaMap` sí conoce la `position` de cada miembro mientras construye los huecos. Así que el lookup se resuelve **dentro de `deriveSagaMap`**, que denormaliza `{mode, note}` en cada nodo del hueco; `deriveTimeline` lo lee del primero al fundir la fila. No es una segunda fuente de verdad: es dato derivado, con un solo escritor.

- [ ] **Step 1: Tests que fallan**

En `derive-map.test.ts`:

```ts
it("los dos nodos de un hueco compartido llevan los metadatos de ese hueco", () => {
  const g = deriveSagaMap(groupsConTandem(), {}, lookup, undefined,
    new Map([["saga-Era:1", { mode: "simultaneo" as const, note: "a la vez" }]]));
  const enHueco = g.nodes.filter((n) => n.orderNo === 0);
  expect(enHueco).toHaveLength(2);
  expect(enHueco.every((n) => n.tandem?.mode === "simultaneo")).toBe(true);
});

it("un hueco sin metadatos deja `tandem` a null", () => {
  const g = deriveSagaMap(groupsConTandem(), {}, lookup);
  expect(g.nodes.every((n) => n.tandem === null)).toBe(true);
});
```

En `derive-timeline.test.ts`:

```ts
it("la fila tandem toma modo y nota del hueco", () => {
  const tl = deriveTimeline(
    graph([
      node("t1", { orderNo: 0, tandem: { mode: "indistinto", note: "cualquiera" } }),
      node("t2", { orderNo: 0, tandem: { mode: "indistinto", note: "cualquiera" } }),
    ]),
  );
  const row = tl[0].rows[0];
  if (row.kind !== "tandem") throw new Error("se esperaba un tándem");
  expect(row.mode).toBe("indistinto");
  expect(row.note).toBe("cualquiera");
});
```

(El helper `node()` del test ya acepta overrides; añade `tandem: null` a su base.)

- [ ] **Step 2: Correr y ver que fallan**

Run: `fnm use 22; npx vitest run src/lib/sagas/derive-map.test.ts src/lib/sagas/derive-timeline.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`map-types.ts`:

```ts
  /** Metadatos del HUECO compartido al que pertenece el nodo (`saga_tandems`,
   *  fase 2). Denormalizado: los N nodos del mismo hueco llevan el mismo valor,
   *  y `deriveTimeline` lo lee del primero al fundir la fila. `null` si el nodo
   *  no comparte hueco, o si el curador no ha declarado nada. */
  tandem: { mode: TandemMode | null; note: string | null } | null;
```

`derive-map.ts`: quinto parámetro `tandems?: Map<string, { mode: TandemMode | null; note: string | null }>` con clave `` `${sagaId}:${position}` ``, y dentro de `huecos.forEach`:

```ts
      // El hueco es compartido solo si tiene dos o más obras; y su saga es la
      // dueña de la membresía (group.sagaId), no la saga que se está pintando.
      const meta =
        hueco.length >= 2 && tandems
          ? (tandems.get(`${group.sagaId}:${hueco[0].position}`) ?? null)
          : null;
      hueco.forEach((m, memberIdx) => {
        const node = { ...makeNode(m, x, rowCursor + memberIdx, orderCounter), tandem: meta };
        …
      });
```

y `makeNode` devuelve `tandem: null` por defecto.

`derive-timeline.ts`: al fundir la fila `tandem`, en las dos columnas, `mode: n.tandem?.mode ?? null` y `note: n.tandem?.note ?? null` — tomados del nodo que abre el hueco.

`get-saga-detail.ts`: cargar `saga_tandems` de la saga y de sus hijas directas (las mismas filas que ya se recorren para los grupos) y construir el `Map` antes de llamar a `deriveSagaMap`.

- [ ] **Step 4: Pintarlo**

En `timeline-tandem-row.tsx`, sustituye la etiqueta fija por el modo cuando exista, y la nota ya está cableada (`row.note`):

```tsx
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              {labels.tandemTitle}
              {row.mode !== null && ` · ${row.mode === "simultaneo" ? labels.tandemModeSimultaneo : labels.tandemModeIndistinto}`}
              {` · ${labels.tandemCount(row.nodes.length)}`}
            </span>
```

y añade las dos etiquetas a `timeline-labels.ts`.

- [ ] **Step 5: Correr todo**

Run: `fnm use 22; npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: verde.

- [ ] **Step 6: Curar el caso real y mirarlo**

Con el dev server levantado, cura en **dev** el tándem de la saga QA (o el equivalente de Trono de Cristal si existe en dev) con modo y nota, y mira la ficha en móvil y al pie del grafo en PC. **Riesgo 4 de la spec**: esta fase se estrena con un único caso real, así que mirarlo es parte del trabajo, no un extra.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sagas src/components/saga/timeline messages/es.json
git commit -m "feat(sagas): el timeline dice qué clase de tándem es y por qué"
```

---

## Task 7: E2E y su inyección de fallo

**Files:**
- Create: `e2e/sagas-tandem-metadatos.spec.ts`

**Universo QA:** el tándem que ya usa `e2e/sagas-editor-secuencia.spec.ts:207` («un tándem deja las dos obras en el mismo número y la siguiente en el siguiente»). Léelo antes de sembrar nada: si ya monta un tándem, este spec puede montar el suyo con el mismo patrón y limpiarlo igual. Semilla y limpieza como el resto (`fetch` nativo, `res.ok` en cada escritura, `finally` que restaura).

- [ ] **Step 1: Escribir el spec**

Tres casos, y ninguno redundante con las unitarias. Las aserciones decisivas, literales:

```ts
// 1) Declarar modo y nota persiste: llega a BD, no se queda en el estado de React.
await page.goto(`/saga/${SAGA_ID}/editar`);
await tandemMeta(page).getByRole("button", { name: "A la vez" }).click();
await tandemMeta(page).getByPlaceholder("Por qué van juntos (opcional)").fill(NOTA);
await save(page);
await page.reload();
await expect(tandemMeta(page).getByRole("button", { name: "A la vez" })).toHaveAttribute("aria-pressed", "true");
await expect(tandemMeta(page).getByPlaceholder("Por qué van juntos (opcional)")).toHaveValue(NOTA);

// 2) Deshacer el tándem borra su fila EN BD. Es lo único que ningún CHECK puede
//    garantizar (la pertenencia es un empate entre filas, no una FK).
await deshacerTandem(page);
await save(page);
const filas = await api(`saga_tandems?saga_id=eq.${SAGA_ID}&select=position`).then((r) => r.json());
expect(filas).toHaveLength(0);

// 3) La ficha lo dice. Móvil, ruta «lectura»: la fila del tándem lleva el modo y la nota.
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`/saga/${SAGA_ID}?tab=mapa&ruta=lectura`);
const fila = page.locator('[data-testid="timeline-tandem"]:visible').first();
await expect(fila).toContainText("A la vez");
await expect(fila).toContainText(NOTA);
```

`tandemMeta(page)` es `page.locator('[data-testid="tandem-meta"]:visible')` — con `:visible` porque las dos cáscaras del editor se montan a la vez y se ocultan por breakpoint (regla de los dos árboles).

- [ ] **Step 2: Correr y ver que pasa**

Run: `npx playwright test e2e/sagas-tandem-metadatos.spec.ts --reporter=list`
Expected: 3 passed.

- [ ] **Step 3: Inyección de fallo, tres roturas de una en una**

| # | Rotura | Test que debe caer |
|---|---|---|
| 1 | En `toPayload`, no emitir nunca `tandems` (`const tandems = []`) | el de persistencia |
| 2 | En el RPC, quitar el `delete from saga_tandems` | el de la baja contra BD |
| 3 | En `timeline-tandem-row.tsx`, dejar de pintar `row.mode` | el de la ficha |

Después de cada una: aplicar, correr, **comprobar que cae exactamente ese test**, revertir.

> Si alguna rotura NO tumba su test, el test no vale. Pasó en la fase 4 (#214) y volvió a pasar en la fase 1 de este mismo spec: la aserción «existe un Nº 1» seguía pasando con la numeración rota, porque el «Nº 1» era la segunda fila. Arréglalo antes de seguir.

- [ ] **Step 4: Suite de sagas entera**

Run: `npx playwright test e2e/sagas-*.spec.ts --reporter=list`
Expected: todo verde. Ojo a `sagas-editor-secuencia.spec.ts:207`, que es el que más cerca está de lo que toca esta fase.

- [ ] **Step 5: Commit**

```bash
git add e2e/sagas-tandem-metadatos.spec.ts
git commit -m "test(e2e): los metadatos del tándem se guardan, se borran y se ven"
```

---

## Task 8: Producción — migrar, desplegar, y SOLO ENTONCES el `drop`

**Files:**
- Create: `supabase/migrations/20260802_drop_save_saga_sequence_v6.sql`
- Modify: `supabase/schema-baseline.sql`

**Esta tarea NO se puede completar de una sentada.** El paso 3 depende de un despliegue a producción que hace el responsable. Si estás ejecutando el plan solo, **para en el paso 3 y dilo**: aplicar el `drop` antes del despliegue deja sin función al bundle que está sirviendo.

- [ ] **Step 1: Aplicar a PROD las dos migraciones de las Tasks 1 y 2**

En este orden: `20260801_saga_tandems.sql`, luego `20260801_save_saga_sequence_tandems.sql`.

- [ ] **Step 2: Verificar en prod contra los objetos reales**

```sql
select to_regclass('public.saga_tandems') as tabla,
       (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where p.proname='save_saga_sequence' and n.nspname='public') as firmas,
       (select count(*) from public.saga_tandems) as filas;
```

Expected: `tabla` no nula, `firmas = 2`, `filas = 0` (**sin backfill**: nadie ha declarado todavía qué clase de tándem es el de Trono de Cristal, y decidirlo por el curador sería inventar).

- [ ] **Step 3: ⛔ Esperar al despliegue del bundle que llama con 7 argumentos**

No sigas sin confirmarlo. La comprobación no es «la PR está mergeada»: es que producción sirve el bundle nuevo.

- [ ] **Step 4: Confirmar que no queda ninguna llamada con 6 argumentos**

Run: `grep -rn "save_saga_sequence" src/`
Expected: una sola llamada, con `p_tandems`.

- [ ] **Step 5: Aplicar el `drop` en dev y en prod**

```sql
-- Retirada del envoltorio de SEIS argumentos, después de confirmar que el
-- bundle que llama con siete está desplegado. Mientras vivía, una llamada
-- rezagada mandaba `p_tandems = '[]'` sin saberlo y borraba los metadatos que
-- el editor nuevo acabara de guardar.
drop function if exists public.save_saga_sequence(uuid, jsonb, jsonb, jsonb, jsonb, jsonb);
```

- [ ] **Step 6: Verificar que queda UNA firma en los dos entornos**

```sql
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.proname='save_saga_sequence' and n.nspname='public';
```

Expected: una fila, la de 7 argumentos. En dev **y** en prod.

- [ ] **Step 7: Curar el caso real de producción y mirarlo**

Trono de Cristal, hueco 5 (*Imperio de Tormentas* + *Torre del Alba*). Declara modo y nota, y mira la ficha. **Riesgo 4 de la spec**: es el único tándem que hay, así que si se ve mal, se ve mal en el 100 % de los casos.

- [ ] **Step 8: Anexar al baseline y commit**

```bash
git add supabase/
git commit -m "chore(db): retirar la sobrecarga de seis argumentos de save_saga_sequence"
```

---

## Task 9: Cerrar la doc

- [ ] **Step 1: `data-model.md`** — sección nueva para `saga_tandems` (columnas, PK, CHECKs, RLS, y que la pertenencia NO vive aquí), y actualizar la firma de `save_saga_sequence` a 7 argumentos. **Sube su fecha de verificación.**
- [ ] **Step 2: `backlog.md`** — marcar la fase 2 con lo aplicado a dev y a prod, y el estado del `drop`.
- [ ] **Step 3: `decisiones.md`** (append-only) — tres entradas: (1) los metadatos van por HUECO y la pertenencia sigue siendo el empate de `position`, con las dos alternativas descartadas y su porqué; (2) el reemplazo por saga de `p_tandems` es correcto porque hay un único escritor, a diferencia de las ventanas desde la fase 4; (3) el riesgo aceptado del envoltorio mientras vive.
- [ ] **Step 4: Mapa de arquitectura** — `docs/architecture/graph.json` (tabla nueva en la capa `db`, flujo del editor de secuencia) y `node docs/architecture/sync.mjs`.
- [ ] **Step 5: Chequeo de deriva** — `/drift-check`.
- [ ] **Step 6: Commit**

```bash
git add docs/
git commit -m "docs(sagas): cerrar la doc de la fase 2 del timeline"
```

---

## Riesgos, con lo que ya se sabe de ellos

1. **El baile de la sobrecarga.** Ya pagado dos veces (2b y 4). El orden es: crear → desplegar → borrar. La Task 8 lo parte en pasos para que sea imposible saltárselo por descuido.
2. **La fase se estrena con UN caso real.** Un único tándem en toda la producción. Curarlo y mirarlo es parte del trabajo (Tasks 6 y 8), no un extra.
3. **El refactor `DraftEntry[][]` → `DraftSlot[]` toca 10 sitios.** Es mecánico, pero un `slot.map` que se quede sin migrar compila si el tipo es laxo. `tsc --noEmit` después de la Task 3 es el mapa exacto de lo que falta: úsalo, no busques a ojo.
4. **Renumerar mueve el hueco.** La tabla se indexa por `position`, que el propio RPC reescribe. Está cubierto porque los metadatos viajan en el mismo payload y en la misma transacción — pero cualquier camino futuro que escriba `position` fuera de `save_saga_sequence` rompe esto en silencio. Desde la fase 2a ese camino no existe (se retiró `assignItemToSaga` como segundo escritor); si alguien lo reabre, esta tabla es una de las víctimas.
5. **La ficha es pública.** Modo y nota se ven sin sesión. No metas nada que dependa del lector en esta fila.
