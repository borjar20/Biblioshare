# Colección v2 — «Mi Biblioteca» con colecciones · diseño

> Plan 02 (Colección), **Tarea 7**. Parte de la iniciativa fidelidad Paper.
> Maqueta: `Paper - Colección v2.html` (frames **A** Colecciones grid · **B** Colección detalle · **C** Todo · **D** Añadir a colección).
> Precede la fidelidad v1 (T1–T5, PR #81), cuyas piezas visuales (Resumen, badge píldora, tarjetas) se reaprovechan en la pestaña `Todo`.

## 1. Qué cambia y por qué

La Colección deja de girar en torno a **estados** (General/Libros/Películas/Series/Colas) y pasa a girar en torno a **colecciones que crea el usuario** — estanterías/sellos donde coloca ítems. La maqueta v2 lo resume: «Fuera el bloque *Ahora mismo · En curso*: ya vive en Inicio y en el Panel del perfil».

La sección se renombra a **«Mi Biblioteca»** (wordmark del topbar, `h1`, y la etiqueta de la nav). Dos subpestañas:

- **Colecciones** (frame A, default) — grid de las colecciones del usuario: abanico de 3 portadas + nombre + recuento, con tile «Nueva colección».
- **Todo** (frame C) — la biblioteca completa: buscador + píldoras de tipo + filtro de estado + Resumen + grid. **Sin** el bloque «en curso».

Más: **detalle de colección** (frame B, ruta propia) y **hoja «Añadir a colección»** (frame D) disparable desde ficha y grid.

### Qué NO entra (YAGNI / diferido)
- **Visibilidad pública** de colecciones: se prepara la columna pero la RLS es solo-dueño; la superficie de perfil no la dibuja la maqueta → se activa en otra iniciativa.
- **Colas**: sale de la navegación visible de «Mi Biblioteca». La ruta `?tab=colas` sigue viva (feature no borrada, `happy-path.spec.ts` sigue verde) hasta decidir su sitio. Su restyle (plan 02 T6) queda pendiente.
- **«Nota media» de la colección**: se muestra (derivada) pero sin ordenación por nota entre colecciones en S1 (el «Ordenar» dentro del detalle sí, en S2).

## 2. Modelo de datos

Dos tablas nuevas. Nada de recuentos/portadas materializados: se derivan por consulta (las colecciones son pocas y personales).

```sql
-- Colección = estantería/sello del usuario.
create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  visibility  text not null default 'private' check (visibility in ('private','public')),
  position    integer not null default 0,           -- orden manual del grid
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index collections_user_idx on public.collections (user_id, position, created_at);

-- Ítem colocado en una colección. Un ítem puede estar en varias (M:N), sin duplicar.
create table public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  item_type     item_type not null,                 -- enum existente (book|movie|series)
  item_id       uuid not null,
  position      integer not null default 0,         -- orden manual dentro de la colección
  added_at      timestamptz not null default now(),
  primary key (collection_id, item_type, item_id)
);
create index collection_items_col_idx on public.collection_items (collection_id, position, added_at);
```

Notas:
- `item_type` reutiliza el enum del proyecto (confirmado: `create type item_type as enum ('book','movie','series')`, `schema-baseline.sql:174`). **No** hay FK a `books/movies/series` porque son tablas distintas por tipo (mismo patrón polimórfico que `passes`/`club_activity_items`). La integridad «el ítem existe en catálogo» se resuelve en la capa de datos al hidratar (los que no casan, se descartan — como ya hace `getLibraryItems`).
- `updated_at` de `collections` se toca al añadir/quitar ítems (trigger o desde la server action) para ordenar por «Recientes».
- Derivados por consulta: **recuento** = `count(collection_items)`; **abanico** = las 3 portadas más recientes (por `position`/`added_at`); **nota media** = media de `passes.rating` del último pase cerrado de cada ítem de la colección (mismo criterio que `latest-rating.ts`).

## 3. RLS

Solo el dueño. `visibility` existe pero se ignora hasta que haya superficie pública.

```sql
alter table public.collections enable row level security;
create policy collections_owner on public.collections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.collection_items enable row level security;
create policy collection_items_owner on public.collection_items
  for all using (
    exists (select 1 from public.collections c
            where c.id = collection_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.collections c
            where c.id = collection_id and c.user_id = auth.uid())
  );
```

Al abrir visibilidad pública (futuro) se añadirá un `using` alternativo `visibility = 'public'` para lectura; por eso la columna nace ya.

## 4. Capa de datos (`src/lib/library/collections.ts`, nuevo)

- `listCollections(supabase, userId, { sort })` → `CollectionCard[]` con `{ id, name, count, fanCovers: string[3], accentType }` (el dot del recuento usa el tipo dominante o un acento por defecto). `sort`: `recent` (default, por `updated_at`), `name`, `size`.
- `getCollection(supabase, userId, id)` → `{ collection, items: LibraryItem[], avgRating }` — reutiliza la hidratación de `getLibraryItems` para los ítems (portada, estado, nota). `null` si no existe o no es del dueño (→ `notFound()`).
- Server actions (`src/lib/library/collection-actions.ts`, nuevo): `createCollection(name)`, `renameCollection(id, name)`, `updateCollectionDescription(id, text)`, `deleteCollection(id)`, `reorderCollections(ids[])`, `addItemToCollections(itemType, itemId, collectionIds[])` / `setItemCollections(...)` (la hoja D marca/desmarca varias de golpe), `reorderCollectionItems(id, keys[])`. Todas con `revalidatePath('/coleccion')` y la ruta del detalle.

## 5. Pantallas, rutas y componentes

| Frame | Ruta | Componente(s) |
|---|---|---|
| A · Colecciones grid | `/coleccion` (subtab `colecciones`, default) | `CollectionsGrid` (nuevo) + `CollectionCard` con abanico |
| C · Todo | `/coleccion?tab=todo` | reutiliza `LibraryFilters` (ahora con píldoras de tipo + estado) + `CollectionSummary` (v1) + grid `LibraryItemCard inCollection` (v1) |
| B · Detalle | `/coleccion/c/[id]` | `page.tsx` nuevo (topbar ‹ + nombre + ⋯) + `CollectionDetail` (dethead con abanico, descripción, acciones, grid ordenable) |
| D · Añadir a colección | — (hoja) | `AddToCollectionSheet` (cliente, `<dialog>`), disparada desde ficha (`item-detail`) y desde `LibraryItemCard` |

Reorg del nav: `collection-tabs.tsx` pasa a `Colecciones · Todo`. El resolver de `tab` en `page.tsx` acepta `colecciones|todo` (default `colecciones`) y **sigue aceptando `colas`** para no romper la ruta viva, pero `colas` no se pinta en las subtabs. La cabecera/​contador de v1 se adapta: en `Colecciones` el header es «N colecciones · M títulos» (frame A); en `Todo`, el Resumen ya trae el total.

Componentes v1 reutilizados en `Todo`: `CollectionSummary`, `LibraryItemCard` (con `inCollection`), el grid. `ContinueStrip` deja de usarse en Colección (se mantiene el componente por si Inicio/Perfil lo comparten; verificar usos antes de borrar).

## 6. Reparto en 2 sesiones

**Sesión 1 — cimientos + Colecciones + detalle**
1. Migración (`collections` + `collection_items` + RLS) vía agente `supabase-schema`; aplicar a **dev**; regenerar `database.types.ts`; anexar a `schema-baseline.sql`.
2. Capa de datos `collections.ts` + acciones básicas (`create`, `rename`, `delete`, `addItemToCollections`).
3. Reorg del nav a `Colecciones · Todo` (Colas oculta, ruta viva); `Todo` = el grid actual movido (sin «en curso»), Resumen incluido.
4. `Colecciones` grid (frame A) + `CollectionCard` con abanico + tile «Nueva colección» (crea y entra al detalle).
5. Detalle (frame B) en `/coleccion/c/[id]`: cabecera, descripción, grid de ítems, `notFound()` para ajeno.
6. Rename «Mi Biblioteca» (i18n + `h1` + nav).

**Sesión 2 — Todo fino + añadir + ordenar**
7. Píldoras de tipo + filtro de estado en `Todo` (frame C; `LibraryFilters` con `showTypeFilter`).
8. Hoja «Añadir a colección» (frame D) desde ficha y grid (multi-selección + crear nueva + «Hecho»).
9. «Ordenar» en el detalle (reordenar ítems) + menú ⋯ (renombrar/descripción/borrar).

Cada sesión es un PR propio. La migración va a **dev** en S1; a **prod** al mergear (patrón del proyecto).

## 7. Verificación

- e2e nuevo `coleccion-v2.spec.ts`: crear colección, añadir un ítem (siembra REST), verla en el grid con recuento, abrir detalle, borrar; un no-dueño (o sin sesión) no ve colecciones ajenas. Limpieza en `finally` (patrón de los specs de clubes).
- Navegador: frames A/B/C/D a 400 y 1280, claro y oscuro.
- `tsc`/`eslint` limpios; `happy-path` (ruta `?tab=colas` viva) y `pase-hub` sin regresión.
- Advisors de Supabase tras la migración (RLS habilitada, sin `SECURITY DEFINER` colgando).

## 8. Cabos sueltos anotados
- Nombre de sección en la **nav global** (`top-nav`/tabbar): la maqueta dice «Mi biblioteca» — se cambia junto al `h1`; si choca con plan 07, se reconcilia allí.
- «Nota media» de colección: derivada; si sale cara, cachear más adelante (no en S1).
