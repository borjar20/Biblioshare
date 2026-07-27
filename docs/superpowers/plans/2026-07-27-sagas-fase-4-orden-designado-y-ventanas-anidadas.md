# Sagas fase 4: el orden que manda y la ventana de una obra anidada — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el curador pueda **designar** cuál de sus itinerarios ocupa el puesto de «Orden de lectura» —acabando con los dos chips que prometen lo mismo— y que desde el editor de una saga se pueda dar **ventana a una obra de una de sus subsagas**, sin que las dos pantallas que pasan a escribir la misma fila se pisen.

**Architecture:** (A) es una columna booleana en `saga_routes` y una regla concentrada en `buildRouteList`; nada se renombra en BD y nada se materializa. (B) mueve la ventana de «pertenece a la saga que la cura» a «pertenece a la obra, y su fila vive bajo la saga dueña de la membresía», lo que obliga a que el RPC **deje de borrar por saga y pase a borrar por lista explícita de sujetos** — exactamente el cambio que en la fase 2a obligó a que la baja de `saga_items` fuera explícita.

**Tech Stack:** Next.js 16 (App Router, React 19), Supabase/PostgREST, Tailwind v4 con tokens Paper, next-intl (solo `es`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-27-sagas-fase-4-orden-designado-y-ventanas-anidadas-design.md` — **léelo**, en particular «Tres hechos que deciden (A)», «La pregunta cara: ¿bajo qué saga vive la fila?» y «La consecuencia, y es la parte cara».

## Global Constraints

- **Una obra, una ventana.** Lo impone el unique parcial que ya existe, `(saga_id, item_type, item_id) where item_id is not null`. La fila vive bajo la saga **dueña** de la membresía (`ownerSagaId`), se cure desde donde se cure.
- **La restricción dura de la 2b sigue intacta:** una ventana por entrada y **dos anclas** como máximo. Esta fase amplía **quién puede ser sujeto**, no cuántas aristas caben. Si al construirla apetece una tercera ancla, **se para y se dice en voz alta**.
- **Solo lo `libre` tiene ventana**, también los sujetos anidados: una obra con hueco fijo YA tiene sitio. Esta regla es además lo que hace que las dos pantallas no se pisen — si una obra tuviera ventana sin ser `libre`, su saga dueña la hidrataría a `null` y la borraría al guardar.
- **La baja de ventanas pasa a ser EXPLÍCITA.** `delete from saga_placement_windows where saga_id = p_saga_id` desaparece. El editor manda las ventanas que conoce y, aparte, la lista de sujetos de los que se hace responsable.
- **No se renombran filas en BD.** La etiqueta «Orden de lectura» la pone el chip (`buildRouteList`). `saga_routes.name` no tiene unique: renombrar la fila dejaría **dos chips con el mismo texto** en cuanto alguien la desdesignara.
- **No se materializa `lectura` como fila de `saga_routes`.** El CHECK `saga_routes_slug_not_reserved` existe para impedirlo. Un booleano compra lo mismo.
- **No se reabre la #187.** Desde el editor del padre **no** se mueve, ni se renumera, ni se marca opcional una obra de la hija. Lo único que se cura desde ahí es su ventana.
- **El progreso no se toca**, ni por (A) ni por (B). El Cosmere sigue en **9 de 11**.
- **`getAnchorOptions` no se toca.** Curando desde el padre, el subárbol que ya recorre incluye las anclas que hacen falta.
- **Añadir un parámetro a una función de Postgres NO la reemplaza: crea una SOBRECARGA.** La de 5 argumentos se queda viva hasta que el bundle nuevo esté desplegado; retirarla es una migración aparte, después del despliegue.
- **CHECKs y comparaciones con NULL:** escritos con `IS [NOT] NULL` / `IS NOT DISTINCT FROM`. Un `=` contra NULL da NULL, y un `DELETE ... WHERE NULL` no borra nada.
- **Migraciones: dev primero, prod después**, verificando contra `information_schema`/`pg_indexes`/`pg_proc`, **nunca** contra `list_migrations`. Y **primero el código desplegado, después el `drop`**.
- **`src/lib/supabase/database.types.ts` se regenera** en cuanto cambie el esquema. Esta rama se quemó dos veces con eso: `PostgrestClient.rpc<Args>` infiere el tipo del literal, así que TypeScript **nunca** aplica excess-property checking a los argumentos de una RPC — un `database.types.ts` viejo no da error, da silencio.
- **Node 22** (`fnm use 22`) antes de `vitest`/`playwright`. Un solo `next dev`, en el 3000.
- Copia en español. Namespace `saga` en la ficha, `sagaEditor` en el editor.

## Lo que hay hoy, medido **[verificado por SQL el 2026-07-27]**

| | |
|---|---|
| ventanas en prod | **2**: *Esquirla del Amanecer* (sujeto **obra**, `saga_id` = El Archivo, solo `after`) y *Nacidos de la Bruma. Era 2* (sujeto **bloque**, `saga_id` = Cosmere, las dos anclas) |
| itinerarios en prod | **3**: Cosmere `orden-recomendado` (19 pasos), Mundodisco `rincewind` (8) y `orden-recomendado` (26) |
| obras con doble membresía | **0** de 363 |
| Novelas secretas | `placement_in_parent = libre` bajo Cosmere; sus **4** obras (*El Hombre Iluminado*, *Islas de la Acuaoscura*, *Trenza del Mar Esmeralda*, *Yumi y el Pintor de Pesadillas*) son todas `placement = libre` |

Ese último dato es el que hace que el caso literal del responsable funcione con la regla «solo lo `libre` tiene ventana»: *El Hombre Iluminado* ya es `libre` en su saga. Lo que hoy no se puede es **curarlo desde el Cosmere**, que es donde están las anclas que quiere usar.

## Estructura de ficheros

| Fichero | Qué |
|---|---|
| `supabase/migrations/20260730_saga_routes_is_reading_order.sql` | **nuevo**: columna + unique parcial |
| `src/lib/sagas/get-saga-routes.ts` (+ test) | `CuratedRouteRow.isReadingOrder`, `sortCuratedRoutes`, la regla de `buildRouteList` |
| `src/lib/sagas/route-types.ts` | `SagaRoute.isReadingOrder` |
| `src/lib/sagas/route-actions.ts` | `setReadingOrder`, guarda de `saveRoute` |
| `src/app/saga/[id]/rutas/page.tsx`, `src/components/saga/route-list.tsx`, `reading-order-picker.tsx` | radios de designación, designado fijado arriba |
| `src/lib/sagas/resolve-route.ts` (+ test) | `unnamedMembers` |
| `src/components/saga/route-view.tsx` | lo que el designado no nombra, al final y sin número |
| `src/lib/sagas/window-owners.ts` (+ test) | **nuevo**: `windowOwnerFor`, `buildWindowOwners`, `loadWindowOwners` |
| `src/lib/sagas/sequence-draft.ts` (+ test) | `NestedSubject`, `ownerSagaId`, `draftWindowOwners`, `toPayload(d, sagaId)` |
| `src/lib/sagas/get-saga-sequence.ts` (+ test) | carga los sujetos anidados y sus ventanas |
| `src/lib/sagas/validate-sequence-draft.ts` (+ test) | `windowOwners` en vez de derivar `free` del payload |
| `src/lib/sagas/sequence-actions.ts` | resuelve dueños en servidor y manda `p_window_subjects` |
| `supabase/migrations/20260730_save_saga_sequence_subjects.sql` | **nuevo**: RPC de 6 argumentos, borrado explícito |
| `src/components/saga/sequence/window-editor.tsx` | prop genérica (`subject`) en vez de `entry` |
| `src/components/saga/sequence/block-windows-drawer.tsx` | **nuevo**: el cajón |
| `shell-desktop.tsx`, `shell-mobile.tsx`, `use-sequence-draft.ts`, `sequence-editor.tsx` | montan el cajón y enganchan las ops |
| `e2e/sagas-orden-designado.spec.ts`, `e2e/sagas-ventana-anidada.spec.ts` | **nuevos** |
| `supabase/migrations/20260731_drop_save_saga_sequence_v5.sql` | **se aplica DESPUÉS de desplegar** |

---

### Task 1: La columna designada y la regla del selector

**Files:**
- Create: `supabase/migrations/20260730_saga_routes_is_reading_order.sql`
- Modify: `src/lib/sagas/get-saga-routes.ts`, `src/lib/sagas/get-saga-routes.test.ts`, `src/lib/sagas/route-types.ts`, `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: `CuratedRouteRow` con `isReadingOrder: boolean`; `sortCuratedRoutes(routes: CuratedRouteRow[]): CuratedRouteRow[]`; `buildRouteList` con la regla nueva; `SagaRoute` con `isReadingOrder: boolean`.

- [ ] **Step 1: Escribir la migración**

Crea `supabase/migrations/20260730_saga_routes_is_reading_order.sql`:

```sql
-- supabase/migrations/20260730_saga_routes_is_reading_order.sql
--
-- Fase 4 (A): el curador DESIGNA cuál de sus itinerarios ocupa el puesto de
-- «Orden de lectura» en la ficha. Hasta hoy el selector ofrecía dos chips que
-- prometen lo mismo: la ruta sintética «lectura» (el mapa derivado) y un
-- itinerario curado que suele llamarse «Orden recomendado».
--
-- Por qué un booleano y no una fila en `saga_routes` con slug «lectura»: ese
-- slug lo prohíbe el CHECK saga_routes_slug_not_reserved a propósito —
-- materializar lo derivado es la familia de fallo del #91. Un booleano compra
-- exactamente lo mismo sin congelar nada.
--
-- SIN BACKFILL a propósito: la decisión es del curador, no automática.
-- Designar cambia la vista POR DEFECTO de esa saga, así que no se hace en su
-- nombre.
alter table public.saga_routes
  add column is_reading_order boolean not null default false;

-- Uno como mucho por saga. Parcial: las filas en `false` son la inmensa
-- mayoría y no deben competir por el unique.
create unique index saga_routes_reading_order_key
  on public.saga_routes (saga_id) where is_reading_order;

comment on column public.saga_routes.is_reading_order is
  'true = este itinerario ocupa el puesto y la etiqueta de «Orden de lectura» en la ficha, y la ruta sintética «lectura» deja de ofrecerse. La fila NO se renombra: la etiqueta la pone buildRouteList.';
```

- [ ] **Step 2: Aplicarla en dev y verificarla**

Aplícala con `mcp__supabase-dev__apply_migration` (name: `saga_routes_is_reading_order`) y verifica **contra el catálogo**, no contra `list_migrations`:

```sql
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_name = 'saga_routes' and column_name = 'is_reading_order';
select indexname, indexdef from pg_indexes
 where tablename = 'saga_routes' and indexname = 'saga_routes_reading_order_key';
```

Esperado: una fila `boolean / NO / false`, y un índice `UNIQUE ... (saga_id) WHERE is_reading_order`.

- [ ] **Step 3: Regenerar `database.types.ts`**

Ejecuta `mcp__supabase-dev__generate_typescript_types` y vuelca el resultado en `src/lib/supabase/database.types.ts`. Comprueba que `saga_routes.Row` ahora tiene `is_reading_order: boolean`. **No lo edites a mano.**

- [ ] **Step 4: Escribir las pruebas que fallan**

Los literales de `CuratedRouteRow` que ya hay en `src/lib/sagas/get-saga-routes.test.ts` van a dejar de compilar: añádeles `isReadingOrder: false` a todos. Después, añade al final del `describe("buildRouteList", ...)`:

```ts
  it("con un itinerario designado, «lectura» no se ofrece y el designado ocupa su puesto y su etiqueta", () => {
    const list = buildRouteList(
      [
        { id: "route-muerte", slug: "muerte", name: "La Muerte", summary: null, position: 2, isReadingOrder: false },
        { id: "route-reco", slug: "orden-recomendado", name: "Orden recomendado", summary: "Del autor", position: 1, isReadingOrder: true },
      ],
      labels,
      true,
    );
    expect(list.map((r) => r.slug)).toEqual(["orden-recomendado", "muerte", "publicacion"]);
    // La etiqueta la pone el chip; la fila NO se renombra en BD.
    expect(list[0].name).toBe("Orden de lectura");
    expect(list[0].summary).toBe("Del autor");
    expect(list[0].synthetic).toBe(false);
    expect(list[0].id).toBe("route-reco");
    expect(list[0].isReadingOrder).toBe(true);
  });

  it("el designado va PRIMERO aunque su position sea la última", () => {
    const list = buildRouteList(
      [
        { id: "a", slug: "a", name: "Ana", summary: null, position: 1, isReadingOrder: false },
        { id: "b", slug: "b", name: "Beto", summary: null, position: 9, isReadingOrder: true },
      ],
      labels,
      true,
    );
    expect(list.map((r) => r.slug)).toEqual(["b", "a", "publicacion"]);
  });

  it("sin designado, todo sigue exactamente como hoy", () => {
    const list = buildRouteList(
      [{ id: "route-guardia", slug: "guardia", name: "La Guardia", summary: null, position: 1, isReadingOrder: false }],
      labels,
      true,
    );
    expect(list.map((r) => r.slug)).toEqual(["lectura", "guardia", "publicacion"]);
    expect(list.every((r) => r.isReadingOrder === false)).toBe(true);
  });

  it("hasGraph=false y designado: «lectura» no vuelve por la puerta de atrás", () => {
    const list = buildRouteList(
      [{ id: "r", slug: "reco", name: "Orden recomendado", summary: null, position: 1, isReadingOrder: true }],
      labels,
      false,
    );
    expect(list.map((r) => r.slug)).toEqual(["reco", "publicacion"]);
    expect(list[0].name).toBe("Orden de lectura");
  });
```

Y un `describe` nuevo para el orden compartido (importa `sortCuratedRoutes` en la línea 2 del fichero):

```ts
describe("sortCuratedRoutes", () => {
  it("el designado primero, el resto por position y nombre", () => {
    const rows: CuratedRouteRow[] = [
      { id: "c", slug: "c", name: "Ceci", summary: null, position: 3, isReadingOrder: false },
      { id: "a", slug: "a", name: "Ana", summary: null, position: 1, isReadingOrder: false },
      { id: "d", slug: "d", name: "Dani", summary: null, position: 9, isReadingOrder: true },
    ];
    expect(sortCuratedRoutes(rows).map((r) => r.id)).toEqual(["d", "a", "c"]);
  });

  it("no muta la lista que recibe", () => {
    const rows: CuratedRouteRow[] = [
      { id: "a", slug: "a", name: "Ana", summary: null, position: 2, isReadingOrder: false },
      { id: "b", slug: "b", name: "Beto", summary: null, position: 1, isReadingOrder: true },
    ];
    sortCuratedRoutes(rows);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 5: Ejecutar las pruebas para verlas fallar**

Run: `fnm use 22 && npx vitest run src/lib/sagas/get-saga-routes.test.ts`
Expected: FAIL — `sortCuratedRoutes is not a function` y los `expect` de designación.

- [ ] **Step 6: Implementar**

En `src/lib/sagas/route-types.ts`, dentro de `SagaRoute`, después de `id?: string;`:

```ts
  /**
   * true = esta ruta OCUPA el puesto de «Orden de lectura» (fase 4). Siempre
   * false en las sintéticas. La ficha lo usa para una sola cosa: listar debajo
   * lo que el itinerario no nombra (route-view.tsx). El puesto y la etiqueta ya
   * vienen resueltos en `name` y en el orden de la lista.
   */
  isReadingOrder: boolean;
```

En `src/lib/sagas/get-saga-routes.ts`, añade el campo al tipo:

```ts
export type CuratedRouteRow = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  position: number;
  /** true = ocupa el puesto de «Orden de lectura» (fase 4). Uno como mucho por
   *  saga; lo impone el unique parcial saga_routes_reading_order_key. */
  isReadingOrder: boolean;
};
```

Debajo de `compareRoutePosition`, añade:

```ts
/**
 * Orden en que se VEN las rutas curadas: el designado ocupa el puesto de
 * «Orden de lectura», que es el primero; el resto por `compareRoutePosition`.
 *
 * Función aparte, y no una rama dentro de `compareRoutePosition`, porque los
 * dos criterios responden a preguntas distintas: `compareRoutePosition` es el
 * orden que el curador ALMACENA (lo que mueven las flechas de /rutas, vía
 * computeMovedPositions), y este es el orden en que se PINTA. Meter la
 * designación en el comparador de almacenamiento dejaría las flechas moviendo
 * `position` sin ningún efecto visible sobre el designado, que está fijado
 * arriba por su designación y no por su número.
 */
export function sortCuratedRoutes(routes: CuratedRouteRow[]): CuratedRouteRow[] {
  return [...routes].sort(
    (a, b) => Number(b.isReadingOrder) - Number(a.isReadingOrder) || compareRoutePosition(a, b),
  );
}
```

Sustituye `buildRouteList` entero por:

```ts
/**
 * Orden del selector: lectura → curadas (por position) → publicación.
 *
 * Fase 4: si una curada está DESIGNADA (`isReadingOrder`), la sintética
 * «lectura» no se ofrece — su puesto (el primero) y su etiqueta los ocupa la
 * designada. La fila NO se renombra en BD: `saga_routes.name` no tiene unique,
 * así que renombrarla dejaría dos chips con el mismo texto en cuanto alguien
 * la desdesignara.
 */
export function buildRouteList(
  curated: CuratedRouteRow[],
  labels: { lectura: string; publicacion: string },
  hasGraph: boolean,
): SagaRoute[] {
  const ordered = sortCuratedRoutes(curated);
  const hasDesignated = ordered.some((c) => c.isReadingOrder);

  const out: SagaRoute[] = [];
  if (hasGraph && !hasDesignated) {
    out.push({
      slug: "lectura",
      name: labels.lectura,
      summary: null,
      synthetic: true,
      isReadingOrder: false,
    });
  }
  for (const c of ordered) {
    // El id viaja para que RouteView pueda localizar la fila activa en
    // detail.routes sin volver a consultar saga_routes (hallazgo 3). Las
    // sintéticas de arriba/abajo no llevan id: no tienen fila.
    out.push({
      id: c.id,
      slug: c.slug,
      name: c.isReadingOrder ? labels.lectura : c.name,
      summary: c.summary,
      synthetic: false,
      isReadingOrder: c.isReadingOrder,
    });
  }
  out.push({
    slug: "publicacion",
    name: labels.publicacion,
    summary: null,
    synthetic: true,
    isReadingOrder: false,
  });
  return out;
}
```

Y `getSagaRoutes` pasa a seleccionar la columna y a mapear snake→camel (antes casteaba directo, que ya no vale porque el nombre del campo cambia):

```ts
export async function getSagaRoutes(supabase: SupabaseServerClient, sagaId: string) {
  const { data } = await supabase
    .from("saga_routes")
    .select("id, slug, name, summary, position, is_reading_order")
    .eq("saga_id", sagaId)
    .order("position", { ascending: true });
  return ((data ?? []) as Array<{
    id: string;
    slug: string;
    name: string;
    summary: string | null;
    position: number;
    is_reading_order: boolean;
  }>).map(
    (r): CuratedRouteRow => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      summary: r.summary,
      position: r.position,
      isReadingOrder: r.is_reading_order,
    }),
  );
}
```

- [ ] **Step 7: Verificar**

Run: `fnm use 22 && npx vitest run src/lib/sagas/get-saga-routes.test.ts && npx tsc --noEmit`
Expected: PASS en vitest. `tsc` puede quejarse donde se construya un `CuratedRouteRow` o un `SagaRoute` a mano — arréglalos añadiendo `isReadingOrder: false`. **No** añadas todavía UI de designación.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260730_saga_routes_is_reading_order.sql src/lib/sagas/get-saga-routes.ts src/lib/sagas/get-saga-routes.test.ts src/lib/sagas/route-types.ts src/lib/supabase/database.types.ts && git commit -m "feat(sagas): un itinerario puede ocupar el puesto de «Orden de lectura»"
```

---

### Task 2: Designar desde `/saga/[id]/rutas`

**Files:**
- Create: `src/components/saga/reading-order-picker.tsx`
- Modify: `src/lib/sagas/route-actions.ts`, `src/components/saga/route-list.tsx`, `src/app/saga/[id]/rutas/page.tsx`, `messages/es.json`

**Interfaces:**
- Consumes: `CuratedRouteRow.isReadingOrder`, `sortCuratedRoutes` (Task 1).
- Produces: `setReadingOrder(sagaId: string, routeId: string | null): Promise<{ error?: "emptyRoute" | "forbidden" | "generic" }>`.

- [ ] **Step 1: El server action**

En `src/lib/sagas/route-actions.ts`, después de `moveRoute`, añade:

```ts
// Designar el «Orden de lectura» de una saga (fase 4). Con un itinerario
// designado, la ruta sintética «lectura» deja de ofrecerse: su puesto y su
// etiqueta los ocupa el designado (buildRouteList). Mismo gate duro
// collaborator+ que el resto de este fichero.
export async function setReadingOrder(
  sagaId: string,
  routeId: string | null,
): Promise<{ error?: "emptyRoute" | "forbidden" | "generic" }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) return { error: "forbidden" };

  if (routeId !== null) {
    // Un itinerario SIN PASOS no puede ocupar el puesto: el flujo normal es
    // crear la fila y editar los pasos después, así que ese estado existe de
    // verdad — y cederle el puesto dejaría la ficha con un chip que no lleva a
    // ninguna parte Y sin la ruta derivada, que es la que sí tiene contenido.
    const { count, error: countError } = await supabase
      .from("saga_route_entries")
      .select("route_id", { count: "exact", head: true })
      .eq("route_id", routeId);
    if (countError) return { error: "generic" };
    if ((count ?? 0) === 0) return { error: "emptyRoute" };
  }

  // Limpiar SIEMPRE primero. El unique parcial `(saga_id) where
  // is_reading_order` rechaza una segunda fila en true, así que designar antes
  // de desdesignar da 23505. Las dos escrituras no son atómicas: el peor caso
  // es quedarse sin designado (estado válido, se reintenta), nunca con dos.
  const { error: clearError } = await supabase
    .from("saga_routes")
    .update({ is_reading_order: false })
    .eq("saga_id", sagaId)
    .eq("is_reading_order", true);
  if (clearError) return { error: "generic" };

  if (routeId !== null) {
    // `eq("saga_id", sagaId)` además del id: impide que una petición manipulada
    // designe un itinerario de otra saga.
    const { error } = await supabase
      .from("saga_routes")
      .update({ is_reading_order: true })
      .eq("id", routeId)
      .eq("saga_id", sagaId);
    if (error) return { error: "generic" };
  }

  revalidateSagaPage(sagaId);
  return {};
}
```

- [ ] **Step 2: La otra mitad de la guarda, en `saveRoute`**

Desde la misma pantalla de pasos se puede vaciar el itinerario designado, así que la guarda de arriba no basta. Dentro de `saveRoute`, **entre** el `if (problems.length > 0) return ...` y la llamada a `supabase.rpc("save_saga_route", ...)`, inserta:

```ts
  // La otra mitad de la guarda de `setReadingOrder`: no se puede dejar sin
  // pasos al itinerario que ocupa el puesto de «Orden de lectura». Solo se
  // consulta cuando el borrador se queda a cero, así que el guardado normal no
  // paga nada.
  if (entries.length === 0) {
    const { data: row } = await supabase
      .from("saga_routes")
      .select("is_reading_order")
      .eq("id", routeId)
      .maybeSingle();
    if ((row as { is_reading_order: boolean } | null)?.is_reading_order) {
      return { error: "readingOrderEmpty" };
    }
  }
```

- [ ] **Step 3: Los literales**

En `messages/es.json`, dentro de `sagaEditor.routeErrors`, añade:

```json
      "emptyRoute": "Un itinerario sin pasos no puede ser el orden de lectura. Añádele pasos primero.",
      "readingOrderEmpty": "Este itinerario es el orden de lectura de la saga: no puede quedarse sin pasos. Quítale antes la designación."
```

Y en `sagaEditor`, junto a `routesTitle`:

```json
    "readingOrderTitle": "Cuál es el orden de lectura",
    "readingOrderHint": "El que elijas ocupa el puesto de «Orden de lectura» en la ficha, y el mapa generado deja de ofrecerse como ruta aparte. Los demás itinerarios siguen ahí.",
    "readingOrderNone": "Ninguno — que la ficha use el mapa generado",
    "readingOrderBadge": "Orden de lectura",
    "readingOrderSave": "Guardar elección",
```

- [ ] **Step 4: El selector de radios**

Crea `src/components/saga/reading-order-picker.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { setReadingOrder } from "@/lib/sagas/route-actions";
import { sortCuratedRoutes, type CuratedRouteRow } from "@/lib/sagas/get-saga-routes";
import { Button } from "@/components/ui/button";

/** Designación del «Orden de lectura» de una saga (fase 4). Radios nativos
 *  —`<fieldset>` + `<input type="radio">` dentro de `<label>`— por el mismo
 *  criterio que `anchor-picker.tsx`/`tandem-picker.tsx`: un `radiogroup` a mano
 *  promete una semántica de teclado que no cumple.
 *
 *  «Ninguno» es una opción de verdad, no un botón de borrar: devolverle el
 *  puesto al mapa generado es una elección tan legítima como designar. */
export function ReadingOrderPicker({ sagaId, routes }: { sagaId: string; routes: CuratedRouteRow[] }) {
  const t = useTranslations("sagaEditor");
  const router = useRouter();
  const ordered = sortCuratedRoutes(routes);
  const current = ordered.find((r) => r.isReadingOrder)?.id ?? "";

  const [chosen, setChosen] = useState<string>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await setReadingOrder(sagaId, chosen === "" ? null : chosen);
      if (result.error) {
        setError(result.error);
        // La elección local vuelve a lo que hay en BD: si no, el radio se queda
        // marcado en algo que no se guardó.
        setChosen(current);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-border p-3">
      <h2 className="text-[13px] font-semibold">{t("readingOrderTitle")}</h2>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{t("readingOrderHint")}</p>
      <fieldset className="mt-2 grid gap-1" disabled={pending}>
        <legend className="sr-only">{t("readingOrderTitle")}</legend>
        {[{ id: "", name: t("readingOrderNone") }, ...ordered].map((option) => (
          <label key={option.id} className="flex items-center gap-2 text-[12.5px]">
            <input
              type="radio"
              name="reading-order"
              value={option.id}
              checked={chosen === option.id}
              onChange={() => setChosen(option.id)}
              className="h-4 w-4 border-border"
            />
            <span className="min-w-0 truncate">{option.name}</span>
          </label>
        ))}
      </fieldset>
      <div className="mt-2 flex items-center justify-end gap-2" aria-live="polite">
        {error && <p className="mr-auto text-xs text-status-dropped">{t(`routeErrors.${error}`)}</p>}
        <Button type="button" disabled={pending || chosen === current} onClick={submit}>
          {pending ? t("routeSaving") : t("readingOrderSave")}
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Fijar el designado arriba en la lista, sin flechas**

En `src/components/saga/route-list.tsx`, cambia el import de la línea 8 a:

```ts
import { sortCuratedRoutes, type CuratedRouteRow } from "@/lib/sagas/get-saga-routes";
```

Sustituye el cuerpo de `RouteList` por:

```tsx
export function RouteList({ sagaId, routes }: { sagaId: string; routes: CuratedRouteRow[] }) {
  // Mismo criterio de orden que ve el lector en el selector (buildRouteList, vía
  // sortCuratedRoutes): así "subir/bajar" aquí coincide siempre con lo que se ve
  // en la ficha.
  const ordered = sortCuratedRoutes(routes);
  // El designado está FIJADO arriba por su designación, no por su `position`:
  // sus flechas moverían `position` sin ningún efecto visible. Así que no las
  // lleva, y los extremos del resto se calculan sobre la sublista movible.
  const movable = ordered.filter((r) => !r.isReadingOrder);

  return (
    <ul className="flex flex-col gap-2">
      {ordered.map((route) => {
        const index = movable.findIndex((r) => r.id === route.id);
        return (
          <RouteRow
            key={route.id}
            sagaId={sagaId}
            route={route}
            pinned={route.isReadingOrder}
            isFirst={index <= 0}
            isLast={index === movable.length - 1}
          />
        );
      })}
    </ul>
  );
}
```

En `RouteRow`, añade `pinned` a la desestructuración y al tipo de props (`pinned: boolean;`), y sustituye el bloque de las dos flechas (`<div className="flex shrink-0 flex-col">…</div>`, dentro del `return` final) por:

```tsx
        {pinned ? (
          <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
            {t("readingOrderBadge")}
          </span>
        ) : (
          <div className="flex shrink-0 flex-col">
            <button
              type="button"
              disabled={busy || isFirst}
              onClick={() => move("up")}
              aria-label={t("routeMoveUp")}
              className="leading-none text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={busy || isLast}
              onClick={() => move("down")}
              aria-label={t("routeMoveDown")}
              className="leading-none text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              ↓
            </button>
          </div>
        )}
```

- [ ] **Step 6: Montarlo en la página**

En `src/app/saga/[id]/rutas/page.tsx`, añade el import:

```ts
import { ReadingOrderPicker } from "@/components/saga/reading-order-picker";
```

y entre el bloque de la lista y `<CreateRouteForm sagaId={id} />`:

```tsx
      {routes.length > 0 && <ReadingOrderPicker sagaId={id} routes={routes} />}
```

- [ ] **Step 7: Comprobar a mano en dev**

Levanta el preview (`preview_start`; si no existe `.claude/launch.json`, créalo con `npm run dev` en el 3000) y entra en `/saga/33d7bb93-da3d-4453-a6da-1722beff134d/rutas` — `[QA Itinerarios] Universo`, que tiene el itinerario `la-guardia` con 1 paso.

1. Designa «La Guardia», guarda, y en `/saga/33d7bb93-da3d-4453-a6da-1722beff134d?tab=mapa` comprueba que el primer chip dice **«Orden de lectura»** y que no hay chip «La Guardia».
2. Vuelve a `/rutas`, marca «Ninguno», guarda, y comprueba que el chip vuelve a decir «La Guardia».
3. Crea un itinerario nuevo (sin pasos) e intenta designarlo: tiene que salir el mensaje de `emptyRoute` y el radio volver a donde estaba.

Deja el estado como lo encontraste: ninguno designado y el itinerario de prueba borrado.

- [ ] **Step 8: Verificar y commit**

Run: `fnm use 22 && npx tsc --noEmit && npx eslint src/components/saga src/lib/sagas && npx vitest run src/lib/sagas`
Expected: limpio y verde.

```bash
git add src/lib/sagas/route-actions.ts src/components/saga/route-list.tsx src/components/saga/reading-order-picker.tsx "src/app/saga/[id]/rutas/page.tsx" messages/es.json && git commit -m "feat(sagas): designar el orden de lectura desde la gestión de itinerarios"
```

---

### Task 3: Lo que el itinerario designado no nombra

**Files:**
- Modify: `src/lib/sagas/resolve-route.ts`, `src/lib/sagas/resolve-route.test.ts`, `src/components/saga/route-view.tsx`, `messages/es.json`

**Interfaces:**
- Consumes: `SagaRoute.isReadingOrder` (Task 1).
- Produces: `unnamedMembers(resolved: ResolvedRoute, orderedKeys: string[], members: Map<string, DetailMember>): DetailMember[]`.

- [ ] **Step 1: Escribir la prueba que falla**

Añade al final de `src/lib/sagas/resolve-route.test.ts` (y `unnamedMembers` al import de la cabecera; si el fichero ya tiene un helper para construir `DetailMember`, usa ese en vez del `member` de aquí):

```ts
describe("unnamedMembers", () => {
  const member = (id: string, title: string): DetailMember =>
    ({
      itemType: "book", itemId: id, title, coverUrl: null, href: `/libro/${id}`,
      position: null, role: null, placement: null, optional: false,
      status: null, groupSagaId: null, ownerSagaId: "saga", year: null,
    }) as DetailMember;

  const a = member("a", "Ana");
  const b = member("b", "Beto");
  const c = member("c", "Ceci");
  const members = new Map([["book:a", a], ["book:b", b], ["book:c", c]]);

  it("devuelve lo que la ruta no nombra, en el orden de la ficha", () => {
    const resolved = { steps: [{ kind: "item" as const, member: b, note: null }], total: 1, completed: 0 };
    expect(unnamedMembers(resolved, ["book:a", "book:b", "book:c"], members)).toEqual([a, c]);
  });

  it("una obra nombrada DENTRO de un bloque no se lista otra vez", () => {
    const resolved = {
      steps: [{ kind: "block" as const, sagaId: "s", name: "S", accent: "beige" as const, members: [a, c], note: null }],
      total: 2,
      completed: 0,
    };
    expect(unnamedMembers(resolved, ["book:a", "book:b", "book:c"], members)).toEqual([b]);
  });

  it("una ruta que lo nombra todo no deja nada debajo", () => {
    const resolved = {
      steps: [
        { kind: "item" as const, member: a, note: null },
        { kind: "item" as const, member: b, note: null },
        { kind: "item" as const, member: c, note: null },
      ],
      total: 3,
      completed: 0,
    };
    expect(unnamedMembers(resolved, ["book:a", "book:b", "book:c"], members)).toEqual([]);
  });

  it("una clave del orden sin miembro resuelto se descarta en silencio", () => {
    const resolved = { steps: [], total: 0, completed: 0 };
    expect(unnamedMembers(resolved, ["book:a", "book:fantasma"], members)).toEqual([a]);
  });
});
```

- [ ] **Step 2: Ejecutarla para verla fallar**

Run: `fnm use 22 && npx vitest run src/lib/sagas/resolve-route.test.ts`
Expected: FAIL — `unnamedMembers is not a function`.

- [ ] **Step 3: Implementar la función pura**

Al final de `src/lib/sagas/resolve-route.ts`:

```ts
/**
 * Los miembros del subárbol que el itinerario NO nombra, en el orden de la
 * ficha (las claves que le pasen; el llamante usa `createCuratedOrder`).
 *
 * Solo se pinta bajo el itinerario DESIGNADO (fase 4): un itinerario parcial
 * —«solo lo esencial»— es un caso de uso legítimo, y listarle debajo todo lo
 * demás sería ruido. Bajo el designado sí hace falta, porque es la vista por
 * defecto de la saga y nadie debe desaparecer de su propia saga por no tener
 * puesto.
 *
 * Cuenta como nombrada la obra que aparece DENTRO de un paso-bloque, no solo la
 * que es paso por sí misma: si no, expandir un bloque de 8 obras las listaría a
 * las 8 otra vez debajo.
 */
export function unnamedMembers(
  resolved: ResolvedRoute,
  orderedKeys: string[],
  members: Map<string, DetailMember>,
): DetailMember[] {
  const named = new Set<string>();
  for (const step of resolved.steps) {
    if (step.kind === "item") named.add(keyOf(step.member));
    else for (const m of step.members) named.add(keyOf(m));
  }
  return orderedKeys
    .filter((k) => !named.has(k))
    .flatMap((k) => {
      const m = members.get(k);
      return m ? [m] : [];
    });
}
```

- [ ] **Step 4: Verificar**

Run: `fnm use 22 && npx vitest run src/lib/sagas/resolve-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Los literales**

En `messages/es.json`, dentro de `saga`, junto a `routeEmpty`:

```json
    "routeUnnamedTitle": "Sin puesto en este itinerario",
    "routeUnnamedHint": "Forman parte de la saga, pero este itinerario no dice cuándo leerlos.",
```

- [ ] **Step 6: Pintarlo en la ficha**

En `src/components/saga/route-view.tsx`, añade `unnamedMembers` al import de `@/lib/sagas/resolve-route`, y **después** del `const resolved = resolveRoute(...)`:

```tsx
  // Solo bajo el DESIGNADO (fase 4): es la vista por defecto de la saga, así que
  // lo que no nombra tiene que seguir viéndose. Sin contador («19 de 20») a
  // propósito: sería una TERCERA regla de recuento en la ficha — el hero ya
  // cuenta con countedKeys (que excluye lo `optional`) y la cabecera de arriba
  // cuenta los pasos de la ruta. Enseñar la lista es honesto; enseñar un número
  // que no cuadra con el de arriba, no.
  const unnamed = row.isReadingOrder ? unnamedMembers(resolved, mainOrder(detail.saga.id), members) : [];
```

Y justo antes del `</div>` final del componente, tras el bloque de `resolved.steps`:

```tsx
      {unnamed.length > 0 && (
        <section className="mt-2 border-t border-border pt-3">
          <h4 className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {t("routeUnnamedTitle")}
          </h4>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t("routeUnnamedHint")}</p>
          <ul className="mt-2 divide-y divide-border border-t border-border">
            {unnamed.map((m) => (
              <li key={`${m.itemType}:${m.itemId}`}>
                <Link href={m.href} className="flex items-center gap-3 py-2.5">
                  {/* Sin número, con «·»: exactamente como el mapa pinta lo que
                      no tiene hueco (#167). Numerarlos les atribuiría un puesto
                      que el curador no les dio. */}
                  <span className="w-6 shrink-0 text-right font-mono text-[11px] text-foreground-faint">·</span>
                  <span className="relative h-[45px] w-[30px] shrink-0 overflow-hidden rounded">
                    {m.coverUrl && <Image src={m.coverUrl} alt="" fill sizes="30px" className="object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{m.title}</span>
                  {/* Presentación, no cómputo de avance: el predicado único vive
                      en completion.ts (issue #91). */}
                  {isMemberCompleted(m) && <span className="shrink-0 text-xs text-success">✓</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
```

- [ ] **Step 7: Comprobar a mano en dev**

Con el preview levantado, designa `la-guardia` en `[QA Itinerarios] Universo` (`/saga/33d7bb93-da3d-4453-a6da-1722beff134d/rutas`) y entra en su pestaña Mapa. El itinerario tiene **un** paso (el bloque «La Guardia», que expande 2 obras) y la saga tiene 3 miembros: debajo tiene que salir **«Ronda de noche»** con «·» y **sin contador**. Desdesígnalo y comprueba que la sección desaparece.

Deja el estado como lo encontraste.

- [ ] **Step 8: Verificar y commit**

Run: `fnm use 22 && npx tsc --noEmit && npx vitest run src/lib/sagas`

```bash
git add src/lib/sagas/resolve-route.ts src/lib/sagas/resolve-route.test.ts src/components/saga/route-view.tsx messages/es.json && git commit -m "feat(sagas): el itinerario designado enseña debajo lo que no nombra"
```

---

### Task 4: Quién es la dueña de una ventana, y los sujetos anidados

**Files:**
- Create: `src/lib/sagas/window-owners.ts`, `src/lib/sagas/window-owners.test.ts`
- Modify: `src/lib/sagas/sequence-draft.ts`, `src/lib/sagas/sequence-draft.test.ts`, `src/lib/sagas/get-saga-sequence.ts`, `src/lib/sagas/get-saga-sequence.test.ts`, `src/components/saga/sequence/sequence-editor.tsx`

**Interfaces:**
- Produces:
  - `windowOwnerFor(memberships: Array<{ sagaId: string; isPrimary: boolean }>, curatedSagaId: string): string`
  - `buildWindowOwners(rows: OwnerRow[], blocks: OwnerBlock[], curatedSagaId: string): Map<string, string>`
  - `loadWindowOwners(supabase, sagaId): Promise<Map<string, string>>`
  - `NestedSubject`; `SequenceDraft.nested`; `DraftEntry.ownerSagaId`; `draftWindowOwners(d)`
  - `hydrateSequenceDraft(rows, nested?)`

- [ ] **Step 1: Escribir las pruebas puras que fallan**

Crea `src/lib/sagas/window-owners.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildWindowOwners, windowOwnerFor, type OwnerBlock, type OwnerRow } from "./window-owners";

const PADRE = "11111111-1111-1111-1111-111111111111";
const HIJA = "22222222-2222-2222-2222-222222222222";
const HERMANA = "33333333-3333-3333-3333-333333333333";

describe("windowOwnerFor", () => {
  it("manda is_primary", () => {
    expect(windowOwnerFor([{ sagaId: HIJA, isPrimary: false }, { sagaId: PADRE, isPrimary: true }], PADRE)).toBe(PADRE);
    expect(windowOwnerFor([{ sagaId: HIJA, isPrimary: true }, { sagaId: PADRE, isPrimary: false }], PADRE)).toBe(HIJA);
  });

  it("sin ninguna principal, gana la saga que se está curando si está entre ellas", () => {
    expect(windowOwnerFor([{ sagaId: HERMANA, isPrimary: false }, { sagaId: PADRE, isPrimary: false }], PADRE)).toBe(PADRE);
  });

  it("sin principal y sin la curada, desempata por id — determinista, no por orden de llegada", () => {
    const a = windowOwnerFor([{ sagaId: HERMANA, isPrimary: false }, { sagaId: HIJA, isPrimary: false }], PADRE);
    const b = windowOwnerFor([{ sagaId: HIJA, isPrimary: false }, { sagaId: HERMANA, isPrimary: false }], PADRE);
    expect(a).toBe(HIJA);
    expect(a).toBe(b);
  });

  it("sin membresías devuelve la curada: función total, nunca lanza", () => {
    expect(windowOwnerFor([], PADRE)).toBe(PADRE);
  });
});

describe("buildWindowOwners", () => {
  const row = (sagaId: string, itemId: string, placement: OwnerRow["placement"], isPrimary = true): OwnerRow => ({
    sagaId, itemType: "book", itemId, placement, isPrimary,
  });

  it("solo lo `libre` es sujeto: una obra con hueco fijo YA tiene sitio", () => {
    const owners = buildWindowOwners([row(PADRE, "a", "fijo"), row(PADRE, "b", "libre")], [], PADRE);
    expect([...owners.keys()]).toEqual(["i:book:b"]);
    expect(owners.get("i:book:b")).toBe(PADRE);
  });

  it("una obra `libre` de la HIJA es sujeto, y su fila vive bajo la hija", () => {
    expect(buildWindowOwners([row(HIJA, "c", "libre")], [], PADRE).get("i:book:c")).toBe(HIJA);
  });

  it("sin clasificar tampoco es sujeto", () => {
    expect(buildWindowOwners([row(PADRE, "a", null)], [], PADRE).size).toBe(0);
  });

  it("doble membresía: basta con que UNA sea libre, y la dueña la decide is_primary", () => {
    const owners = buildWindowOwners(
      [row(PADRE, "d", "fijo", false), row(HIJA, "d", "libre", true)],
      [],
      PADRE,
    );
    expect(owners.get("i:book:d")).toBe(HIJA);
  });

  it("un BLOQUE libre es sujeto, y su fila vive bajo el padre que lo coloca", () => {
    const blocks: OwnerBlock[] = [
      { childSagaId: HIJA, placementInParent: "libre" },
      { childSagaId: HERMANA, placementInParent: "fijo" },
    ];
    const owners = buildWindowOwners([], blocks, PADRE);
    expect([...owners.keys()]).toEqual([`s:${HIJA}`]);
    expect(owners.get(`s:${HIJA}`)).toBe(PADRE);
  });
});
```

- [ ] **Step 2: Ejecutarlas para verlas fallar**

Run: `fnm use 22 && npx vitest run src/lib/sagas/window-owners.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar `window-owners.ts`**

Crea `src/lib/sagas/window-owners.ts`:

```ts
import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { SagaPlacement } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Quién es la DUEÑA de la ventana de una obra (fase 4).
//
// Hasta la fase 3 la pregunta no existía: solo se podía curar la ventana de una
// entrada de la propia saga, así que la fila iba bajo esa saga y punto. Desde
// que el editor del padre puede curar la ventana de una obra de su hija hay dos
// pantallas que escriben la MISMA fila, y hace falta una regla — sin ella cada
// una crearía la suya y el unique parcial (saga_id, item_type, item_id) no
// impediría nada, porque los `saga_id` serían distintos.
//
// La regla: la ventana pertenece a la OBRA, no al contexto desde el que se
// cura. Su fila vive bajo la saga dueña de la membresía.

export type OwnerRow = {
  sagaId: string;
  itemType: ItemType;
  itemId: string;
  placement: SagaPlacement | null;
  isPrimary: boolean;
};

export type OwnerBlock = {
  childSagaId: string;
  placementInParent: SagaPlacement | null;
};

/**
 * Dueña de la ventana de una obra a partir de sus membresías: manda
 * `is_primary`; sin ninguna principal, la saga que se está curando si está
 * entre ellas; y si tampoco, la de id menor — determinista en vez de depender
 * del orden en que Postgres devuelva las filas.
 *
 * Total a propósito (no lanza): con la lista vacía devuelve `curatedSagaId`,
 * que es el único valor sensato y el que hace que un dato inesperado degrade en
 * vez de tumbar el guardado entero.
 *
 * Solo ve las membresías que el llamante le pasa, y `loadWindowOwners` solo
 * carga las del padre y sus hijas DIRECTAS. Eso no es una limitación, es la
 * garantía que hace falta: si una obra tuviera su membresía principal en una
 * saga ajena a este subárbol, esta función no la vería y no devolvería un
 * `saga_id` fuera del alcance que el RPC acepta.
 */
export function windowOwnerFor(
  memberships: Array<{ sagaId: string; isPrimary: boolean }>,
  curatedSagaId: string,
): string {
  const primary = memberships.find((m) => m.isPrimary);
  if (primary) return primary.sagaId;
  if (memberships.some((m) => m.sagaId === curatedSagaId)) return curatedSagaId;
  const sorted = [...memberships].sort((a, b) => a.sagaId.localeCompare(b.sagaId));
  return sorted[0]?.sagaId ?? curatedSagaId;
}

/**
 * Sujetos que PUEDEN tener ventana desde el editor de `curatedSagaId`, con la
 * saga bajo la que vive su fila. Clave en el mismo formato que `DraftEntry.key`
 * (`i:<tipo>:<uuid>` / `s:<uuid>`).
 *
 * Solo lo `libre`: una obra con hueco fijo YA tiene sitio, y darle además una
 * ventana es la contradicción que los dos ejes (`placement` y `optional`)
 * existen para evitar. Y hay una razón operativa además de la conceptual: la
 * saga dueña hidrata a `null` la ventana de lo que no es `libre`
 * (get-saga-sequence.ts), así que una ventana sobre algo `fijo` la borraría el
 * primer guardado de esa saga — se perdería en silencio.
 *
 * Basta con que UNA de las membresías de la obra sea `libre`: es la que le da
 * derecho a ventana. La dueña la decide `is_primary`, no esa membresía.
 */
export function buildWindowOwners(
  rows: OwnerRow[],
  blocks: OwnerBlock[],
  curatedSagaId: string,
): Map<string, string> {
  const byKey = new Map<string, OwnerRow[]>();
  for (const r of rows) {
    const key = `i:${r.itemType}:${r.itemId}`;
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }

  const out = new Map<string, string>();
  for (const [key, list] of byKey) {
    if (!list.some((r) => r.placement === "libre")) continue;
    out.set(key, windowOwnerFor(list.map((r) => ({ sagaId: r.sagaId, isPrimary: r.isPrimary })), curatedSagaId));
  }
  // Un BLOQUE `libre` es sujeto igual que una obra, y su fila vive bajo el
  // padre: `sagas.placement_in_parent` es colocación EN el padre, así que es el
  // padre quien la cura. Es el caso de *Nacidos de la Bruma. Era 2* en
  // producción (sujeto bloque, saga_id = Cosmere).
  for (const b of blocks) {
    if (b.placementInParent !== "libre") continue;
    out.set(`s:${b.childSagaId}`, curatedSagaId);
  }
  return out;
}

/** La parte de Supabase: padre + hijas DIRECTAS. Nada más hondo — el editor del
 *  padre solo despliega el cajón de sus hijas directas, así que reclamar
 *  responsabilidad sobre la ventana de un nieto sería borrar filas que esta
 *  pantalla no enseña. */
export async function loadWindowOwners(
  supabase: SupabaseServerClient,
  sagaId: string,
): Promise<Map<string, string>> {
  const { data: childRows } = await supabase
    .from("sagas")
    .select("id, placement_in_parent")
    .eq("parent_saga_id", sagaId);
  const children = (childRows ?? []) as Array<{ id: string; placement_in_parent: SagaPlacement | null }>;

  const { data: itemRows } = await supabase
    .from("saga_items")
    .select("saga_id, item_type, item_id, placement, is_primary")
    .in("saga_id", [sagaId, ...children.map((c) => c.id)]);
  const rows = ((itemRows ?? []) as Array<{
    saga_id: string;
    item_type: ItemType;
    item_id: string;
    placement: SagaPlacement | null;
    is_primary: boolean;
  }>).map(
    (r): OwnerRow => ({
      sagaId: r.saga_id,
      itemType: r.item_type,
      itemId: r.item_id,
      placement: r.placement,
      isPrimary: r.is_primary,
    }),
  );

  return buildWindowOwners(
    rows,
    children.map((c) => ({ childSagaId: c.id, placementInParent: c.placement_in_parent })),
    sagaId,
  );
}
```

- [ ] **Step 4: Verificar las puras**

Run: `fnm use 22 && npx vitest run src/lib/sagas/window-owners.test.ts`
Expected: PASS (10 pruebas).

- [ ] **Step 5: Los tipos del borrador**

En `src/lib/sagas/sequence-draft.ts`, dentro de `DraftEntry` y **antes** de `isNew`:

```ts
  /** Saga bajo la que vive la fila de ventana de esta entrada (fase 4). Para
   *  una entrada propia es casi siempre la saga que se cura; con doble
   *  membresía puede ser otra, y lo decide `windowOwnerFor`. Viaja en el
   *  borrador porque `toPayload` lo necesita para escribir `saga_id` en cada
   *  fila de ventana y en cada sujeto. */
  ownerSagaId: string;
```

Después de `DraftEntry`, el tipo del cajón:

```ts
/** Obra de una subsaga cuya VENTANA se cura desde el editor del padre (fase 4).
 *  No es una `DraftEntry`: el padre no puede moverla, ni renumerarla, ni
 *  marcarla opcional — la #187 sigue cerrada. Lo único suyo que esta pantalla
 *  toca es la ventana. */
export type NestedSubject = {
  /** Mismo formato que `DraftEntry.key` (`i:<tipo>:<uuid>`), y único en todo el
   *  borrador: `getSagaSequence` excluye de `nested` cualquier clave que ya sea
   *  entrada propia, para que `setAnchor`/`clearAnchor` no tengan que
   *  desempatar entre las dos colecciones. */
  key: string;
  /** Saga bajo la que vive su fila de ventana (`windowOwnerFor`). */
  ownerSagaId: string;
  /** Bloque bajo el que se despliega en el cajón. No tiene por qué coincidir
   *  con `ownerSagaId` si la obra tuviera doble membresía. */
  childSagaId: string;
  itemType: ItemType;
  itemId: string;
  title: string;
  coverUrl: string | null;
  window: DraftWindow | null;
};
```

En `SequenceDraft`, tras `removed`:

```ts
  /** Sujetos anidados: obras `libre` de las hijas DIRECTAS, para el cajón bajo
   *  la fila de su bloque (fase 4). No son filas de esta saga y no viajan en
   *  `entries`/`blocks` del payload — solo sus ventanas. */
  nested: NestedSubject[];
```

- [ ] **Step 6: Que `setAnchor`/`clearAnchor` alcancen a los anidados**

Sustituye las dos funciones enteras en `src/lib/sagas/sequence-draft.ts`, y añade `draftWindowOwners` junto a ellas:

```ts
/** Pone un ancla de la ventana. Solo puede tenerla una entrada de la zona
 *  `free` («Cuando quieras») o un SUJETO ANIDADO (fase 4) — fuera de ahí es un
 *  no-op, porque `placement` ni siquiera tiene dónde guardarla. Las claves de
 *  `nested` no chocan con las de las zonas: `getSagaSequence` excluye de
 *  `nested` lo que ya es entrada propia. */
export function setAnchor(
  d: SequenceDraft,
  key: string,
  side: "after" | "before",
  anchor: DraftAnchor,
): SequenceDraft {
  if (d.nested.some((n) => n.key === key)) {
    return {
      ...d,
      nested: d.nested.map((n) =>
        n.key === key
          ? { ...n, window: { ...(n.window ?? { after: null, before: null }), [side]: anchor } }
          : n,
      ),
    };
  }
  if (!d.free.some((e) => e.key === key)) return d;
  return mapEntry(d, key, (e) => {
    const base = e.window ?? { after: null, before: null };
    return { ...e, window: { ...base, [side]: anchor } };
  });
}

/** Quita un ancla. Si era la última, la ventana entera vuelve a `null` — no se
 *  deja un `{ after: null, before: null }` huérfano, que el CHECK de BD
 *  rechazaría igualmente. */
export function clearAnchor(d: SequenceDraft, key: string, side: "after" | "before"): SequenceDraft {
  const drop = (w: DraftWindow | null): DraftWindow | null => {
    if (!w) return null;
    const next = { ...w, [side]: null };
    return next.after === null && next.before === null ? null : next;
  };
  if (d.nested.some((n) => n.key === key)) {
    return { ...d, nested: d.nested.map((n) => (n.key === key ? { ...n, window: drop(n.window) } : n)) };
  }
  return mapEntry(d, key, (e) => ({ ...e, window: drop(e.window) }));
}

/** Sujetos que ESTE borrador puede tener con ventana, y bajo qué saga vive su
 *  fila. Deriva del borrador VIVO —no del servidor— para no repetir el
 *  `foreignBlock` falso de la fase 2a: una entrada que acaba de entrar en
 *  «Cuando quieras» tiene que poder recibir ventana sin recargar la página. El
 *  servidor lo vuelve a resolver contra BD en `saveSequence`, que es la
 *  garantía real. */
export function draftWindowOwners(d: SequenceDraft): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of d.free) out.set(e.key, e.ownerSagaId);
  for (const n of d.nested) out.set(n.key, n.ownerSagaId);
  return out;
}
```

- [ ] **Step 7: Ajustar `hydrateSequenceDraft` y los constructores de entrada**

En `src/lib/sagas/get-saga-sequence.ts`, la firma y el retorno de `hydrateSequenceDraft`:

```ts
export function hydrateSequenceDraft(
  rows: Array<{ entry: DraftEntry; position: number | null; placement: SagaPlacement | null }>,
  nested: NestedSubject[] = [],
): SequenceDraft {
```

```ts
  return { slots, free, unclassified, removed: [], nested };
```

En `src/components/saga/sequence/sequence-editor.tsx`, los dos constructores pasan a recibir la saga, porque la fila que crearán vivirá bajo ella:

```ts
/** Alta desde el buscador de catálogo del rail. `isNew` lo pone `addEntry`. La
 *  fila se creará bajo ESTA saga, así que su dueña es esta saga. */
const entryFromPickedItem = (item: PickedItem, sagaId: string): DraftEntry => ({
  key: `i:${item.itemType}:${item.itemId}`,
  kind: "item", itemType: item.itemType, itemId: item.itemId, childSagaId: null,
  title: item.title, coverUrl: item.coverUrl, accentColor: null, count: null,
  optional: false, role: null, window: null, ownerSagaId: sagaId, isNew: false,
});

const entryFromChildSaga = (child: ChildSagaData, sagaId: string): DraftEntry => ({
  key: `s:${child.id}`,
  kind: "block", itemType: null, itemId: null, childSagaId: child.id,
  title: child.name, coverUrl: null, accentColor: child.accentColor, count: child.count,
  optional: false, role: null, window: null, ownerSagaId: sagaId, isNew: false,
});
```

y sus dos llamadas dentro de `EditorLeftPanel` pasan `sagaId`:

```tsx
      onAddItem={(item: PickedItem) => ops.add(entryFromPickedItem(item, sagaId))}
      onAddBlock={(child: { id: string; name: string }) =>
        ops.add(
          entryFromChildSaga(
            children.find((c) => c.id === child.id) ?? { ...child, accentColor: null, count: 0 },
            sagaId,
          ),
        )
      }
```

- [ ] **Step 8: Cargar los sujetos anidados en `getSagaSequence`**

En `src/lib/sagas/get-saga-sequence.ts`:

1. Añade al import del borrador `NestedSubject`, y un import nuevo:

```ts
import { buildWindowOwners, type OwnerRow } from "./window-owners";
```

2. Encima del `await Promise.all` de la segunda ronda, declara los acumuladores:

```ts
  type ChildItemRow = {
    saga_id: string;
    item_type: ItemType;
    item_id: string;
    placement: SagaPlacement | null;
    is_primary: boolean;
  };
  const childItems: ChildItemRow[] = [];
  let childWindows: RawWindowRow[] = [];
  let anchorTitles = new Map<string, string>();
```

3. Sustituye la IIFE de recuentos por una que traiga también colocación y principalidad, porque las necesitan tanto el recuento como el cajón:

```ts
    // Obras de las hijas DIRECTAS: alimentan el «BLOQUE · 8 OBRAS» de su fila y
    // el cajón de ventanas anidadas (fase 4). Una sola consulta para las dos
    // cosas — antes solo pedía `saga_id` para contar.
    (async () => {
      if (children.length === 0) return;
      const { data } = await supabase
        .from("saga_items")
        .select("saga_id, item_type, item_id, placement, is_primary")
        .in("saga_id", children.map((c) => c.id));
      for (const r of (data ?? []) as ChildItemRow[]) {
        counts.set(r.saga_id, (counts.get(r.saga_id) ?? 0) + 1);
        childItems.push(r);
      }
    })(),
```

4. La IIFE de anclas deja de hidratar dentro (solo guarda los títulos) y su condición se amplía, porque ahora también hacen falta para las ventanas de las hijas:

```ts
    // Anclas del subárbol entero: hacen falta para resolver los títulos de las
    // ventanas propias Y de las anidadas. Se salta el recorrido solo cuando no
    // puede haber ninguna ventana que resolver: ni filas propias ni hijas.
    (async () => {
      if (rawWindows.length === 0 && children.length === 0) return;
      const anchors = await getAnchorOptions(supabase, sagaId);
      anchorTitles = new Map(
        anchors.map((a) => [a.kind === "item" ? `i:${a.itemType}:${a.itemId}` : `s:${a.childSagaId}`, a.title] as const),
      );
    })(),
```

5. Añade una IIFE más a esa misma ronda:

```ts
    // Ventanas de las hijas DIRECTAS (fase 4): el cajón tiene que ENSEÑAR la
    // que la obra ya tenga curada desde su propia saga, en vez de dejar crear
    // una segunda que el unique parcial no impediría (viven bajo `saga_id`
    // distintos). Y enseñarla es además lo que hace que el padre la reemita al
    // guardar, en vez de borrarla.
    (async () => {
      if (children.length === 0) return;
      const { data } = await supabase
        .from("saga_placement_windows")
        .select(
          "item_type, item_id, child_saga_id, after_item_type, after_item_id, after_child_saga_id, before_item_type, before_item_id, before_child_saga_id, created_at",
        )
        .in("saga_id", children.map((c) => c.id));
      childWindows = (data ?? []) as RawWindowRow[];
    })(),
```

6. Justo después del `await Promise.all`, hidrata las propias (esto lo hacía la IIFE de anclas) y resuelve los dueños:

```ts
  windowsByKey = hydrateWindows(rawWindows, anchorTitles);

  // Dueña de cada sujeto anidado. Las MISMAS reglas que aplicará `saveSequence`
  // en servidor: dos derivaciones distintas del dueño acabarían discrepando,
  // que es la familia de la #203.
  const owners = buildWindowOwners(
    childItems.map(
      (r): OwnerRow => ({
        sagaId: r.saga_id, itemType: r.item_type, itemId: r.item_id,
        placement: r.placement, isPrimary: r.is_primary,
      }),
    ),
    [],
    sagaId,
  );
```

7. En el bucle que construye las entradas propias, el campo nuevo. Para una obra:

```ts
        // `owners` se construye SOLO con las filas de las hijas, así que una
        // obra propia sin doble membresía no está ahí y cae en `sagaId`, que es
        // lo correcto: su fila de `saga_items` vive bajo esta saga.
        ownerSagaId: owners.get(`i:${r.item_type}:${r.item_id}`) ?? sagaId,
```

y para un bloque, `ownerSagaId: sagaId,` (la colocación de la hija en el padre es del padre).

8. Después de los dos bucles de `entries`, construye los anidados:

```ts
  // Sujetos anidados: obras `libre` de las hijas directas que NO sean ya fila
  // propia de esta saga — esas se curan en su zona, no en el cajón. Así la
  // clave de un `NestedSubject` nunca choca con la de una `DraftEntry`.
  const nestedWindows = hydrateWindows(childWindows, anchorTitles);
  const ownKeys = new Set(entries.map((e) => e.entry.key));
  const nestedRows = childItems.filter((r) => {
    const key = `i:${r.item_type}:${r.item_id}`;
    return owners.has(key) && !ownKeys.has(key);
  });

  const nestedIds: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const r of nestedRows) nestedIds[r.item_type].push(r.item_id);
  const nestedMeta = new Map<string, { title: string; coverUrl: string | null }>();
  await Promise.all(
    (Object.keys(nestedIds) as ItemType[]).map(async (type) => {
      if (nestedIds[type].length === 0) return;
      const { data } = await supabase
        .from(CATALOG_TABLE[type]).select("id, title, cover_url").in("id", nestedIds[type]);
      for (const r of data ?? []) {
        nestedMeta.set(`${type}:${r.id}`, {
          title: r.title as string,
          coverUrl: (r.cover_url as string | null) ?? null,
        });
      }
    }),
  );

  const nested: NestedSubject[] = nestedRows.flatMap((r) => {
    const m = nestedMeta.get(`${r.item_type}:${r.item_id}`);
    if (!m) return []; // huérfana de catálogo: ni se pinta ni se toca
    const key = `i:${r.item_type}:${r.item_id}`;
    return [{
      key,
      ownerSagaId: owners.get(key)!,
      childSagaId: r.saga_id,
      itemType: r.item_type,
      itemId: r.item_id,
      title: m.title,
      coverUrl: m.coverUrl,
      window: nestedWindows.get(key) ?? null,
    }];
  });
  nested.sort((a, b) => a.title.localeCompare(b.title));
```

9. El retorno pasa a `draft: hydrateSequenceDraft(entries, nested),`.

- [ ] **Step 9: Cubrir el borrador con pruebas**

En `src/lib/sagas/sequence-draft.test.ts`, añade `ownerSagaId: "saga"` a todas las `DraftEntry` que construya y `nested: []` a todos los `SequenceDraft`. Después:

```ts
describe("ventanas de sujetos anidados (fase 4)", () => {
  const nestedSubject = {
    key: "i:book:x", ownerSagaId: "hija", childSagaId: "hija",
    itemType: "book" as const, itemId: "x", title: "Anidada", coverUrl: null, window: null,
  };
  const anchor = { kind: "item" as const, itemType: "book" as const, itemId: "y", childSagaId: null, title: "Ancla" };
  const empty = { slots: [], free: [], unclassified: [], removed: [] };

  it("setAnchor alcanza a un sujeto anidado", () => {
    const next = setAnchor({ ...empty, nested: [nestedSubject] }, "i:book:x", "after", anchor);
    expect(next.nested[0].window).toEqual({ after: anchor, before: null });
  });

  it("clearAnchor deja la ventana anidada a null cuando quita la última ancla", () => {
    const d = { ...empty, nested: [{ ...nestedSubject, window: { after: anchor, before: null } }] };
    expect(clearAnchor(d, "i:book:x", "after").nested[0].window).toBeNull();
  });

  it("una clave que no está ni en `free` ni en `nested` es un no-op", () => {
    const d = { ...empty, nested: [nestedSubject] };
    expect(setAnchor(d, "i:book:fantasma", "after", anchor)).toEqual(d);
  });

  it("draftWindowOwners junta la zona libre y los anidados, con su dueña", () => {
    const free = { ...entry("i:book:a"), ownerSagaId: "padre" };
    const d = { ...empty, free: [free], nested: [nestedSubject] };
    expect(draftWindowOwners(d)).toEqual(new Map([["i:book:a", "padre"], ["i:book:x", "hija"]]));
  });
});
```

(usa el helper que ese fichero ya tenga para construir una `DraftEntry`; si no lo tiene, constrúyela a mano con todos sus campos, incluido `ownerSagaId`.)

- [ ] **Step 10: Verificar**

Run: `fnm use 22 && npx vitest run src/lib/sagas && npx tsc --noEmit`
Expected: verde. `tsc` señalará todos los constructores de `SequenceDraft`/`DraftEntry` que falten por actualizar — arréglalos.

- [ ] **Step 11: Commit**

```bash
git add src/lib/sagas/window-owners.ts src/lib/sagas/window-owners.test.ts src/lib/sagas/sequence-draft.ts src/lib/sagas/sequence-draft.test.ts src/lib/sagas/get-saga-sequence.ts src/lib/sagas/get-saga-sequence.test.ts src/components/saga/sequence/sequence-editor.tsx && git commit -m "feat(sagas): la ventana pertenece a la obra, no al contexto que la cura"
```

---

### Task 5: El payload, la validación y el RPC que borra por sujeto

**Files:**
- Create: `supabase/migrations/20260730_save_saga_sequence_subjects.sql`
- Modify: `src/lib/sagas/sequence-draft.ts`, `src/lib/sagas/sequence-draft.test.ts`, `src/lib/sagas/validate-sequence-draft.ts`, `src/lib/sagas/validate-sequence-draft.test.ts`, `src/lib/sagas/sequence-actions.ts`, `src/components/saga/sequence/use-sequence-draft.ts`, `messages/es.json`, `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: `NestedSubject`, `DraftEntry.ownerSagaId`, `draftWindowOwners`, `loadWindowOwners` (Task 4).
- Produces: `SequencePayload.windows[].saga_id`, `SequencePayload.windowSubjects`, `toPayload(d, sagaId)`, `validateSequenceDraft(payload, { childIds, anchorKeys, windowOwners })`, RPC `save_saga_sequence(uuid, jsonb, jsonb, jsonb, jsonb, jsonb)`.

- [ ] **Step 1: Escribir las pruebas del payload que fallan**

En `src/lib/sagas/sequence-draft.test.ts`:

```ts
describe("toPayload: ventanas y sujetos (fase 4)", () => {
  const anchor = { kind: "item" as const, itemType: "book" as const, itemId: "y", childSagaId: null, title: "Ancla" };
  const free = { ...entry("i:book:a"), ownerSagaId: "padre", window: { after: anchor, before: null } };
  const nested = {
    key: "i:book:x", ownerSagaId: "hija", childSagaId: "hija",
    itemType: "book" as const, itemId: "x", title: "Anidada", coverUrl: null,
    window: { after: anchor, before: null },
  };

  it("cada fila de ventana lleva la saga DUEÑA, no la que se cura", () => {
    const p = toPayload({ slots: [], free: [free], unclassified: [], removed: [], nested: [nested] }, "padre");
    expect(p.windows.map((w) => [w.item_id, w.saga_id])).toEqual([["a", "padre"], ["x", "hija"]]);
  });

  it("los sujetos incluyen TODAS las zonas, las bajas y los anidados", () => {
    const fijo = { ...entry("i:book:f"), ownerSagaId: "padre" };
    const sin = { ...entry("i:book:s"), ownerSagaId: "padre" };
    const p = toPayload(
      { slots: [[fijo]], free: [free], unclassified: [sin], removed: ["i:book:borrada"], nested: [nested] },
      "padre",
    );
    expect(p.windowSubjects).toEqual([
      { saga_id: "padre", item_type: "book", item_id: "f", child_saga_id: null },
      { saga_id: "padre", item_type: "book", item_id: "a", child_saga_id: null },
      { saga_id: "padre", item_type: "book", item_id: "s", child_saga_id: null },
      { saga_id: "padre", item_type: "book", item_id: "borrada", child_saga_id: null },
      { saga_id: "hija", item_type: "book", item_id: "x", child_saga_id: null },
    ]);
  });

  it("una entrada que sale de «Cuando quieras» sigue siendo sujeto: es lo que borra su ventana", () => {
    // Sin ventana en `windows` pero SÍ en `windowSubjects`: el RPC borra la fila
    // y no reinserta nada. Es la coherencia que ningún CHECK entre tablas puede
    // dar, y la razón de que el borrado sea por sujeto y no por omisión.
    const movida = { ...entry("i:book:a"), ownerSagaId: "padre", window: null };
    const p = toPayload({ slots: [[movida]], free: [], unclassified: [], removed: [], nested: [] }, "padre");
    expect(p.windows).toEqual([]);
    expect(p.windowSubjects).toEqual([{ saga_id: "padre", item_type: "book", item_id: "a", child_saga_id: null }]);
  });

  it("un BLOQUE es sujeto con child_saga_id, no con item_id", () => {
    const block = {
      ...entry("s:hija"), kind: "block" as const, itemType: null, itemId: null,
      childSagaId: "hija", ownerSagaId: "padre",
    };
    const p = toPayload({ slots: [], free: [block], unclassified: [], removed: [], nested: [] }, "padre");
    expect(p.windowSubjects).toEqual([{ saga_id: "padre", item_type: null, item_id: null, child_saga_id: "hija" }]);
  });

  it("una baja de BLOQUE se apunta como sujeto de bloque", () => {
    const p = toPayload({ slots: [], free: [], unclassified: [], removed: ["s:hija"], nested: [] }, "padre");
    expect(p.windowSubjects).toEqual([{ saga_id: "padre", item_type: null, item_id: null, child_saga_id: "hija" }]);
  });
});
```

- [ ] **Step 2: Ejecutarlas para verlas fallar**

Run: `fnm use 22 && npx vitest run src/lib/sagas/sequence-draft.test.ts`
Expected: FAIL — `toPayload` no acepta segundo argumento y no emite `saga_id` ni `windowSubjects`.

- [ ] **Step 3: Implementar el payload**

En `src/lib/sagas/sequence-draft.ts`, dentro de `SequencePayload`, sustituye el campo `windows` por estos dos:

```ts
  /** Una fila por sujeto con ventana, forma calcada de
   *  `saga_placement_windows` (20260727_saga_placement_windows.sql). Desde la
   *  fase 4 el `saga_id` viaja EN CADA FILA —lo pone `ownerSagaId`, no el RPC—
   *  porque una ventana curada desde el padre sobre una obra de su hija vive
   *  bajo la HIJA. Recorre `d.free` y `d.nested`: fuera de ahí `window` siempre
   *  es null. */
  windows: Array<{
    saga_id: string;
    item_type: ItemType | null;
    item_id: string | null;
    child_saga_id: string | null;
    after_item_type: ItemType | null;
    after_item_id: string | null;
    after_child_saga_id: string | null;
    before_item_type: ItemType | null;
    before_item_id: string | null;
    before_child_saga_id: string | null;
  }>;
  /** Sujetos de los que ESTA pantalla se hace responsable. El RPC borra
   *  exactamente estos y reinserta `windows`.
   *
   *  Por qué existe: hasta la fase 3 el RPC hacía reemplazo total por saga, y su
   *  comentario lo justificaba con que «no hay un segundo escritor: ninguna otra
   *  pantalla crea ventanas». Desde que el editor del padre cura la ventana de
   *  una obra de su hija eso deja de ser cierto — dos pantallas escriben la
   *  misma fila, y el reemplazo por saga se llevaría por delante lo que la otra
   *  acaba de guardar. Es exactamente lo que en la fase 2a obligó a que la baja
   *  de `saga_items` fuera explícita. */
  windowSubjects: Array<{
    saga_id: string;
    item_type: ItemType | null;
    item_id: string | null;
    child_saga_id: string | null;
  }>;
```

Y sustituye `toPayload` entero por:

```ts
export function toPayload(d: SequenceDraft, sagaId: string): SequencePayload {
  const entries: SequencePayload["entries"] = [];
  const blocks: SequencePayload["blocks"] = [];

  const push = (e: DraftEntry, position: number | null, placement: SagaPlacement | null) => {
    if (e.kind === "block") {
      blocks.push({
        child_saga_id: e.childSagaId!,
        position_in_parent: position,
        placement_in_parent: placement,
        optional_in_parent: e.optional,
      });
      return;
    }
    entries.push({
      item_type: e.itemType!,
      item_id: e.itemId!,
      position,
      placement,
      optional: e.optional,
      role: e.role,
    });
  };

  // El número es el índice del HUECO, no el de la entrada: por eso un tándem
  // comparte número y el hueco siguiente vale n+1, nunca n+2.
  d.slots.forEach((slot, i) => slot.forEach((e) => push(e, i + 1, "fijo")));
  d.free.forEach((e) => push(e, null, "libre"));
  d.unclassified.forEach((e) => push(e, null, null));

  const removedItems: SequencePayload["removed"] = [];
  for (const key of d.removed) {
    const [, type, id] = key.split(":");
    if (key.startsWith("i:")) removedItems.push({ item_type: type as ItemType, item_id: id });
  }

  // Las columnas de un ancla son XOR obra/bloque, igual que el sujeto.
  const anchorColumns = (a: DraftAnchor | null) => ({
    itemType: a?.kind === "item" ? a.itemType : null,
    itemId: a?.kind === "item" ? a.itemId : null,
    childSagaId: a?.kind === "block" ? a.childSagaId : null,
  });
  const windowRow = (
    ownerSagaId: string,
    itemType: ItemType | null,
    itemId: string | null,
    childSagaId: string | null,
    w: DraftWindow,
  ) => {
    const after = anchorColumns(w.after);
    const before = anchorColumns(w.before);
    return {
      saga_id: ownerSagaId,
      item_type: itemType,
      item_id: itemId,
      child_saga_id: childSagaId,
      after_item_type: after.itemType,
      after_item_id: after.itemId,
      after_child_saga_id: after.childSagaId,
      before_item_type: before.itemType,
      before_item_id: before.itemId,
      before_child_saga_id: before.childSagaId,
    };
  };

  const windows: SequencePayload["windows"] = [
    ...d.free
      .filter((e) => e.window !== null)
      .map((e) =>
        windowRow(
          e.ownerSagaId,
          e.kind === "item" ? e.itemType : null,
          e.kind === "item" ? e.itemId : null,
          e.kind === "block" ? e.childSagaId : null,
          e.window!,
        ),
      ),
    ...d.nested
      .filter((n) => n.window !== null)
      .map((n) => windowRow(n.ownerSagaId, n.itemType, n.itemId, null, n.window!)),
  ];

  // TODAS las zonas, no solo `free`: una entrada que SALE de «Cuando quieras»
  // deja de mandar su ventana pero tiene que seguir siendo sujeto, porque es lo
  // que hace que su fila se borre en la misma transacción en que se mueve.
  const subjectOf = (e: DraftEntry) => ({
    saga_id: e.ownerSagaId,
    item_type: e.kind === "item" ? e.itemType : null,
    item_id: e.kind === "item" ? e.itemId : null,
    child_saga_id: e.kind === "block" ? e.childSagaId : null,
  });
  // Una baja ya no está en ninguna zona, así que su dueña no viaja en el
  // borrador: era fila de ESTA saga, que es lo único que se puede dar de baja
  // desde aquí (#187).
  const subjectFromKey = (key: string) => {
    const parts = key.split(":");
    return key.startsWith("i:")
      ? { saga_id: sagaId, item_type: parts[1] as ItemType, item_id: parts[2], child_saga_id: null }
      : { saga_id: sagaId, item_type: null, item_id: null, child_saga_id: key.slice(2) };
  };

  const windowSubjects: SequencePayload["windowSubjects"] = [
    ...d.slots.flat().map(subjectOf),
    ...d.free.map(subjectOf),
    ...d.unclassified.map(subjectOf),
    ...d.removed.map(subjectFromKey),
    ...d.nested.map((n) => ({
      saga_id: n.ownerSagaId,
      item_type: n.itemType as ItemType | null,
      item_id: n.itemId as string | null,
      child_saga_id: null,
    })),
  ];

  return { entries, blocks, removed: removedItems, removedBlocks: [], windows, windowSubjects };
}
```

- [ ] **Step 4: Verificar el payload**

Run: `fnm use 22 && npx vitest run src/lib/sagas/sequence-draft.test.ts`
Expected: PASS.

- [ ] **Step 5: Escribir las pruebas de validación que fallan**

En `src/lib/sagas/validate-sequence-draft.test.ts`, añade `windowOwners` al `ctx` de todas las pruebas existentes (con `new Map()` donde no haya ventanas, y con la entrada correspondiente donde la prueba espere que una ventana sea válida). Después:

```ts
describe("ventanas con dueña (fase 4)", () => {
  const base = { entries: [], blocks: [], removed: [], removedBlocks: [], windowSubjects: [] };
  const win = (sagaId: string, itemId: string) => ({
    saga_id: sagaId, item_type: "book" as const, item_id: itemId, child_saga_id: null,
    after_item_type: "book" as const, after_item_id: "ancla", after_child_saga_id: null,
    before_item_type: null, before_item_id: null, before_child_saga_id: null,
  });
  const ctx = {
    childIds: new Set<string>(),
    anchorKeys: new Set(["i:book:ancla"]),
    windowOwners: new Map([["i:book:x", "hija"]]),
  };

  it("un sujeto que no puede tener ventana se rechaza", () => {
    expect(validateSequenceDraft({ ...base, windows: [win("hija", "z")] }, ctx).errors).toEqual(["windowNotFree"]);
  });

  it("el sujeto correcto bajo la saga correcta pasa", () => {
    expect(validateSequenceDraft({ ...base, windows: [win("hija", "x")] }, ctx).errors).toEqual([]);
  });

  it("el sujeto correcto bajo OTRA saga se rechaza: la fila iría al sitio equivocado", () => {
    expect(validateSequenceDraft({ ...base, windows: [win("padre", "x")] }, ctx).errors).toEqual(["windowWrongOwner"]);
  });
});
```

- [ ] **Step 6: Implementar la validación**

En `src/lib/sagas/validate-sequence-draft.ts`, la firma:

```ts
export function validateSequenceDraft(
  payload: SequencePayload,
  ctx: { childIds: Set<string>; anchorKeys: Set<string>; windowOwners: Map<string, string> },
): { errors: string[]; unclassified: number } {
```

Borra las dos constantes `freeItemKeys` y `freeBlockKeys`, y sustituye el `for (const w of payload.windows)` entero por:

```ts
  for (const w of payload.windows) {
    const subjectKey = key(w.item_type, w.item_id, w.child_saga_id);
    // `windowOwners` responde a las DOS preguntas de una vez: si el sujeto puede
    // tener ventana (está `libre`) y bajo qué saga vive su fila. En servidor se
    // resuelve contra BD (`loadWindowOwners`); en cliente, del borrador vivo
    // (`draftWindowOwners`), para que una entrada recién movida a «Cuando
    // quieras» no se acuse de ajena sin recargar — el `foreignBlock` falso de
    // la fase 2a.
    const owner = subjectKey === null ? undefined : ctx.windowOwners.get(subjectKey);
    if (owner === undefined) errors.add("windowNotFree");
    else if (owner !== w.saga_id) errors.add("windowWrongOwner");

    const afterKey = key(w.after_item_type, w.after_item_id, w.after_child_saga_id);
    const beforeKey = key(w.before_item_type, w.before_item_id, w.before_child_saga_id);
    if (afterKey === null && beforeKey === null) errors.add("windowNoAnchor");

    if (afterKey !== null) {
      if (afterKey === subjectKey) errors.add("windowSelfAnchor");
      if (!anchorKeys.has(afterKey)) errors.add("windowForeignAnchor");
    }
    if (beforeKey !== null) {
      if (beforeKey === subjectKey) errors.add("windowSelfAnchor");
      if (!anchorKeys.has(beforeKey)) errors.add("windowForeignAnchor");
    }
  }
```

En `messages/es.json`, dentro de `sagaEditor.sequenceErrors`:

```json
      "windowWrongOwner": "Esa ventana intenta guardarse bajo una saga que no es la dueña de la obra.",
```

- [ ] **Step 7: Enganchar el cliente**

En `src/components/saga/sequence/use-sequence-draft.ts`, añade `draftWindowOwners` al import de `@/lib/sagas/sequence-draft` y sustituye el `check` y la llamada de `save`:

```ts
  const anchorKeySet = useMemo(() => new Set(anchorKeys), [anchorKeys]);
  const check = useMemo(
    () =>
      validateSequenceDraft(toPayload(draft, sagaId), {
        childIds: new Set(childIds),
        anchorKeys: anchorKeySet,
        windowOwners: draftWindowOwners(draft),
      }),
    [draft, sagaId, childIds, anchorKeySet],
  );
```

```ts
      const res = await saveSequence(sagaId, toPayload(draft, sagaId), childIds);
```

El `setDraft` que limpia tras guardar no toca `nested` (no lleva `isNew`): déjalo como está.

- [ ] **Step 8: Enganchar el servidor**

En `src/lib/sagas/sequence-actions.ts`, añade `import { loadWindowOwners } from "./window-owners";` y sustituye desde el bloque de `anchorKeys` hasta la llamada al RPC:

```ts
  // Anclas y dueños válidos: los dos se resuelven CONTRA BD, no se cree al
  // cliente. Solo cuando hay ventanas que validar — `validateSequenceDraft` no
  // toca ninguno de los dos fuera del bucle sobre `payload.windows`, así que el
  // guardado normal (sin ninguna ventana) no paga ni el recorrido del subárbol
  // ni la consulta de dueños.
  const anchorKeys = new Set<string>();
  let windowOwners = new Map<string, string>();
  if (payload.windows.length > 0) {
    const [anchors, owners] = await Promise.all([
      getAnchorOptions(supabase, sagaId),
      loadWindowOwners(supabase, sagaId),
    ]);
    for (const a of anchors) {
      anchorKeys.add(a.kind === "item" ? `i:${a.itemType}:${a.itemId}` : `s:${a.childSagaId}`);
    }
    windowOwners = owners;
  }
  const { errors } = validateSequenceDraft(payload, {
    childIds: new Set(childIds),
    anchorKeys,
    windowOwners,
  });
  if (errors.length > 0) return { error: errors[0] };

  // `p_window_subjects` NO se valida aquí contra `windowOwners`: el alcance de
  // lo que puede borrar lo acota el propio RPC (solo `p_saga_id` y sus hijas
  // directas), y dentro de ese alcance un collaborator ya puede borrar
  // cualquier ventana por la interfaz normal. Validarlo además obligaría a
  // pagar la consulta de dueños en TODO guardado, incluidos los que no tocan
  // ninguna ventana.
  const { error } = await supabase.rpc("save_saga_sequence", {
    p_saga_id: sagaId,
    p_entries: payload.entries,
    p_blocks: payload.blocks,
    p_removed: payload.removed,
    p_windows: payload.windows,
    p_window_subjects: payload.windowSubjects,
  });
```

- [ ] **Step 9: La migración del RPC**

Crea `supabase/migrations/20260730_save_saga_sequence_subjects.sql`:

```sql
-- supabase/migrations/20260730_save_saga_sequence_subjects.sql
--
-- Fase 4 (B): `save_saga_sequence` deja de borrar las ventanas POR SAGA y pasa
-- a borrarlas por LISTA EXPLÍCITA DE SUJETOS.
--
-- Por qué. El comentario de la versión de 5 argumentos justificaba el reemplazo
-- total diciendo que «no hay un segundo escritor: ninguna otra pantalla crea
-- ventanas». Eso deja de ser cierto en el momento en que el editor del padre
-- puede curar la ventana de una obra de su hija: hay dos pantallas escribiendo
-- la misma fila. Guardar desde el Cosmere borraría en silencio la ventana que
-- El Archivo tiene curada sobre *Esquirla del Amanecer*, o al revés. Es
-- exactamente la situación que en la fase 2a obligó a que la baja de
-- `saga_items` fuera explícita en vez de por omisión.
--
-- ⚠️ Añadir un parámetro NO reemplaza la función: crea una SOBRECARGA. La de 5
-- argumentos se queda VIVA E INTACTA hasta que el bundle nuevo esté desplegado
-- —si no, el bundle de hoy, que llama con cinco, se quedaría sin función entre
-- esta migración y el despliegue— y se retira en una migración aparte
-- (20260731_drop_save_saga_sequence_v5.sql), después.
create or replace function public.save_saga_sequence(
  p_saga_id uuid,
  p_entries jsonb,
  p_blocks  jsonb,
  p_removed jsonb,
  p_windows jsonb,
  p_window_subjects jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_min_role('collaborator') then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from sagas where id = p_saga_id) then
    raise exception 'saga % not found', p_saga_id;
  end if;

  -- ALCANCE. Esta pantalla solo puede escribir o borrar ventanas de SU saga o
  -- de sus hijas DIRECTAS: es lo único que su editor enseña (la propia
  -- secuencia, y el cajón bajo cada bloque). Sin esta guarda, un payload
  -- manipulado podría borrar las ventanas de cualquier saga de la base con solo
  -- nombrarla en `p_window_subjects`.
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

  -- Obras de ESTA saga. El insert es lo que permite dar de alta desde el rail
  -- sin escribir en BD hasta que se guarda.
  insert into saga_items (saga_id, item_type, item_id, position, placement, optional, role, is_primary)
  select
    p_saga_id,
    (e->>'item_type')::public.item_type,
    (e->>'item_id')::uuid,
    (e->>'position')::integer,
    (e->>'placement')::public.saga_placement,
    coalesce((e->>'optional')::boolean, false),
    (e->>'role')::public.saga_item_role,
    -- `is_primary` NO puede ser un `false` incondicional: el resto de escritores
    -- (assignItemToSaga, link_tmdb_saga_item) marcan la fila como principal
    -- cuando el ítem no tiene ya una principal en otra saga, y sin esto un alta
    -- desde el editor deja al ítem SIN saga principal — que luego se lleva, en
    -- silencio, la siguiente saga a la que alguien lo añada desde la ficha.
    -- El `not exists` se evalúa contra la instantánea previa a la sentencia, lo
    -- cual es correcto aquí porque `validateSequenceDraft` ya rechaza un payload
    -- con el mismo ítem dos veces.
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

  -- Hijas DIRECTAS. Sin insert ni delete: anidar y desanidar cambian
  -- `parent_saga_id` y son competencia de editor-actions.ts, no de la
  -- secuencia. El `where parent_saga_id = p_saga_id` impide que una petición
  -- manipulada recoloque la hija de otra saga.
  update sagas s
     set position_in_parent  = (b->>'position_in_parent')::integer,
         placement_in_parent = (b->>'placement_in_parent')::public.saga_placement,
         optional_in_parent  = coalesce((b->>'optional_in_parent')::boolean, false)
    from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) as b
   where s.id = (b->>'child_saga_id')::uuid
     and s.parent_saga_id = p_saga_id;

  -- Bajas explícitas de obras, y SOLO estas.
  delete from saga_items si
   using jsonb_array_elements(coalesce(p_removed, '[]'::jsonb)) as r
   where si.saga_id = p_saga_id
     and si.item_type = (r->>'item_type')::public.item_type
     and si.item_id = (r->>'item_id')::uuid;

  -- Bajas explícitas de VENTANAS: exactamente los sujetos de los que esta
  -- pantalla se hace responsable. Borrar primero y reinsertar es lo que
  -- garantiza la coherencia que ningún CHECK entre tablas puede dar (una
  -- entrada que deja de ser `libre` viaja como sujeto pero no como ventana), y
  -- borrar SOLO estos es lo que impide que el padre se lleve por delante lo que
  -- la hija acaba de guardar.
  --
  -- ⚠️ `IS NOT DISTINCT FROM`, no `=`: el sujeto es obra XOR bloque, así que en
  -- cada fila hay columnas a NULL. Un `=` contra NULL da NULL, y un DELETE cuyo
  -- WHERE da NULL no borra nada — el fallo sería silencioso y solo se vería
  -- como «la ventana que quité sigue ahí».
  delete from saga_placement_windows w
   using jsonb_array_elements(coalesce(p_window_subjects, '[]'::jsonb)) as s
   where w.saga_id = (s->>'saga_id')::uuid
     and w.item_type is not distinct from (s->>'item_type')::public.item_type
     and w.item_id is not distinct from (s->>'item_id')::uuid
     and w.child_saga_id is not distinct from (s->>'child_saga_id')::uuid;

  -- El `saga_id` sale de CADA FILA, no de p_saga_id: la ventana de una obra de
  -- una hija vive bajo la hija.
  insert into saga_placement_windows (
    saga_id, item_type, item_id, child_saga_id,
    after_item_type, after_item_id, after_child_saga_id,
    before_item_type, before_item_id, before_child_saga_id
  )
  select
    (w->>'saga_id')::uuid,
    (w->>'item_type')::public.item_type, (w->>'item_id')::uuid, (w->>'child_saga_id')::uuid,
    (w->>'after_item_type')::public.item_type, (w->>'after_item_id')::uuid, (w->>'after_child_saga_id')::uuid,
    (w->>'before_item_type')::public.item_type, (w->>'before_item_id')::uuid, (w->>'before_child_saga_id')::uuid
  from jsonb_array_elements(coalesce(p_windows, '[]'::jsonb)) as w;
end;
$$;

revoke execute on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;

comment on function public.save_saga_sequence(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Guardado atómico de la secuencia de una saga: obras propias, colocación de hijas directas, bajas explícitas y ventanas de colocación. Collaborator+. NINGUNA baja es por omisión: ni la de saga_items ni la de saga_placement_windows, que desde la fase 4 se borra por lista explícita de sujetos porque hay dos pantallas escribiendo la misma fila.';
```

- [ ] **Step 10: Aplicarla en dev, verificarla y regenerar tipos**

Aplica con `mcp__supabase-dev__apply_migration` (name: `save_saga_sequence_subjects`) y verifica **contra `pg_proc`** que existen las dos sobrecargas:

```sql
select p.oid::regprocedure as firma
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'save_saga_sequence'
 order by 1;
```

Esperado: dos filas, `save_saga_sequence(uuid,jsonb,jsonb,jsonb,jsonb)` y `save_saga_sequence(uuid,jsonb,jsonb,jsonb,jsonb,jsonb)`.

Regenera `src/lib/supabase/database.types.ts` con `mcp__supabase-dev__generate_typescript_types` y comprueba que aparece `p_window_subjects` en los `Args` de `save_saga_sequence`. **Este paso no es opcional**: `rpc<Args>` infiere del literal, así que un tipo viejo no da error de compilación, da silencio.

- [ ] **Step 11: Verificar todo**

Run: `fnm use 22 && npx vitest run && npx tsc --noEmit && npx eslint src/lib/sagas src/components/saga`
Expected: verde y limpio.

- [ ] **Step 12: Commit**

```bash
git add supabase/migrations/20260730_save_saga_sequence_subjects.sql src/lib/sagas/sequence-draft.ts src/lib/sagas/sequence-draft.test.ts src/lib/sagas/validate-sequence-draft.ts src/lib/sagas/validate-sequence-draft.test.ts src/lib/sagas/sequence-actions.ts src/components/saga/sequence/use-sequence-draft.ts src/lib/supabase/database.types.ts messages/es.json && git commit -m "feat(sagas): la baja de ventanas pasa a ser explícita, por lista de sujetos"
```

---

### Task 6: El cajón bajo la fila del bloque

**Files:**
- Create: `src/components/saga/sequence/block-windows-drawer.tsx`
- Modify: `src/components/saga/sequence/window-editor.tsx`, `src/components/saga/sequence/shell-desktop.tsx`, `src/components/saga/sequence/shell-mobile.tsx`, `messages/es.json`

**Interfaces:**
- Consumes: `NestedSubject`, `SequenceDraft.nested`, `ops.setAnchor`/`ops.clearAnchor` (Tasks 4 y 5).

- [ ] **Step 1: Generalizar `WindowEditor`**

`WindowEditor` recibe hoy una `DraftEntry` pero solo usa tres cosas de ella. En `src/components/saga/sequence/window-editor.tsx`, cambia el import de tipos a `import type { DraftAnchor, DraftWindow } from "@/lib/sagas/sequence-draft";` y la prop:

```tsx
export function WindowEditor({
  subject, anchors, onSetAnchor, onClearAnchor,
}: {
  /** Lo mínimo que este componente necesita. Prop genérica (fase 4) y no una
   *  `DraftEntry`: el mismo editor sirve para una entrada `libre` de esta saga
   *  y para un SUJETO ANIDADO —una obra de una hija, que no es fila de esta
   *  pantalla y no tiene ni zona ni número. */
  subject: { key: string; title: string; window: DraftWindow | null };
  /** Subárbol entero (`getAnchorOptions`), para ofrecer en `AnchorPicker`. */
  anchors: DraftAnchor[];
  onSetAnchor: (side: Side, anchor: DraftAnchor) => void;
  onClearAnchor: (side: Side) => void;
}) {
```

Dentro del cuerpo, sustituye `entry.window` → `subject.window`, `entry.title` → `subject.title` (en los tres `aria-label`) y `entry.key` → `subject.key` (el `entryKey` de `AnchorPicker`).

- [ ] **Step 2: Escribir el cajón**

Crea `src/components/saga/sequence/block-windows-drawer.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import type { DraftAnchor, NestedSubject } from "@/lib/sagas/sequence-draft";
import { WindowEditor } from "./window-editor";

/** Cajón bajo la fila de un bloque (fase 4): las ventanas de las obras `libre`
 *  de esa subsaga, curadas SIN salir del editor del padre. Es lo que pidió el
 *  responsable: «dentro de las Novelas secretas me gustaría poner a El Hombre
 *  Iluminado en una ventana dentro del Cosmere».
 *
 *  Y es lo único de la hija que se toca desde aquí: la #187 sigue cerrada, así
 *  que el bloque no se despliega para mover, renumerar ni marcar opcional sus
 *  obras — para eso está su enlace «Abrir su editor».
 *
 *  Si la obra ya tiene ventana curada desde su propia saga, el cajón la ENSEÑA y
 *  deja editarla ahí mismo. No es cosmético: al enseñarla, el borrador la lleva,
 *  y al guardar el padre la reemite en vez de borrarla. */
export function BlockWindowsDrawer({
  childSagaId, nested, anchors, onSetAnchor, onClearAnchor,
}: {
  childSagaId: string;
  /** Todos los sujetos anidados del borrador; el cajón filtra los suyos. */
  nested: NestedSubject[];
  anchors: DraftAnchor[];
  onSetAnchor: (key: string, side: "after" | "before", anchor: DraftAnchor) => void;
  onClearAnchor: (key: string, side: "after" | "before") => void;
}) {
  const t = useTranslations("sagaEditor");
  const subjects = nested.filter((n) => n.childSagaId === childSagaId);

  return (
    <details className="mt-1.5 rounded-xl border border-dashed border-border px-2.5 py-2">
      <summary className="cursor-pointer text-[11.5px] font-semibold text-muted-foreground">
        {t("blockWindowsSummary", { count: subjects.length })}
      </summary>
      {subjects.length === 0 ? (
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{t("blockWindowsEmpty")}</p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {subjects.map((n) => (
            <li key={n.key} className="rounded-lg border border-border bg-surface px-2.5 py-2">
              <p className="truncate font-serif text-[12.5px] font-semibold leading-tight">{n.title}</p>
              <WindowEditor
                subject={n}
                anchors={anchors}
                onSetAnchor={(side, anchor) => onSetAnchor(n.key, side, anchor)}
                onClearAnchor={(side) => onClearAnchor(n.key, side)}
              />
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
```

- [ ] **Step 3: Los literales**

En `messages/es.json`, dentro de `sagaEditor`, junto a `blockOpenEditorFor`:

```json
    "blockWindowsSummary": "Ventanas de sus obras ({count})",
    "blockWindowsEmpty": "Ninguna de sus obras está en «Cuando quieras». La ventana solo tiene sentido ahí: márcalas desde el editor de esa saga y volverán a aparecer aquí.",
```

- [ ] **Step 4: Montarlo en la cáscara de escritorio**

En `src/components/saga/sequence/shell-desktop.tsx`, importa `import { BlockWindowsDrawer } from "./block-windows-drawer";` y sustituye el helper `row` por:

```tsx
  const row = (e: DraftEntry, slotNumber: number | null, controls?: React.ReactNode) => (
    <div key={e.key}>
      <SequenceRow
        entry={e} slotNumber={slotNumber} density="compact" controls={controls}
        onOptional={(v) => ops.setOptional(e.key, v)}
        onRole={(r) => ops.setRole(e.key, r)}
        onMenu={() => onMenu(e.key)}
      />
      {/* El cajón cuelga del bloque esté donde esté: «Novelas secretas» vive en
          «Cuando quieras» (es `libre` en el Cosmere), no en la secuencia. */}
      {e.kind === "block" && e.childSagaId && (
        <BlockWindowsDrawer
          childSagaId={e.childSagaId}
          nested={draft.nested}
          anchors={anchors}
          onSetAnchor={ops.setAnchor}
          onClearAnchor={ops.clearAnchor}
        />
      )}
    </div>
  );
```

En la zona `free`, el `<div key={e.key}>` que envuelve `row(e, null)` pasa a chocar con la key que ahora pone `row`: renómbralo a `<div key={`free-${e.key}`}>`, y actualiza su `WindowEditor` a la prop nueva:

```tsx
              <WindowEditor
                subject={e}
                anchors={anchors}
                onSetAnchor={(side, anchor) => ops.setAnchor(e.key, side, anchor)}
                onClearAnchor={(side) => ops.clearAnchor(e.key, side)}
              />
```

- [ ] **Step 5: Montarlo en la cáscara móvil**

En `src/components/saga/sequence/shell-mobile.tsx`, el mismo cambio. Importa `BlockWindowsDrawer` y sustituye su helper `row` (que no recibe `controls`):

```tsx
  const row = (e: DraftEntry, slotNumber: number | null) => (
    <div key={e.key}>
      <SequenceRow
        entry={e} slotNumber={slotNumber} density="roomy"
        onOptional={(v) => ops.setOptional(e.key, v)}
        onRole={(r) => ops.setRole(e.key, r)}
        onMenu={() => onMenu(e.key)}
      />
      {e.kind === "block" && e.childSagaId && (
        <BlockWindowsDrawer
          childSagaId={e.childSagaId}
          nested={draft.nested}
          anchors={anchors}
          onSetAnchor={ops.setAnchor}
          onClearAnchor={ops.clearAnchor}
        />
      )}
    </div>
  );
```

En su zona `free`, renombra igualmente `<div key={e.key}>` a `<div key={`free-${e.key}`}>` y pasa `subject={e}` al `WindowEditor`.

- [ ] **Step 6: Comprobar a mano en dev**

Siembra por SQL en dev una obra `libre` dentro de `[QA Sagas v2] Era Uno`, para que el cajón tenga contenido:

```sql
update saga_items set placement = 'libre', position = null
 where saga_id = '53118dd4-ccd9-4a9d-8241-5899816a9eab'
   and item_id = '79ddcbd0-3342-44dc-84c0-ffa5c635fbfc';
```

Con el preview levantado, entra en `/saga/69c07496-9b1a-4203-b3da-15d22a09c039/editar` — el **PADRE**, `[QA Sagas v2] Universo`. Despliega el cajón del bloque «Era Uno», ponle a *Para leer a Isabel Allende* un «A partir de» (elige *Rayuela*) y guarda. Comprueba por SQL que la fila cayó bajo la **HIJA**:

```sql
select saga_id, item_id from saga_placement_windows
 where item_id = '79ddcbd0-3342-44dc-84c0-ffa5c635fbfc';
```

Esperado: `saga_id = 53118dd4-ccd9-4a9d-8241-5899816a9eab` (Era Uno), **no** el del Universo.

Comprueba también los otros dos bloques: «Era Dos» (2 obras, todas `fijo`) y «Era Vacía» (0 obras) tienen que enseñar el estado vacío explicado, no un cajón en blanco.

Restaura la semilla:

```sql
delete from saga_placement_windows where item_id = '79ddcbd0-3342-44dc-84c0-ffa5c635fbfc';
update saga_items set placement = 'fijo', position = 4
 where saga_id = '53118dd4-ccd9-4a9d-8241-5899816a9eab'
   and item_id = '79ddcbd0-3342-44dc-84c0-ffa5c635fbfc';
```

- [ ] **Step 7: Verificar y commit**

Run: `fnm use 22 && npx tsc --noEmit && npx eslint src/components/saga && npx vitest run`

```bash
git add src/components/saga/sequence/block-windows-drawer.tsx src/components/saga/sequence/window-editor.tsx src/components/saga/sequence/shell-desktop.tsx src/components/saga/sequence/shell-mobile.tsx messages/es.json && git commit -m "feat(sagas): cajón de ventanas anidadas bajo la fila del bloque"
```

---

### Task 7: E2E — designar un orden, y curar una ventana anidada

**Files:**
- Create: `e2e/sagas-orden-designado.spec.ts`, `e2e/sagas-ventana-anidada.spec.ts`

Semillas **verificadas contra BD dev el 2026-07-27** (vuelve a verificarlas con `mcp__supabase-dev__execute_sql` antes de escribir, que es lo que este dominio de specs hace siempre):

- `[QA Sagas v2] Universo` = `69c07496-9b1a-4203-b3da-15d22a09c039`, `show_map = true`, **2** miembros directos, **0** itinerarios, tres hijas: `Era Uno` (`53118dd4-ccd9-4a9d-8241-5899816a9eab`, 4 obras), `Era Dos` (`c9a702f1-c96b-4daa-a7d4-b6fe135da11b`, 2), `Era Vacía` (`40378312-56fb-47a6-8af1-7e54d98ad96c`, 0).
- Dentro de Era Uno: *Para leer a Isabel Allende* = `79ddcbd0-3342-44dc-84c0-ffa5c635fbfc`, hoy `placement = fijo`, `position = 4`; *Rayuela* es su hueco 1 y sirve de ancla.
- Cuenta `devtest` (`TEST_USER_EMAIL` / `TEST_USER_PASSWORD`), `role = admin` en dev, cumple collaborator+.

Patrón obligado, calcado de `e2e/sagas-ventanas.spec.ts`: `fetch` nativo (**no** el fixture `request` de Playwright, que muere con el contexto del test y dejaría el `finally` sin correr en un timeout a mitad de test), `res.ok` comprobado en cada escritura, locators escopados a la cáscara **visible** (las dos se montan a la vez y se ocultan por breakpoint: sin `:visible` cada locator encuentra dos elementos), y la semilla devuelta EXACTAMENTE a como estaba.

- [ ] **Step 1: E2E de (A) — designar y desdesignar**

Crea `e2e/sagas-orden-designado.spec.ts` con dos tests sobre `[QA Sagas v2] Universo`, que es el único universo QA con `show_map = true` — hace falta, porque sin él la ruta sintética «lectura» no se ofrece nunca y el test no distinguiría «la sustituyó» de «no estaba».

Semilla del `beforeAll` (por REST): un `saga_routes` con `saga_id` = Universo, `slug: "qa-designado"`, `name: "QA Designado"`, `position: 1`, y **un** `saga_route_entries` con `position: 1` y uno de los dos miembros directos del Universo (resuélvelo por REST contra `saga_items`, no lo escribas a ciegas).

1. **Designar sustituye a «Orden de lectura».** Entra en `/saga/69c07496-.../rutas`, marca el radio «QA Designado», pulsa «Guardar elección», y navega a `/saga/69c07496-...?tab=mapa`. Comprueba que existe un chip con el texto exacto **«Orden de lectura»**, que **no** existe ninguno con «QA Designado», y que ese chip es el **primero** del selector.
2. **Desdesignar lo devuelve.** Vuelve a `/rutas`, marca «Ninguno», guarda, y en la ficha comprueba que ahora conviven un chip «Orden de lectura» (la sintética) **y** uno «QA Designado».

`afterAll`: borra la fila de `saga_routes` (sus pasos se van por `on delete cascade`) y comprueba que no queda ninguna fila con `is_reading_order` en esa saga.

- [ ] **Step 2: E2E de (B) — la ventana anidada, y que la hija no se la lleve**

Crea `e2e/sagas-ventana-anidada.spec.ts` con un solo test, el que el spec llama «el caso que más protege»:

1. Siembra por REST `placement = "libre"`, `position = null` sobre la fila de *Para leer a Isabel Allende* en **Era Uno**.
2. Entra en `/saga/69c07496-.../editar` — el editor del **padre**.
3. Despliega el cajón del bloque «Era Uno» (el `<summary>` del `<details>`, escopado a la cáscara visible).
4. Pulsa «+ Añadir ventana» de *Para leer a Isabel Allende*, elige *Rayuela* en el `AnchorPicker` y confirma.
5. Guarda con «Guardar secuencia» y espera «Guardado».
6. **Comprueba contra BD** que la fila de `saga_placement_windows` tiene `saga_id` = **Era Uno**, no el del Universo. Es la aserción que da sentido al test: es lo único que distingue «la ventana pertenece a la obra» de «la ventana pertenece a quien la cura».
7. Abre `/saga/53118dd4-.../editar` —el editor de la **HIJA**— y guarda ahí **sin tocar nada**. Vuelve a comprobar por BD que **la ventana sigue existiendo, con las mismas anclas**. Este paso es el corazón de la fase: con el borrado por saga que había hasta ahora, este guardado la habría borrado en silencio.

`finally`: borra la ventana y devuelve la fila a `placement = "fijo"`, `position = 4`.

- [ ] **Step 3: Correr la suite de sagas entera**

Run:
```bash
fnm use 22 && npx playwright test e2e/sagas-orden-designado.spec.ts e2e/sagas-ventana-anidada.spec.ts e2e/sagas-ventanas.spec.ts e2e/sagas-itinerarios.spec.ts e2e/sagas-mapa-derivado.spec.ts e2e/sagas-editor-secuencia.spec.ts e2e/sagas-colocacion-bloques.spec.ts e2e/sagas-colocacion-opcionalidad.spec.ts e2e/sagas-rol-narrativo.spec.ts e2e/sagas-v2.spec.ts e2e/sagas-v2-mapa.spec.ts e2e/sagas-v2-curacion.spec.ts e2e/sagas-v2-biblioteca.spec.ts
```

Expected: todo verde. Si algún spec preexistente falla, **diagnostícalo antes de tocarlo**: puede ser una aserción obsoleta (pasó en la fase 3) o una regresión real de esta rama. Conocido y ajeno a esta fase: el test «un tándem deja las dos obras en el mismo número y la siguiente en el siguiente» de `sagas-editor-secuencia.spec.ts` es intermitente por interferencia entre ficheros en paralelo — si falla en la pasada conjunta y pasa en solitario, es eso: anótalo en el informe, no lo arregles aquí.

- [ ] **Step 4: Inyección de fallo — comprobar que los e2e sirven de algo**

Rompe el producto por tres sitios, **de uno en uno**, y comprueba que cae exactamente el test que debe. Deshaz cada rotura antes de la siguiente.

1. En `buildRouteList`, quita el `&& !hasDesignated` → tiene que caer el test 1 de (A): aparecerían dos chips.
2. En `toPayload`, en la rama de `d.nested`, sustituye `n.ownerSagaId` por `sagaId` → tiene que caer el paso 6 de (B). Se manifestará como error de guardado, porque `validateSequenceDraft` lo rechaza antes con `windowWrongOwner` — eso también vale, y es la señal de que la validación de dueño hace algo.
3. En el RPC (aplícalo en dev con `apply_migration`), sustituye el `delete ... using jsonb_array_elements(p_window_subjects)` por el `delete from saga_placement_windows where saga_id = p_saga_id` de la versión vieja → tiene que caer el paso 7 de (B). Restaura la función buena después.

Si alguna rotura NO tumba su test, el test no vale: arréglalo antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add e2e/sagas-orden-designado.spec.ts e2e/sagas-ventana-anidada.spec.ts && git commit -m "test(e2e): orden designado y ventana anidada curada desde el padre"
```

---

### Task 8: Producción — migraciones, despliegue y retirada de la sobrecarga

**Files:**
- Create: `supabase/migrations/20260731_drop_save_saga_sequence_v5.sql`
- Modify: `docs/requirements/backlog.md`, `docs/requirements/decisiones.md`, `docs/requirements/data-model.md`, `src/lib/supabase/database.types.ts`

> **Esta tarea toca producción. Cada aplicación de migración necesita autorización explícita del responsable antes de ejecutarse.** Pídesela y espera; no la ejecutes por tu cuenta.

- [ ] **Step 1: Medir producción ANTES**

Con `mcp__supabase-prod__execute_sql`, y guarda los resultados en el informe:

```sql
select count(*) as ventanas from saga_placement_windows;
select w.saga_id, coalesce(b.title, cs.name) as sujeto,
       w.item_id is not null as sujeto_es_obra,
       w.after_item_id is not null or w.after_child_saga_id is not null as tiene_after,
       w.before_item_id is not null or w.before_child_saga_id is not null as tiene_before
  from saga_placement_windows w
  left join books b on b.id = w.item_id
  left join sagas cs on cs.id = w.child_saga_id;
select count(*) as itinerarios from saga_routes;
```

Esperado hoy: **2** ventanas (*Esquirla del Amanecer*, sujeto obra bajo El Archivo, solo `after`; *Nacidos de la Bruma. Era 2*, sujeto **bloque** bajo Cosmere, las dos anclas) y **3** itinerarios.

- [ ] **Step 2: Aplicar las dos migraciones a producción**

Con autorización, **en este orden**:

1. `20260730_saga_routes_is_reading_order.sql`
2. `20260730_save_saga_sequence_subjects.sql`

**Antes que el despliegue del código**, que es el orden que exige el bundle: `getSagaRoutes` selecciona `is_reading_order` sin tolerancia, así que servir el código antes de migrar daría error en todas las fichas de saga.

Verifica contra el catálogo (`information_schema.columns`, `pg_indexes`, `pg_proc`), **no** contra `list_migrations`.

- [ ] **Step 3: Comprobar que producción no se movió**

Repite las tres consultas del Step 1. Las 2 ventanas siguen siendo 2 y dicen lo mismo; los 3 itinerarios siguen ahí y **ninguno** tiene `is_reading_order` — sin backfill, a propósito.

- [ ] **Step 4: Mergear y esperar al despliegue**

El despliegue es automático al mergear a `main`. Espera a que el bundle nuevo esté sirviendo antes del paso siguiente.

- [ ] **Step 5: Comprobar en producción con datos reales**

1. En el Cosmere, entra en `/saga/<cosmere>/editar`, despliega el cajón del bloque «Novelas secretas» y comprueba que salen sus **4** obras (*El Hombre Iluminado*, *Islas de la Acuaoscura*, *Trenza del Mar Esmeralda*, *Yumi y el Pintor de Pesadillas*).
2. Comprueba que el bloque «Nacidos de la Bruma. Era 2» sigue enseñando **su propia** ventana (sujeto bloque, con sus dos anclas) en la zona «Cuando quieras», y que guardar desde el Cosmere no la toca.
3. Abre el editor de El Archivo de las Tormentas, guarda sin tocar nada, y comprueba que la ventana de *Esquirla del Amanecer* sigue ahí.
4. **El progreso del Cosmere sigue en 9 de 11.**

- [ ] **Step 6: Retirar la sobrecarga de 5 argumentos**

Solo **después** de comprobar que el bundle nuevo sirve. Primero comprueba de verdad que no queda ninguna llamada vieja:

```bash
grep -rn "save_saga_sequence" src/ | grep -v p_window_subjects
```

Expected: solo comentarios, ninguna llamada.

Crea `supabase/migrations/20260731_drop_save_saga_sequence_v5.sql`:

```sql
-- supabase/migrations/20260731_drop_save_saga_sequence_v5.sql
--
-- Retirada de la sobrecarga de CINCO argumentos de `save_saga_sequence`, que
-- vivía solo para que el bundle desplegado sin `p_window_subjects` no se
-- quedara sin función entre la migración de la fase 4 y su despliegue. A partir
-- del despliegue todo el mundo llama con seis.
--
-- ⚠️ Su cuerpo hacía `delete from saga_placement_windows where saga_id =
-- p_saga_id` — reemplazo total por saga. Mientras siguiera viva, cualquier
-- llamada con cinco argumentos borraría en silencio la ventana que la hija (o
-- el padre) tuviera curada sobre la misma obra. Por eso se retira, no se deja
-- «por si acaso».
--
-- Se verificó antes de aplicar que el bundle nuevo lleva sirviendo y que no
-- queda ni una llamada con cinco argumentos en `src/`.
drop function if exists public.save_saga_sequence(uuid, jsonb, jsonb, jsonb, jsonb);
```

Aplícala en dev, verifica con `pg_proc` que queda **una sola** sobrecarga, y después en producción con autorización. Regenera `src/lib/supabase/database.types.ts`.

- [ ] **Step 7: Sincronizar la documentación**

Con el agente `backlog-scribe` (o a mano si no está disponible):

- `docs/requirements/backlog.md`: marca la fase 4 hecha y anota lo que **no** entra, con su motivo — que «Novelas secretas» vuelva a pintarse como bloque teniendo todas sus obras `libre` (vecino de la #202); mover, renumerar o marcar opcional desde el editor del padre (#187); y atar la ventana a su entrada con FKs compuestas y triggers.
- `docs/requirements/decisiones.md`: dos decisiones. (1) **La ventana pertenece a la obra, no al contexto que la cura**, y su consecuencia: la baja de ventanas pasa a ser explícita, igual que la de `saga_items` en la 2a. (2) **El curador designa el orden de lectura**; no se deriva ni se materializa, y designar cambia la vista por defecto de esa saga — con el zigzag del mapa que eso implica en el Cosmere, aceptado a sabiendas.
- `docs/requirements/data-model.md`: `saga_routes.is_reading_order` con su unique parcial, y que `saga_placement_windows.saga_id` es la saga **dueña de la membresía**, no la que cura.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260731_drop_save_saga_sequence_v5.sql src/lib/supabase/database.types.ts docs/requirements && git commit -m "chore(db): retirar la sobrecarga que borraba ventanas por saga"
```

---

## Riesgos que hay que mirar al desplegar

1. **Un guardado desde el padre que no reemita una ventana de la hija la borra.** Es la razón de que el borrado sea explícito, y lo cubre el paso 7 del e2e de (B) — pero mira las 2 ventanas reales de producción después del despliegue, no solo el test.
2. **Designar el itinerario del Cosmere cambia su vista por defecto**, y con ella aparece el zigzag que el spec describe en «Lo que (A) no arregla»: …10 → 11-14 en un bloque flotante sin aristas → 15 → 16 volviendo a la fila de El Archivo. Es consecuencia directa de que el itinerario diga cosas que el mapa no sabe dibujar. Con **0** adopciones en `saga_route_choices` no hay preferencia de nadie que romper; un enlace `?ruta=lectura` guardado degradará por la cadena de precedencia que ya existe.
3. **En la ficha del Cosmere, «Novelas secretas» no aparece como bloque** — sus 4 obras son `libre`, así que el grupo se omite y salen sueltas en «Cuando quieras». La línea «a partir de …» de *El Hombre Iluminado* aterrizará en una celda que no dice que sea una novela secreta. Se acepta para esta fase: es lo que ya pasa hoy con *Esquirla del Amanecer*, y cambiarlo afecta a todas las fichas.
4. **Si al construir (B) apetece una tercera ancla**, es la señal que la 2b pidió no ignorar: **para y dilo en voz alta.**
