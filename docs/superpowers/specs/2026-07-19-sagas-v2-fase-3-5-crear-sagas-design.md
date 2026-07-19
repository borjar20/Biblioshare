# Sagas v2 · fase 3.5 — Crear y curar sagas (diseño)

> Adenda al spec principal `2026-07-19-sagas-v2-design.md`. Aprobada en
> brainstorming el 2026-07-19. La antigua fase 4 (pestaña Sagas de Mi
> Biblioteca) pasa a ser la **fase 5**, sin cambios de alcance.

## Problema

Tras las fases 1–3, una saga solo puede nacer de tres maneras: desde el modo
edición de la ficha de un ítem (`assignItemToSaga`, que crea la saga como
efecto colateral y cuya UI solo muestra la chip primary), automáticamente desde
las colecciones TMDB (`persist-collection.ts`), o como subsaga desde el editor
del grafo de una saga que ya existe (`createChildSaga`). No hay forma de crear
un universo «desde arriba» (UCM), no existe ningún índice navegable de sagas, y
la ficha de saga no permite editar sus metadatos (nombre, sinopsis, portada).

## Decisiones (brainstorming 2026-07-19)

| Tema | Decisión |
| --- | --- |
| Puntos de entrada | Tres: «Anidar en universo» desde la ficha de saga, índice `/sagas` con «Nueva saga», y multi-chip en la ficha del ítem |
| Carácter de `/sagas` | Público (exploración + seguir) con curación condicional collaborator+ — patrón `canConfigure` de la ficha de saga |
| Flujo de creación | Hoja mínima (nombre + acento) → redirect a la ficha de la saga nueva |
| Edición de metadatos | Completa: nombre, sinopsis, portada (service-role), acento y universo padre |
| Encaje en el roadmap | Fase propia (PR propio) antes de la fase de biblioteca |

## 1. Índice `/sagas`

Ruta nueva `src/app/sagas/page.tsx`, accesible sin sesión (la policy de SELECT
de `sagas` ya es `anon, authenticated`).

- **Buscador** arriba, reutilizando `search-sagas.ts` (el backend del
  `SagaPicker`). Buscar filtra la lista por nombre (server, por query param).
- **Lista de sagas raíz** (`parent_saga_id IS NULL`), orden alfabético:
  tarjeta estilo Paper con portada (`cover_url`, o placeholder con el acento de
  la saga), nombre, nº de títulos (miembros de `saga_items` de la raíz y sus
  descendientes, mismo criterio que la ficha) y las subsagas como chips con su
  punto de color. Las subsagas no tienen tarjeta propia: se llega a ellas por
  las chips o por el buscador (que sí busca en todas).
- **Botón «Seguir»** por tarjeta para autenticados (reutiliza
  `saga-follow-button` / `follow-actions.ts`).
- **Botón «Nueva saga»** visible solo collaborator+ → abre la hoja de creación
  (§2).
- **Entrada de navegación**: enlace a `/sagas` desde la página de
  búsqueda/explorar del catálogo.

Sin paginación en esta fase: el catálogo de sagas es pequeño; si crece, se
pagina en una iteración posterior (YAGNI).

## 2. Crear una saga

### Hoja «Nueva saga» (desde `/sagas`)

Formulario corto: **nombre** (obligatorio) + **acento** (paleta de
`SAGA_ACCENT_SEQUENCE`, sin beige, la misma del editor del grafo). Al guardar:

- Server action `createSaga(name, accentColor)` → inserta saga `source:
  'manual'` con `accent_color` → redirect a `/saga/[id]`.
- Gate collaborator+ en la action (patrón `requireCollaborator` de
  `editor-actions.ts`). La RLS permite a cualquier autenticado crear sagas
  sueltas (lo necesita el cache-as-you-go), pero este flujo de UI es curación.

Desde la ficha recién creada ya existen el editor del grafo (añadir miembros,
subsagas, nodos) y la edición de metadatos (§3): el patrón es «creo el
contenedor y luego lo relleno».

### «Anidar en universo» (desde la ficha de una saga)

Botón collaborator+ en la ficha de la saga (junto al de configurar el grafo)
que abre una hoja con:

- **`SagaPicker`** para elegir un universo existente como padre, **o** un campo
  de nombre para **crear el universo nuevo** en el mismo gesto (patrón
  buscar-o-crear de `assignItemToSaga`: reutiliza una saga manual homónima
  case-insensitive o la crea).
- Server action `setParentSaga(sagaId, parentSagaId | { newName, accent })`.
  El trigger `saga_parent_no_cycle` (fase 1) protege contra ciclos; la policy
  de UPDATE con jerarquía ya exige collaborator+ vía la action.
- Tras guardar, redirect a la ficha del universo padre.

Caso UCM: desde la ficha de «Iron Man» → «Anidar en universo» → escribes
«UCM» → nace el universo con Iron Man como subsaga.

## 3. Editar la ficha de saga

Botón «Editar ficha» (collaborator+) en la ficha de saga → superficie de
edición con:

- **Nombre** (obligatorio), **sinopsis** (`overview`), **acento** (misma
  paleta) y **universo padre** (selector con `SagaPicker` + opción «Quitar del
  universo» → `parent_saga_id = null`). «Anidar en universo» (§2) es un atajo
  a esta misma superficie con el foco en el selector de padre.
- **Portada**: subida por server action con service-role (Storage no valida
  ES256 — mismo patrón que las portadas del catalog-editor de ítems),
  actualizando `cover_url`.
- Server action `updateSagaMeta` gated collaborator+. La policy de UPDATE de
  `sagas` (`authenticated`, `true`) se queda como está: la necesita el
  cache-as-you-go de TMDB; el gate de curación vive en la action, como en el
  resto de la app.

**Sin migraciones**: `name`, `overview`, `cover_url`, `accent_color` y
`parent_saga_id` ya existen.

## 4. Multi-saga real en la ficha del ítem

El bloque de sagas del `catalog-editor` deja de mostrar solo la chip primary:

- **Todas las membresías** del ítem como chips (vía `getItemSagas`), cada una
  con su aspa (`removeItemFromSaga` ya borra solo esa membresía).
- La primary lleva una **marca visual**; las demás ofrecen **«hacer
  principal»** → action nueva `setPrimarySaga(itemType, itemId, sagaId)` que
  des-primaria la actual y promociona la elegida (dos updates; el índice
  parcial `saga_items_primary_idx` exige el orden des-primariar → promocionar).
- El formulario de añadir (nombre + posición) se queda igual:
  `assignItemToSaga` ya añade sin pisar las demás membresías.

## 5. Permisos

Todo botón de curación (Nueva saga, Anidar, Editar ficha, hacer principal) es
collaborator+ y su server action repite el gate (`requireCollaborator`). Las
vistas (`/sagas`, ficha de saga) siguen siendo públicas.

## 6. Verificación

- **Vitest** para la lógica pura que surja (p. ej. orden/agregación de la
  lista del índice), colocado junto al código como el resto de `src/lib/sagas`.
- **QA en navegador** (dev) con el usuario colaborador de pruebas.
- **E2E** (`e2e/sagas-v2-curacion.spec.ts`, specs ejecutados
  individualmente): flujo colaborador completo — crear saga desde `/sagas`,
  anidar otra bajo ella, editar la ficha (nombre/sinopsis), y comprobar el
  multi-chip + «hacer principal» en la ficha de un ítem. Restaurar el estado
  del seed al terminar.

## Fuera de alcance

- Pestaña Sagas de Mi Biblioteca (fase 5) y la resolución de la tensión
  §1.5/§3.5 del order_no de nodos-saga (sigue pendiente para esa fase).
- Borrar sagas desde la UI.
- Paginación/facetas del índice `/sagas`.
- Retos por saga recursivos (anotado en fase 1).
