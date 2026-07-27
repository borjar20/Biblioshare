# Sagas fase 2b: la ventana de una entrada libre — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que una entrada `libre` pueda decir *entre dónde y dónde* se lee — «a partir de Nacidos Era 1 · recomendable antes de Viento y Verdad» — y que eso se vea en la ficha.

**Architecture:** una tabla nueva con **una fila por entrada y dos anclas como máximo**, que viaja en el mismo guardado atómico que el resto de la secuencia. La curación son dos selectores dentro de la zona «Cuando quieras»; el render es una línea de texto bajo la entrada.

**Tech Stack:** Next.js 16 (App Router, React 19), Supabase/PostgREST, Tailwind v4 con tokens Paper, next-intl (solo `es`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-26-sagas-fase-2b-ventanas-design.md` — **léelo, y en particular sus dos correcciones**: la puerta de entrada ya se cruzó (se curó el Cosmere el 2026-07-26) y el alcance se invirtió respecto de la primera redacción.

## Lo que hay hoy, medido

Tras curar el Cosmere y desplegar la #198, producción tiene **exactamente dos entradas `libre`**, y las dos son **bloques-subsaga**:

| entrada | qué es | zona | opcional |
|---|---|---|---|
| Nacidos de la Bruma. Era 2 | bloque | `libre` | sí |
| Novelas secretas | bloque | `libre` | sí |

`saga_items` sigue con **0** filas `libre`. Por eso el sujeto de una ventana **no puede ser «solo obra»**: sería un editor incapaz de tocar ninguna de las dos entradas que existen.

**El enunciado que hay que poder expresar**, en palabras del curador: ***Nacidos de la Bruma Era 2 es opcional, a partir de Era 1, y recomendable antes de Viento y Verdad***. Fíjate en las dos anclas: *Era 1* es un **bloque hijo** del Cosmere y *Viento y Verdad* es una **obra de dentro de otro bloque** (El Archivo de las Tormentas). Las anclas cruzan el subárbol entero.

## Global Constraints

- **Sujeto: obra o bloque.** Anclas: obra o bloque. Los dos casos reales de hoy son bloques.
- **Como máximo UNA ventana por entrada y DOS anclas** (una «a partir de», una «antes de»). Es la restricción dura que impide que esto degenere en el grafo que la fase 2a retiró. Si en algún momento hace falta relajarla, **se para y se dice en voz alta**.
- **Solo las entradas `libre` tienen ventana.** No se puede imponer con un CHECK entre tablas: lo garantizan el RPC (único escritor, borra las ventanas de lo que deja de ser `libre`) y el render (ignora la ventana de lo que no sea `libre`).
- **Las anclas se eligen del SUBÁRBOL entero**, no solo de las filas que esta pantalla cura. Es más ancho que lo que carga el editor hoy (#187), y hace falta un cargador propio.
- **Un ancla nunca apunta a su propio sujeto.**
- **Las anclas rotas no las limpia el RPC**: el render omite la que no resuelve, y el editor la enseña marcada para que se vea la deuda. Está razonado en el spec.
- **El progreso no cambia.** Una ventana no toca el denominador. El Cosmere marca **9 de 11** hoy (bajó de 12 al marcarse *Arcanum Ilimitado* como `optional`) y tiene que seguir marcándolo.
- **Migraciones: dev primero, prod después**, verificando contra `pg_class`/`pg_proc`/`pg_policies`, **nunca** contra `list_migrations`.
- **Node 22** (`fnm use 22`) antes de `vitest`/`playwright`. Un solo `next dev`, en el 3000.
- Copia en español, namespace `sagaEditor` para el editor y `saga` para la ficha.

## Estructura de ficheros

| Fichero | Qué |
|---|---|
| `supabase/migrations/20260727_saga_placement_windows.sql` | tabla, uniques, CHECKs, RLS |
| `supabase/migrations/20260727_save_saga_sequence_windows.sql` | RPC de 5 argumentos + envoltorio de 4 |
| `supabase/migrations/20260728_drop_save_saga_sequence_v4.sql` | **se aplica DESPUÉS de desplegar** |
| `src/lib/sagas/sequence-draft.ts` | `DraftEntry.window`, operaciones y serialización |
| `src/lib/sagas/validate-sequence-draft.ts` | reglas de la ventana |
| `src/lib/sagas/get-saga-sequence.ts` | carga las ventanas |
| `src/lib/sagas/get-anchor-options.ts` | **nuevo**: obras y bloques del subárbol para el selector |
| `src/lib/sagas/sequence-actions.ts` | manda `p_windows` |
| `src/components/saga/sequence/window-editor.tsx` | **nuevo**: las dos anclas de una fila |
| `src/components/saga/sequence/anchor-picker.tsx` | **nuevo**: elegir ancla (patrón de `tandem-picker`) |
| `src/components/saga/sequence/shell-desktop.tsx`, `shell-mobile.tsx` | montan el editor de ventana en la zona 2 |
| `src/lib/sagas/get-saga-detail.ts` | resuelve las ventanas para la ficha |
| `src/components/saga/saga-info.tsx` | pinta la línea |
| `e2e/sagas-ventanas.spec.ts` | **nuevo** |

---

### Task 1: La tabla

**Files:** Create `supabase/migrations/20260727_saga_placement_windows.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260727_saga_placement_windows.sql
--
-- La ventana de una entrada `libre` (spec 2026-07-26, fase 2b): entre dónde y
-- dónde se lee algo que no ocupa un hueco del orden. El caso que la motiva, en
-- palabras del curador: «Nacidos Era 2 es opcional, A PARTIR DE Era 1, y
-- recomendable ANTES DE Viento y Verdad».
--
-- ⚠️ Esto son aristas otra vez, con otro nombre. Lo que impide que degeneren en
-- el lienzo que la fase 2a retiró es la RESTRICCIÓN DURA: una fila por entrada,
-- dos anclas como máximo, solo para entradas `libre`, y curadas con dos
-- selectores — nunca arrastrando. Si alguna vez se relaja el unique, se admite
-- un tercer tipo de ancla o se deja que un ancla apunte fuera del subárbol, se
-- ha vuelto al punto de partida y hay que decirlo en voz alta.
create table public.saga_placement_windows (
  id uuid primary key default gen_random_uuid(),
  saga_id uuid not null references public.sagas(id) on delete cascade,

  -- SUJETO: la entrada cuya ventana es esta. Obra XOR bloque.
  item_type public.item_type,
  item_id uuid,
  child_saga_id uuid references public.sagas(id) on delete cascade,

  -- ANCLA «a partir de». Obra XOR bloque, opcional.
  after_item_type public.item_type,
  after_item_id uuid,
  after_child_saga_id uuid references public.sagas(id) on delete cascade,

  -- ANCLA «recomendable antes de». Misma forma, opcional.
  before_item_type public.item_type,
  before_item_id uuid,
  before_child_saga_id uuid references public.sagas(id) on delete cascade,

  created_at timestamptz not null default now(),

  -- El sujeto es obra XOR bloque, y una obra necesita SIEMPRE su tipo: item_id
  -- es polimórfico (book|movie|series) y sin item_type no se sabe a qué tabla
  -- apunta. Escrito sobre IS NOT NULL a propósito: la fase 1 se quemó con un
  -- CHECK de tres ramas unidas por OR, donde comparar con NULL da NULL, el OR
  -- entero da NULL y un CHECK solo rechaza FALSE — así que la fila imposible
  -- pasaba. `IS NOT NULL` nunca da NULL.
  constraint saga_placement_windows_subject check (
    ((item_id is not null and item_type is not null) and child_saga_id is null)
    or
    ((item_id is null and item_type is null) and child_saga_id is not null)
  ),
  constraint saga_placement_windows_after check (
    (after_item_id is null and after_item_type is null and after_child_saga_id is null)
    or ((after_item_id is not null and after_item_type is not null) and after_child_saga_id is null)
    or ((after_item_id is null and after_item_type is null) and after_child_saga_id is not null)
  ),
  constraint saga_placement_windows_before check (
    (before_item_id is null and before_item_type is null and before_child_saga_id is null)
    or ((before_item_id is not null and before_item_type is not null) and before_child_saga_id is null)
    or ((before_item_id is null and before_item_type is null) and before_child_saga_id is not null)
  ),
  -- Al menos un ancla: una ventana sin ninguna es un `libre` sin ventana, y
  -- entonces no hay fila.
  constraint saga_placement_windows_needs_anchor check (
    after_item_id is not null or after_child_saga_id is not null
    or before_item_id is not null or before_child_saga_id is not null
  )
);

-- Una fila por entrada. Mismo par de uniques parciales que ya protege
-- `saga_nodes` y `saga_route_entries` (20260723_saga_route_entries_uniques.sql).
create unique index saga_placement_windows_item_key
  on public.saga_placement_windows (saga_id, item_type, item_id) where item_id is not null;
create unique index saga_placement_windows_child_key
  on public.saga_placement_windows (saga_id, child_saga_id) where child_saga_id is not null;

create index saga_placement_windows_saga_idx on public.saga_placement_windows (saga_id);

alter table public.saga_placement_windows enable row level security;

create policy "saga placement windows readable by everyone"
  on public.saga_placement_windows for select using (true);
create policy "saga placement windows writable by collaborators"
  on public.saga_placement_windows for all
  using (public.has_min_role('collaborator'))
  with check (public.has_min_role('collaborator'));
```

**Antes de escribirla**, abre `supabase/migrations/20260723_saga_routes.sql` y copia de ahí la **forma exacta** de las políticas RLS de `saga_routes` (nombres y estructura), en vez de fiarte de las de arriba: si el repo usa políticas separadas por operación en vez de un `for all`, sigue lo que hay.

- [ ] **Step 2: Aplicarla a dev y verificar contra los objetos reales**

Con `mcp__supabase-dev__apply_migration`. Después, **contra `pg_class`/`pg_constraint`/`pg_policies`, nunca contra `list_migrations`**:

```sql
select conname from pg_constraint
where conrelid = 'public.saga_placement_windows'::regclass order by conname;
select indexname from pg_indexes where tablename = 'saga_placement_windows' order by 1;
select policyname, cmd from pg_policies where tablename = 'saga_placement_windows' order by 1;
```

Esperado: los cuatro CHECK, los dos uniques parciales + el índice de `saga_id` + la PK, y las políticas de lectura pública y escritura `collaborator+`.

- [ ] **Step 3: Comprobar que los CHECK muerden de verdad**

No basta con que existan. Sobre dev, dentro de `begin; ... rollback;`, y **enseñando la salida literal en el informe**, comprueba que estas cuatro inserciones **fallan con 23514**:

1. sujeto con `item_id` **y** `child_saga_id` a la vez;
2. sujeto con `item_id` pero **sin** `item_type`;
3. fila **sin ninguna ancla**;
4. ancla «a partir de» con `after_item_id` y `after_child_saga_id` a la vez.

Y que **sí** entra una fila legítima (sujeto bloque, un ancla de obra). Si alguna de las cuatro pasa, **para**: el CHECK está mal escrito, que es exactamente lo que ocurrió en la fase 1.

- [ ] **Step 4: Comprobar el unique**

En otra transacción con `rollback`: insertar dos ventanas para el **mismo** sujeto debe fallar con `23505`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260727_saga_placement_windows.sql
git commit -m "feat(db): saga_placement_windows — una ventana por entrada, dos anclas"
```

---

### Task 2: El borrador lleva la ventana

**Files:**
- Modify: `src/lib/sagas/sequence-draft.ts`, `src/lib/sagas/sequence-draft.test.ts`
- Modify: `src/lib/sagas/validate-sequence-draft.ts`, `src/lib/sagas/validate-sequence-draft.test.ts`

**Interfaces:**
- Produces: `DraftAnchor`, `DraftWindow`, `DraftEntry.window`, las operaciones `setAnchor` / `clearAnchor`, y `SequencePayload.windows`.

- [ ] **Step 1: Los tipos**

En `sequence-draft.ts`:

```ts
/** Un ancla apunta a una obra o a un bloque del subárbol. Lleva el título
 *  resuelto porque el editor la pinta sin volver a consultar. */
export type DraftAnchor = {
  kind: "item" | "block";
  itemType: ItemType | null;
  itemId: string | null;
  childSagaId: string | null;
  title: string;
};

/** Como máximo dos anclas, y al menos una: una ventana sin ninguna no existe
 *  (lo impone también un CHECK). `null` en las dos = no hay ventana. */
export type DraftWindow = { after: DraftAnchor | null; before: DraftAnchor | null };
```

Y en `DraftEntry`, junto a `role`:

```ts
  /** Ventana de una entrada `libre` (fase 2b): entre dónde y dónde se lee.
   *  SIEMPRE null fuera de la zona «Cuando quieras» — la coherencia la
   *  mantiene `sendTo`, que la borra al sacar la fila de esa zona, porque
   *  ningún CHECK puede atar dos tablas. */
  window: DraftWindow | null;
```

- [ ] **Step 2: Las pruebas que fallan**

En `sequence-draft.test.ts` (usa el helper `work()`/`block()`/`draft()` que ya tiene el fichero; añade `window: null` a los helpers):

```ts
const anchor = (title: string): DraftAnchor => ({
  kind: "block", itemType: null, itemId: null, childSagaId: `saga-${title}`, title,
});

describe("ventanas", () => {
  it("poner un ancla la deja en la entrada", () => {
    const d = setAnchor(draft([], [work("f")]), "i:book:f", "after", anchor("Era 1"));
    expect(d.free[0].window).toEqual({ after: anchor("Era 1"), before: null });
  });

  it("quitar la última ancla deja la ventana en null, no en un objeto vacío", () => {
    // Una ventana sin anclas no existe: el CHECK de BD la rechaza, así que el
    // borrador tampoco puede tenerla.
    const conAncla = setAnchor(draft([], [work("f")]), "i:book:f", "after", anchor("Era 1"));
    expect(clearAnchor(conAncla, "i:book:f", "after").free[0].window).toBeNull();
  });

  it("sacar la fila de «Cuando quieras» se lleva su ventana por delante", () => {
    // Es la coherencia que ningún CHECK entre tablas puede imponer.
    const conAncla = setAnchor(draft([], [work("f")]), "i:book:f", "after", anchor("Era 1"));
    const movida = sendTo(conAncla, "i:book:f", "sequence");
    expect(movida.slots[0][0].window).toBeNull();
  });

  it("una entrada fuera de la zona libre no admite ancla", () => {
    const d = draft([[work("a")]]);
    expect(setAnchor(d, "i:book:a", "after", anchor("Era 1"))).toEqual(d);
  });

  it("toPayload lleva las ventanas, y solo las de la zona libre", () => {
    const d = setAnchor(draft([[work("a")]], [work("f")]), "i:book:f", "before", anchor("Viento"));
    const p = toPayload(d);
    expect(p.windows).toEqual([
      {
        item_type: "book", item_id: "f", child_saga_id: null,
        after_item_type: null, after_item_id: null, after_child_saga_id: null,
        before_item_type: null, before_item_id: null, before_child_saga_id: "saga-Viento",
      },
    ]);
  });
});
```

- [ ] **Step 3: Verlas fallar, implementar, verlas pasar**

```bash
fnm use 22; npx vitest run src/lib/sagas/sequence-draft.test.ts
```

Implementa `setAnchor` / `clearAnchor` con el mismo estilo puro del fichero (`mapEntry` ya existe), haz que `sendTo` borre la ventana cuando el destino no es `free`, y añade `windows` a `toPayload` recorriendo **solo** `d.free`.

- [ ] **Step 4: La validación**

En `validate-sequence-draft.ts`, sobre `payload.windows`:

- el sujeto está entre las entradas `libre` del propio payload → si no, `windowNotFree`;
- al menos un ancla → `windowNoAnchor`;
- ningún ancla apunta al propio sujeto → `windowSelfAnchor`;
- las anclas están en el subárbol → `windowForeignAnchor`, usando un `ctx.anchorKeys: Set<string>` nuevo que el llamante rellena con las claves del subárbol.

Con su prueba por regla, y **su gemela que no la dispara**.

- [ ] **Step 5: Inyección de fallo**

Desactiva una a una las cuatro reglas nuevas y comprueba que **cae solo su prueba**. Y quita el borrado de la ventana en `sendTo`: debe caer «sacar la fila se lleva su ventana».

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/sequence-draft.ts src/lib/sagas/sequence-draft.test.ts src/lib/sagas/validate-sequence-draft.ts src/lib/sagas/validate-sequence-draft.test.ts
git commit -m "feat(sagas): el borrador de secuencia lleva la ventana de una entrada libre"
```

---

### Task 3: El RPC crece sin romper el bundle desplegado

**Files:** Create `supabase/migrations/20260727_save_saga_sequence_windows.sql`; modify `src/lib/sagas/sequence-actions.ts`.

**⚠️ Esta es la tarea con la trampa.** «Migraciones antes que el código» basta cuando el cambio es aditivo, y **este no lo es**: añadir un parámetro a una función de Postgres **no la reemplaza**, crea una **sobrecarga**; y borrar la de cuatro argumentos rompe el bundle que hay desplegado, que llama a esa. Por eso van tres pasos en tres migraciones, y la tercera **no** es de esta tarea.

- [ ] **Step 1: La migración**

Crea `save_saga_sequence(uuid, jsonb, jsonb, jsonb, jsonb)` con la lógica de hoy **más** las ventanas, y **reescribe la de cuatro argumentos como un envoltorio**:

```sql
create or replace function public.save_saga_sequence(
  p_saga_id uuid, p_entries jsonb, p_blocks jsonb, p_removed jsonb, p_windows jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- El cuerpo entero de la versión de hoy, COPIADO SIN CAMBIOS de
  -- `supabase/migrations/20260726_save_saga_sequence.sql` (el insert de
  -- `saga_items` con su `on conflict do update` y su `is_primary` condicional,
  -- el update de las hijas directas acotado por `parent_saga_id`, y el delete
  -- por `p_removed`). No lo reescribas de memoria: ábrelo y cópialo. Y después,
  -- lo único nuevo:

  -- Reemplazo total de las ventanas DE ESTA SAGA. Aquí sí es correcto —al
  -- contrario que en `saga_items`, donde la baja es explícita— porque no hay un
  -- segundo escritor: ninguna otra pantalla crea ventanas. Y borrar primero es
  -- lo que garantiza la coherencia que ningún CHECK entre tablas puede dar: una
  -- entrada que deja de ser `libre` no viaja en p_windows, así que su ventana
  -- desaparece en la misma transacción en que se mueve de zona.
  delete from saga_placement_windows where saga_id = p_saga_id;

  insert into saga_placement_windows (
    saga_id, item_type, item_id, child_saga_id,
    after_item_type, after_item_id, after_child_saga_id,
    before_item_type, before_item_id, before_child_saga_id
  )
  select
    p_saga_id,
    (w->>'item_type')::public.item_type, (w->>'item_id')::uuid, (w->>'child_saga_id')::uuid,
    (w->>'after_item_type')::public.item_type, (w->>'after_item_id')::uuid, (w->>'after_child_saga_id')::uuid,
    (w->>'before_item_type')::public.item_type, (w->>'before_item_id')::uuid, (w->>'before_child_saga_id')::uuid
  from jsonb_array_elements(coalesce(p_windows, '[]'::jsonb)) as w;
end;
$$;

-- La versión de CUATRO argumentos pasa a ser un envoltorio, y se queda viva
-- hasta que el código nuevo esté desplegado. Sin esto, el bundle que hay hoy en
-- producción —que llama con cuatro— se quedaría sin función entre la migración
-- y el despliegue.
create or replace function public.save_saga_sequence(
  p_saga_id uuid, p_entries jsonb, p_blocks jsonb, p_removed jsonb
) returns void
language sql security definer set search_path = public
as $$ select public.save_saga_sequence(p_saga_id, p_entries, p_blocks, p_removed, '[]'::jsonb) $$;
```

Con sus `revoke`/`grant` para **las dos** firmas, copiando el patrón de la migración de la fase 2a.

⚠️ **Ojo con el envoltorio**: llamar con `'[]'` borraría las ventanas de la saga. Para el bundle viejo eso es correcto (no las conoce y nunca las manda), pero **compruébalo y déjalo escrito**: si alguien guardara desde el editor viejo, perdería las ventanas. Es una ventana de riesgo de minutos, entre migración y despliegue.

- [ ] **Step 2: Aplicar a dev y verificar las DOS firmas**

```sql
select pg_get_function_identity_arguments(p.oid) as args, p.prosecdef
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'save_saga_sequence' order by 1;
```

Esperado: **dos** filas, las dos con `prosecdef = true`.

- [ ] **Step 3: Comprobar en dev las dos garantías**

Dentro de `begin; ... rollback;`, con salida literal en el informe:
1. llamar a la de **cinco** con una ventana la inserta;
2. llamar después a la de **cinco** sin esa ventana la borra (reemplazo total);
3. llamar a la de **cuatro** deja la secuencia igual que antes (el envoltorio no rompe nada).

- [ ] **Step 4: El action manda `p_windows`**

En `sequence-actions.ts`, añadir `p_windows: payload.windows` a la llamada.

**Y nada más.** La validación de las anclas necesita `ctx.anchorKeys`, que sale del cargador del subárbol y **todavía no existe**: eso se cablea en la Task 4, que es quien lo construye. Hasta entonces, `validateSequenceDraft` recibe un `anchorKeys` vacío y su regla `windowForeignAnchor` no puede disparar — es un estado intermedio de una tarea, no un hueco: no hay interfaz que pueda producir una ventana todavía.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260727_save_saga_sequence_windows.sql src/lib/sagas/sequence-actions.ts
git commit -m "feat(sagas): save_saga_sequence escribe las ventanas, sin romper el bundle viejo"
```

---

### Task 4: La carga — ventanas y opciones de ancla

**Files:** Modify `src/lib/sagas/get-saga-sequence.ts`; create `src/lib/sagas/get-anchor-options.ts` (+ test).

**Interfaces:**
- `getSagaSequence` devuelve además las ventanas ya metidas en `DraftEntry.window`.
- `getAnchorOptions(supabase, sagaId)` devuelve `Array<DraftAnchor>` con **todas** las obras y bloques del subárbol.

- [ ] **Step 1: Las ventanas, en el borrador**

`getSagaSequence` consulta `saga_placement_windows` de esta saga y resuelve los títulos de las anclas. **Los títulos de las anclas no salen de las filas que ya carga**: un ancla puede apuntar a una obra de un nieto (el caso real: *Viento y Verdad*, dentro de El Archivo de las Tormentas). Resuélvelos con `getAnchorOptions`, que ya recorre el subárbol, en vez de con una segunda consulta ad hoc.

- [ ] **Step 2: `getAnchorOptions`**

Recorre los descendientes hasta profundidad 4 —el mismo cinturón que `fetchDescendants` en `get-saga-detail.ts`, cópialo de ahí en vez de reinventarlo— y devuelve una entrada por **obra** del subárbol y una por **bloque** descendiente, con su título. Un ancla rota (una obra que ya no está en el árbol) simplemente no aparece en la lista.

- [ ] **Step 3: Prueba de la hidratación**

Como en la fase 2a, extrae la parte pura a una función exportada (`hydrateWindows`) y pruébala sin Supabase: una fila con dos anclas, una con solo `after`, y **una cuyo ancla no resuelve** — esa debe quedar con esa ancla a `null`, y si se queda sin ninguna, con `window: null`.

- [ ] **Step 4: Suite y commit**

```bash
fnm use 22; npx vitest run; npx tsc --noEmit
git add src/lib/sagas/get-saga-sequence.ts src/lib/sagas/get-anchor-options.ts src/lib/sagas/get-anchor-options.test.ts
git commit -m "feat(sagas): carga de ventanas y de las opciones de ancla del subárbol"
```

---

### Task 5: La curación

**Files:** Create `src/components/saga/sequence/window-editor.tsx` y `anchor-picker.tsx`; modify `shell-desktop.tsx`, `shell-mobile.tsx`, `sequence-editor.tsx`, `messages/es.json`.

- [ ] **Step 1: El selector de ancla**

**Clona el patrón de `tandem-picker.tsx`, no inventes otro.** Ese componente ya resolvió los mismos tres problemas y le costó dos rondas de revisión:

- **radios nativos** (`<fieldset>` + `<input type="radio">` dentro de `<label>`), que traen la navegación con flechas gratis — no un `radiogroup` a mano, que promete una semántica que no cumple;
- **filtro que normaliza acentos** con `normalizeTitle` de `src/lib/catalog/title-match.ts`;
- **estado vacío explicado**, no un panel en blanco;
- `<dialog>` nativo con `showModal()`, y **centrado en escritorio / hoja abajo en móvil, cortando en `lg`** — el mismo criterio que `row-sheet.tsx`.

Repetirlo desde cero sería repetir sus tres bugs.

- [ ] **Step 2: El editor de ventana**

Dentro de cada fila de la zona «Cuando quieras»: si no hay ventana, un «+ Añadir ventana»; si la hay, las anclas presentes con su ✕ y, mientras quede hueco, el botón para añadir la otra. **Con las dos anclas puestas, el botón de añadir desaparece**: el tope está alcanzado y se ve que lo está.

Un ancla que llegó rota (`title` sin resolver) se pinta marcada como tal, con la opción de quitarla. No se borra sola: la obra puede volver a la saga.

> **Nota añadida en la revisión final de rama (2026-07-27):** esto se revirtió a
> propósito. El responsable de producto decidió el 2026-07-27 que un ancla rota
> se olvida, no se conserva marcada — ver `docs/requirements/decisiones.md`
> (entrada 2026-07-27). Este Step queda tal cual como registro histórico de lo
> planeado; el comportamiento construido es el contrario.

- [ ] **Step 3: Claves i18n**, namespace `sagaEditor`:

```json
"windowAdd": "+ Añadir ventana",
"windowAfter": "A partir de",
"windowBefore": "Antes de",
"windowAddAfter": "+ A partir de…",
"windowAddBefore": "+ Recomendable antes de…",
"windowRemoveAnchor": "Quitar «{anchor}» de {title}",
"windowBroken": "Ya no está en la saga",
"anchorPickerFilter": "Filtrar obras y bloques…",
"anchorPickerEmpty": "No hay nada más en esta saga a lo que anclar.",
"windowErrors": {
  "windowNotFree": "Solo las entradas de «Cuando quieras» pueden tener ventana.",
  "windowNoAnchor": "Una ventana necesita al menos un ancla.",
  "windowSelfAnchor": "Una obra no puede anclarse a sí misma.",
  "windowForeignAnchor": "El ancla tiene que ser algo de esta saga."
}
```

- [ ] **Step 4: `tsc`, suite y verificación en navegador**

Contra **dev**: marca algo como `libre`, ponle las dos anclas, guarda, recarga y comprueba que siguen. Deja la semilla como estaba. Un solo `next dev` en el 3000.

- [ ] **Step 5: Commit**

```bash
git add src/components/saga/sequence/ messages/es.json
git commit -m "feat(sagas): curación de la ventana de una entrada libre"
```

---

### Task 6: La ficha lo cuenta

**Files:** Modify `src/lib/sagas/get-saga-detail.ts`, `src/components/saga/saga-info.tsx`, `messages/es.json`.

- [ ] **Step 1: Resolver las ventanas para la ficha**

`getSagaDetail` ya baja los descendientes y los miembros del subárbol, así que **tiene en memoria todo lo que hace falta para resolver los títulos de las anclas**: no añadas un cargador nuevo, resuelve con lo que ya hay.

Añade a `SagaDetail` un campo `windows`, con un tipo nuevo declarado en `src/lib/sagas/types.ts` — ya vive ahí el resto del vocabulario de la ficha:

```ts
/** Ventana de una entrada `libre` ya resuelta a texto para la ficha. Un ancla
 *  que no resuelve contra el subárbol cargado llega como `null` y no se pinta:
 *  mejor media frase cierta que una referencia rota (spec fase 2b). */
export type ResolvedWindow = { afterTitle: string | null; beforeTitle: string | null };
```

y en `SagaDetail`: `windows: Record<string, ResolvedWindow>` — objeto plano, no `Map`, porque **cruza la frontera servidor→cliente** y un `Map` no es serializable. Es la misma trampa que ya obligó a cambiar la forma del rail en la fase 2a. La clave es la de la entrada (`i:<tipo>:<uuid>` o `s:<uuid>`), la misma que usa el borrador.

- [ ] **Step 2: Pintarlo**

Bajo cada entrada `libre` que tenga ventana, en la sección «Cuando quieras»:

> *a partir de **Nacidos de la Bruma Era 1** · recomendable antes de **Viento y Verdad***

- Para un **bloque**, bajo su cabecera.
- Para una **obra**, bajo su celda.
- Con una sola ancla, media frase. **Sin ninguna que resuelva, ninguna línea** — la entrada sigue apareciendo, que es lo que importa.
- **El render ignora la ventana de una entrada que no sea `libre`**, en vez de confiar en que no exista.

Claves nuevas en el namespace `saga`: `windowAfterText`, `windowBeforeText`, `windowBothText`.

- [ ] **Step 3: `tsc`, suite, navegador y commit**

Verifica en dev que la línea sale, que con una sola ancla sale media, y que una entrada sin ventana no pinta nada.

```bash
git add src/lib/sagas/get-saga-detail.ts src/components/saga/saga-info.tsx messages/es.json
git commit -m "feat(sagas): la ficha cuenta la ventana de lo que se lee cuando quieras"
```

---

### Task 7: E2E, producción y cierre

**Files:** Create `e2e/sagas-ventanas.spec.ts`; modify `supabase/schema-baseline.sql`, `docs/requirements/data-model.md`, `backlog.md`, `decisiones.md`.

- [ ] **Step 1: El e2e**

**Lee los componentes antes de escribir un locator** — este plan se escribió antes que ellos. Cubre:

1. poner las dos anclas a una entrada `libre`, guardar, recargar y verlas;
2. **la coherencia**: mover esa entrada a la secuencia, guardar, y comprobar **contra la base de datos** que su ventana desapareció. Es lo que ningún CHECK puede garantizar, así que es el test que más protege;
3. el tope: con dos anclas puestas, no hay forma de añadir una tercera.

Con `try/finally`, `fetch` nativo (no el fixture `request`, que muere con el contexto), comprobando `res.ok`, y dejando la semilla como estaba. **Dos pasadas seguidas en verde.**

- [ ] **Step 2: Aplicar a producción**

Las **dos** migraciones de esta rama, en orden. Verificar contra `pg_class`/`pg_constraint`/`pg_policies`/`pg_proc`, y comprobar que quedan **las dos firmas** de `save_saga_sequence`.

- [ ] **Step 3: Desplegar y comprobar el Cosmere**

Tras el despliegue automático, curar en producción la ventana que motiva la fase —*Nacidos Era 2*: **a partir de Nacidos Era 1**, **antes de Viento y Verdad**— y comprobar que la ficha la cuenta. Y que **el progreso sigue en 9 de 11**: una ventana no toca el denominador.

- [ ] **Step 4: Borrar la firma de cuatro argumentos**

**Solo después de que el paso 3 confirme que el código nuevo está sirviendo.** Migración propia:

```sql
-- supabase/migrations/20260728_drop_save_saga_sequence_v4.sql
-- El envoltorio de cuatro argumentos existió para que el bundle desplegado no
-- se quedara sin función entre la migración de la fase 2b y su despliegue. Ya
-- no lo llama nadie. Dos firmas conviviendo sin motivo es una trampa para quien
-- venga después: no sabría cuál manda.
drop function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb);
```

Aplicar a dev y a prod, y verificar que queda **una** sola firma.

- [ ] **Step 5: Doc e issues**

- `schema-baseline.sql`: anexar las tres migraciones.
- `data-model.md`: la tabla nueva, sus restricciones y quién garantiza la coherencia «solo lo `libre` tiene ventana»; actualizar la fecha de verificación.
- `backlog.md`: 2b hecha; queda la fase 3.
- `decisiones.md`, **al final**: el reemplazo total de ventanas (frente a la baja explícita de `saga_items`) y por qué es correcto aquí; las anclas rotas que no limpia el RPC; y la secuencia de tres migraciones para crecer una firma sin romper el bundle.
- Issue por lo que quede vivo.

- [ ] **Step 6: Comprobación final**

```bash
fnm use 22; npx tsc --noEmit; npx vitest run; npm run lint
```

Esperado: limpio salvo el error preexistente de `signup-form.tsx` (#163).
