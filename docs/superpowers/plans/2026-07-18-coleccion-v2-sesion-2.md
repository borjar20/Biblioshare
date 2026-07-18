# Colección v2 · Sesión 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Completar «Mi Biblioteca» v2 — filtros de tipo/estado en `Todo`, la hoja «Añadir a colección» (frame D) desde ficha y grid, y la gestión del detalle (ordenar + menú ⋯ renombrar/descripción/borrar); resolviendo de paso la deuda de S1 sobre ítems sin pase.

**Architecture:** Sobre lo de S1 (ya en `main`, #83). No hay migración nueva (las tablas existen). Se cablean las server actions que S1 dejó escritas pero sin usar, se añade `setItemCollections`, y se corrige `getCollection` para incluir ítems no trackeados. La hoja es un componente cliente reutilizable disparado desde ficha y grid.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, Supabase, next-intl, Tailwind, Playwright.

## Global Constraints

- **NO es el Next.js de tu training:** lee `node_modules/next/dist/docs/` si dudas.
- **Sin migración nueva.** Las acciones ya existen en `src/lib/library/collection-actions.ts` (S1): `createCollection`, `renameCollection`, `deleteCollection`, `addItemToCollections`. Falta cablearlas + `setItemCollections`.
- **DECISIÓN DE DISEÑO (ítems sin pase) — RESUELTA 2026-07-18: SOLO ÍTEMS DE BIBLIOTECA.** Una colección solo contiene títulos que trackeas (con pase activo). La hoja «Añadir a colección» solo aparece/opera sobre ítems de biblioteca (calca la maqueta B, donde todos llevan estado). Consecuencia: `getCollection` (que ya descarta sin-pase) queda **correcto sin tocar**, y el descuadre de recuento se evita por construcción. Para no dejar huérfanos, **quitar un ítem de la biblioteca borra sus `collection_items`** (Task 1).
- **NO botones muertos**: todo lo que se pinte debe funcionar.
- Nota decimal en español (coma): «4,3».
- **Verificación**: `tsc`/`eslint` limpios; Playwright e2e (Node 22) + navegador (claro/oscuro, 400 y 1280). Regla de los dos árboles: `:visible` si hay duplicado móvil/PC.
- i18n en `messages/es.json`; añadir las claves de error de las acciones (`rename_failed`, `delete_failed`, `add_failed`) que S1 dejó sin traducir, y las nuevas.

---

### Task 1: sin huérfanos — quitar de la biblioteca borra los `collection_items`

Bajo la decisión «solo ítems de biblioteca», el descuadre de recuento (deuda de S1) solo puede surgir si un ítem que estaba en una colección se quita luego de la biblioteca. Se ataja en el origen: `removeFromLibrary` borra también los `collection_items` de ese ítem. Así `getCollection` (que descarta sin-pase) nunca se queda corto frente al recuento del grid, y **no hace falta tocar `collections.ts` ni el detalle**.

**Files:**
- Modify: `src/lib/library/manage-actions.ts` (`removeFromLibrary`, ~línea 51)

**Interfaces:**
- Consumes: RLS de `collection_items` (gatea al dueño del padre).
- Produces: al quitar un ítem de la biblioteca, desaparece de todas las colecciones del usuario.

- [ ] **Step 1:** En `removeFromLibrary`, tras borrar los pases, añadir:

```ts
  // Al salir de la biblioteca, el ítem sale de todas las colecciones del usuario
  // (mantiene el recuento del grid cuadrado con el detalle, que solo pinta
  // ítems con pase). La RLS de collection_items ya restringe a las colecciones
  // propias, así que basta filtrar por (item_type, item_id).
  const { error: colError } = await supabase
    .from("collection_items")
    .delete()
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  if (colError) throw colError;
```

- [ ] **Step 2:** Verificar: `tsc`/`eslint`; e2e (añadir un ítem a una colección, quitarlo de la biblioteca, y comprobar en BD que ya no está en `collection_items`; el grid ya no lo cuenta).

- [ ] **Step 3:** Commit: `fix(coleccion): quitar un ítem de la biblioteca lo saca de sus colecciones`.

---

### Task 2: Filtros de tipo + estado en `Todo` (frame C)

**Files:**
- Modify: `src/components/library/library-filters.tsx` (habilitar `showTypeFilter` con píldoras)
- Modify: `src/app/coleccion/page.tsx` (pasar `?type=`; grid filtra por tipo)

**Interfaces:**
- Consumes: `getLibraryItems` (ya acepta `itemType`).
- Produces: `Todo` con píldoras Todos/Libros/Películas/Series + filtro de estado.

- [ ] **Step 1:** En `library-filters.tsx`, cuando `showTypeFilter`, pintar las 4 píldoras (`.pill` del mockup: Todos + una por tipo con dot de color) que setean `?type=book|movie|series` (o lo quitan para «Todos»). El filtro de estado (Todos/Pendiente/En curso/Terminado) como `.sortrow` de segmentos.

- [ ] **Step 2:** En `page.tsx`, la rama `todo` pasa `showTypeFilter` y resuelve `?type=` a `itemType` para `LibraryGrid`. El Resumen + FavoritesShelf solo sin filtros (como hoy).

- [ ] **Step 3:** Verificar: `tsc`/`eslint`; e2e (Todo con `?type=book` solo muestra libros); navegador claro/oscuro.

- [ ] **Step 4:** Commit: `feat(coleccion): Todo con píldoras de tipo y filtro de estado (frame C)`.

---

### Task 3: `setItemCollections` + hoja «Añadir a colección» (frame D)

**Files:**
- Modify: `src/lib/library/collection-actions.ts` (añadir `setItemCollections`)
- Create: `src/components/library/add-to-collection-sheet.tsx` (cliente, `<dialog>`)
- Modify: el disparador en la ficha (`src/components/detail/...`, botón «Añadir a colección») y en `library-item-card.tsx` (grid)
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `listCollections` (para pintar la lista con recuento), `createCollection`.
- Produces: `setItemCollections(itemType, itemId, collectionIds: string[])` — deja el ítem EXACTAMENTE en esas colecciones (añade las nuevas, quita las desmarcadas). `AddToCollectionSheet` reutilizable.

- [ ] **Step 1:** `setItemCollections`: leer las colecciones actuales del ítem, calcular altas/bajas, `upsert` las altas y `delete` las bajas (RLS gatea al dueño). `revalidatePath('/coleccion')`. Devuelve `{ error? }`.

- [ ] **Step 2:** `AddToCollectionSheet` (cliente): recibe `itemType`, `itemId`, y la lista de colecciones (mini portada + nombre + recuento + checkbox); marca las que ya contienen el ítem; «＋ Crear nueva colección…» (usa `createCollection` y la marca); «Hecho» llama `setItemCollections` con las marcadas. Contador «N marcadas».

- [ ] **Step 3:** Disparadores: botón «▤ Añadir a colección» en la ficha (frame D) y una acción en `LibraryItemCard` (grid). Ambos abren la hoja con el ítem.

- [ ] **Step 4:** i18n: título, «N marcadas», «Crear nueva colección…», «Hecho», y los errores `add_failed`/`create_failed` que falten.

- [ ] **Step 5:** Verificar: e2e (abrir la hoja desde una ficha, marcar 2 colecciones, «Hecho», comprobar en BD que el ítem quedó en esas 2; desmarcar una y comprobar la baja); navegador claro/oscuro.

- [ ] **Step 6:** Commit: `feat(coleccion): hoja «Añadir a colección» desde ficha y grid (frame D)`.

---

### Task 4: Gestión del detalle — ⋯ (renombrar/descripción/borrar) + ordenar

**Files:**
- Modify: `src/app/coleccion/c/[id]/page.tsx` y `src/components/library/collection-detail.tsx`
- Modify: `src/lib/library/collection-actions.ts` (añadir `updateCollectionDescription`, `reorderCollectionItems` si se hace el orden)
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `renameCollection`, `deleteCollection` (ya existen), + `updateCollectionDescription`.
- Produces: menú ⋯ funcional en el detalle.

- [ ] **Step 1:** Menú ⋯ (cliente) en el topbar del detalle: «Renombrar» (hoja con input → `renameCollection`), «Editar descripción» (`updateCollectionDescription`), «Borrar» (confirmación → `deleteCollection` → `router.push('/coleccion')`).

- [ ] **Step 2:** `updateCollectionDescription(id, text)` en las acciones (patrón de `renameCollection`).

- [ ] **Step 3 (opcional según alcance):** «Ordenar» — reordenar ítems del detalle (drag o mover) → `reorderCollectionItems(id, keys[])`. Si se aplaza, NO pintar el botón «Ordenar».

- [ ] **Step 4:** i18n de las etiquetas y errores.

- [ ] **Step 5:** Verificar: e2e (renombrar desde ⋯ cambia el nombre; borrar lleva a /coleccion y la colección ya no está en el grid); navegador.

- [ ] **Step 6:** Commit: `feat(coleccion): gestión del detalle — renombrar, descripción y borrar (menú ⋯)`.

---

### Task 5: e2e de cierre + verificación

**Files:**
- Modify/Create: `e2e/coleccion-v2.spec.ts` (ampliar) o `e2e/coleccion-v2-s2.spec.ts`

- [ ] **Step 1:** Spec: añadir ítem a 2 colecciones vía la hoja, verificar en BD; filtro de tipo en Todo; renombrar/borrar desde el detalle. Siembra REST + limpieza en `finally`.
- [ ] **Step 2:** `npx playwright test` de colección + regresión (happy-path, pase-hub). Verde.
- [ ] **Step 3:** Navegador: frames C y D a 400 y 1280, claro y oscuro.
- [ ] **Step 4:** Commit + PR draft.

---

## Notas de ejecución
- **Sin gate de migración** (no hay DDL nueva).
- Decisión «solo ítems de biblioteca»: la hoja «Añadir a colección» (Task 3) solo se dispara desde ítems que están en biblioteca (ficha con pase / tarjeta del grid), así que solo añade ítems con pase. Task 1 cierra el único hueco (quitar de biblioteca después).
- Tareas independientes; orden sugerido 1 → 2 → 3 → 4 → 5.
- Revisión final de rama (opus) antes del PR, como en S1.
