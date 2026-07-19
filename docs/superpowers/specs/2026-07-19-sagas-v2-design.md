# Sagas v2 — universos, grafo de lectura y seguimiento

**Fecha:** 2026-07-19
**Mockup de referencia:** `Biblioshare_mockups/Biblioshare/design_handoff_biblioshare_paper/Paper - Sagas (grafo de lectura).html` (frames A–F + COL)
**Estado de partida:** sistema de sagas plano (`sagas`/`saga_items`, migración `add_people_credits_sagas`), sin jerarquía, con `position`, restricción «un ítem = una sola saga», autopoblado desde colecciones TMDB (películas) y manual para libros. Curación = collaborator+ (REQUIREMENTS §7.34/§7.35).

## Decisiones tomadas en brainstorming

| Tema | Decisión |
| --- | --- |
| Subsagas | **Sagas reales anidadas** (`parent_saga_id`), no grupos ligeros. Iron Man sigue siendo saga completa con ficha propia; UCM es otra saga que la contiene. Las colecciones TMDB existentes se reutilizan como subsagas. |
| Membresía | **Un ítem puede estar en N sagas** (se elimina el `UNIQUE (item_type, item_id)`). Se añade `is_primary` para la saga mostrada en el strip de la ficha de obra. |
| Nodos del grafo | **Mixto en el mismo lienzo**: el moderador puede colocar nodos-ítem y nodos-saga (una subsaga entera como nodo) en el mismo grafo. |
| «Seguir» sagas | **Solo follow explícito**: la pestaña Sagas de Mi Biblioteca lista únicamente sagas seguidas con el botón «Seguir esta saga». Sin inclusión implícita por tener ítems suyos. |
| Modelo de datos del grafo | **Relacional** (`saga_nodes` + `saga_edges`), no blob JSONB. |
| Render | **React Flow (`@xyflow/react`)** para viewer (read-only) y editor, con nodos/aristas custom estética Paper. |
| RBAC | Editar grafo/jerarquía = **collaborator+** (mismo gate que el resto de curación de sagas). |
| Orden de publicación | Derivado del año ya presente en `books/movies/series`; no se persiste. |

## 1. Modelo de datos

### 1.1 Jerarquía (`sagas`)

- Nueva columna `parent_saga_id uuid null references sagas(id) on delete set null`.
- Profundidad arbitraria, con **trigger anti-ciclos** (rechaza un `parent_saga_id` que convierta la cadena de ancestros en un ciclo).
- Nueva columna `accent_color text null`: token de la paleta Paper (`terracota | verde | teal | ambar | purpura | beige`). Se usa cuando la saga se pinta como subsaga dentro de la ficha del padre. Si es null, el renderizador asigna uno rotatorio estable (por índice de grupo).
- El «Nexo (sin subsaga)» del mockup **no es una entidad**: es un ítem miembro directo de la saga universo sin membresía en ninguna hija. Se pinta con el color neutro (beige/spine).

### 1.2 Membresía (`saga_items`)

- Se elimina `saga_items_item_key` (`UNIQUE (item_type, item_id)`) y se restaura `UNIQUE (saga_id, item_type, item_id)`.
- Nueva columna `is_primary boolean not null default false` + índice único parcial sobre `(item_type, item_id) WHERE is_primary`.
  - La primera membresía de un ítem se marca primary automáticamente (en las server actions de alta).
  - Un collaborator+ puede cambiar cuál es la primary.
  - `getItemSagas` pasa a ordenar: primary primero, luego `created_at` (el código de lectura ya devuelve array).
- El strip/breadcrumb de la ficha de obra usa la saga primary; `SagaList` sigue mostrando todas.

### 1.3 Grafo (`saga_nodes` + `saga_edges`)

El grafo pertenece a una saga. La pestaña «Mapa de lectura» existe si la saga tiene ≥1 nodo.

**`saga_nodes`**

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid pk | |
| `saga_id` | uuid → `sagas` on delete cascade | Saga dueña del grafo |
| `item_type` / `item_id` | `public.item_type` / uuid, nullable | Referencia polimórfica a ítem |
| `child_saga_id` | uuid → `sagas` on delete cascade, nullable | Nodo-saga |
| `x`, `y` | real | Coordenadas de lienzo |
| `level` | enum `saga_node_level` (`principal` \| `menor`) | Portada grande vs medallón |
| `order_no` | integer null | Nº en el orden principal; alimenta lista lineal y badges de Info |
| `label_override` | text null | Título mostrado en el grafo |

- CHECK: exactamente una de las dos referencias (par ítem completo XOR `child_saga_id`).
- UNIQUE `(saga_id, item_type, item_id)` y UNIQUE `(saga_id, child_saga_id)` (parciales).
- **Regla de opcionalidad**: un título es «opcional / spin-off» si su nodo no tiene `order_no` (o si no tiene nodo). No hay flag aparte.

**`saga_edges`**

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid pk | |
| `saga_id` | uuid → `sagas` on delete cascade | Denormalizado para RLS/queries |
| `from_node` / `to_node` | uuid → `saga_nodes` on delete cascade | CHECK `from_node <> to_node` |
| `edge_type` | enum `saga_edge_type` (`principal` \| `opcional` \| `requisito`) | |

- UNIQUE `(from_node, to_node)`.

**Derivaciones (una sola fuente de verdad):**

- **La subsaga de un nodo se deriva, no se guarda**: nodo-ítem → ¿en qué saga hija del universo milita (`saga_items`)? → ese es su grupo/color. El selector «Subsaga» del editor edita `saga_items`. Info y grafo no pueden discrepar.
- **Grafo ⊆ miembros**: añadir un nodo-ítem al grafo añade también su membresía directa a la saga si no la tenía.

### 1.4 Seguimiento (`saga_follows`)

- `user_id uuid` (→ usuario), `saga_id uuid → sagas on delete cascade`, `created_at`; PK `(user_id, saga_id)`.
- RLS: SELECT/INSERT/DELETE solo el dueño.

### 1.5 Lo que NO se guarda

- **Orden de publicación**: derivado del año del catálogo en lectura.
- **Progreso y «siguiente por leer»**: calculados con joins contra `library_entries`/pases, usando una **CTE recursiva** sobre `parent_saga_id` (profundidad capada, p. ej. 4, como cinturón extra frente a ciclos).
  - **Regla de cómputo (aplica en hero, cards y timeline)**: el denominador son los títulos del orden principal. Con grafo: nodos con `order_no`, expandiendo cada nodo-saga a los títulos del orden principal de esa saga (recursivo). Sin grafo: todos los miembros (por `position`). Los opcionales nunca penalizan el %.
- **Estado borrador del editor**: los cambios viven en cliente hasta «Guardar grafo». Sin columna draft.

### 1.6 RLS y migraciones

- Patrón actual: SELECT público en `sagas`/`saga_items`/`saga_nodes`/`saga_edges`; INSERT/UPDATE/DELETE de curación = collaborator+; `saga_follows` = dueño.
- Migraciones (primero dev, prod al desplegar):
  1. `sagas`: `parent_saga_id`, `accent_color`, trigger anti-ciclos.
  2. `saga_items`: drop `saga_items_item_key`, add `UNIQUE (saga_id, item_type, item_id)`, add `is_primary` + índice parcial (backfill: membresía existente → primary).
  3. Enums + `saga_nodes` + `saga_edges` + RLS.
  4. `saga_follows` + RLS.

## 2. Ficha de saga (Info | Mapa de lectura)

Se reconstruye `src/app/saga/[id]/page.tsx` con el patrón hero+tabs de las fichas de obra rediseñadas.

### 2.1 Hero (frames A/D)

- Abanico con las 4 primeras portadas del orden; título; autor/creador dominante; chips (`14 títulos · 3 subsagas · ★ 4,6`).
- Barra de progreso del usuario **segmentada por subsaga** (cada tramo con el color de su subsaga).
- Botón **«Seguir esta saga»** ↔ «Siguiendo ✓» (PC: columna derecha; móvil: pill bajo los chips).
- Si la saga tiene padre: chip «Parte de *{padre}*» enlazando hacia arriba.

### 2.2 Pestañas

- `Info` (por defecto) y `Mapa de lectura` (solo si ≥1 nodo; con `cfgdot` de acento). Mismo componente de tabs que la ficha de obra.

### 2.3 Pestaña Info

- Sinopsis (`overview`; dos columnas en PC).
- Nota dorada «Orden de lectura disponible → pestaña Mapa» si hay grafo.
- **Títulos agrupados por subsaga**: cada saga hija = grupo con tick de color y contador; miembros directos sin subsaga → grupo «Nexo» beige. Celda: portada, badge `order_no`, estado del usuario (✓ leído / ◉ leyendo), contorno punteado si es opcional.
- Orden de los grupos: por menor `order_no` contenido; **sin grafo, por `position` actual** (la Info funciona igual aunque nadie haya configurado grafo).

### 2.4 Pestaña Mapa de lectura

- Toggle **Lectura | Publicación**. *Lectura* = grafo/timeline. *Publicación* = lista lineal ordenada por año (no se re-dibuja el grafo por cronología).
- **Móvil (frame B)**: leyenda, CTA «Grafo de lectura → ver completo» (mini-preview SVG estático), **timeline vertical ramificado** y al final «Como lista lineal».
  - Derivación determinista del timeline: columna = nodos con `order_no` agrupados por subsaga (tramo teñido); tarjetas-rama punteadas = destinos de aristas `opcional` colgando de su nodo origen; nexos (miembros directos con aristas que cruzan grupos) = tarjeta-puente entre eras.
- **PC (frame E)**: grafo React Flow embebido bajo las pestañas (fondo oscuro estrellado) + barra de leyenda inferior.

### 2.5 Viewer del grafo (`SagaGraphView`, frames C/E)

- React Flow read-only (sin drag), compartido entre PC embebido y ruta a pantalla completa `src/app/saga/[id]/mapa/page.tsx` (móvil: barra translúcida, zoom ±, hoja de leyenda inferior).
- Nodos custom: **CoverNode** (portada 78×116, borde color subsaga, badges ✓/◉), **MedallionNode** (círculo 58 px, etiqueta mono debajo), **SagaNode** (mini-abanico + nombre + «N títulos»; tap → ficha de esa saga). Pendientes: atenuados, borde discontinuo.
- Aristas custom: sólida color subsaga origen = principal; discontinua ámbar = opcional; punteada beige = requisito. Con flecha.
- Estados ✓/◉/pendiente inyectados desde el cálculo de progreso (§1.5).

### 2.6 i18n

- Todas las cadenas nuevas en `messages/es.json` + `messages/en.json` (grupo `saga.*`).

## 3. Editor del grafo (frame F)

### 3.1 Ruta y acceso

- `src/app/saga/[id]/mapa/editar/page.tsx`, gate collaborator+ (mismo helper que el editor de catálogo).
- PC: tres columnas (herramientas | lienzo | inspector). Móvil: una columna, inspector como hoja inferior; no se bloquea.
- Entrada: botón «Editar grafo» en la pestaña Mapa (collaborator+), o «Configurar orden de lectura» en Info si aún no hay grafo.

### 3.2 Estado y guardado

- Borrador 100 % en cliente (estado React Flow + contador «Borrador · N cambios sin guardar»).
- **«Guardar grafo»** → server action `saveSagaGraph(sagaId, nodes[], edges[])`: **full-replace transaccional** de `saga_nodes`/`saga_edges` de esa saga (delete + insert; nada más referencia esos ids). Última escritura gana (v1).
- Efectos colaterales **incrementales** (no full-replace) en el mismo action: altas de membresía al añadir títulos y cambios de subsaga del inspector (upserts dirigidos sobre `saga_items`).
- «Descartar» recarga desde BD. Revalidación de la ficha al guardar.

### 3.3 Panel izquierdo

- **Añadir título**: buscador reutilizando la escalera de búsqueda de catálogo (crea el ítem de catálogo desde fuentes externas si hace falta). Al elegir: nodo nuevo en el centro del viewport + membresía directa si no la tenía. «＋ Añadir manualmente» **fuera de v1**.
- **Subsagas**: lista de hijas (swatch de color editable con paleta Paper, nombre, contador). «Nueva subsaga» crea saga manual hija; también se puede buscar una saga existente y anidarla (set `parent_saga_id`).
- **Herramientas**: Seleccionar/mover · Conectar (radio del tipo activo: principal/opcional/requisito) · Borrar. El tipo activo determina el `edge_type` de conexiones nuevas.

### 3.4 Lienzo

- React Flow editable: drag actualiza `x,y`; handle→handle crea arista del tipo activo (duplicadas y self-loops impedidos); `Supr` borra selección; zoom ±; hint contextual.

### 3.5 Inspector derecho

- **Nodo-ítem**: portada+título+año; «Título en el grafo» (override); **Subsaga** (dropdown hijas + «Sin subsaga (nexo)»; mueve la membresía en `saga_items`); **Nivel** Principal/Menor; **Orden nº** (aviso inline si colisiona); conexiones entrantes/salientes con ×; **«Quitar del grafo»** (borra nodo+aristas, **no** la membresía).
- **Nodo-saga**: label, nivel, conexiones, quitar.

## 4. Mi Biblioteca — pestaña «Sagas» (frame COL)

### 4.1 Ubicación

- Tercera pestaña de Mi Biblioteca (Colección v2), junto a `Colecciones | Todo`. Misma barra sticky y patrón de tabs.

### 4.2 Seguimiento

- Server actions `followSaga` / `unfollowSaga` sobre `saga_follows`. Las consume el botón del hero (§2.1). Dejar de seguir no toca biblioteca ni historial.

### 4.3 La lista

Query única `getFollowedSagas(userId)` que por saga seguida resuelve (con la CTE recursiva de §1.5):

- **Card**: mini-abanico de 3 portadas, nombre, autor/creador con tipo dominante, tag **«◆ Grafo»** si tiene nodos.
- **Progreso**: barra segmentada por subsaga (universos) o color del tipo de obra (sagas simples); `5 / 14 leídos · 3 subsagas` + %. Sigue la regla de cómputo de §1.5 (solo orden principal, nodos-saga expandidos; opcionales no penalizan).
- **Bloque siguiente** (estados excluyentes):
  1. **«Leyendo ahora»** — pase activo en algún título → esa obra.
  2. **«Siguiente»** — primer título del orden principal (`order_no`, o `position` si no hay grafo) sin terminar.
  3. **«✓ Saga completada · valorada ★ 4,8»** — orden principal completo; media de las valoraciones del propio usuario.
- Tap card → ficha de saga; tap bloque siguiente → ficha de la obra.
- Orden: en curso (actividad reciente arriba) → no empezadas → completadas.
- Estado vacío: explica el botón «Seguir esta saga».

## 5. Fases de implementación (4 PRs)

1. **Modelo + jerarquía + ficha Info**: migraciones (§1), ficha con hero+tabs y la Info agrupada por subsaga (frames A/D). Sin grafo aún: la pestaña Mapa no aparece.
2. **Viewer del grafo**: `SagaGraphView`, timeline ramificado móvil (B), mapa completo (C/E), toggle lectura/publicación.
3. **Editor** (F): lienzo collaborator+, subsagas/colores, conexiones tipadas, `saveSagaGraph`.
4. **Biblioteca**: pestaña Sagas, follow/unfollow, `getFollowedSagas` (COL).

Cada fase incluye sus claves i18n, verificación e2e/browser (docs/TESTING.md) y actualización de REQUIREMENTS.md.

## 6. Fuera de alcance (v1)

- «＋ Añadir manualmente» títulos sin ítem de catálogo.
- Grafos por usuario (los grafos son de catálogo, curados; no personalizables por lector).
- Validación de ciclos en aristas del grafo (solo se impiden duplicadas y self-loops; un ciclo no rompe el timeline porque la columna se deriva de `order_no`).
- Resolución de conflictos de edición concurrente (última escritura gana).
- Social sobre follows de saga (feed, contadores públicos).

## 7. Riesgos y puntos de atención

- **Discrepancia lectura/esquema existente**: `get-item-sagas.ts` ya asume multi-saga; al relajar la restricción hay que revisar `assignItemToSaga` (hoy borra membresía previa y reinserta — pasa a añadir sin borrar) y `persistCollectionMembership` (idempotencia con `is_primary`).
- **`populateTmdbCollection` hace delete+insert de `saga_items`**: debe respetar membresías manuales ajenas a TMDB y no pisar `is_primary` (ajustarlo en la fase 1).
- **Rendimiento**: universos grandes (30+ ítems, N subsagas) → la CTE recursiva y los joins de progreso deben ir en una sola query por vista; capar profundidad.
- **Móvil + React Flow**: verificar pinch-zoom y drag en el editor táctil (qa-verifier).
