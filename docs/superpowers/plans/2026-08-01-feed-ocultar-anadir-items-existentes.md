# Feed: ocultar «Añadir» en ítems existentes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ocultar las acciones de alta rápida del feed para las obras que el visitante ya tiene y limitar la acción agrupada a las obras pendientes.

**Architecture:** `getFeed` consultará en un solo batch los pases activos del visitante para los eventos `added` de la página y adjuntará una marca serializable a cada `FeedEvent`. `CollectionCard` consumirá esa marca mediante un helper puro para decidir los botones individuales y el payload/recuento de la acción agrupada. El identificador del visitante pasará a ser nullable en feeds públicos para no confundir al actor con un visitante anónimo.

**Tech Stack:** Next.js 16.2.10 App Router/RSC, React 19.2.4, Supabase JS 2.110.1, TypeScript 5, Vitest 4.1.10, Playwright 1.61.1.

## Global Constraints

- Fuente de verdad del estado vivo: `passes`; nunca `library_entries`.
- «Ya lo tiene» = pase con `user_id = viewerId`, `is_active = true` y la misma pareja `(item_type, item_id)`.
- Una sola consulta de pertenencia por página; nunca una consulta por fila ni cargar toda la biblioteca.
- La consulta solo incluye `item_id` presentes en eventos `added` de la página ya paginada.
- Un visitante anónimo de un perfil público no hereda la biblioteca del actor.
- Sin cambios de esquema, migraciones ni copy; no se modifica `messages/es.json`.
- TDD estricto: observar RED antes de tocar producción y GREEN después.
- Antes de editar cada símbolo: `gitnexus impact <symbol> --direction upstream`; avisar antes de continuar si el riesgo es HIGH/CRITICAL.
- Antes de cualquier commit: `gitnexus detect_changes --scope staged`.
- Un solo `next dev` en el puerto 3000; limpiar el servidor y fixtures al acabar.

Spec: `docs/superpowers/specs/2026-08-01-feed-ocultar-anadir-items-existentes-design.md`.

---

## Estructura de ficheros

**Crear:**

- `src/components/social/collection-card-items.ts` — filtro puro de ítems que aún no están en la biblioteca.
- `src/components/social/collection-card-items.test.ts` — contrato unitario del filtro usado por recuento y payload.

**Modificar:**

- `src/components/social/collection-card.tsx:17-83` — ocultar botones individuales y construir la acción agrupada con los pendientes.
- `src/lib/social/feed.ts:25-73,177-714` — marca de pertenencia, visitante nullable y batch de pases activos.
- `src/app/u/[username]/_tabs/activity-tab.tsx:27` — pasar `null` cuando el perfil lo visita una persona anónima.
- `src/lib/social/feed-actions.ts:39` — la paginación del perfil conserva ese `null` anónimo.
- `e2e/feed-tarjetas-por-tipo.spec.ts:38-223` — fixture del pase del visitante y aserciones por fila.

---

### Task 1: Selección pura y render de acciones disponibles

**Files:**

- Create: `src/components/social/collection-card-items.ts`
- Create: `src/components/social/collection-card-items.test.ts`
- Modify: `src/components/social/collection-card.tsx:17-83`

**Interfaces:**

- Consumes: objetos con `viewerHasActivePass?: boolean`.
- Produces: `itemsMissingFromLibrary<T extends { viewerHasActivePass?: boolean }>(items: readonly T[]): T[]`.
- `CollectionCard` usa exactamente el array devuelto para el recuento y para los argumentos de `quickAddManyToLibrary`.

- [ ] **Step 1: Analizar el impacto antes de editar**

Ejecutar:

```powershell
node .gitnexus/run.cjs impact CollectionCard --direction upstream
```

Revisar dependientes directos y procesos afectados. Riesgo esperado: LOW, limitado al despacho `FeedItem` y al render del feed.

- [ ] **Step 2: Escribir el test unitario que falla**

Crear `src/components/social/collection-card-items.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { itemsMissingFromLibrary } from "./collection-card-items";

describe("itemsMissingFromLibrary", () => {
  it("excluye del recuento y del payload los ítems con pase activo del visitante", () => {
    const items = [
      { id: "owned", viewerHasActivePass: true },
      { id: "missing-a", viewerHasActivePass: false },
      { id: "missing-b" },
    ];

    expect(itemsMissingFromLibrary(items).map((item) => item.id)).toEqual([
      "missing-a",
      "missing-b",
    ]);
  });
});
```

Mutación que debe detectar: quitar el filtro o invertir la condición volvería a incluir `owned`.

- [ ] **Step 3: Ejecutar y observar RED**

Run:

```powershell
npm test -- src/components/social/collection-card-items.test.ts
```

Expected: FAIL porque `./collection-card-items` todavía no existe.

- [ ] **Step 4: Implementar el helper mínimo**

Crear `src/components/social/collection-card-items.ts`:

```ts
export function itemsMissingFromLibrary<
  T extends { viewerHasActivePass?: boolean },
>(items: readonly T[]): T[] {
  return items.filter((item) => !item.viewerHasActivePass);
}
```

- [ ] **Step 5: Conectar `CollectionCard` al helper**

En `src/components/social/collection-card.tsx`, importar el helper y derivar una sola vez:

```tsx
import { itemsMissingFromLibrary } from "./collection-card-items";

// dentro de CollectionCard, antes del return
const missingItems = itemsMissingFromLibrary(entry.items);
```

Cambiar el bloque individual a:

```tsx
{!item.viewerHasActivePass && (
  <div className="shrink-0 self-start">
    <QuickAddButton itemType={item.itemType} itemId={item.itemId} />
  </div>
)}
```

Cambiar el pie para que su guarda, recuento y payload compartan `missingItems`:

```tsx
{missingItems.length > 1 && (
  <form
    action={async () => {
      await quickAddManyToLibrary(
        missingItems.map((item) => ({
          itemType: item.itemType,
          itemId: item.itemId,
        })),
      );
    }}
  >
    <button type="submit" className="w-full rounded-lg border border-border py-2 text-[12.5px] font-semibold text-accent hover:bg-surface-muted">
      {t("grouped.saveAllToQueue", { count: missingItems.length })}
    </button>
  </form>
)}
```

- [ ] **Step 6: Verificar GREEN y tipos**

Run:

```powershell
npm test -- src/components/social/collection-card-items.test.ts
npx tsc --noEmit
```

Expected: 1 test PASS y TypeScript exit 0. En este punto la UI sigue mostrando botones hasta que Task 2 suministre la marca del servidor.

- [ ] **Step 7: Commit acotado**

```powershell
git add src/components/social/collection-card-items.ts src/components/social/collection-card-items.test.ts src/components/social/collection-card.tsx
node .gitnexus/run.cjs detect_changes --scope staged
git commit -m "feat(feed): filtra acciones de coleccion disponibles"
```

---

### Task 2: Resolver pertenencia desde el feed y verificar el flujo completo

**Files:**

- Modify: `src/lib/social/feed.ts:25-73,177-714`
- Modify: `src/app/u/[username]/_tabs/activity-tab.tsx:27`
- Modify: `src/lib/social/feed-actions.ts:39`
- Modify: `e2e/feed-tarjetas-por-tipo.spec.ts:38-223`

**Interfaces:**

- `getFeed(supabase, viewerId: string | null, options?: FeedOptions): Promise<FeedPage>`.
- `FeedEvent.viewerHasActivePass?: boolean` solo informa la presentación del visitante; no altera identidad, orden ni agrupación.
- La query lee `passes(item_type,item_id)` con `user_id`, `is_active` e `item_id` filtrados.

- [ ] **Step 1: Analizar el impacto antes de editar**

Ejecutar individualmente:

```powershell
node .gitnexus/run.cjs impact getFeed --direction upstream
node .gitnexus/run.cjs impact ActivityTab --direction upstream
node .gitnexus/run.cjs impact loadMoreProfileFeed --direction upstream
```

Revisar primero los dependientes de profundidad 1. Riesgo esperado: MEDIUM por compartir `getFeed` entre Inicio, Actividad de perfil y ambas paginaciones; si GitNexus devuelve HIGH/CRITICAL, parar y avisar antes de editar.

- [ ] **Step 2: Escribir el E2E que reproduce el fallo**

En `e2e/feed-tarjetas-por-tipo.spec.ts`, añadir un UUID fijo:

```ts
const VIEWER_COL_PASS = "e2fc0a09-0000-4000-8000-000000000009";
```

Incluirlo en `ALL_PASSES` para que `cleanFixtures()` lo borre antes y después:

```ts
const ALL_PASSES = [
  ...COL_PASSES,
  VIEWER_COL_PASS,
  PROG_PASS,
  REV_PASS,
];
```

En el caso Colección, obtener `viewerId = await devtestId()` y, después de crear los libros, sembrar este pase además de los dos del seguido:

```ts
await rest("passes", {
  method: "POST",
  body: JSON.stringify([
    ...COL_PASSES.map((id, index) => ({
      id,
      user_id: followee.id,
      item_type: "book",
      item_id: COL_BOOKS[index],
      status: "planned",
      is_active: true,
      created_at: now,
    })),
    {
      id: VIEWER_COL_PASS,
      user_id: viewerId,
      item_type: "book",
      item_id: COL_BOOKS[0],
      status: "planned",
      is_active: true,
      created_at: now,
    },
  ]),
});
```

Sustituir la expectativa de dos botones por aserciones ligadas a cada fila:

```ts
const ownedRow = card
  .getByRole("link", { name: `[E2E] Colección 1 · ${ts}` })
  .first()
  .locator("../..");
const missingRow = card
  .getByRole("link", { name: `[E2E] Colección 2 · ${ts}` })
  .first()
  .locator("../..");

await expect(ownedRow.getByRole("button", { name: /^añadir$/i })).toHaveCount(0);
await expect(missingRow.getByRole("button", { name: /^añadir$/i })).toHaveCount(1);
await expect(card.getByRole("button", { name: /guardar los 2/i })).toHaveCount(0);
```

- [ ] **Step 3: Ejecutar y observar RED**

Comprobar primero que no haya un servidor ajeno en 3000 y ejecutar:

```powershell
npm run test:e2e -- feed-tarjetas-por-tipo --grep "un seguido con altas"
```

Expected: FAIL porque la fila `owned` todavía muestra «Añadir». La limpieza del fixture debe terminar tanto al principio como en `finally`.

- [ ] **Step 4: Añadir la marca al contrato del evento**

En `FeedEvent` (`src/lib/social/feed.ts`) añadir:

```ts
// Solo para `added`: pertenencia del visitante actual, resuelta por página.
viewerHasActivePass?: boolean;
```

Cambiar la firma:

```ts
export async function getFeed(
  supabase: SupabaseServerClient,
  viewerId: string | null,
  options: FeedOptions = {},
): Promise<FeedPage> {
```

Las ramas que consultan `follows` o clubes deben exigir `viewerId !== null`. Un feed sin `actorId` y sin visitante devuelve la página vacía; un feed con `actorId` sigue leyendo la actividad pública.

- [ ] **Step 5: Resolver los pases activos tras fijar la página**

Inmediatamente después de `const page = fresh.slice(0, pageSize);`, añadir:

```ts
const addedPageEvents = page.flatMap((entry) =>
  entry.source === "person" && entry.event.verb === "added"
    ? [entry.event]
    : [],
);
const addedItemIds = [
  ...new Set(addedPageEvents.map((event) => event.itemId)),
];
const { data: viewerPasses, error: viewerPassesError } =
  viewerId && addedItemIds.length > 0
    ? await supabase
        .from("passes")
        .select("item_type, item_id")
        .eq("user_id", viewerId)
        .eq("is_active", true)
        .in("item_id", addedItemIds)
    : {
        data: [] as { item_type: ItemType; item_id: string }[],
        error: null,
      };
if (viewerPassesError) throw viewerPassesError;

const viewerPassKeys = new Set(
  (viewerPasses ?? []).map((pass) => `${pass.item_type}:${pass.item_id}`),
);
for (const event of addedPageEvents) {
  event.viewerHasActivePass = viewerPassKeys.has(
    `${event.itemType}:${event.itemId}`,
  );
}
```

La pareja tipo/id se conserva en el `Set`; el `.in()` solo acota UUIDs y nunca se llama con una lista vacía.

- [ ] **Step 6: Corregir el visitante anónimo del perfil**

En `ActivityTab`:

```ts
const page = await getFeed(supabase, user?.id ?? null, { actorId: userId });
```

En `loadMoreProfileFeed`:

```ts
return getFeed(supabase, user?.id ?? null, {
  cursor: cursor ?? undefined,
  actorId,
});
```

Inicio y `loadMoreFeed` mantienen `user.id`, porque ambas rutas requieren sesión.

- [ ] **Step 7: Verificar GREEN en unitario, E2E y tipos**

Run:

```powershell
npm test -- src/components/social/collection-card-items.test.ts src/lib/social/group-feed-entries.test.ts
npm run test:e2e -- feed-tarjetas-por-tipo --grep "un seguido con altas"
npx tsc --noEmit
npx eslint src/lib/social/feed.ts src/lib/social/feed-actions.ts src/components/social/collection-card.tsx src/components/social/collection-card-items.ts src/components/social/collection-card-items.test.ts "src/app/u/[username]/_tabs/activity-tab.tsx" e2e/feed-tarjetas-por-tipo.spec.ts
```

Expected: todas las pruebas PASS, TypeScript exit 0 y ESLint sin errores.

- [ ] **Step 8: Verificación UI y cobertura duradera**

1. Ejecutar el agente `qa-verifier` sobre Inicio con el fixture del E2E, comprobando que la fila poseída carece de botón y la pendiente conserva uno; revisar consola/red.
2. Ejecutar `test-author` después de QA para revisar que el unitario y el E2E protegen el comportamiento sin duplicar cobertura.
3. Limpiar fixtures, servidor de desarrollo y cualquier worktree huérfano conforme a `docs/TESTING.md` y `AGENTS.md`.

- [ ] **Step 9: Sincronización documental**

Ejecutar `backlog-scribe` para auditar la definición de hecho. Resultado esperado: no cambia `data-model.md` (sin esquema), no cambia el estado de una feature en `backlog.md`, y la decisión queda documentada por la spec aprobada; solo editar documentos canónicos si el agente encuentra una afirmación que haya dejado de ser cierta.

- [ ] **Step 10: Detectar alcance y crear el commit final**

Preparar solo los ficheros de esta tarea, preservando las ediciones concurrentes:

```powershell
git add src/lib/social/feed.ts src/lib/social/feed-actions.ts src/components/social/collection-card.tsx src/components/social/collection-card-items.ts src/components/social/collection-card-items.test.ts "src/app/u/[username]/_tabs/activity-tab.tsx" e2e/feed-tarjetas-por-tipo.spec.ts
node .gitnexus/run.cjs detect_changes --scope staged
git diff --cached --check
git commit -m "fix(feed): oculta altas de items ya presentes"
```

El alcance esperado es Inicio/Actividad de perfil/paginación del feed. Si `detect_changes` muestra procesos ajenos, retirar del stage los ficheros no propios y revisar antes del commit.

---

## Self-Review

- **Cobertura de spec:** pase activo y pareja tipo/id → Task 2 Steps 4-5; ocultar botón por fila → Task 1 Step 5 + E2E; recuento/payload solo pendientes → helper unitario + `missingItems`; ocultar pie sin suficientes pendientes → `missingItems.length > 1`; paginación → marca después de `page` en el `getFeed` compartido; visitante anónimo → Task 2 Step 6.
- **Completitud:** todos los pasos contienen rutas, contratos, código y resultados esperados concretos.
- **Consistencia de tipos:** `viewerHasActivePass` es opcional en `FeedEvent` y coincide con el constraint genérico del helper; `getFeed` acepta `string | null` y los cuatro call sites quedan cubiertos.
- **TDD:** unitario RED antes del helper; E2E RED antes de la marca de servidor; ambos se observan GREEN tras la implementación.
- **Supabase/Next:** consulta server-side, props serializables, filtros `.eq().eq().in()` documentados y guardia contra `.in([])`.
