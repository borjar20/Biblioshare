# Sagas · timeline con los cuatro estados — Fase 5: los roles (enum ampliado, cinta en portada, chip y filtro)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el rol narrativo de una obra —precuela, relato, novela corta, spin-off, compañero, crossover— se vea en el orden de lectura (cinta en la portada y chip en la línea de texto) y se pueda usar como lente (filtro en la cabecera del mapa), ampliando el enum de BD y retirando `paralela`.

**Architecture:** el rol ya viaja en el nodo del grafo (`SagaGraphNode.role`, puesto por `deriveSagaMap`), así que **no hace falta consultar nada nuevo**. El trabajo se reparte en tres capas: (a) BD + espejo de tipos, donde el enum crece en tres valores y pierde uno; (b) presentación, donde el rol se dice en la portada y en el texto; (c) motor, donde el filtro entra como una opción más de `deriveTimeline`, junto a `showOptional` de la fase 4 y por el mismo motivo — `items` alimenta la columna, las ramas, los puentes y la colocación de las ventanas.

**Tech Stack:** Next.js 16 (App Router, RSC), Supabase/Postgres 17.6, Tailwind v4, next-intl, Vitest, Playwright.

---

## Lo medido, antes de decidir nada

**[MEDIDO contra producción y dev el 2026-07-28]**, con `SELECT` de solo lectura sobre objetos reales (`pg_enum`, `pg_proc`, `pg_attribute`), nunca contra `list_migrations`:

| | prod | dev |
|---|---|---|
| valores del enum `saga_item_role` | `precuela, spin_off, relato, paralela` | idénticos |
| filas de `saga_items` | 367 | — |
| filas **con rol** | **8**: 4 `relato`, 3 `precuela`, 1 `spin_off` | 0 |
| filas `paralela` | **0** | 0 |
| columnas del tipo | **una**: `saga_items.role` | idem |
| funciones que lo citan | **una**: `save_saga_sequence/7` | idem |
| lenguaje de esa función | `plpgsql`, `prosqlbody is null` → **cuerpo NO parseado**: el cast `(e->>'role')::public.saga_item_role` se resuelve **por nombre en ejecución** | idem |
| versión | PostgreSQL 17.6 | idem |

Cuatro consecuencias que gobiernan el plan:

1. **Retirar `paralela` es gratis en datos** (0 filas) pero **no es gratis en el bundle desplegado**: el editor viejo lo sigue ofreciendo en su `<select>`. Ver la decisión D1.
2. **Recrear el tipo no rompe el RPC**, porque su cuerpo no está parseado ni tiene dependencia registrada. Aun así hay que **llamarlo una vez en dev después de recrear** para descartar un plan cacheado: es la única forma de comprobarlo, y cuesta un minuto.
3. **De las 8 obras con rol, la mayoría tiene hueco fijo** — y hoy la fila `entry` del timeline **no dice el rol en ningún sitio**: `RoleChip` solo se monta en ramas, ventanas y puentes. El rol curado es, hoy, casi invisible. Eso es lo que la cinta arregla.
4. **El escenario es minúsculo** (8 de 367): un filtro por rol devuelve pocas filas. Eso hace que la barra de filtro tenga que decir **cuántas hay de cada uno** para que pulsar no sea a ciegas.

## Global Constraints

Valores exactos, copiados de la spec `docs/superpowers/specs/2026-07-28-sagas-timeline-estados-design.md` y de `AGENTS.md`. **Los requisitos de cada tarea incluyen implícitamente esta sección.**

- **`src/lib/sagas/progress.ts` sale de esta fase exactamente como entró.** Ni `companero` deja de computar, ni el filtro por rol mueve el denominador, ni existe «progreso por rol». El mockup dice de `compañero` «Sin progreso de lectura; se abre, no se termina» y **se descarta a sabiendas**: reabrir el denominador es la familia de fallo del #91 y el #185. Hay un e2e dedicado a que el porcentaje del hero no se mueva al filtrar.
- **`principal` NO se materializa como valor** (spec §4): es exactamente lo que hoy es `role = null`. El mockup lo dibuja como chip de filtro; no se implementa.
- **El rol del mockup llamado `nexo` se llama `crossover`** (spec §4): «nexo» ya nombra en este producto el grupo beige de miembros directos del universo (`groupSagaId === null`), y dejaría dos «nexos» distintos en la misma pantalla.
- **Roles personalizados del moderador: fuera de alcance** (spec §Alcance).
- **Migraciones: dev primero, prod después**, y **siempre verificadas contra los objetos reales** (`pg_enum`, `pg_type`, `information_schema.columns`), **nunca contra `list_migrations`** («no aparece en `list_migrations`» ≠ «no está en prod»).
- **Nunca `git stash` a secas** (la pila se comparte entre worktrees). Commit WIP si hace falta apartar algo.
- **Un solo `next dev`, en el puerto 3000.** `npm run test:e2e` reutiliza el que haya.
- **Node 22**: la shell abre con v20 y eso rompe Vitest. Antes de cualquier `npm`: `eval "$(fnm env --shell bash)"; fnm use 22`.
- **Un commit por tarea**, sin `--no-verify` ni flags de firma añadidos a mano (el repo no tiene firma configurada; añadir `-c commit.gpgsign=true` falla con `No secret key`).
- **Todo lo que quede pendiente se abre como issue**, no como nota en el cuerpo de la PR.
- **No mergear, no hacer push a main, no forzar.** La PR se abre en borrador y la mergea el responsable.

## Decisiones de esta fase, con su porqué

**D1 · Dos migraciones, y la segunda entra en prod DESPUÉS del despliegue.** Ampliar el enum es la dirección inofensiva —el bundle viejo no conoce los valores nuevos, así que jamás los escribe— y va a dev y prod antes del merge, como en las fases 3 y 4. **Retirar `paralela` es la dirección peligrosa**: el bundle desplegado sigue ofreciendo «Paralela» en el `<select>` del editor de secuencia, y guardar con el valor ya retirado reventaría el cast del RPC (`22P02`) en la cara del curador. Por eso van en **dos ficheros de migración**: la A ahora, la B a prod cuando el bundle nuevo esté desplegado. Es el mismo baile que ya se pagó dos veces con la sobrecarga de `save_saga_sequence` (#217, #224), aplicado a un enum.

**D2 · Una sola lista de roles en TypeScript, atada por un test a los tipos generados.** Hoy el vocabulario está escrito **tres veces**: la unión de `types.ts:31` y dos arrays `ROLES` idénticos (`sequence-row.tsx:10`, `row-sheet.tsx:8`), y nada obliga a que coincidan. Ampliar el enum en tres valores con tres copias a mano es exactamente cómo se pierde una. Pasa a `src/lib/sagas/roles.ts`, con un test que compara la lista contra `Constants.public.Enums.saga_item_role` de `database.types.ts` — el espejo generado de la BD. Es la única forma barata de que un enum cambiado en BD y no en TS (o al revés) tumbe un test en vez de aparecer en producción.

**D3 · El filtro vive en la URL (`?rol=`), no en `profiles`.** Al revés que `show_optional_readings` de la fase 4, que sí es preferencia persistente: filtrar por rol es una **lente momentánea** —«enséñame solo las precuelas»—, no una decisión sobre cómo quiere leer siempre. En la URL: se comparte, vuelve atrás con el botón del navegador, no necesita columna ni migración, y se implementa con `<Link>` sin una línea de JS de cliente, igual que `?ruta=`.

**D4 · El filtro filtra EN EL MOTOR, no en los componentes** — la lección literal de la fase 4. `items` alimenta la columna, las ramas, los puentes **y la colocación de las ventanas**: esconder en el render dejaría secciones vacías con su cabecera, ramas colgando de una fila que ya no se pinta y ventanas ancladas a filas invisibles.

**D5 · El filtro no redefine nada derivado.** Dos cosas que NO hace, las dos con test: **no renumera** (si la fila 3 desaparece, la 7 sigue siendo la 7 — la misma regla que ya rige los pasos de un itinerario y las opcionales escondidas) y **no mueve el tramo de la ventana** (`windowTrack` sigue recibiendo el grafo entero: el tramo describe el orden de la SAGA, no la lente que este lector eligió). Dos lectores con filtros distintos no pueden ver tramos distintos para la misma ventana.

**D6 · Las cuentas de la barra se calculan sobre el GRAFO, no sobre las filas visibles.** Calculadas sobre lo visible, filtrar por «Precuela» dejaría la barra con un solo chip y no habría forma de volver. Es el mismo error que la fase 4 evitó con `optionalCount`, y lleva su propio test de inyección de fallo.

**D7 · El rol no estrena paleta: se distingue por glifo y palabra.** El mockup pinta seis colores (`#7a5676` para precuela, gold para relato, etc.), pero **en este producto el color ya significa subsaga**: `SAGA_ACCENT` tiñe el raíl, el punto y la leyenda, y un chip de rol con hue propio se leería como «esta obra es de otro grupo». Se mantiene el par que `RoleChip` ya usa (gold sobre gold/10, calcado del badge de rama) y se añade el **glifo** del propio mockup (`◂ ✦ ▪ ↳ ▤ ◈`), que distingue sin competir. Si algún día se quiere color por rol, hay que decidir antes qué hacer con el acento de subsaga; se deja dicho, no hecho.

**D8 · La cinta lleva etiqueta CORTA, y por eso existe `roleShort`.** La portada de una fila `entry` mide 44 px; «Novela corta» a 7.5 px no cabe. La cinta usa una forma corta por rol (`Novela`, `Compañero`, `Crossover`…), el chip la larga. Dos claves de i18n, no una función de recorte: recortar por código produce «Novela cor…».

**D9 · La rama deja de tragarse el rol.** Hoy `timeline-branch.tsx:53-66` pinta el chip de rol **solo si** la obra no es requisito y no es opcional — o sea, justo al revés del caso más común (un spin-off casi siempre es opcional, lo dice el propio mockup). Un spin-off opcional no dice hoy en ninguna parte que sea un spin-off. Se pintan las dos cosas.

---

## Estructura de ficheros

**Nuevos**

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20260806_saga_item_role_ampliado.sql` | Migración A: los tres valores nuevos |
| `supabase/migrations/20260807_saga_item_role_sin_paralela.sql` | Migración B: recrear el tipo sin `paralela` |
| `src/lib/sagas/roles.ts` | La lista ÚNICA de roles y el tipo derivado de ella |
| `src/lib/sagas/roles.test.ts` | Que la lista sea el enum de la BD, y que cada rol tenga sus dos etiquetas |
| `src/lib/sagas/role-style.ts` | Glifo por rol, exhaustivo por tipo |
| `src/lib/sagas/role-style.test.ts` | Que ningún rol se quede sin glifo |
| `src/lib/sagas/count-roles.ts` | Cuántas obras hay de cada rol **en el grafo** |
| `src/lib/sagas/count-roles.test.ts` | Incluida la regla de D6 |
| `src/components/saga/timeline/role-ribbon.tsx` | La cinta sobre la portada |
| `src/components/saga/timeline/role-filter-bar.tsx` | La barra de filtro de la cabecera |
| `e2e/sagas-roles.spec.ts` | Los cuatro e2e de la fase |

**Modificados**

| Fichero | Qué cambia |
|---|---|
| `src/lib/sagas/types.ts:31` | La unión deja de declararse aquí; se reexporta de `roles.ts` |
| `src/lib/supabase/database.types.ts:2340,2515` | Espejo del enum, a mano y en dos sitios |
| `src/lib/sagas/derive-timeline.ts:88-114` | La opción `roleFilter` |
| `src/components/saga/role-chip.tsx` | Glifo |
| `src/components/saga/timeline/timeline-entry-row.tsx` | Cinta en la portada |
| `src/components/saga/timeline/timeline-branch.tsx` | Cinta + el arreglo de D9 |
| `src/components/saga/timeline/timeline-tandem-row.tsx` | Cinta en cada portada del hueco |
| `src/components/saga/timeline/timeline-window-row.tsx` | Cinta |
| `src/components/saga/timeline/timeline-labels.ts` | Etiquetas nuevas |
| `src/components/saga/reading-timeline.tsx` | Monta la barra de filtro |
| `src/components/saga/saga-map-tab.tsx` | Dos montajes: pasa `roleFilter`, cuentas y hrefs |
| `src/components/saga/route-view.tsx` | El tercer montaje |
| `src/app/saga/[id]/page.tsx:33,36` | El parámetro `rol` |
| `src/components/saga/sequence/sequence-row.tsx:10`, `row-sheet.tsx:8` | Usan la lista única |
| `messages/es.json` | `roleLabel`, `roleShort`, `sagaEditor.role`, etiquetas de la barra |
| `docs/requirements/data-model.md`, `backlog.md`, `decisiones.md`, `supabase/schema-baseline.sql`, `docs/architecture/graph.json` | Sincronización documental |

---

### Task 1: El vocabulario nuevo, de la BD a la interfaz

Deliverable: el enum tiene sus tres valores nuevos en dev y prod, TypeScript los conoce desde **una sola** lista, y el editor de secuencia ya los ofrece traducidos. `paralela` sigue existiendo — se retira en la Task 2.

**Files:**
- Create: `supabase/migrations/20260806_saga_item_role_ampliado.sql`
- Create: `src/lib/sagas/roles.ts`
- Create: `src/lib/sagas/roles.test.ts`
- Modify: `src/lib/sagas/types.ts:31`
- Modify: `src/lib/supabase/database.types.ts:2340` y `:2515`
- Modify: `src/components/saga/sequence/sequence-row.tsx:10`, `src/components/saga/sequence/row-sheet.tsx:8`
- Modify: `messages/es.json` (`saga.roleLabel`, `saga.roleShort`, `sagaEditor.role`)

**Interfaces:**
- Produces: `SAGA_ITEM_ROLES: readonly SagaItemRole[]` y `type SagaItemRole` (`src/lib/sagas/roles.ts`), reexportados por `src/lib/sagas/types.ts` para no romper a los ~10 módulos que hoy importan `SagaItemRole` de `./types`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/sagas/roles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import es from "../../../messages/es.json";
import { Constants } from "../supabase/database.types";
import { SAGA_ITEM_ROLES } from "./roles";

// Este fichero existe porque el vocabulario de roles estaba escrito TRES veces
// (la unión de types.ts y dos arrays ROLES idénticos en el editor) sin nada que
// obligase a que coincidieran. Ahora hay una sola lista, y estos dos tests son
// lo que la ata a la BD y a las traducciones.
describe("SAGA_ITEM_ROLES", () => {
  it("es exactamente el enum saga_item_role de la BD", () => {
    // Constants sale de database.types.ts, que es el espejo GENERADO de la BD:
    // si alguien amplía el enum en Postgres y no aquí (o al revés), cae esto y
    // no un cast en producción.
    expect([...SAGA_ITEM_ROLES].sort()).toEqual([...Constants.public.Enums.saga_item_role].sort());
  });

  it("cada rol tiene etiqueta larga y corta en es.json", () => {
    // RoleChip no tiene caso por defecto A PROPÓSITO (role-chip.tsx): un rol sin
    // traducción debe verse raro en dev, no esconderse tras un genérico. Este
    // test es el que hace que «verse raro» sea «test rojo».
    for (const role of SAGA_ITEM_ROLES) {
      expect(es.saga.roleLabel, `roleLabel.${role}`).toHaveProperty(role);
      expect(es.saga.roleShort, `roleShort.${role}`).toHaveProperty(role);
      expect(es.sagaEditor.role, `sagaEditor.role.${role}`).toHaveProperty(role);
    }
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

```bash
eval "$(fnm env --shell bash)"; fnm use 22
npm run test -- src/lib/sagas/roles.test.ts
```

Esperado: FAIL — `Failed to resolve import "./roles"`.

- [ ] **Step 3: Aplicar la migración A a dev**

Crear `supabase/migrations/20260806_saga_item_role_ampliado.sql`:

```sql
-- Fase 5 del timeline con los cuatro estados (spec 2026-07-28, §4): el
-- vocabulario de roles se amplía con los tres que faltaban.
--
-- Esta migración SOLO añade. Retirar `paralela` va aparte
-- (20260807_saga_item_role_sin_paralela.sql) porque es la dirección peligrosa:
-- el bundle desplegado sigue ofreciendo «Paralela» en el editor, y guardarlo
-- con el valor ya retirado reventaría el cast de save_saga_sequence (22P02).
-- Mismo baile que la sobrecarga del RPC en las fases 2b y 4 (#217, #224).
--
-- `nexo` del mockup se llama aquí `crossover`: «nexo» ya nombra en este
-- producto el grupo de miembros directos del universo (groupSagaId is null), y
-- dejaría dos nexos distintos en la misma pantalla.
-- `principal` NO se añade: es exactamente lo que hoy es role = null, y darle un
-- valor propio serían dos formas de decir lo mismo.
alter type public.saga_item_role add value if not exists 'novela_corta';
alter type public.saga_item_role add value if not exists 'companero';
alter type public.saga_item_role add value if not exists 'crossover';
```

Aplicarla con `mcp__supabase-dev__apply_migration` (name: `saga_item_role_ampliado`).

- [ ] **Step 4: Verificar dev contra el objeto real**

Con `mcp__supabase-dev__execute_sql`:

```sql
select array_agg(e.enumlabel order by e.enumsortorder) as valores
  from pg_enum e join pg_type t on t.oid = e.enumtypid
 where t.typname = 'saga_item_role';
```

Esperado: los 7 valores, con `novela_corta, companero, crossover` al final.

- [ ] **Step 5: Aplicar y verificar la misma migración en prod**

`mcp__supabase-prod__apply_migration` con el mismo cuerpo y nombre, y **el mismo `select` de verificación** contra `pg_enum`. Ampliar es inofensivo para el bundle desplegado (D1): nadie escribe un valor que su código no conoce.

- [ ] **Step 6: Crear la lista única**

Crear `src/lib/sagas/roles.ts`:

```ts
/** Vocabulario de roles narrativos (issue #167, ampliado en la fase 5 del
 *  timeline con los cuatro estados).
 *
 *  UNA lista, no tres: hasta esta fase el mismo vocabulario estaba escrito en
 *  la unión de `types.ts` y en dos arrays `ROLES` idénticos del editor de
 *  secuencia, sin nada que obligara a mantenerlos iguales. `roles.test.ts` la
 *  ata al enum de la BD (vía los tipos generados) y a las traducciones.
 *
 *  El orden es el de LECTURA —lo que el editor ofrece de arriba abajo—, no el
 *  alfabético ni el histórico del enum. Nada depende de él para ordenar datos.
 *
 *  Dos ausencias deliberadas (spec §4):
 *   · `principal` no existe: es `role = null`, y darle valor propio serían dos
 *     formas de decir lo mismo.
 *   · el `nexo` del mockup se llama aquí `crossover`, porque «nexo» ya nombra
 *     el grupo de miembros directos del universo. */
export const SAGA_ITEM_ROLES = [
  "precuela",
  "novela_corta",
  "relato",
  "spin_off",
  "companero",
  "crossover",
  "paralela",
] as const;

export type SagaItemRole = (typeof SAGA_ITEM_ROLES)[number];
```

> `paralela` sigue en la lista **a propósito** en esta tarea: mientras el enum de BD lo tenga, el test de la Step 1 exige que TS también. Sale en la Task 2, de los dos sitios a la vez.

- [ ] **Step 7: Que `types.ts` reexporte en vez de declarar**

En `src/lib/sagas/types.ts`, sustituir la línea 31:

```ts
export type SagaItemRole = "precuela" | "spin_off" | "relato" | "paralela";
```

por:

```ts
// La unión vivía AQUÍ, escrita a mano, y el editor tenía además dos copias en
// forma de array. Ahora hay una sola lista (`./roles`) y un test que la ata al
// enum de la BD. Se reexporta para no tocar los ~10 módulos que importan
// `SagaItemRole` desde `./types`.
export { SAGA_ITEM_ROLES } from "./roles";
export type { SagaItemRole } from "./roles";
```

- [ ] **Step 8: Espejo a mano en los tipos generados**

En `src/lib/supabase/database.types.ts`, línea 2340:

```ts
      saga_item_role: "precuela" | "spin_off" | "relato" | "paralela"
```

pasa a:

```ts
      saga_item_role:
        | "precuela"
        | "spin_off"
        | "relato"
        | "paralela"
        | "novela_corta"
        | "companero"
        | "crossover"
```

y la línea 2515:

```ts
      saga_item_role: ["precuela", "spin_off", "relato", "paralela"],
```

pasa a:

```ts
      saga_item_role: ["precuela", "spin_off", "relato", "paralela", "novela_corta", "companero", "crossover"],
```

> **No regenerar el fichero entero.** El generador lo devuelve en una sola línea de 79 KB y destruiría el formato (ya pasó en la fase 4). Se edita a mano y se comprueba con `tsc`. El orden aquí es el del enum en BD (`enumsortorder`), no el de lectura de `roles.ts`; el test compara **ordenados**, justamente para que las dos ordenaciones puedan diferir sin mentir.

- [ ] **Step 9: Las etiquetas**

En `messages/es.json`, `saga.roleLabel` pasa a:

```json
    "roleLabel": {
      "precuela": "Precuela",
      "novela_corta": "Novela corta",
      "relato": "Relato",
      "spin_off": "Spin-off",
      "companero": "Compañero",
      "crossover": "Crossover",
      "paralela": "Paralela"
    },
```

Justo debajo, la forma corta de la cinta (D8 — «Novela corta» no cabe en una portada de 44 px):

```json
    "roleShort": {
      "precuela": "Precuela",
      "novela_corta": "Novela",
      "relato": "Relato",
      "spin_off": "Spin-off",
      "companero": "Compañero",
      "crossover": "Crossover",
      "paralela": "Paralela"
    },
```

Y `sagaEditor.role` pasa a:

```json
    "role": { "precuela": "Precuela", "novela_corta": "Novela corta", "relato": "Relato", "spin_off": "Spin-off", "companero": "Compañero", "crossover": "Crossover", "paralela": "Paralela" },
```

- [ ] **Step 10: El editor usa la lista única**

En `src/components/saga/sequence/sequence-row.tsx`, sustituir la línea 10:

```ts
const ROLES: SagaItemRole[] = ["precuela", "spin_off", "relato", "paralela"];
```

por:

```ts
// La lista viene de `roles.ts` — era una de las tres copias del mismo
// vocabulario que la fase 5 unificó.
const ROLES = SAGA_ITEM_ROLES;
```

y cambiar el import de la línea 8 a:

```ts
import { SAGA_ITEM_ROLES, type SagaItemRole } from "@/lib/sagas/types";
```

Repetir **exactamente lo mismo** en `src/components/saga/sequence/row-sheet.tsx` (línea 8 el array, línea 6 el import). Los dos ficheros tenían el array idéntico y hay que cambiar los dos.

- [ ] **Step 11: Correr los tests y el compilador**

```bash
npm run test -- src/lib/sagas/roles.test.ts
npx tsc --noEmit
```

Esperado: PASS los dos tests; `tsc` sin errores.

- [ ] **Step 12: Correr la suite unitaria entera**

```bash
npm run test
```

Esperado: todo verde (697 tests en la línea base de la fase 4, más los 2 nuevos).

- [ ] **Step 13: Commit**

```bash
git add supabase/migrations/20260806_saga_item_role_ampliado.sql src/lib/sagas/roles.ts src/lib/sagas/roles.test.ts src/lib/sagas/types.ts src/lib/supabase/database.types.ts src/components/saga/sequence/sequence-row.tsx src/components/saga/sequence/row-sheet.tsx messages/es.json
git commit -m "feat(sagas): amplía el vocabulario de roles y lo unifica en una sola lista"
```

---

### Task 2: Retirar `paralela`

Deliverable: el enum queda en seis valores en dev, TypeScript ya no conoce `paralela`, y prod queda **pendiente hasta después del despliegue**, con su issue abierta.

**Files:**
- Create: `supabase/migrations/20260807_saga_item_role_sin_paralela.sql`
- Modify: `src/lib/sagas/roles.ts`, `src/lib/supabase/database.types.ts`, `messages/es.json`

- [ ] **Step 1: Escribir la migración B**

Crear `supabase/migrations/20260807_saga_item_role_sin_paralela.sql`:

```sql
-- Fase 5, segunda mitad: `paralela` sale del vocabulario (spec §4, tabla de
-- Esquema). En prod hay 0 filas con ese valor [MEDIDO 2026-07-28], así que la
-- retirada no pierde ningún dato curado.
--
-- ORDEN DE DESPLIEGUE (importante, y distinto al de las fases 3 y 4): esta
-- migración va a producción DESPUÉS de que el bundle nuevo esté desplegado, no
-- antes. Retirar un valor es la dirección peligrosa: el bundle viejo sigue
-- ofreciendo «Paralela» en el <select> del editor de secuencia, y guardar con
-- él reventaría el cast de save_saga_sequence con un 22P02 en la cara del
-- curador. Es el mismo baile que la sobrecarga del RPC en las fases 2b y 4.
--
-- Recrear el tipo NO rompe save_saga_sequence: es plpgsql y su cuerpo no está
-- parseado (`prosqlbody is null`), así que el cast
-- `(e->>'role')::public.saga_item_role` se resuelve POR NOMBRE en ejecución
-- [MEDIDO]. Aun así, después de aplicar hay que llamar al RPC una vez en dev:
-- es lo único que descarta un plan cacheado en una conexión del pool.

-- Guarda explícita: sin ella, el `using` de más abajo fallaría igual, pero con
-- un error de cast que no dice de qué va el problema.
do $$
begin
  if exists (select 1 from public.saga_items where role::text = 'paralela') then
    raise exception 'Hay filas con role = paralela: decide qué son antes de retirar el valor';
  end if;
end $$;

alter type public.saga_item_role rename to saga_item_role_viejo;

-- El orden es el de lectura, el mismo que `src/lib/sagas/roles.ts`. Nada
-- ordena datos por este enum, así que es solo legibilidad.
create type public.saga_item_role as enum (
  'precuela',
  'novela_corta',
  'relato',
  'spin_off',
  'companero',
  'crossover'
);

-- Única columna del tipo en todo el esquema [MEDIDO: pg_attribute].
alter table public.saga_items
  alter column role type public.saga_item_role
  using role::text::public.saga_item_role;

drop type public.saga_item_role_viejo;
```

- [ ] **Step 2: Aplicarla a dev y verificar contra el objeto real**

`mcp__supabase-dev__apply_migration` (name: `saga_item_role_sin_paralela`), y después:

```sql
select
  (select array_agg(e.enumlabel order by e.enumsortorder)
     from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'saga_item_role') as valores,
  (select count(*) from pg_type where typname = 'saga_item_role_viejo') as sobra_el_viejo,
  (select atttypid::regtype::text from pg_attribute a
     join pg_class c on c.oid = a.attrelid
    where c.relname = 'saga_items' and a.attname = 'role') as tipo_de_la_columna;
```

Esperado: 6 valores, `sobra_el_viejo = 0`, `tipo_de_la_columna = saga_item_role`.

- [ ] **Step 3: Comprobar que el RPC sigue vivo tras recrear el tipo**

En dev, con `mcp__supabase-dev__execute_sql`, una llamada que no cambia nada pero **ejecuta el cast**:

```sql
select public.save_saga_sequence(
  '53118dd4-ccd9-4a9d-8241-5899816a9eab'::uuid,  -- [QA Sagas v2] Era Uno
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
);
```

Esperado: sin error. Si diera `cache lookup failed for type` o similar, el problema es un plan cacheado y no la migración: se documenta y se abre issue antes de seguir.

- [ ] **Step 4: Quitar `paralela` de TypeScript y de las traducciones**

En `src/lib/sagas/roles.ts`, borrar la línea `"paralela",` de `SAGA_ITEM_ROLES` y el párrafo del comentario que explicaba por qué seguía ahí.

En `src/lib/supabase/database.types.ts`, quitar `| "paralela"` de la unión (línea ~2340) y `"paralela",` del array (línea ~2515).

En `messages/es.json`, borrar la clave `"paralela"` de los tres mapas: `saga.roleLabel`, `saga.roleShort` y `sagaEditor.role`.

- [ ] **Step 5: Correr tests y compilador**

```bash
npm run test -- src/lib/sagas/roles.test.ts
npx tsc --noEmit
npm run test
```

Esperado: verde. El compilador es aquí la red de seguridad: cualquier sitio que aún escriba `"paralela"` como `SagaItemRole` sale ahora.

- [ ] **Step 6: Abrir la issue de la migración pendiente en prod**

Con `mcp__github__create_issue` (owner `borjar20`, repo `Biblioshare`). Título: *«Pendiente: aplicar `20260807_saga_item_role_sin_paralela.sql` a producción tras el despliegue de la fase 5»*. Cuerpo, como mínimo: qué migración, por qué no fue con las demás (D1: retirar un valor rompe el bundle viejo, `22P02`), la comprobación previa (`select count(*) from saga_items where role::text = 'paralela'` debe dar 0) y la verificación posterior (`pg_enum` con 6 valores, `saga_item_role_viejo` inexistente, una llamada al RPC). **Sin esta issue el cambio queda a medias y nadie se entera** — es exactamente el caso que la regla de oro de `AGENTS.md` describe.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260807_saga_item_role_sin_paralela.sql src/lib/sagas/roles.ts src/lib/supabase/database.types.ts messages/es.json
git commit -m "feat(sagas): retira paralela del vocabulario de roles"
```

---

### Task 3: El glifo de cada rol

Deliverable: cada rol tiene su glifo, garantizado por el tipo y por un test, y `RoleChip` lo pinta.

**Files:**
- Create: `src/lib/sagas/role-style.ts`, `src/lib/sagas/role-style.test.ts`
- Modify: `src/components/saga/role-chip.tsx`

**Interfaces:**
- Produces: `ROLE_GLYPH: Record<SagaItemRole, string>` (`src/lib/sagas/role-style.ts`), que consumen `RoleChip` (Task 3), `RoleRibbon` (Task 4) y `RoleFilterBar` (Task 7).

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/sagas/role-style.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ROLE_GLYPH } from "./role-style";
import { SAGA_ITEM_ROLES } from "./roles";

describe("ROLE_GLYPH", () => {
  it("cubre todos los roles y ninguno de más", () => {
    // El Record<SagaItemRole, string> ya lo exige en compilación; esto lo
    // exige también en ejecución, que es lo que queda cuando alguien amplía el
    // enum y silencia el error con un `as`.
    expect(Object.keys(ROLE_GLYPH).sort()).toEqual([...SAGA_ITEM_ROLES].sort());
  });

  it("los glifos son distintos entre sí", () => {
    // Un glifo repetido no rompe nada, pero deja de distinguir — que es lo
    // único para lo que existe (D7: el rol no estrena paleta).
    const glifos = Object.values(ROLE_GLYPH);
    expect(new Set(glifos).size).toBe(glifos.length);
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

```bash
npm run test -- src/lib/sagas/role-style.test.ts
```

Esperado: FAIL — `Failed to resolve import "./role-style"`.

- [ ] **Step 3: Crear el mapa**

Crear `src/lib/sagas/role-style.ts`:

```ts
import type { SagaItemRole } from "./roles";

/** Glifo de cada rol, tomado del mockup «Paper - Sagas (estados del grafo)».
 *
 *  Solo glifo, no color, y a propósito: en este producto el color YA significa
 *  subsaga (`SAGA_ACCENT` tiñe el raíl, el punto y la leyenda), así que un chip
 *  de rol con hue propio se leería como «esta obra es de otro grupo». El
 *  mockup pinta seis colores; se descarta a sabiendas. Si algún día se quiere
 *  color por rol, primero hay que decidir qué hacer con el acento de subsaga.
 *
 *  `Record<SagaItemRole, string>` sin caso por defecto, por el mismo motivo por
 *  el que `RoleChip` no lo tiene: un rol nuevo sin glifo tiene que romper la
 *  compilación, no caer en un genérico que lo esconda. */
export const ROLE_GLYPH: Record<SagaItemRole, string> = {
  precuela: "◂",
  novela_corta: "▪",
  relato: "✦",
  spin_off: "↳",
  companero: "▤",
  crossover: "◈",
};
```

- [ ] **Step 4: Correr el test y verlo pasar**

```bash
npm run test -- src/lib/sagas/role-style.test.ts
```

Esperado: PASS, 2 tests.

- [ ] **Step 5: Que `RoleChip` pinte el glifo**

`src/components/saga/role-chip.tsx` pasa a:

```tsx
import { getTranslations } from "next-intl/server";
import { ROLE_GLYPH } from "@/lib/sagas/role-style";
import type { SagaItemRole } from "@/lib/sagas/types";

// Chip de rol narrativo (issue #167). Deliberadamente sin caso por defecto: un
// rol nuevo en BD que no tenga traducción debe verse raro en dev, no caer en
// un genérico que lo esconda.
//
// El estilo replica el badge de rama de reading-timeline.tsx:100 — mismo gold
// sobre gold/10 — para no inventar una quinta etiqueta visual en la ficha. La
// fase 5 añade el glifo del mockup y NO añade color por rol: el color ya
// significa subsaga en este producto (ver role-style.ts).
export async function RoleChip({ role }: { role: SagaItemRole | null }) {
  if (role === null) return null;
  const t = await getTranslations("saga");
  return (
    <span
      data-testid="role-chip"
      className="inline-flex items-center gap-1 rounded bg-gold/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-gold"
    >
      <span aria-hidden>{ROLE_GLYPH[role]}</span>
      {t(`roleLabel.${role}`)}
    </span>
  );
}
```

- [ ] **Step 6: Compilar y commitear**

```bash
npx tsc --noEmit
git add src/lib/sagas/role-style.ts src/lib/sagas/role-style.test.ts src/components/saga/role-chip.tsx
git commit -m "feat(sagas): glifo por rol en el chip narrativo"
```

---

### Task 4: La cinta en la portada

Deliverable: toda fila del timeline con portada y rol curado lo dice **en la portada**, y una rama opcional deja de tragarse su rol (D9).

**Files:**
- Create: `src/components/saga/timeline/role-ribbon.tsx`
- Modify: `src/components/saga/timeline/timeline-labels.ts`, `timeline-entry-row.tsx`, `timeline-branch.tsx`, `timeline-tandem-row.tsx`, `timeline-window-row.tsx`
- Modify: `src/components/saga/reading-timeline.tsx` (pasa la etiqueta nueva)

**Interfaces:**
- Consumes: `ROLE_GLYPH` (Task 3).
- Produces: `<RoleRibbon role={...} labels={...} />`, función plana (no `async`) que devuelve `null` si `role === null`.

- [ ] **Step 1: La etiqueta corta entra en `TimelineLabels`**

En `src/components/saga/timeline/timeline-labels.ts`, añadir al tipo, después de `skippedTag`:

```ts
  /** Forma CORTA del rol, para la cinta de la portada: «Novela corta» no cabe
   *  en 44 px a 7.5 px. El chip usa la larga (`saga.roleLabel`). */
  roleShort: (role: SagaItemRole) => string;
```

con el import correspondiente arriba del fichero:

```ts
import type { SagaItemRole } from "@/lib/sagas/types";
```

y en `buildTimelineLabels`, después de `skippedTag`:

```ts
    roleShort: (role) => t(`roleShort.${role}`),
```

- [ ] **Step 2: Crear la cinta**

Crear `src/components/saga/timeline/role-ribbon.tsx`:

```tsx
import { ROLE_GLYPH } from "@/lib/sagas/role-style";
import type { SagaItemRole } from "@/lib/sagas/types";
import type { TimelineLabels } from "./timeline-labels";

// Cinta de rol sobre la portada (mockup, `.rib`). Va DENTRO del `<span
// className="relative ...">` que envuelve la portada, que ya es `relative` y
// `overflow-hidden` en las cuatro filas.
//
// Por qué la cinta y no solo el chip: hasta la fase 5 la fila `entry` —la de
// una obra con hueco— no decía el rol en NINGÚN sitio (RoleChip solo se
// montaba en ramas, ventanas y puentes), y en producción la mayoría de las 8
// obras con rol tienen hueco. Además la cinta no le roba ancho a un título que
// ya se trunca.
//
// Etiqueta CORTA a propósito (`roleShort`): la portada de una fila `entry` mide
// 44 px y «Novela corta» no cabe. Recortar por código daría «Novela cor…».
export function RoleRibbon({ role, labels }: { role: SagaItemRole | null; labels: TimelineLabels }) {
  if (role === null) return null;
  return (
    <span
      data-testid="role-ribbon"
      className="absolute inset-x-0 bottom-0 truncate bg-foreground/75 px-1 py-[1px] text-center font-mono text-[7.5px] uppercase tracking-wide text-background"
    >
      <span aria-hidden>{ROLE_GLYPH[role]} </span>
      {labels.roleShort(role)}
    </span>
  );
}
```

- [ ] **Step 3: Montarla en la fila `entry`**

En `src/components/saga/timeline/timeline-entry-row.tsx`, dentro del `<span className="relative h-[66px] w-[44px] ...">`, **después** del bloque de `status === "in_progress"` (línea ~72) y antes de cerrar el `</span>`:

```tsx
              <RoleRibbon role={row.node.role} labels={labels} />
```

con el import:

```tsx
import { RoleRibbon } from "./role-ribbon";
```

- [ ] **Step 4: Montarla en la ventana y en el tándem**

En `timeline-window-row.tsx`, dentro del `<span className="relative h-[57px] w-[38px] ...">`, después del `{row.node.coverUrl && ...}`:

```tsx
            <RoleRibbon role={row.node.role} labels={labels} />
```

En `timeline-tandem-row.tsx`, dentro del `<span className="relative h-[57px] w-[38px] ...">` de cada `<li>`, después del bloque `{n.status === "completed" && ...}`:

```tsx
                    <RoleRibbon role={n.role} labels={labels} />
```

Los dos ficheros necesitan el import `import { RoleRibbon } from "./role-ribbon";`.

> El tándem es el único sitio donde la cinta aparece varias veces en una fila: son obras distintas y cada una tiene su rol. En producción el único tándem real (Trono de Cristal, hueco 5) no tiene roles curados, así que hoy no pinta ninguna.

- [ ] **Step 5: La rama: cinta, y que deje de tragarse el rol**

En `src/components/saga/timeline/timeline-branch.tsx`, la portada (línea ~47) gana la cinta:

```tsx
          <span className="relative h-[57px] w-[38px] shrink-0 overflow-hidden rounded">
            {branch.node.coverUrl && (
              <Image src={branch.node.coverUrl} alt="" fill sizes="38px" className="object-cover" />
            )}
            <RoleRibbon role={branch.node.role} labels={labels} />
          </span>
```

Y el bloque de etiquetas (líneas 53-66) deja de ser un `if/else if/else` que **excluye** el rol:

```tsx
            {/* Antes esto era un if/else que pintaba el chip de rol SOLO si la
                obra no era requisito ni opcional — justo al revés del caso más
                común: un spin-off casi siempre es opcional (lo dice el propio
                mockup), así que un spin-off opcional no decía en ninguna parte
                que fuera un spin-off. Ahora la chapa de posición/estado y el
                rol conviven: dicen cosas distintas. */}
            <span className="flex flex-wrap items-center gap-1">
              {branch.edgeType === "requisito" && (
                <span className="inline-block rounded bg-gold/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-gold">
                  {labels.branchRequisite}
                </span>
              )}
              {branch.node.optional && (
                <span
                  data-testid="optional-tag"
                  className="inline-block rounded bg-gold/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-gold"
                >
                  {skipped ? labels.skippedTag : labels.optionalTag}
                </span>
              )}
              <RoleChip role={branch.node.role} />
            </span>
```

- [ ] **Step 6: Comprobar en el navegador**

Con un solo `next dev` en el 3000 (matar el que hubiera: `Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess`), curar un rol en dev sobre una obra **con hueco** del universo QA y mirar `/saga/<id>?tab=mapa&ruta=lectura`: la cinta se lee sobre la portada y no tapa el ✓ de completado (que vive en la esquina inferior **derecha**, encima de la cinta — comprobarlo, y si estorba, mover el ✓ arriba a la derecha en el mismo commit).

- [ ] **Step 7: Compilar, correr y commitear**

```bash
npx tsc --noEmit
npm run test
git add src/components/saga/timeline/ src/components/saga/reading-timeline.tsx
git commit -m "feat(sagas): cinta de rol en la portada de las filas del timeline"
```

---

### Task 5: El motor aprende a filtrar por rol

Deliverable: `deriveTimeline` acepta `roleFilter`, y hay tests que fijan las dos cosas que NO hace (D5).

**Files:**
- Modify: `src/lib/sagas/derive-timeline.ts:88-114`
- Test: `src/lib/sagas/derive-timeline.test.ts`

**Interfaces:**
- Produces: `deriveTimeline(graph, { spine?, authenticated?, showOptional?, roleFilter? })`, donde `roleFilter?: SagaItemRole | null` y `null`/ausente significa «todos».

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `src/lib/sagas/derive-timeline.test.ts`, dentro del `describe("deriveTimeline", ...)`:

```ts
  it("con roleFilter solo quedan las obras de ese rol", () => {
    const tl = deriveTimeline(
      graph([
        node("a", { orderNo: 1, role: null }),
        node("b", { orderNo: 2, role: "precuela" }),
        node("c", { orderNo: 3, role: "relato" }),
        node("d", { orderNo: 4, role: "precuela" }),
      ]),
      { roleFilter: "precuela" },
    );
    expect(tl.flatMap((s) => s.rows).map((r) => r.kind === "entry" && r.node.id)).toEqual(["b", "d"]);
  });

  it("el filtro NO renumera: la fila 4 sigue siendo la 4 aunque la 1 no se vea", () => {
    // Misma regla que ya rige los pasos de un itinerario y las opcionales
    // escondidas de la fase 4: renumerar solo lo visible haría que el timeline
    // contara la saga distinto que el resto del producto.
    const tl = deriveTimeline(
      graph([
        node("a", { orderNo: 1, role: null }),
        node("b", { orderNo: 2, role: null }),
        node("c", { orderNo: 3, role: null }),
        node("d", { orderNo: 4, role: "precuela" }),
      ]),
      { roleFilter: "precuela" },
    );
    const fila = tl[0].rows[0];
    expect(fila.kind).toBe("entry");
    if (fila.kind === "entry") expect(fila.no).toBe(4);
  });

  it("sin roleFilter no se esconde nada", () => {
    const nodos = [node("a", { orderNo: 1, role: "relato" }), node("b", { orderNo: 2, role: null })];
    expect(deriveTimeline(graph(nodos)).flatMap((s) => s.rows)).toHaveLength(2);
    expect(deriveTimeline(graph(nodos), { roleFilter: null }).flatMap((s) => s.rows)).toHaveLength(2);
  });

  it("el filtro por rol y el interruptor de opcionales se aplican a la vez", () => {
    const tl = deriveTimeline(
      graph([
        node("a", { orderNo: 1, role: "relato", optional: false }),
        node("b", { orderNo: 2, role: "relato", optional: true }),
      ]),
      { roleFilter: "relato", showOptional: false },
    );
    expect(tl.flatMap((s) => s.rows).map((r) => r.kind === "entry" && r.node.id)).toEqual(["a"]);
  });

  it("el filtro NO mueve el tramo de la ventana", () => {
    // windowTrack sigue recibiendo el grafo ENTERO: el tramo describe el orden
    // de lectura de la SAGA, no la lente que este lector eligió. Si el filtro
    // lo moviera, dos lectores verían tramos distintos para la misma ventana
    // (la misma cantidad derivada con dos valores: #91 / #185).
    const nodos = [
      node("a", { orderNo: 1, role: null }),
      node("b", { orderNo: 2, role: null }),
      node("c", { orderNo: 3, role: null }),
      node("libre", { orderNo: null, role: "crossover" }),
    ];
    const edges: SagaGraph["edges"] = [
      { id: "e1", source: "a", target: "libre", type: "requisito", accent: "verde" },
      { id: "e2", source: "libre", target: "c", type: "requisito", accent: "verde" },
    ];
    const sinFiltro = deriveTimeline(graph(nodos, edges), { authenticated: true });
    const conFiltro = deriveTimeline(graph(nodos, edges), { authenticated: true, roleFilter: "crossover" });
    const track = (tl: ReturnType<typeof deriveTimeline>) =>
      tl.flatMap((s) => s.rows).find((r) => r.kind === "window")?.kind === "window"
        ? (tl.flatMap((s) => s.rows).find((r) => r.kind === "window") as Extract<
            (typeof tl)[number]["rows"][number],
            { kind: "window" }
          >).track
        : null;
    expect(track(conFiltro)).toEqual(track(sinFiltro));
  });
```

- [ ] **Step 2: Correr y ver fallar**

```bash
npm run test -- src/lib/sagas/derive-timeline.test.ts
```

Esperado: FAIL — `roleFilter` no existe en el tipo de `opts` (error de compilación en el test) y las filas no se filtran.

- [ ] **Step 3: Implementar**

En `src/lib/sagas/derive-timeline.ts`, la firma (línea ~88) pasa a:

```ts
  opts: {
    spine?: TimelineSpine;
    authenticated?: boolean;
    showOptional?: boolean;
    /** Lente por rol (fase 5). `null` o ausente = todos. NO es preferencia
     *  persistente: viaja en la URL (`?rol=`), al revés que `showOptional`. */
    roleFilter?: SagaItemRole | null;
  } = {},
): TimelineSection[] {
  const spineMode = opts.spine ?? "curation";
  const authenticated = opts.authenticated ?? false;
  const showOptional = opts.showOptional ?? true;
  const roleFilter = opts.roleFilter ?? null;
```

con `SagaItemRole` añadido al import de `./types` en la cabecera:

```ts
import type { DetailMember, SagaItemRole, TandemMode, WindowReason } from "./types";
```

Y el filtro de `items` (línea ~114) pasa a:

```ts
  // El filtro por rol va en el MISMO sitio que el de opcionales y por el mismo
  // motivo: `items` alimenta la columna, las ramas, los puentes y la colocación
  // de las ventanas.
  //
  // Lo que NO hace, igual que el de opcionales: no renumera (`no` sale de
  // `orderNo + 1` o de `step`, calculados sobre el grafo entero) y no mueve el
  // tramo de la ventana — `graph` entero sigue llegando a `windowTrack`.
  const items = graph.nodes.filter(
    (n) =>
      n.kind === "item" &&
      (showOptional || !n.optional) &&
      (roleFilter === null || n.role === roleFilter),
  );
```

- [ ] **Step 4: Correr y ver pasar**

```bash
npm run test -- src/lib/sagas/derive-timeline.test.ts
```

Esperado: PASS, incluidos los 5 nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/derive-timeline.ts src/lib/sagas/derive-timeline.test.ts
git commit -m "feat(sagas): el motor del timeline acepta una lente por rol"
```

---

### Task 6: Cuántas hay de cada rol, contadas sobre el grafo

Deliverable: `countRoles`, pura y probada, con la regla de D6 fijada por un test.

**Files:**
- Create: `src/lib/sagas/count-roles.ts`, `src/lib/sagas/count-roles.test.ts`

**Interfaces:**
- Produces: `countRoles(graph: SagaGraph): Array<{ role: SagaItemRole; count: number }>`, en el orden de `SAGA_ITEM_ROLES` y **sin** los roles con 0.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/sagas/count-roles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countRoles } from "./count-roles";
import type { SagaGraph, SagaGraphNode } from "./map-types";

const node = (id: string, over: Partial<SagaGraphNode> = {}): SagaGraphNode => ({
  id,
  kind: "item",
  x: 0,
  y: 0,
  level: "principal",
  orderNo: null,
  label: id,
  accent: "verde",
  status: null,
  role: null,
  coverUrl: null,
  covers: [],
  href: `/libro/${id}`,
  memberCount: null,
  groupSagaId: "g1",
  groupName: "Era Uno",
  step: null,
  tandem: null,
  windowReason: null,
  optional: false,
  skipped: false,
  ownerSagaId: "owner",
  ...over,
});

const graph = (nodes: SagaGraphNode[]): SagaGraph => ({ nodes, edges: [] });

describe("countRoles", () => {
  it("cuenta las obras de cada rol presente, en el orden del vocabulario", () => {
    const r = countRoles(
      graph([
        node("a", { role: "relato" }),
        node("b", { role: "precuela" }),
        node("c", { role: "relato" }),
        node("d", { role: null }),
      ]),
    );
    expect(r).toEqual([
      { role: "precuela", count: 1 },
      { role: "relato", count: 2 },
    ]);
  });

  it("no lista los roles que no tiene ninguna obra", () => {
    expect(countRoles(graph([node("a", { role: null })]))).toEqual([]);
  });

  it("cuenta también las opcionales y las saltadas", () => {
    // Esta es la regla que hace REVERSIBLE la barra de filtro: si se contara
    // sobre lo visible, filtrar por «Precuela» dejaría la barra con un solo
    // chip y no habría forma de volver — el mismo error que la fase 4 evitó
    // con optionalCount.
    const r = countRoles(
      graph([
        node("a", { role: "spin_off", optional: true }),
        node("b", { role: "spin_off", optional: true, skipped: true }),
      ]),
    );
    expect(r).toEqual([{ role: "spin_off", count: 2 }]);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

```bash
npm run test -- src/lib/sagas/count-roles.test.ts
```

Esperado: FAIL — `Failed to resolve import "./count-roles"`.

- [ ] **Step 3: Implementar**

Crear `src/lib/sagas/count-roles.ts`:

```ts
import type { SagaGraph } from "./map-types";
import { SAGA_ITEM_ROLES, type SagaItemRole } from "./roles";

/** Cuántas obras hay de cada rol EN EL GRAFO (fase 5).
 *
 *  Sobre el grafo y no sobre las filas visibles del timeline, a propósito: es
 *  lo que hace reversible la barra de filtro. Contadas sobre lo visible,
 *  filtrar por «Precuela» dejaría la barra con un solo chip y no habría forma
 *  de volver — exactamente el error que la fase 4 evitó al contar
 *  `optionalCount` sobre el grafo.
 *
 *  Devuelve solo los roles presentes, en el orden de lectura del vocabulario:
 *  una barra con seis chips a cero sería ruido en las sagas sin roles, que hoy
 *  son casi todas (8 filas con rol de 367 en producción). */
export function countRoles(graph: SagaGraph): Array<{ role: SagaItemRole; count: number }> {
  const cuenta = new Map<SagaItemRole, number>();
  for (const n of graph.nodes) {
    if (n.kind !== "item" || n.role === null) continue;
    cuenta.set(n.role, (cuenta.get(n.role) ?? 0) + 1);
  }
  return SAGA_ITEM_ROLES.flatMap((role) => {
    const count = cuenta.get(role);
    return count === undefined ? [] : [{ role, count }];
  });
}
```

- [ ] **Step 4: Correr y ver pasar**

```bash
npm run test -- src/lib/sagas/count-roles.test.ts
```

Esperado: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/count-roles.ts src/lib/sagas/count-roles.test.ts
git commit -m "feat(sagas): cuenta de obras por rol sobre el grafo"
```

---

### Task 7: La barra de filtro

Deliverable: la cabecera del timeline lleva los chips de rol, con su cuenta, sin una línea de JS de cliente.

**Files:**
- Create: `src/components/saga/timeline/role-filter-bar.tsx`
- Modify: `src/components/saga/reading-timeline.tsx`, `messages/es.json`

**Interfaces:**
- Consumes: `countRoles` (Task 6), `ROLE_GLYPH` (Task 3).
- Produces: `<RoleFilterBar counts={...} active={...} baseHref={...} labels={...} />`. `baseHref` es la URL **ya con sus parámetros** (`/saga/<id>?tab=mapa&ruta=lectura`); la barra solo añade `&rol=`.

- [ ] **Step 1: Las etiquetas**

En `messages/es.json`, dentro de `saga`, junto a las `timelineOptional*` de la fase 4:

```json
    "timelineRoleFilterTitle": "Roles",
    "timelineRoleFilterAll": "Todos",
    "timelineRoleFilterAria": "Ver solo: {role}",
```

- [ ] **Step 2: Crear la barra**

Crear `src/components/saga/timeline/role-filter-bar.tsx`:

```tsx
import Link from "next/link";
import { ROLE_GLYPH } from "@/lib/sagas/role-style";
import type { SagaItemRole } from "@/lib/sagas/types";

// Barra de filtro por rol (fase 5, mockup frame C `.rolefilter`).
//
// Enlaces, no botones ni estado de cliente: filtrar es una LENTE momentánea,
// no una preferencia (al revés que el interruptor de opcionales de la fase 4,
// que sí vive en `profiles`). En la URL se comparte, vuelve con el botón atrás
// del navegador y no cuesta ni una línea de JS.
//
// `counts` viene de `countRoles(graph)` — contado sobre el GRAFO, nunca sobre
// las filas visibles: contado sobre lo visible, filtrar dejaría la barra con un
// solo chip y no habría forma de volver.
export function RoleFilterBar({
  counts,
  active,
  baseHref,
  labels,
}: {
  counts: Array<{ role: SagaItemRole; count: number }>;
  active: SagaItemRole | null;
  /** URL de la ficha CON sus parámetros ya puestos (`?tab=mapa&ruta=…`). */
  baseHref: string;
  labels: { title: string; all: string; name: (role: SagaItemRole) => string; aria: (role: string) => string };
}) {
  const chip = (on: boolean) =>
    `rounded-full border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-wide ${
      on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"
    }`;
  return (
    <div data-testid="role-filter-bar" className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
        {labels.title}
      </span>
      <Link href={baseHref} data-testid="role-filter-all" className={chip(active === null)}>
        {labels.all}
      </Link>
      {counts.map(({ role, count }) => (
        <Link
          key={role}
          href={`${baseHref}&rol=${role}`}
          data-testid={`role-filter-${role}`}
          aria-label={labels.aria(labels.name(role))}
          aria-current={active === role ? "true" : undefined}
          className={chip(active === role)}
        >
          <span aria-hidden>{ROLE_GLYPH[role]} </span>
          {labels.name(role)} · {count}
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Montarla en la cáscara**

En `src/components/saga/reading-timeline.tsx`, añadir tres props al componente:

```tsx
  /** Roles presentes en el grafo, con su cuenta. Vacío = no se pinta barra. */
  roleCounts: Array<{ role: SagaItemRole; count: number }>;
  /** Rol activo (de `?rol=`), o null. */
  activeRole: SagaItemRole | null;
  /** URL de la ficha con sus parámetros, para construir los enlaces del filtro. */
  baseHref: string;
```

y, **encima** del bloque de `OptionalBar` (antes del `{sagaId !== null && optionalCount > 0 && ...}`):

```tsx
      {roleCounts.length > 0 && (
        <RoleFilterBar
          counts={roleCounts}
          active={activeRole}
          baseHref={baseHref}
          labels={{
            title: t("timelineRoleFilterTitle"),
            all: t("timelineRoleFilterAll"),
            name: (role) => t(`roleLabel.${role}`),
            aria: (role) => t("timelineRoleFilterAria", { role }),
          }}
        />
      )}
```

> La barra se pinta **con y sin sesión**, al revés que la de opcionales: filtrar no guarda nada, así que no hace falta a quién guardárselo. La ficha es pública y el visitante también quiere ver solo las precuelas.

- [ ] **Step 4: Compilar (fallará: faltan los tres montajes)**

```bash
npx tsc --noEmit
```

Esperado: FAIL en `saga-map-tab.tsx` (×2) y `route-view.tsx` — `roleCounts` no existe en las props que pasan. Es la cascada que la Task 8 resuelve; **no** silenciarla con valores por defecto.

- [ ] **Step 5: Commit (junto con la Task 8)**

Esta tarea y la siguiente comparten commit: el compilador está en rojo entre las dos, y un commit que no compila no sirve para bisecar. Seguir a la Task 8 antes de commitear.

---

### Task 8: Cableado — el parámetro `rol` llega a los tres montajes

Deliverable: `?rol=` funciona en las tres ubicaciones (móvil, pie del grafo en PC, itinerario) y el compilador vuelve a verde.

**Files:**
- Modify: `src/app/saga/[id]/page.tsx:33,36`, `src/components/saga/saga-map-tab.tsx`, `src/components/saga/route-view.tsx`

- [ ] **Step 1: El parámetro entra en la página**

En `src/app/saga/[id]/page.tsx`, línea 33:

```ts
  searchParams: Promise<{ tab?: string; orden?: string; ruta?: string; rol?: string }>;
```

línea 36:

```ts
  const { orden, ruta, rol } = await searchParams;
```

y, después del bloque que resuelve `activeRoute`:

```ts
  // Lente por rol (fase 5). Un valor desconocido —enlace viejo, `paralela` de
  // antes de la retirada, o algo escrito a mano— degrada a «todos» en vez de
  // dar 404 o vaciar el timeline sin explicación. Mismo criterio que el slug de
  // ruta desconocido, justo arriba.
  const activeRole = (SAGA_ITEM_ROLES as readonly string[]).includes(rol ?? "")
    ? (rol as SagaItemRole)
    : null;
```

con el import:

```ts
import { SAGA_ITEM_ROLES, type SagaItemRole } from "@/lib/sagas/types";
```

y pasarlo a `SagaMapTab` en el JSX (junto a `activeRoute`):

```tsx
            activeRole={activeRole}
```

- [ ] **Step 2: `SagaMapTab` lo reparte**

En `src/components/saga/saga-map-tab.tsx`, añadir la prop:

```tsx
  activeRole,
```

al destructuring, y al tipo:

```tsx
  /** Lente por rol (`?rol=`), ya validada contra el vocabulario. */
  activeRole: SagaItemRole | null;
```

Después de la línea de `optionalCount` (~67), añadir:

```tsx
  // Contado sobre el GRAFO, igual que optionalCount y por el mismo motivo: la
  // barra tiene que seguir listando todos los roles mientras uno está activo,
  // o no habría forma de volver.
  const roleCounts = graph === null ? [] : countRoles(graph);
  // Los enlaces del filtro conservan la pestaña y la ruta activa: la lente no
  // puede sacarte del mapa ni cambiarte de itinerario.
  const baseHref = `${base}?tab=mapa&ruta=${encodeURIComponent(activeRoute)}`;
```

con los imports:

```tsx
import { countRoles } from "@/lib/sagas/count-roles";
import type { SagaItemRole } from "@/lib/sagas/types";
```

En **los dos** `<ReadingTimeline>` de la rama `lectura` (móvil, línea ~106; PC, línea ~127), añadir a la llamada de `deriveTimeline` y a las props:

```tsx
            <ReadingTimeline
              sections={deriveTimeline(graph, {
                authenticated: detail.isAuthenticated,
                showOptional: detail.showOptionalReadings,
                roleFilter: activeRole,
              })}
              sagaId={detail.isAuthenticated ? detail.saga.id : null}
              showOptional={detail.showOptionalReadings}
              optionalCount={optionalCount}
              roleCounts={roleCounts}
              activeRole={activeRole}
              baseHref={baseHref}
            />
```

Y pasar `activeRole` a `RouteView` (línea ~155):

```tsx
          <RouteView detail={detail} slug={activeRoute} canEdit={canEdit} graph={curatedGraph} activeRole={activeRole} />
```

- [ ] **Step 3: `RouteView`, el tercer montaje**

En `src/components/saga/route-view.tsx`, añadir `activeRole` a las props (mismo tipo y comentario), calcular `roleCounts` y `baseHref` junto a donde ya calcula `optionalCount`, pasar `roleFilter: activeRole` a su `deriveTimeline` y las tres props nuevas a su `<ReadingTimeline>` (línea ~154). El `baseHref` aquí es `${sagaHref(detail.saga.id)}?tab=mapa&ruta=${encodeURIComponent(slug)}`.

- [ ] **Step 4: Compilar y correr todo**

```bash
npx tsc --noEmit
npm run test
```

Esperado: verde los dos.

- [ ] **Step 5: Comprobar a mano las tres ubicaciones**

Con el dev en el 3000 y roles curados en dev: `?tab=mapa&ruta=lectura` (móvil estrecho y ancho de PC) y una ruta curada. Pulsar un chip filtra; «Todos» vuelve; **la barra sigue listando todos los roles con el filtro puesto**; recargar mantiene el filtro; el botón atrás lo quita.

- [ ] **Step 6: Commit (con la Task 7)**

```bash
git add src/components/saga/timeline/role-filter-bar.tsx src/components/saga/reading-timeline.tsx src/components/saga/saga-map-tab.tsx src/components/saga/route-view.tsx src/app/saga/\[id\]/page.tsx messages/es.json
git commit -m "feat(sagas): filtro por rol en la cabecera del orden de lectura"
```

---

### Task 9: E2E

Deliverable: cuatro tests de Playwright, con la semilla restaurada por el propio spec.

**Files:**
- Create: `e2e/sagas-roles.spec.ts`

- [ ] **Step 1: Medir la semilla ANTES de escribir el spec**

Con `mcp__supabase-dev__execute_sql`, sobre `[QA Sagas v2] Era Uno` (`53118dd4-ccd9-4a9d-8241-5899816a9eab`) y el universo (`69c07496-9b1a-4203-b3da-15d22a09c039`):

```sql
select saga_id, item_type, item_id, position, placement, optional, role
  from public.saga_items
 where saga_id in ('53118dd4-ccd9-4a9d-8241-5899816a9eab', '69c07496-9b1a-4203-b3da-15d22a09c039')
 order by saga_id, position nulls last;
```

Anotar **el estado exacto de `role`** de las filas que el spec va a tocar: es lo que su `afterAll` tiene que restaurar. En la fase 4 esto se hizo mal —el spec capturó como línea base un valor que yo mismo había puesto a mano— y dejó la semilla desviada; aquí se mide **antes** de tocar nada.

- [ ] **Step 2: Escribir el spec**

Crear `e2e/sagas-roles.spec.ts`, calcando la estructura de `e2e/sagas-opcionales-saltables.spec.ts` (fase 4): `fetch` nativo con la service key, sin helpers compartidos, semilla restaurada en `afterAll`.

```ts
import { expect, test } from "@playwright/test";

// E2E de la fase 5 (roles). Contra el universo QA compartido, y con la ficha
// abierta directamente en la pestaña del mapa: la saga abre en «Info», así que
// sin `?tab=mapa` no hay timeline que mirar (aprendido a base de 4 tests rojos
// en la fase 4).
const UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039";
const MAPA = `/saga/${UNIVERSO_ID}?tab=mapa&ruta=lectura`;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = () => ({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" });

// Rellenar en la Step 1 con lo MEDIDO: las filas que el spec tiñe de rol y el
// valor que tenían antes (casi siempre null).
const CURADAS: Array<{ sagaId: string; itemType: string; itemId: string; role: string | null; before: string | null }> = [
  /* … */
];

async function setRole(f: (typeof CURADAS)[number], role: string | null) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/saga_items?saga_id=eq.${f.sagaId}&item_type=eq.${f.itemType}&item_id=eq.${f.itemId}`,
    { method: "PATCH", headers: admin(), body: JSON.stringify({ role }) },
  );
}

test.beforeAll(async () => {
  for (const f of CURADAS) await setRole(f, f.role);
});

test.afterAll(async () => {
  // Devolver la semilla a SU línea base, la medida antes de tocar nada.
  for (const f of CURADAS) await setRole(f, f.before);
});

test("el filtro por rol deja solo las obras de ese rol, y la barra sigue ofreciendo los demás", async ({ page }) => {
  await page.goto(MAPA);
  const barra = page.getByTestId("role-filter-bar").first();
  await expect(barra).toBeVisible();
  const antes = await page.getByTestId("reading-timeline").first().getByRole("link").count();

  await barra.getByTestId("role-filter-precuela").click();
  await page.waitForURL(/rol=precuela/);
  const despues = await page.getByTestId("reading-timeline").first().getByRole("link").count();
  expect(despues).toBeLessThan(antes);

  // Lo que hace REVERSIBLE la barra: con el filtro puesto sigue listando los
  // otros roles (contados sobre el grafo, no sobre lo visible).
  await expect(page.getByTestId("role-filter-bar").first().getByTestId("role-filter-relato")).toBeVisible();
  await page.getByTestId("role-filter-bar").first().getByTestId("role-filter-all").click();
  await expect(page).not.toHaveURL(/rol=/);
});

test("el filtro no renumera: la fila conserva su número", async ({ page }) => {
  await page.goto(MAPA);
  const fila = page.getByTestId("reading-timeline").first().getByText(/…/).first(); // título de la obra curada
  const numeroAntes = await fila.locator("xpath=..").locator("span").first().textContent();
  await page.goto(`${MAPA}&rol=precuela`);
  const numeroDespues = await page
    .getByTestId("reading-timeline")
    .first()
    .locator("span")
    .filter({ hasText: /^\d/ })
    .first()
    .textContent();
  expect(numeroDespues).toBe(numeroAntes);
});

test("la cinta dice el rol sobre la portada de una obra con hueco", async ({ page }) => {
  await page.goto(MAPA);
  const cintas = page.getByTestId("reading-timeline").first().getByTestId("role-ribbon");
  await expect(cintas.first()).toBeVisible();
  await expect(cintas.first()).toHaveText(/Precuela|Relato|Novela|Spin-off|Compañero|Crossover/);
});

test("filtrar NO mueve el progreso del hero", async ({ page }) => {
  // El límite duro de la spec, otra vez: `progress.ts` sale de la fase como
  // entró. El mockup pide lo contrario en dos sitios.
  await page.goto(MAPA);
  const antes = await page.getByTestId("saga-hero-progress").textContent();
  await page.goto(`${MAPA}&rol=precuela`);
  await expect(page.getByTestId("saga-hero-progress")).toHaveText(antes!);
});
```

> Ajustar los localizadores del test 2 al título real medido en la Step 1 — el `/…/` es un hueco a rellenar, no código que se pueda dejar. Si el número de fila no se puede localizar sin ambigüedad, añadir `data-testid="entry-no"` al `<span>` de `timeline-entry-row.tsx:76` en esta misma tarea; es preferible a un XPath frágil.

- [ ] **Step 3: Correr solo este spec**

```bash
npm run test:e2e -- e2e/sagas-roles.spec.ts
```

Esperado: 4 passed. Reutiliza el dev server que ya haya (no arrancar otro).

- [ ] **Step 4: Comprobar que la semilla quedó como estaba**

```sql
select saga_id, item_id, role from public.saga_items
 where role is not null and saga_id in ('53118dd4-ccd9-4a9d-8241-5899816a9eab', '69c07496-9b1a-4203-b3da-15d22a09c039');
```

Esperado: exactamente lo medido en la Step 1.

- [ ] **Step 5: Commit**

```bash
git add e2e/sagas-roles.spec.ts
git commit -m "test(sagas): e2e del filtro por rol y la cinta en portada"
```

---

### Task 10: Inyección de fallo

Deliverable: constancia de que los tests de esta fase valen. **Tres roturas, de una en una, cada una revertida antes de la siguiente.**

- [ ] **Step 1: Rotura 1 — el motor ignora el filtro**

En `derive-timeline.ts`, cambiar la condición del filtro a `(roleFilter === null || true)`.

```bash
npm run test -- src/lib/sagas/derive-timeline.test.ts
npm run test:e2e -- e2e/sagas-roles.spec.ts
```

Esperado: caen los tests unitarios del filtro **y** el e2e 1. Revertir con `git checkout -- src/lib/sagas/derive-timeline.ts` y confirmar verde.

- [ ] **Step 2: Rotura 2 — las cuentas se calculan sobre lo visible**

En `saga-map-tab.tsx`, cambiar `countRoles(graph)` por `countRoles({ ...graph, nodes: graph.nodes.filter((n) => activeRole === null || n.role === activeRole) })`.

Esperado: cae el e2e 1 **en el assert de que la barra sigue ofreciendo `relato`** (no antes: comprobar la línea exacta que falla, no solo que el spec esté rojo). Revertir y confirmar verde.

- [ ] **Step 3: Rotura 3 — la cinta no se pinta en la fila `entry`**

Quitar el `<RoleRibbon …/>` de `timeline-entry-row.tsx`.

Esperado: cae el e2e 3. Revertir y confirmar verde.

- [ ] **Step 4: Anotar el resultado**

Si alguna rotura **no** tumba ningún test, ese test no vale: se arregla el test en esta misma tarea (fue lo que destapó el #214 en la fase 4). Anotar las tres roturas y qué cayó, para el cuerpo de la PR.

- [ ] **Step 5: Confirmar que el árbol quedó limpio**

```bash
git status --porcelain
```

Esperado: vacío. Las tres roturas están revertidas.

---

### Task 11: Sincronizar la documentación y cerrar

Deliverable: los docs canónicos vuelven a ser ciertos, la PR está abierta en borrador y lo pendiente vive en issues.

- [ ] **Step 1: `docs/requirements/data-model.md`**

Actualizar el enum `saga_item_role` (seis valores, sin `paralela`), su fecha de verificación y la cabecera de frescura. Anotar explícitamente que **el enum de producción todavía tiene `paralela`** hasta que se aplique la migración B, con el número de la issue de la Task 2 — el doc canónico tiene que decir la verdad sobre prod, no la del repo.

- [ ] **Step 2: `docs/requirements/backlog.md`**

Marcar la fila de la fase 5, justo debajo de la de la fase 4, con: lo medido (8 filas con rol de 367, 0 `paralela`, una sola columna y un solo consumidor del tipo), las dos migraciones y **por qué van separadas**, las decisiones D1–D9 en una línea cada una, y la deuda abierta con su issue. La narrativa de *cómo* va aquí y en la spec, nunca al revés.

- [ ] **Step 3: `docs/requirements/decisiones.md`** (append-only, al final)

Cuatro filas nuevas: (1) las dos migraciones y el orden invertido de la B respecto a las fases 3 y 4; (2) una sola lista de roles en TS atada por test a los tipos generados; (3) el filtro en la URL y en el motor, con lo que NO redefine (números, tramo de ventana) y las cuentas sobre el grafo; (4) el rol se distingue por glifo y no por color, porque el color ya significa subsaga.

- [ ] **Step 4: `supabase/schema-baseline.sql`**

ANEXO con las dos migraciones, la nota del orden de despliegue y la de por qué recrear el tipo no rompe `save_saga_sequence` (plpgsql, cuerpo no parseado).

- [ ] **Step 5: `docs/architecture/graph.json`**

Regenerar según `docs/architecture/README.md`, y añadir a mano las trampas nuevas: en el nodo del motor, que `deriveTimeline` acepta ya **tres** lentes (`spine`, `showOptional`, `roleFilter`) y que ninguna renumera ni mueve el tramo; en el nodo de BD, que el enum de prod va **por detrás** del repo hasta que se aplique la migración B.

- [ ] **Step 6: Verificación final**

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run test:e2e
```

Esperado: `tsc` limpio; el único error de lint es el preexistente de `signup-form.tsx`; unitarias verdes; e2e con los dos fallos conocidos y ajenos del #228 (`busqueda-hidratacion.spec.ts:121`, `happy-path.spec.ts:54`) y nada más. Si aparece un fallo distinto, **es de esta fase**: se investiga, no se atribuye.

- [ ] **Step 7: Commit, rama, PR en borrador**

```bash
git add docs/ supabase/schema-baseline.sql
git commit -m "docs(sagas): sincroniza la documentación con la fase 5 de los roles"
git push -u origin worktree-sagas-fase-5-impl
gh pr create --draft --title "Sagas fase 5: los roles se ven y se pueden usar como lente" --body "…"
```

El cuerpo de la PR debe decir: qué entra, lo medido, las decisiones, **el estado exacto de cada migración en dev y en prod**, las tres inyecciones de fallo y qué cayó con cada una, y los enlaces a las issues abiertas. No mergear.

- [ ] **Step 8: Limpiar el entorno**

Matar el `next dev` (`Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess`, `Stop-Process -Id <pid>`), comprobar que el 3000 queda sin listener y que no sobran worktrees (`git worktree list`, `git worktree prune`, y borrar a mano las carpetas que sobrevivan en `.claude/worktrees/`).

---

## Auto-revisión del plan

**1 · Cobertura de la spec.** La fila de la fase 5 pide tres cosas: «enum ampliado» (Tasks 1 y 2), «cinta en portada» (Task 4), «chip y filtro en la cabecera del mapa» (Tasks 3, 7 y 8). Los límites duros de la sección «No entra» están en Global Constraints, con un e2e dedicado al del progreso (Task 9, test 4). Lo que la spec deja fuera —roles personalizados, `principal` como valor— no tiene tarea, a propósito.

**2 · Marcadores sin rellenar.** Queda uno, señalado como tal: el localizador del título en el e2e 2 y el array `CURADAS`, que dependen de lo que se mida en la Step 1 de la Task 9 y **no se pueden inventar antes**. El plan dice explícitamente que rellenarlos es parte de esa tarea y ofrece la alternativa (`data-testid="entry-no"`) si el localizador sale frágil.

**3 · Consistencia de tipos.** `SAGA_ITEM_ROLES` y `SagaItemRole` se definen en la Task 1 y se consumen con esos mismos nombres en las Tasks 3, 5, 6, 7 y 8. `countRoles` devuelve `Array<{role, count}>` en la Task 6 y se consume con esa forma en las Tasks 7 y 8. `ROLE_GLYPH` se define en la Task 3 y se consume en las 3, 4 y 7. `roleFilter` es el nombre de la opción del motor en la Task 5 y el de la prop en la 8; el parámetro de URL se llama `rol` en las dos.

**4 · Un riesgo que el plan asume.** Entre el merge y la aplicación de la migración B, producción tendrá un enum con `paralela` y un bundle que no lo conoce. Es inofensivo (0 filas, y el código nunca lo escribe), pero deja el repo y prod **desalineados a propósito** durante ese rato: por eso la issue de la Task 2 y la nota en `data-model.md` no son opcionales.
