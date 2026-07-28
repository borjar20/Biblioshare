# Sagas · timeline con los cuatro estados · fase 4 — opcionales saltables — plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development` (recomendada)
> o `superpowers:executing-plans` para ejecutar tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que el lector decida qué opcionales le estorban — saltar una a una, con «Deshacer», y un
interruptor global para verlas o no — **sin tocar el denominador del progreso**.

**Arquitectura:** una tabla nueva por usuario (`saga_optional_skips`, clon de `saga_route_choices`),
una preferencia nueva en `profiles` (`show_optional_readings`), y dos campos nuevos que viajan por la
tubería que ya existe: `DetailMember.skipped` → `SagaGraphNode.optional`/`.skipped` → filas del
timeline. El filtrado lo hace **el motor puro** (`deriveTimeline`), no los componentes.

**Stack:** Next.js 16 App Router (RSC + server actions), Supabase/Postgres con RLS, Tailwind v4,
next-intl (locale único `es`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-28-sagas-timeline-estados-design.md` — fase 4 de la tabla de
fases. **Mockup:** `D:\Proyectos\Personal\Mockups\Paper - Sagas (estados del grafo).html`, bloque
«03 · Lecturas opcionales».

---

## Global Constraints

Copiadas literalmente de la spec y de `AGENTS.md`. Los requisitos de **toda** tarea las incluyen.

- **`src/lib/sagas/progress.ts` NO se toca.** Ni `computeProgress` ni `countedKeys` ni sus tests.
  Saltar es **solo visual**: el denominador no se mueve. El mockup pide lo contrario en dos sitios
  («desaparece del cómputo», «36% contando solo los principales · 31% si incluyes opcionales») y **se
  descarta a sabiendas** — reabrir el denominador es la familia de fallo del #91, el #185 y la fase 1.
- **Nada de segundas fuentes de verdad.** `optional` sale de `saga_items.optional` y de ningún otro
  sitio; `skipped` sale de `saga_optional_skips` y de ningún otro sitio. Prohibido deducir «es
  opcional» de `node.level === "menor"` (eso es un token de layout del grafo 2D, no una afirmación
  sobre la obra).
- **Migraciones: dev primero (`supabase-dev`), prod después**, y **prod ANTES del merge** (Task 9).
  Verificar contra los objetos reales (`pg_class`, `pg_policies`, `information_schema.columns`),
  **nunca** contra `list_migrations`.
- **Todo lo que quede pendiente se abre como issue** en el repo. No vale dejarlo en el cuerpo de la
  PR, en un `TODO` ni en el resumen de la sesión.
- **Nunca `git push` a `main`, ni `--force`, ni merge.** El usuario mergea. Commit por tarea.
- **Nada de `git stash` a pelo** (la pila es compartida entre worktrees).
- **Un solo `next dev`, en el puerto 3000.** `npm run test:e2e` reutiliza el que haya.
- **Node 22 para los tests**: la shell abre con v20 y rompe Vitest. `eval "$(fnm env --shell bash)"; fnm use 22`.
- **La doc canónica vuelve a ser cierta antes de cerrar** (Task 10): `data-model.md`, `backlog.md`,
  `decisiones.md` (append-only), `supabase/schema-baseline.sql`, `docs/architecture/graph.json`.

---

## Lo que hay hoy, medido

**[MEDIDO 2026-07-28, `SELECT` de solo lectura contra producción]**

| | |
|---|---|
| filas `saga_items.optional = true` | **6**, en 5 sagas |
| de ellas, `placement = libre` (`position IS NULL`) | **4** — Cosmere, El Archivo, Empíreo, La Rueda del Tiempo |
| de ellas, `placement = fijo` (con hueco) | **2** — *Saga de los Huesos Verdes*, huecos **1 y 2** de 5 |
| `saga_optional_skips` | no existe |
| `profiles.show_optional_readings` | no existe |

Las dos consecuencias que gobiernan el diseño:

1. **Una opcional CON hueco existe de verdad.** `optional` y `placement` son ortogonales
   (`src/lib/sagas/types.ts:70-72`). Así que el interruptor no puede limitarse a las ramas: en *Saga
   de los Huesos Verdes*, apagarlo esconde los huecos 1 y 2 de 5 — la cabeza de la saga. Es lo que el
   lector ha pedido al apagarlo, pero **hay que mirarlo con los ojos** antes de dar la fase por buena.
2. **Los números NO se recalculan al esconder.** Si el hueco 1 desaparece, el 3 sigue siendo el 3. Es
   la misma regla que la spec ya fijó para los pasos de un itinerario («si el paso 5 no se ve, el 6
   sigue siendo el 6»): renumerar haría que el timeline y el resto del producto contaran distinto.

---

## Decisiones de esta fase, con su porqué

Se añaden a las de la spec; van a `decisiones.md` en la Task 10.

### A. `saga_optional_skips.saga_id` es la saga **dueña** de la fila, no la que se está mirando

`DetailMember` ya distingue `groupSagaId` (agrupación visual) de `ownerSagaId` (la `saga_id` real de
la fila de `saga_items`) — `src/lib/sagas/types.ts:79-91`. El salto se guarda con **`ownerSagaId`**.

Con la alternativa (guardar la saga de la página) el mismo salto se vería en la ficha del universo y
no en la de la subsaga, o al revés, según por dónde hubieras entrado. Con `ownerSagaId` la lectura es
la misma desde cualquier ficha del árbol, y se carga igual que las ventanas: `.in("saga_id", sagaIds)`
sobre el subárbol ya resuelto.

### B. El interruptor filtra **en el motor**, no en los componentes

`deriveTimeline` recibe `showOptional` y descarta los nodos opcionales al construir `items`. Filtrar
en los componentes dejaría secciones vacías con su cabecera, ramas colgando de una fila que ya no se
pinta y ventanas ancladas a filas invisibles. Una línea en el motor y todo lo derivado es coherente.

### C. El interruptor **no redefine** el tramo de la ventana

`windowTrack` sigue leyendo `graph.nodes` completo. El mini-track dice dónde cae la ventana **sobre el
orden de lectura de la saga**, no sobre lo que este lector ha elegido ver. Si el filtro moviera el
track, dos lectores con la misma ventana verían tramos distintos — la misma cantidad derivada con dos
valores, que es la familia del #91.

### D. Saltar **no** esconde: tacha

`skipped` pinta la fila al 50% con el título tachado y el botón pasa a «Deshacer» (mockup: `.bcard.skipped`).
Esconder por saltar dejaría el «Deshacer» sin dónde vivir. Quien quiera dejar de verlas usa el
interruptor, que sí esconde — y **la barra del interruptor se pinta aunque estén todas escondidas**,
que es lo que permite volver.

### E. Sin sesión no hay ni salto ni interruptor, pero **sí** opcionales

La ficha es pública. Sin `user`, `showOptionalReadings` es `true` (el default) y no se pinta ningún
botón. Riesgo 5 de la spec: es fácil construir esto mirando solo la vista con sesión.

---

## Estructura de ficheros

| Fichero | Responsabilidad | Tarea |
|---|---|---|
| `supabase/migrations/20260805_saga_optional_skips.sql` | **Crear.** Tabla + RLS + columna de `profiles` | 1 |
| `src/lib/supabase/database.types.ts` | **Modificar.** Tabla nueva + columna nueva | 1 |
| `src/lib/sagas/types.ts` | **Modificar.** `DetailMember.skipped` | 2 |
| `src/lib/sagas/get-saga-detail.ts` | **Modificar.** Carga de skips y preferencia; `SagaDetail.showOptionalReadings` | 2 |
| `src/lib/sagas/map-types.ts` | **Modificar.** `SagaGraphNode.optional` / `.skipped` | 3 |
| `src/lib/sagas/derive-map.ts` | **Modificar.** `makeNode` copia los dos | 3 |
| `src/lib/sagas/derive-timeline.ts` | **Modificar.** Opción `showOptional` | 4 |
| `src/lib/sagas/optional-actions.ts` | **Crear.** `skipOptional`, `unskipOptional`, `setShowOptionalReadings` | 5 |
| `src/components/saga/timeline/skip-optional-button.tsx` | **Crear.** Píldora «Saltar»/«Deshacer» | 6 |
| `src/components/saga/timeline/timeline-entry-row.tsx` | **Modificar.** Tachado + píldora fuera del `<Link>` | 6 |
| `src/components/saga/timeline/timeline-branch.tsx` | **Modificar.** Ídem | 6 |
| `src/components/saga/timeline/timeline-labels.ts` | **Modificar.** Etiquetas nuevas | 6 |
| `src/components/saga/timeline/optional-bar.tsx` | **Crear.** Barra con el interruptor | 7 |
| `src/components/saga/reading-timeline.tsx` | **Modificar.** Monta la barra y pasa el contexto | 7 |
| `src/components/saga/saga-map-tab.tsx`, `route-view.tsx` | **Modificar.** Pasan `showOptional` y el contexto de acción | 7 |
| `messages/es.json` | **Modificar.** Copys | 6, 7 |
| `e2e/sagas-opcionales-saltables.spec.ts` | **Crear.** 4 tests | 8 |

Tests unitarios: se amplían `derive-timeline.test.ts`, `derive-map.test.ts` y `get-saga-detail.test.ts`.

---

## Task 1: Esquema — tabla de saltos y preferencia de perfil

**Files:**
- Create: `supabase/migrations/20260805_saga_optional_skips.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: tabla `public.saga_optional_skips (user_id, saga_id, item_type, item_id, created_at)` con
  PK `(user_id, saga_id, item_type, item_id)`; columna `public.profiles.show_optional_readings boolean not null default true`.
  Tipos TS: `Database["public"]["Tables"]["saga_optional_skips"]` y el campo nuevo en `profiles`.

- [ ] **Paso 1: Escribir la migración**

`supabase/migrations/20260805_saga_optional_skips.sql`:

```sql
-- Fase 4 del timeline con los cuatro estados (spec 2026-07-28): las opcionales
-- se pueden saltar, y el lector decide si quiere verlas.
--
-- Las dos piezas viajan en la MISMA migración porque son la misma decisión: sin
-- la tabla, el interruptor solo sabe esconderlas todas o ninguna; sin el
-- interruptor, saltarlas de una en una es la única forma de quitarlas de en
-- medio. Separarlas dejaría media feature desplegada.

-- Clon de saga_route_choices (20260723_saga_routes.sql): preferencia PERSONAL,
-- RLS solo-dueño y SIN gate de rol. No es curación — cualquier lector puede
-- saltarse una opcional en una saga que él no cura.
--
-- `saga_id` es la saga DUEÑA de la fila de `saga_items` (DetailMember.ownerSagaId),
-- no la ficha desde la que se pulsa: así el mismo salto se ve igual desde la
-- ficha del universo y desde la de la subsaga. Ver la decisión A del plan.
--
-- Sin FK contra `saga_items`: la PK de esa tabla es (saga_id, item_type,
-- item_id) y una FK compuesta ataría el salto al ciclo de vida de la curación,
-- de modo que retirar un miembro y volver a añadirlo borraría en silencio la
-- preferencia del lector. Un salto huérfano es INERTE: `deriveSagaMap` solo
-- marca nodos que existen, así que no se pinta en ninguna parte.
create table public.saga_optional_skips (
  user_id uuid not null references auth.users (id) on delete cascade,
  saga_id uuid not null references public.sagas (id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, saga_id, item_type, item_id)
);

alter table public.saga_optional_skips enable row level security;

create policy "saga optional skips own" on public.saga_optional_skips
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Preferencia global del lector, mismo patrón que profiles.daily_goal_minutes.
-- NOT NULL con default true a propósito: el estado por defecto es VER las
-- opcionales, y con NOT NULL ningún perfil existente queda en un `null` que
-- cada lectura tendría que interpretar.
alter table public.profiles
  add column show_optional_readings boolean not null default true;
```

- [ ] **Paso 2: Aplicar en dev**

Herramienta: `mcp__supabase-dev__apply_migration`, nombre `saga_optional_skips`, con el SQL de arriba.

- [ ] **Paso 3: Verificar contra los objetos reales, NO contra `list_migrations`**

`mcp__supabase-dev__execute_sql`:

```sql
select
  to_regclass('public.saga_optional_skips') is not null as tabla,
  (select count(*) from pg_policies
    where schemaname='public' and tablename='saga_optional_skips') as politicas,
  (select relrowsecurity from pg_class where oid='public.saga_optional_skips'::regclass) as rls,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='show_optional_readings') as columna_perfil;
```

Esperado: `tabla=t`, `politicas=1`, `rls=t`, `columna_perfil=1`.

- [ ] **Paso 4: Actualizar `database.types.ts` a mano**

**No** vuelques la salida de `generate_typescript_types` sobre el fichero: el generador MCP devuelve
~78 KB **en una sola línea** y destruiría un fichero de 2490 líneas formateadas (lección de la fase 3).
Edita a mano estos sitios, respetando el **orden alfabético** de las tablas (`saga_optional_skips` va
entre `saga_items` y `saga_placement_windows`):

```ts
      saga_optional_skips: {
        Row: {
          created_at: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          saga_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          saga_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          item_id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          saga_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saga_optional_skips_saga_id_fkey"
            columns: ["saga_id"]
            isOneToOne: false
            referencedRelation: "sagas"
            referencedColumns: ["id"]
          },
        ]
      }
```

Y en `profiles`, en Row / Insert / Update (orden alfabético: detrás de `role`, antes de `updated_at` —
**comprueba el orden real del fichero antes de insertar**):

```ts
          show_optional_readings: boolean      // Row
          show_optional_readings?: boolean     // Insert
          show_optional_readings?: boolean     // Update
```

- [ ] **Paso 5: Verificar que lo escrito a mano coincide con el generador**

```bash
eval "$(fnm env --shell bash)"; fnm use 22
npx tsc --noEmit
```

Y compara contra la salida real del generador (`mcp__supabase-dev__generate_typescript_types`)
guardándola en `$CLAUDE_JOB_DIR/tmp/gen.txt` y buscando los bloques con una regex sobre el texto plano
— no reformatees el fichero del repo para compararlos. Esperado: los campos y su orden coinciden.

- [ ] **Paso 6: Commit**

```bash
git add supabase/migrations/20260805_saga_optional_skips.sql src/lib/supabase/database.types.ts
git commit -m "feat(sagas): tabla de saltos de opcionales y preferencia de perfil"
```

---

## Task 2: `getSagaDetail` carga los saltos y la preferencia

**Files:**
- Modify: `src/lib/sagas/types.ts` (tipo `DetailMember`)
- Modify: `src/lib/sagas/get-saga-detail.ts`
- Test: `src/lib/sagas/get-saga-detail.test.ts`

**Interfaces:**
- Consumes: la tabla y la columna de la Task 1.
- Produces: `DetailMember.skipped: boolean`; `SagaDetail.showOptionalReadings: boolean`.

- [ ] **Paso 1: Escribir el test que falla**

En `src/lib/sagas/get-saga-detail.test.ts`, dentro del describe que ya prueba la carga (mira cómo
están montados los mocks de Supabase en ese fichero y **reutiliza el mismo helper**, no montes uno
nuevo):

```ts
it("marca skipped al miembro cuyo salto existe para su saga DUEÑA", async () => {
  // El salto está guardado con la saga dueña de la fila (ownerSagaId), no con
  // la saga que se está mirando: por eso se ve igual desde la ficha del padre.
  const detail = await getSagaDetail(clientConSkips([{ saga_id: HIJA_ID, item_type: "book", item_id: LIBRO_ID }]), PADRE_ID);
  const miembro = detail!.groups.flatMap((g) => g.members).find((m) => m.itemId === LIBRO_ID)!;
  expect(miembro.skipped).toBe(true);
  expect(miembro.ownerSagaId).toBe(HIJA_ID);
});

it("un salto de OTRO usuario o de otra saga no marca nada", async () => {
  const detail = await getSagaDetail(clientConSkips([]), PADRE_ID);
  expect(detail!.groups.flatMap((g) => g.members).every((m) => m.skipped === false)).toBe(true);
});

it("showOptionalReadings sale del perfil, y es true sin sesión", async () => {
  expect((await getSagaDetail(clientSinUsuario(), PADRE_ID))!.showOptionalReadings).toBe(true);
  expect((await getSagaDetail(clientConPerfil({ show_optional_readings: false }), PADRE_ID))!.showOptionalReadings).toBe(false);
});
```

- [ ] **Paso 2: Verlo fallar**

```bash
eval "$(fnm env --shell bash)"; fnm use 22
npx vitest run src/lib/sagas/get-saga-detail.test.ts
```

Esperado: FAIL — `skipped` y `showOptionalReadings` no existen (error de tipos y de aserción).

- [ ] **Paso 3: Añadir `skipped` a `DetailMember`**

En `src/lib/sagas/types.ts`, dentro de `DetailMember`, tras `year`:

```ts
  /** El lector ha decidido saltarse esta obra (`saga_optional_skips`, fase 4).
   *  SOLO VISUAL: no toca el denominador del progreso — ver el límite duro de
   *  la spec. `false` sin sesión, y `false` para una obra que no es opcional
   *  (nada impide guardar el salto de una obra que dejó de serlo; se ignora al
   *  leer, que es donde el criterio manda). */
  skipped: boolean;
```

- [ ] **Paso 4: Cargar los saltos en el batch que ya existe**

En `get-saga-detail.ts`, dentro del `Promise.all` que trae `followRow, parentRow, roleRow, curated,
routeChoice, windowsRes, tandemsRes` (~línea 509): **añade el select de la preferencia al `roleRow` que
ya se pide** — cero viajes nuevos —

```ts
    user
      ? supabase.from("profiles").select("role, show_optional_readings").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
```

y añade al final del array, con su destructuring correspondiente (`..., tandemsRes, skipsRes]`):

```ts
    // Saltos de opcionales del lector (fase 4). Todo el subárbol, exactamente
    // como las ventanas y los tándems: el salto se guarda con la saga DUEÑA de
    // la fila (`ownerSagaId`), que puede ser cualquier descendiente, no la raíz
    // que se está mirando.
    user
      ? supabase
          .from("saga_optional_skips")
          .select("saga_id, item_type, item_id")
          .eq("user_id", user.id)
          .in("saga_id", sagaIds)
      : Promise.resolve({ data: null }),
```

- [ ] **Paso 5: Marcar los miembros y devolver la preferencia**

Justo antes del `const members: DetailMember[] = [];` (~línea 415):

```ts
  // Clave `<sagaId>:<itemType>:<itemId>`: la PK de saga_optional_skips menos el
  // user_id, que ya está filtrado en la consulta.
  const skipped = new Set(
    ((skipsRes as { data: Array<{ saga_id: string; item_type: string; item_id: string }> | null }).data ?? []).map(
      (s) => `${s.saga_id}:${s.item_type}:${s.item_id}`,
    ),
  );
```

y dentro del `members.push({...})`, tras `ownerSagaId: row.saga_id,`:

```ts
      skipped: skipped.has(`${row.saga_id}:${row.item_type}:${row.item_id}`),
```

En el `return` final, junto a `isAuthenticated`:

```ts
    // Sin sesión: `true`, el default de la columna. Nunca `false` por omisión —
    // esconderle las opcionales a quien no ha elegido nada sería decidir por él.
    showOptionalReadings:
      (roleRow as { data: { show_optional_readings: boolean } | null }).data?.show_optional_readings ?? true,
```

Y en el tipo `SagaDetail` (~línea 47), junto a `routeChoice`:

```ts
  /** Preferencia GLOBAL del lector (`profiles.show_optional_readings`, fase 4):
   *  si ve las obras opcionales en el orden de lectura. `true` sin sesión. Es
   *  global a propósito, como `daily_goal_minutes`: no se cura por saga. */
  showOptionalReadings: boolean;
```

- [ ] **Paso 6: Verlo pasar**

```bash
npx vitest run src/lib/sagas/get-saga-detail.test.ts
```

Esperado: PASS. Otros tests del fichero pueden romper por literales de `DetailMember` sin `skipped` —
**añádeles `skipped: false` uno a uno**; que el compilador los señale de uno en uno es justamente lo
que garantiza que no queda ninguno a medias.

```bash
npx tsc --noEmit && npx vitest run
```

- [ ] **Paso 7: Commit**

```bash
git add src/lib/sagas/types.ts src/lib/sagas/get-saga-detail.ts src/lib/sagas/get-saga-detail.test.ts
git commit -m "feat(sagas): cargar saltos de opcionales y la preferencia del lector"
```

---

## Task 3: El nodo del grafo lleva `optional` y `skipped`

**Files:**
- Modify: `src/lib/sagas/map-types.ts`
- Modify: `src/lib/sagas/derive-map.ts`
- Test: `src/lib/sagas/derive-map.test.ts`

**Interfaces:**
- Consumes: `DetailMember.optional` (ya existía) y `.skipped` (Task 2).
- Produces: `SagaGraphNode.optional: boolean`, `SagaGraphNode.skipped: boolean`.

- [ ] **Paso 1: Escribir el test que falla**

En `src/lib/sagas/derive-map.test.ts`:

```ts
it("el nodo lleva optional y skipped del miembro, sin deducirlos de `level`", () => {
  const graph = deriveSagaMap(
    [grupo([miembro({ itemId: "a", optional: true, skipped: true, position: 1 })])],
    [],
    lookup,
  );
  const n = graph.nodes.find((x) => x.id === "i:book:a")!;
  expect(n.optional).toBe(true);
  expect(n.skipped).toBe(true);
  // `level` sigue siendo lo que era: un token de TAMAÑO del grafo 2D. Que hoy
  // se derive de lo mismo no lo convierte en la fuente de "es opcional".
  expect(n.level).toBe("menor");
});

it("una obra no opcional llega con los dos en false", () => {
  const graph = deriveSagaMap([grupo([miembro({ itemId: "b", position: 1 })])], [], lookup);
  const n = graph.nodes.find((x) => x.id === "i:book:b")!;
  expect(n.optional).toBe(false);
  expect(n.skipped).toBe(false);
});
```

- [ ] **Paso 2: Verlo fallar**

```bash
npx vitest run src/lib/sagas/derive-map.test.ts
```

Esperado: FAIL — `optional`/`skipped` no existen en `SagaGraphNode`.

- [ ] **Paso 3: Añadir los campos al tipo**

En `src/lib/sagas/map-types.ts`, dentro de `SagaGraphNode`, tras `windowReason`:

```ts
  /** La obra NO cuenta en el denominador del progreso (`saga_items.optional`).
   *  Ortogonal a `placement`: una opcional puede tener hueco fijo — en
   *  producción hay dos así (Saga de los Huesos Verdes, huecos 1 y 2). Se
   *  guarda aparte de `level` a propósito: `level` es el TAMAÑO con el que el
   *  grafo 2D pinta el nodo, y leer «es opcional» de un token de layout sería
   *  la segunda fuente de verdad de siempre. */
  optional: boolean;
  /** El lector se la ha saltado (`saga_optional_skips`, fase 4). Solo visual:
   *  tacha y atenúa la fila, y el denominador no se mueve. */
  skipped: boolean;
```

- [ ] **Paso 4: Rellenarlos en `makeNode`**

En `src/lib/sagas/derive-map.ts`, dentro de `makeNode` (~línea 128), tras `windowReason: null,`:

```ts
    optional: m.optional,
    skipped: m.skipped,
```

- [ ] **Paso 5: Verlo pasar y arreglar los literales que el compilador señale**

```bash
npx tsc --noEmit && npx vitest run
```

Esperado: PASS. Los literales de `SagaGraphNode` en los tests de `derive-timeline`, `window-track` y
`linearize-graph` necesitarán `optional: false, skipped: false`. Añádelos; no relajes el tipo.

- [ ] **Paso 6: Commit**

```bash
git add src/lib/sagas/map-types.ts src/lib/sagas/derive-map.ts src/lib/sagas/derive-map.test.ts
git commit -m "feat(sagas): el nodo del grafo dice si la obra es opcional y si está saltada"
```

---

## Task 4: El motor decide qué se ve

**Files:**
- Modify: `src/lib/sagas/derive-timeline.ts`
- Test: `src/lib/sagas/derive-timeline.test.ts`

**Interfaces:**
- Consumes: `SagaGraphNode.optional` (Task 3).
- Produces: `deriveTimeline(graph, { spine?, authenticated?, showOptional? })` — `showOptional` por
  defecto **`true`**.

- [ ] **Paso 1: Escribir los tests que fallan**

En `src/lib/sagas/derive-timeline.test.ts`, un describe nuevo:

```ts
describe("deriveTimeline · opcionales escondidas", () => {
  it("por defecto se ven: showOptional omitido equivale a true", () => {
    const secciones = deriveTimeline(grafoConOpcionalEnHueco2());
    expect(clavesDeFila(secciones)).toEqual(["i:book:uno", "i:book:dos-opcional", "i:book:tres"]);
  });

  it("con showOptional=false desaparece la fila, y los números NO se recalculan", () => {
    const secciones = deriveTimeline(grafoConOpcionalEnHueco2(), { showOptional: false });
    expect(clavesDeFila(secciones)).toEqual(["i:book:uno", "i:book:tres"]);
    // El 3 sigue siendo el 3: misma regla que los pasos de un itinerario.
    expect(secciones.flatMap((s) => s.rows).map((r) => (r.kind === "entry" ? r.no : null))).toEqual([1, 3]);
  });

  it("una RAMA opcional también desaparece", () => {
    const secciones = deriveTimeline(grafoConRamaOpcional(), { showOptional: false });
    expect(secciones.flatMap((s) => s.rows).flatMap((r) => (r.kind === "entry" ? r.branches : []))).toEqual([]);
  });

  it("el tramo de la ventana NO se encoge al esconder opcionales", () => {
    // Decisión C: el track dice dónde cae la ventana sobre el orden de la SAGA,
    // no sobre lo que este lector ha elegido ver.
    const conTodo = deriveTimeline(grafoConVentanaYOpcional(), { authenticated: true });
    const sinOpcionales = deriveTimeline(grafoConVentanaYOpcional(), { authenticated: true, showOptional: false });
    const track = (ss: TimelineSection[]) => ss.flatMap((s) => s.rows).find((r) => r.kind === "window")!.track;
    expect(track(sinOpcionales)).toEqual(track(conTodo));
  });

  it("en modo route también esconde, y el número del paso se conserva", () => {
    const secciones = deriveTimeline(grafoRutaConOpcionalEnPaso2(), { spine: "route", showOptional: false });
    expect(secciones[0].rows.map((r) => (r.kind === "entry" ? r.no : null))).toEqual([1, 3]);
  });
});
```

- [ ] **Paso 2: Verlos fallar**

```bash
npx vitest run src/lib/sagas/derive-timeline.test.ts
```

Esperado: FAIL — `showOptional` no existe; las filas opcionales siguen apareciendo.

- [ ] **Paso 3: Implementar — una línea, en el sitio que lo gobierna todo**

En `src/lib/sagas/derive-timeline.ts`, en la firma:

```ts
export function deriveTimeline(
  graph: SagaGraph,
  // `authenticated` por defecto FALSE a propósito: quien no lo pase obtiene la
  // vista pública, que es la segura. Nunca al revés — un olvido no puede
  // acabar afirmando «estás dentro de la ventana» a quien no ha entrado.
  //
  // `showOptional` por defecto TRUE, y por el mismo criterio invertido: el
  // default seguro aquí es ENSEÑARLO todo. Un olvido que esconde obras es
  // silencioso —nadie echa de menos lo que no sabe que existe—, y un olvido
  // que las enseña se ve al instante.
  opts: { spine?: TimelineSpine; authenticated?: boolean; showOptional?: boolean } = {},
): TimelineSection[] {
  const spineMode = opts.spine ?? "curation";
  const authenticated = opts.authenticated ?? false;
  const showOptional = opts.showOptional ?? true;
  // Filtrar AQUÍ y no en los componentes: `items` alimenta la columna, las
  // ramas, los puentes y la colocación de las ventanas. Esconder en el render
  // dejaría secciones vacías con su cabecera, ramas colgando de una fila que ya
  // no se pinta, y ventanas ancladas a filas invisibles.
  //
  // Lo que NO se toca al esconder: los números. `no` sale de `orderNo + 1` (o
  // de `step`), que se calcularon antes y sobre el grafo entero — si el hueco 1
  // desaparece, el 3 sigue siendo el 3. Renumerar haría que el timeline contara
  // la saga distinto que el resto del producto (misma regla que la spec fijó
  // para los pasos de un itinerario).
  const items = graph.nodes.filter((n) => n.kind === "item" && (showOptional || !n.optional));
```

`windowTrack(graph, ...)` se queda **tal cual**: recibe `graph`, no `items` (decisión C).

- [ ] **Paso 4: Verlos pasar**

```bash
npx vitest run src/lib/sagas/derive-timeline.test.ts && npx tsc --noEmit
```

Esperado: PASS, y el resto de la suite de `derive-timeline` intacta (el default `true` conserva el
comportamiento de hoy).

- [ ] **Paso 5: Commit**

```bash
git add src/lib/sagas/derive-timeline.ts src/lib/sagas/derive-timeline.test.ts
git commit -m "feat(sagas): el timeline puede esconder las opcionales sin renumerar"
```

---

## Task 5: Las tres acciones

**Files:**
- Create: `src/lib/sagas/optional-actions.ts`

**Interfaces:**
- Produces:
  - `skipOptional(sagaId: string, ownerSagaId: string, itemType: ItemType, itemId: string): Promise<void>`
  - `unskipOptional(sagaId: string, ownerSagaId: string, itemType: ItemType, itemId: string): Promise<void>`
  - `setShowOptionalReadings(value: boolean, sagaId: string): Promise<void>`

  `sagaId` es la ficha que hay que revalidar; `ownerSagaId` es lo que se guarda. Son dos cosas
  distintas y por eso van dos argumentos: desde la ficha del universo coinciden solo si la obra es
  miembro directo.

- [ ] **Paso 1: Escribir el fichero**

```ts
"use server";

import { redirect } from "next/navigation";
import type { ItemType } from "@/lib/catalog/types";
import { revalidateSagaPage } from "@/lib/reactivity/revalidate";
import { createClient } from "@/lib/supabase/server";

// Saltar una opcional y el interruptor global (fase 4). Clonan `adoptRoute`
// (route-actions.ts): RLS solo-dueño y SIN gate de rol, porque son preferencia
// personal, no curación.
//
// LO QUE NO HACEN: tocar el progreso. Saltar es solo visual — el denominador lo
// gobierna `countedKeys` (progress.ts) desde `saga_items.optional`, y esta
// feature no lo mira siquiera. Es el límite duro de la spec: reabrir el
// denominador es la familia del #91 y el #185.
//
// `ownerSagaId` es lo que se GUARDA (la saga dueña de la fila de `saga_items`,
// `DetailMember.ownerSagaId`); `sagaId` es solo la ficha que hay que revalidar.
// Desde la ficha de un universo, la mayoría de obras pertenecen a una subsaga y
// los dos valores NO coinciden.
export async function skipOptional(
  sagaId: string,
  ownerSagaId: string,
  itemType: ItemType,
  itemId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // upsert, no insert: pulsar dos veces (doble submit, pestaña duplicada) no
  // puede dar un 23505 en la cara del lector.
  await supabase
    .from("saga_optional_skips")
    .upsert(
      { user_id: user.id, saga_id: ownerSagaId, item_type: itemType, item_id: itemId },
      { onConflict: "user_id,saga_id,item_type,item_id" },
    );
  revalidateSagaPage(sagaId);
}

export async function unskipOptional(
  sagaId: string,
  ownerSagaId: string,
  itemType: ItemType,
  itemId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("saga_optional_skips")
    .delete()
    .eq("user_id", user.id)
    .eq("saga_id", ownerSagaId)
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  revalidateSagaPage(sagaId);
}

// Preferencia GLOBAL (spec §6): vale para todas las sagas, como
// `daily_goal_minutes`. `sagaId` solo dice qué ficha revalidar — la que el
// lector está mirando cuando pulsa. Las demás se revalidan solas al visitarlas,
// porque leen el perfil en `getSagaDetail`.
export async function setShowOptionalReadings(value: boolean, sagaId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("profiles").update({ show_optional_readings: value }).eq("user_id", user.id);
  revalidateSagaPage(sagaId);
}
```

- [ ] **Paso 2: Comprobar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Paso 3: Commit**

```bash
git add src/lib/sagas/optional-actions.ts
git commit -m "feat(sagas): acciones de saltar, deshacer y ver u ocultar opcionales"
```

---

## Task 6: La fila opcional — píldora, tachado y «Deshacer»

**Files:**
- Create: `src/components/saga/timeline/skip-optional-button.tsx`
- Modify: `src/components/saga/timeline/timeline-entry-row.tsx`
- Modify: `src/components/saga/timeline/timeline-branch.tsx`
- Modify: `src/components/saga/timeline/timeline-labels.ts`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `skipOptional`/`unskipOptional` (Task 5), `node.optional`/`node.skipped` (Task 3).
- Produces: `<SkipOptionalButton sagaId node labels />`; `TimelineLabels` gana `skip`, `unskip`,
  `optionalTag`, `skippedTag`, `skipAria`, `unskipAria`. `TimelineEntryRow` y `TimelineBranchRow`
  ganan la prop `sagaId: string | null` (null = sin sesión o vista pública: no se pinta botón).

**Trampa que hay que evitar:** hoy la tarjeta ENTERA es un `<Link>`. Un `<form>` dentro de un `<a>` es
HTML inválido (contenido interactivo anidado) y el navegador reordena el DOM. El botón tiene que ser
**hermano** del enlace, no hijo.

- [ ] **Paso 1: Escribir el botón**

`src/components/saga/timeline/skip-optional-button.tsx`:

```tsx
import type { SagaGraphNode } from "@/lib/sagas/map-types";
import { skipOptional, unskipOptional } from "@/lib/sagas/optional-actions";
import type { TimelineLabels } from "./timeline-labels";

// Píldora «Saltar» / «Deshacer» del mockup (`.skip`). Server Component con un
// <form>, como AdoptRouteButton: sin JS de cliente.
//
// `sagaId === null` = vista pública o sin sesión: no se pinta nada. La ficha es
// pública y hay que verla entera sin sesión (riesgo 5 de la spec) — las
// opcionales se ven, pero no hay a quién guardarle el salto.
//
// La clave de la obra se parte del id del nodo (`i:<tipo>:<uuid>`), que es
// como `deriveSagaMap` la construye; `ownerSagaId` NO está en el nodo, así que
// viaja aparte desde la fila.
export function SkipOptionalButton({
  sagaId,
  ownerSagaId,
  itemType,
  itemId,
  skipped,
  labels,
}: {
  sagaId: string | null;
  ownerSagaId: string;
  itemType: SagaGraphNode["id"] extends string ? "book" | "movie" | "series" : never;
  itemId: string;
  skipped: boolean;
  labels: TimelineLabels;
}) {
  if (sagaId === null) return null;
  const action = skipped
    ? unskipOptional.bind(null, sagaId, ownerSagaId, itemType, itemId)
    : skipOptional.bind(null, sagaId, ownerSagaId, itemType, itemId);
  return (
    <form action={action} className="shrink-0">
      <button
        type="submit"
        data-testid={skipped ? "unskip-optional" : "skip-optional"}
        className="rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.05em] text-muted-foreground"
      >
        {skipped ? labels.unskip : labels.skip}
      </button>
    </form>
  );
}
```

> **Nota para quien implemente:** el tipo de `itemType` de arriba está escrito de forma retorcida a
> propósito para que **no** compile tal cual y te obligue a mirar de dónde sale de verdad. Sustitúyelo
> por `ItemType` importado de `@/lib/catalog/types`, que es el que usan las acciones.

- [ ] **Paso 2: Escribir el test que falla — la fila tachada**

Este comportamiento es de render, así que se prueba en el e2e (Task 8). Aquí, el test que sí es unitario:
que `deriveTimeline` conserve `skipped` en el nodo de la fila. En `derive-timeline.test.ts`:

```ts
it("la fila conserva `skipped` del nodo: saltar no la esconde, la tacha", () => {
  const secciones = deriveTimeline(grafoConOpcionalSaltada());
  const fila = secciones.flatMap((s) => s.rows).find((r) => r.kind === "entry" && r.node.skipped);
  expect(fila).toBeDefined();
});
```

- [ ] **Paso 3: Verlo fallar, luego pasar**

```bash
npx vitest run src/lib/sagas/derive-timeline.test.ts
```

Falla mientras el fixture no marque `skipped`; pasa sin tocar producción — es un test de **contrato**:
deja constancia de que esconder-al-saltar sería un cambio de comportamiento, no un detalle de CSS.

- [ ] **Paso 4: Añadir las etiquetas**

En `timeline-labels.ts`, al tipo y al builder:

```ts
  skip: string;
  unskip: string;
  optionalTag: string;
  skippedTag: string;
```

```ts
    skip: t("timelineSkip"),
    unskip: t("timelineUnskip"),
    optionalTag: t("timelineOptionalTag"),
    skippedTag: t("timelineSkippedTag"),
```

En `messages/es.json`, sección `saga`:

```json
    "timelineSkip": "Saltar",
    "timelineUnskip": "Deshacer",
    "timelineOptionalTag": "Opcional",
    "timelineSkippedTag": "Oculto del recorrido",
```

- [ ] **Paso 5: Montar en la fila de columna**

En `timeline-entry-row.tsx`: nueva prop `sagaId: string | null`; el `<Link>` deja de ser el
contenedor exclusivo — envuélvelo junto al botón en un `div` flex, con el `<Link>` en `flex-1`:

```tsx
        <div
          data-testid="timeline-entry"
          className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl border bg-surface px-3 py-2 ${
            row.node.status === "in_progress" ? "border-accent/50 shadow-md" : "border-border"
          } ${row.node.status === null ? "opacity-60" : ""} ${row.node.skipped ? "opacity-50" : ""}`}
        >
          <Link href={row.node.href} className="flex min-w-0 flex-1 items-center gap-3">
            {/* …portada y textos, tal cual estaban… */}
            <span className={`block truncate font-serif text-[14.5px] font-semibold leading-tight ${
              row.node.skipped ? "line-through decoration-muted-foreground" : ""
            }`}>
              {row.node.label}
            </span>
          </Link>
          {row.node.optional && (
            <SkipOptionalButton
              sagaId={sagaId}
              ownerSagaId={row.node.ownerSagaId}
              itemType={/* del id del nodo */}
              itemId={/* del id del nodo */}
              skipped={row.node.skipped}
              labels={labels}
            />
          )}
        </div>
```

**`ownerSagaId` no está en `SagaGraphNode`.** Dos salidas; elige la primera:

1. **Añadirlo al nodo** (`map-types.ts` + `makeNode`: `ownerSagaId: m.ownerSagaId`), como se hizo con
   `optional`/`skipped` en la Task 3. Es el mismo dato viajando por el mismo canal.
2. Pasarlo por props desde arriba — obliga a un mapa clave→saga en cada montaje. **No.**

Si eliges la 1, **hazlo dentro de esta tarea** y añade el test correspondiente en `derive-map.test.ts`.

El `itemType`/`itemId` salen del id del nodo (`i:book:<uuid>`). Escribe un helper diminuto y
**expórtalo desde `derive-map.ts`, junto a `itemKey`**, que es quien construye la clave — partirla en
otro fichero sería la segunda mitad de un par que puede desincronizarse:

```ts
/** Inversa de `itemKey`. Devuelve null para un id que no sea de obra. */
export function parseItemKey(id: string): { itemType: ItemType; itemId: string } | null {
  const m = /^i:(book|movie|series):(.+)$/.exec(id);
  return m ? { itemType: m[1] as ItemType, itemId: m[2] } : null;
}
```

- [ ] **Paso 6: Montar en la rama**

Lo mismo en `timeline-branch.tsx`: prop `sagaId`, `<Link>` dentro de un flex, botón hermano cuando
`branch.node.optional`, tachado y opacidad cuando `branch.node.skipped`, y la chapa `optionalTag` /
`skippedTag` en lugar del `RoleChip` cuando la obra es opcional y no hay rol curado.

- [ ] **Paso 7: Comprobar**

```bash
npx tsc --noEmit && npx vitest run && npm run lint
```

- [ ] **Paso 8: Commit**

```bash
git add src/components/saga/timeline src/lib/sagas/derive-map.ts src/lib/sagas/map-types.ts messages/es.json src/lib/sagas/derive-timeline.test.ts src/lib/sagas/derive-map.test.ts
git commit -m "feat(sagas): saltar una opcional la tacha, y se deshace desde la misma píldora"
```

---

## Task 7: La barra del interruptor, y el contexto en las cuatro ubicaciones

**Files:**
- Create: `src/components/saga/timeline/optional-bar.tsx`
- Modify: `src/components/saga/reading-timeline.tsx`
- Modify: `src/components/saga/saga-map-tab.tsx` (2 montajes)
- Modify: `src/components/saga/route-view.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `setShowOptionalReadings` (Task 5), `detail.showOptionalReadings` (Task 2).
- Produces: `ReadingTimeline` gana `sagaId: string | null`, `showOptional: boolean`, `hasOptional: boolean`.

- [ ] **Paso 1: Escribir la barra**

`src/components/saga/timeline/optional-bar.tsx`:

```tsx
import { setShowOptionalReadings } from "@/lib/sagas/optional-actions";

// La `optbar` del mockup con su interruptor. Se pinta SIEMPRE que la saga tenga
// alguna obra opcional y haya sesión — también, y sobre todo, cuando están
// escondidas: es lo único que permite volver a verlas, incluidas las que el
// lector se saltó (saltar tacha, el interruptor esconde; con el interruptor
// apagado, un salto no se puede deshacer desde la fila porque la fila no está).
export function OptionalBar({
  sagaId,
  showOptional,
  labels,
}: {
  sagaId: string;
  showOptional: boolean;
  labels: { title: string; show: string; hide: string };
}) {
  return (
    <div
      data-testid="optional-bar"
      className="my-2 flex items-center gap-2.5 rounded-xl border border-gold/25 bg-gold/[0.08] px-3 py-2.5"
    >
      <span className="text-gold">↳</span>
      <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">{labels.title}</p>
      <form action={setShowOptionalReadings.bind(null, !showOptional, sagaId)}>
        <button
          type="submit"
          data-testid="toggle-optional"
          aria-pressed={showOptional}
          className="shrink-0 rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.05em] text-muted-foreground"
        >
          {showOptional ? labels.hide : labels.show}
        </button>
      </form>
    </div>
  );
}
```

`messages/es.json`, sección `saga`:

```json
    "timelineOptionalBarTitle": "Fuera de la columna principal. Nunca bloquean el siguiente título.",
    "timelineOptionalShow": "Ver opcionales",
    "timelineOptionalHide": "Ocultar opcionales",
```

- [ ] **Paso 2: Montarla en la cáscara**

En `reading-timeline.tsx`, firma nueva y barra encima de las secciones:

```tsx
export async function ReadingTimeline({
  sections,
  sagaId,
  showOptional,
  hasOptional,
}: {
  sections: TimelineSection[];
  /** null = sin sesión: se ve todo, no se pinta ningún control. */
  sagaId: string | null;
  showOptional: boolean;
  /** ¿La saga TIENE opcionales? Se calcula sobre el grafo, no sobre las filas
   *  visibles: si se calculara sobre lo visible, apagar el interruptor haría
   *  desaparecer el propio interruptor y no habría forma de volver. */
  hasOptional: boolean;
}) {
```

```tsx
    <div data-testid="reading-timeline">
      {sagaId !== null && hasOptional && (
        <OptionalBar sagaId={sagaId} showOptional={showOptional} labels={{ … }} />
      )}
```

- [ ] **Paso 3: Pasar el contexto en los cuatro montajes**

`saga-map-tab.tsx`, los **dos** montajes de la rama `lectura` (móvil ~línea 101 y PC ~línea 114):

```tsx
            <ReadingTimeline
              sections={deriveTimeline(graph, {
                authenticated: detail.isAuthenticated,
                showOptional: detail.showOptionalReadings,
              })}
              sagaId={detail.isAuthenticated ? detail.saga.id : null}
              showOptional={detail.showOptionalReadings}
              hasOptional={graph.nodes.some((n) => n.kind === "item" && n.optional)}
            />
```

`route-view.tsx`: lo mismo en su montaje (`spine: "route"`), con su `curatedGraph`.

- [ ] **Paso 4: Ver las cuatro ubicaciones a ojo**

```bash
npm run dev   # una sola instancia, puerto 3000
```

Mira, con sesión y sin ella:
- móvil `lectura`, móvil con itinerario, PC `lectura` (pie del grafo), PC con itinerario.
- **Y la saga medida**: en *Saga de los Huesos Verdes* apagar el interruptor esconde los huecos **1 y 2
  de 5**. Comprueba que el 3 sigue diciendo «3» y que la barra sigue ahí para volver.

- [ ] **Paso 5: Commit**

```bash
git add src/components/saga messages/es.json
git commit -m "feat(sagas): interruptor de opcionales en las cuatro ubicaciones del timeline"
```

---

## Task 8: E2E e inyección de fallo

**Files:**
- Create: `e2e/sagas-opcionales-saltables.spec.ts`

**Interfaces:** Consume todo lo anterior. Sin salidas nuevas.

Convenciones del fichero, copiadas de `e2e/sagas-timeline-estados.spec.ts` y
`e2e/sagas-ventana-motivo-track.spec.ts`: `fetch` nativo (NO el fixture `request`, que muere con el
contexto del test y deja filas huérfanas en un timeout), `res.ok` comprobado en cada escritura
(#180/#182), y **la semilla devuelta exactamente a como estaba** en el `afterAll`.

El seed QA **no tiene ninguna obra `optional`** (verificado contra BD dev el 2026-07-28): las 4 de
*Era Uno* y las 2 de *Era Dos* son `optional=false`. Así que el test marca una y la desmarca al acabar.

- [ ] **Paso 1: Escribir los cuatro tests**

```ts
test("1 · una obra opcional trae su píldora «Saltar»", async ({ page }) => { … });

test("2 · saltar tacha la fila y persiste tras recargar; deshacer la devuelve", async ({ page }) => {
  // Persistencia real: recarga entre el clic y la aserción.
});

test("3 · el interruptor esconde las opcionales, y la barra sigue estando para volver", async ({ page }) => {
  // La barra tiene que seguir en el DOM con las opcionales escondidas: es lo
  // único que permite deshacer un salto (ver el comentario de OptionalBar).
});

test("4 · saltar NO mueve el progreso", async ({ page }) => {
  // El límite duro de la spec, comprobado en la UI: se lee el «X de Y» del hero
  // ANTES de saltar y DESPUÉS, y tienen que ser idénticos. Es el test que
  // impide que un futuro «ya que estamos» reabra el denominador.
  const antes = await page.getByTestId("saga-progress").innerText();
  // …saltar…
  await page.reload();
  expect(await page.getByTestId("saga-progress").innerText()).toBe(antes);
});
```

> Localiza el `data-testid` real del progreso del hero antes de escribir el test 4 (`saga-hero.tsx`);
> si no existe, **añádelo** — es preferible a colgar el test de un texto traducible.

- [ ] **Paso 2: Correr solo este fichero**

```bash
npx playwright test e2e/sagas-opcionales-saltables.spec.ts
```

Esperado: 4 passed.

- [ ] **Paso 3: Inyección de fallo — tres roturas, de una en una**

Rompe, corre, **confirma que cae exactamente el test que debe**, y revierte. Si una rotura no tumba
ningún test, **el test no vale** y hay que rehacerlo.

| # | Rotura | Debe caer |
|---|---|---|
| 1 | En `derive-timeline.ts`, ignorar `showOptional` (`const showOptional = true`) | test 3 |
| 2 | En `optional-actions.ts`, que `skipOptional` no escriba (return antes del upsert) | test 2 |
| 3 | En `reading-timeline.tsx`, pintar la barra solo si `showOptional` | test 3 (la parte de «sigue estando») |

Anota el resultado de las tres en el cuerpo de la PR.

- [ ] **Paso 4: Suite completa**

```bash
npx playwright test    # ~15 min: lánzalo en segundo plano, el timeout del tool son 10
```

Los fallos preexistentes conocidos están en la **#228** (`busqueda-hidratacion.spec.ts:121`,
`happy-path.spec.ts:54`) y la **#219** (`sagas-v2-curacion.spec.ts:190`, intermitente por orden).
**Antes de culpar a esta rama, comprueba que fallan igual en `origin/main`** — es exactamente el error
que se cometió en la fase 3 hasta que se verificó con `git checkout --detach origin/main`.

- [ ] **Paso 5: Commit**

```bash
git add e2e/sagas-opcionales-saltables.spec.ts
git commit -m "test(sagas): e2e de saltar opcionales y del interruptor"
```

---

## Task 9: Migración a producción — ANTES del merge

**Files:** ninguno. Es una operación, y va documentada en el cuerpo de la PR.

**Por qué antes:** el bundle viejo que sigue sirviendo mientras Vercel despliega **no conoce** ni la
tabla ni la columna, así que no las consulta: la dirección segura. Al revés —merge primero— el bundle
nuevo pediría `saga_optional_skips` contra una base que no la tiene y la ficha de saga reventaría
para todo el mundo hasta que la migración llegara. En la fase 2 se pagó ese orden; en la fase 3 se
invirtió y el retraso de despliegue (12 minutos) fue inofensivo.

- [ ] **Paso 1: Aplicar en prod**

`mcp__supabase-prod__apply_migration`, nombre `saga_optional_skips`, el MISMO SQL de la Task 1.

- [ ] **Paso 2: Verificar contra los objetos reales**

`mcp__supabase-prod__execute_sql`, la misma consulta del Paso 3 de la Task 1. Esperado: `tabla=t`,
`politicas=1`, `rls=t`, `columna_perfil=1`.

- [ ] **Paso 3: Comprobar que el bundle VIEJO sigue guardando bien**

La ficha de saga del bundle actual no toca ninguno de los dos objetos nuevos, así que basta con
comprobar que sigue respondiendo:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://biblioshare-nine.vercel.app/saga/8782f667-0d83-431a-a1bf-dca0f3fad1c3"
```

Esperado: `200`.

- [ ] **Paso 4: Comprobar que ningún perfil quedó en null**

```sql
select count(*) as perfiles, count(*) filter (where show_optional_readings) as con_true
from public.profiles;
```

Esperado: `perfiles = con_true` (el `default true` con `NOT NULL` los rellena todos).

---

## Task 10: Sincronizar la documentación canónica

**Files:**
- Modify: `docs/requirements/data-model.md`
- Modify: `docs/requirements/backlog.md`
- Modify: `docs/requirements/decisiones.md` (**append-only**)
- Modify: `supabase/schema-baseline.sql`
- Modify: `docs/architecture/graph.json` y `docs/architecture/map.html`

Un cambio no está hecho hasta que el doc canónico correspondiente vuelve a ser cierto (`AGENTS.md`).

- [ ] **Paso 1: `data-model.md`**

Sección nueva para `saga_optional_skips` (columnas, PK, RLS, la ausencia deliberada de FK contra
`saga_items` y por qué), la columna `profiles.show_optional_readings`, y **la fecha de verificación de
la cabecera actualizada**.

- [ ] **Paso 2: `backlog.md`**

Marcar la casilla de la fase 4. La narrativa de **cómo** se hizo va en la spec, **nunca** aquí — eso
fue lo que pudrió el backlog antes.

- [ ] **Paso 3: `decisiones.md`, al final, sin reescribir nada anterior**

Tres entradas: la decisión **A** (`saga_id` = saga dueña), la **B** (filtrar en el motor, no en los
componentes) y la **C** (el interruptor no redefine el tramo de la ventana). Cada una con su porqué en
una línea.

- [ ] **Paso 4: `schema-baseline.sql`**

Anexo con fecha, con el DDL exacto de la Task 1.

- [ ] **Paso 5: Regenerar el mapa de arquitectura**

```bash
node docs/architecture/sync.mjs
```

`git diff --stat docs/architecture/` debe salir **corto** (una decena de líneas). Si sale un
reformateo de miles de líneas, has vuelto a escribir el JSON con otro formateador: `git checkout
docs/architecture/` y hazlo con reemplazos quirúrgicos sobre el formato compacto real.

- [ ] **Paso 6: Commit**

```bash
git add docs supabase/schema-baseline.sql
git commit -m "docs(sagas): sincronizar esquema, backlog y decisiones de la fase 4"
```

---

## Task 11: Cerrar — PR y lo que queda vivo

- [ ] **Paso 1: Suite verde**

```bash
eval "$(fnm env --shell bash)"; fnm use 22
npx tsc --noEmit && npm run lint && npx vitest run
```

- [ ] **Paso 2: Push y PR en borrador**

```bash
git push -u origin worktree-sagas-fase-4-impl
gh pr create --draft --title "Sagas fase 4: el lector decide qué opcionales le estorban" --body "…"
```

El cuerpo lleva: qué entra, la **tabla de inyección de fallo** con sus tres resultados, la nota de que
las migraciones ya están en prod (Task 9) y por qué ese orden, y el recordatorio de que el progreso no
se ha tocado.

- [ ] **Paso 3: Abrir las issues de lo que quede**

Como mínimo, comprueba si procede abrir:

- **El salto huérfano.** Retirar un miembro de una saga deja su fila en `saga_optional_skips` para
  siempre (sin FK, a propósito). Hoy es inerte y no se pinta, pero nadie lo limpia. Issue con la
  consulta que los cuenta.
- **Una opcional con hueco fijo escondida deja un salto en la numeración** (1, 3, 4…). Es la regla
  elegida y está probada, pero **no está dicho en la interfaz**: un lector que apaga el interruptor no
  sabe por qué falta el 2. Issue de UX con la propuesta (¿un «+1 oculta» en la barra?).
- Cualquier sospecha sin confirmar que aparezca por el camino. Vale abrirla diciendo que es una
  sospecha; lo que no vale es que se pierda.

- [ ] **Paso 4: Dejar el entorno limpio**

Sin `next dev` colgado, puerto 3000 libre, sin worktrees huérfanos en `.claude/worktrees/`.

---

## Autorrevisión del plan

**Cobertura de la spec (fila «4» de la tabla de fases: `saga_optional_skips`,
`profiles.show_optional_readings`, las tres acciones y el interruptor):**

| Requisito de la spec | Tarea |
|---|---|
| `saga_optional_skips (user_id, saga_id, item_type, item_id)`, clon de `saga_route_choices`, RLS solo-dueño, sin gate de rol | 1 |
| `profiles.show_optional_readings boolean not null default true` | 1 |
| `skipOptional`, `unskipOptional`, `setShowOptionalReadings` clonando `adoptRoute` | 5 |
| «Saltar» tacha y pliega, con «Deshacer» | 6 |
| El denominador NO se mueve | Constraint global + test 4 de la Task 8 |
| Interruptor global y persistente, mismo criterio que `saga_route_choices` | 5, 7 |
| E2E: saltar y deshacer persisten tras recargar | Task 8, test 2 |
| E2E: el interruptor vale en otra saga | **Cubierto parcialmente** — la preferencia es global por
  construcción (vive en `profiles`, no en una tabla por saga) y el test 3 comprueba el efecto en una
  saga. Si al ejecutar la Task 8 sale barato, añade la comprobación en una segunda saga; si no,
  **ábrelo como issue** en lugar de dejarlo caer. |
| Inyección de fallo: tres roturas | Task 8, paso 3 |
| Sin sesión se ve el timeline entero, sin controles | Decisión E; Task 6 (`sagaId === null`), Task 7 |

**Consistencia de tipos:** `DetailMember.skipped` (T2) → `SagaGraphNode.optional`/`.skipped`/`ownerSagaId`
(T3, T6 paso 5) → `deriveTimeline(..., { showOptional })` (T4) → props de `ReadingTimeline` (T7). Las
acciones usan `(sagaId, ownerSagaId, itemType, itemId)` en las tres apariciones (T5, T6).

**Riesgo conocido que el plan NO cierra:** el mockup pinta la opcional siempre como rama punteada; en
producción hay dos que tienen hueco fijo y viven en la columna. El plan las trata en los dos sitios
(Task 6 toca `timeline-entry-row` **y** `timeline-branch`), pero el aspecto de una opcional en la
columna no está dibujado en ningún frame — hay que decidirlo al implementar y **mirarlo en *Saga de los
Huesos Verdes*** (Task 7, paso 4).
