# Itinerarios de lectura en sagas-universo — diseño

> **[Canónico · verificado contra el repo el 2026-07-22]**
> Spec de diseño. La narrativa de *cómo* se implementó irá creciendo aquí; el estado de la feature
> vive en `docs/requirements/backlog.md` y lo accionable, en issues.

## El problema

Las sagas-universo grandes no tienen un orden de lectura, tienen varios. Mundodisco son 41 libros
con subseries (La Guardia, La Muerte, Rincewind, Tiffany Aching) y la pregunta real del lector no es
"¿cuál es el orden?" sino "¿por dónde entro?". La respuesta legítima cambia según lo que busques.

Hoy Biblioshare solo sabe expresar **un** orden por saga: el grafo curado (`saga_nodes` +
`saga_edges`), con un toggle **Orden de lectura | Publicación** donde la segunda opción se calcula al
vuelo por año. No hay sitio para "La Guardia (8 libros)" ni para "Solo lo esencial (6)".

## Qué se construye

Un itinerario (o "ruta") es una **secuencia curada y con nombre** de obras y subsagas dentro de una
saga. Una saga puede tener varias; el lector elige cuál está viendo y puede **adoptar** una, que la
app recuerda.

El toggle actual se convierte en el selector de ruta: "Orden de lectura" y "Publicación" pasan a ser
dos rutas más a ojos del usuario.

### Fuera de alcance (issues aparte)

- **Rol + colocación** de un miembro (precuela, spin-off, "léelo en cualquier punto"). Es la feature
  hermana y la base compartida; se decidió hacer los itinerarios primero.
- **Tándem** con guía de intercalado (dos obras compartiendo hueco, tipo Trono de Cristal).
- **Rutas creadas por usuarios**, públicas o privadas. Requiere RLS, autoría, moderación y
  descubrimiento: es una feature en sí misma.
- **Arreglo de permisos de `saga_items`** (ver "Deuda que se toca de refilón").

## Modelo de datos

Ninguna tabla existente cambia. `saga_nodes`, `saga_edges` y `saga_items` se quedan como están.

### `saga_routes`

| columna | tipo | notas |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `saga_id` | uuid | NOT NULL, FK → `sagas(id)` ON DELETE CASCADE |
| `slug` | text | NOT NULL, para la URL `?ruta=<slug>` |
| `name` | text | NOT NULL, ≤ 80 |
| `summary` | text | nullable, ≤ 280 — "para quien quiera la parte policíaca" |
| `position` | integer | NOT NULL, orden en el selector |
| `created_at` | timestamptz | NOT NULL, default `now()` |

- UNIQUE `(saga_id, slug)`.
- CHECK: `slug` no puede ser `lectura` ni `publicacion` (slugs reservados, ver abajo).
- RLS: SELECT público (anon incluido); `for all` a `has_min_role('collaborator')`. Igual que
  `saga_nodes`.

### `saga_route_entries`

| columna | tipo | notas |
|---|---|---|
| `id` | uuid | PK |
| `route_id` | uuid | NOT NULL, FK → `saga_routes(id)` ON DELETE CASCADE |
| `position` | integer | NOT NULL, CHECK > 0 |
| `item_type` | `public.item_type` | nullable (XOR) |
| `item_id` | uuid | nullable, sin FK (polimórfico, como en `saga_nodes`) |
| `child_saga_id` | uuid | nullable, FK → `sagas(id)` ON DELETE CASCADE |
| `note` | text | nullable, ≤ 200 — "a partir de aquí ya puedes parar" |
| `created_at` | timestamptz | NOT NULL, default `now()` |

- CHECK `saga_route_entries_ref_xor`, calcado de `saga_nodes_ref_xor`: o `(item_type, item_id)` con
  `child_saga_id` nulo, o al revés.
- UNIQUE `(route_id, position)`. Como el guardado es reemplazo total (borrar + reinsertar dentro de
  una función), no hace falta que sea diferible.

### `saga_route_choices`

| columna | tipo | notas |
|---|---|---|
| `user_id` | uuid | FK → `auth.users(id)` ON DELETE CASCADE |
| `saga_id` | uuid | FK → `sagas(id)` ON DELETE CASCADE |
| `route_slug` | text | NOT NULL |
| `created_at` | timestamptz | NOT NULL, default `now()` |

- PK `(user_id, saga_id)`.
- RLS solo-dueño, clonando `saga_follows`.

### RPC `save_saga_route(p_route_id uuid, p_entries jsonb)`

Reemplazo total atómico (borra las entradas de la ruta y reinserta), `SECURITY DEFINER` con gate
`has_min_role('collaborator')` interno. Es el mismo patrón y las mismas garantías que
`save_saga_graph`.

## Dos decisiones y su porqué

### Las rutas sintéticas no se materializan

"Orden de lectura" y "Publicación" **no** son filas de `saga_routes`. Se sintetizan en código con los
slugs reservados `lectura` y `publicacion`, exactamente como se calculan hoy.

El motivo es evitar una segunda fuente de verdad. Si `lectura` fuese una fila, habría que
resincronizarla con el grafo en cada edición de éste, y dos representaciones del mismo orden que
pueden divergir es precisamente la familia de fallo del issue **#91** (se duplicó la regla del orden
principal y aparecieron dos progresos que discrepaban). Como efecto secundario, el toggle "se
convierte en selector" de cara al usuario sin migrar ni un solo dato existente.

### La adopción guarda el slug, no el `route_id`

`saga_route_choices.route_slug` es texto, no una FK. Así una elección puede apuntar tanto a una ruta
curada como a una sintética, y si un curador borra una ruta la preferencia **degrada sola** al orden
por defecto, en vez de dejar una FK rota o un registro fantasma que haya que limpiar.

## UI de lectura

### Selector

`OrderToggle` (`src/components/saga/order-toggle.tsx`) pasa a ser `RouteSelector` y se adapta al
número de rutas:

- **Dos rutas** (el caso de todas las sagas de hoy): el mismo par de links SSR de ahora. Cero
  regresión visual.
- **Tres o más**: tira de chips.

La URL pasa de `?orden=publicacion` a `?ruta=<slug>`, con redirect de compatibilidad para no romper
enlaces ya compartidos.

### Cabecera de ruta

Nombre, `summary` en una línea, y **contador propio**: "llevas 3 de 8 de esta ruta". El progreso del
hero no se toca y sigue diciendo "9 de 41" mires la ruta que mires.

### Entradas

- **Obra**: se pinta como hoy.
- **Subsaga**: bloque con el acento de color de esa subsaga (`SAGA_ACCENT`, ya existente) y su
  recuento — "Rincewind · 8 libros". **Plegado por defecto**, desplegable en sitio: al abrir "La
  Guardia" ocho portadas de Rincewind no deben sepultar el paso siguiente. Que el bloque use el mismo
  acento que esa subsaga tiene en el resto de la ficha lo hace reconocible de un vistazo.
- `note`, si existe, bajo la entrada.

### Adopción

Botón "Leer por aquí" en la cabecera → escribe `saga_route_choices`. Al volver a la saga, la ficha
abre por esa ruta; la tarjeta de saga en Mi Biblioteca indica por cuál vas. Reversible con un clic.

**La ruta no cambia el progreso guardado, no filtra la biblioteca y no oculta obras.** Solo cambia
qué lista ves y en qué orden.

## Curación

Editor **lineal**, no React Flow: una ruta es una secuencia, el lienzo 2D no aporta nada y arrastra
640px de grafo, coste de bundle y un modelo mental que no toca. Lista reordenable por drag & drop.

Dos rutas nuevas, ambas con gate duro collaborator+ como `/saga/[id]/mapa/editar`:

- `/saga/[id]/rutas` — lista de rutas: crear, renombrar, reordenar, borrar.
- `/saga/[id]/rutas/[slug]/editar` — los pasos de una ruta.

Se **reutiliza** `editor-left-panel.tsx` (el panel izquierdo del editor de grafo), que ya resuelve
buscar en catálogo y listar subsagas: es el mismo gesto de "traer algo a la derecha". Añadir un
bloque es arrastrar una subsaga en vez de una obra.

### Validación previa al guardado

En la línea de `validate-graph-draft.ts`:

- Posiciones consecutivas desde 1.
- XOR respetado; sin entradas duplicadas dentro de la ruta.
- Sin bloques que apunten a una saga que no sea descendiente de ésta.
- **Aviso no bloqueante** si la ruta deja fuera obras del orden principal. Informativo a propósito:
  una ruta parcial ("solo lo esencial") es justo el caso de uso.

## Progreso, o cómo no repetir el #91

El contador de ruta es un **segundo sitio** donde se cuenta "cuánto llevas", y la tentación es
escribir ahí mismo tres líneas de `filter(x => x.status === "completed")`. Eso es literalmente lo que
se hizo la vez anterior y lo que produjo dos números que discrepaban.

**Regla:** se extrae el predicado de completado de `src/lib/sagas/main-order.ts` a una función
compartida, y el contador de ruta la consume. Si alguien cambia qué cuenta como "leído", cambia en un
sitio.

El progreso del hero, el de Mi Biblioteca y `computeProgress` siguen usando el orden principal, sin
modificación alguna.

## Riesgos conocidos

**Expansión de bloques.** Un bloque-subsaga se despliega con la misma recursión y el mismo
`MAX_DEPTH = 4` que ya usa `createMainOrder`, no con una travesía nueva.

**Referencias colgantes.** `item_id` no tiene FK (es polimórfico). Una entrada que apunte a algo
inexistente se descarta en render **y también del denominador** del contador de ruta.

Esto se aparta a propósito de lo que hace hoy el grafo: en `graph-data.ts:76-78` un nodo huérfano se
omite al pintar, pero `createMainOrder` (`get-saga-detail.ts:370-377`) lo sigue contando en el
denominador, así que ese progreso **nunca puede llegar al 100%** (hay un comentario reconociéndolo en
`group-members.ts:114-116`). No se replica el fallo. Corregirlo en el grafo es otra issue.

## Pruebas

**Unitarias** — donde está la lógica: resolución de rutas y contador, cubriendo bloques anidados,
entradas huérfanas y rutas parciales.

**E2E**, en la línea de `e2e/sagas-v2-mapa.spec.ts`:

1. Seleccionar una ruta y ver su lista y su contador.
2. Adoptarla y comprobar que persiste al volver a la saga.
3. **Que el número del hero no se mueva al cambiar de ruta.** Ésta es la red contra el #91.
4. Que `?orden=publicacion` siga funcionando vía redirect.

## Deuda que se toca de refilón

`saga_items` tiene hoy INSERT y DELETE abiertos a cualquier `authenticated`
(`supabase/schema-baseline.sql:531-532`) mientras que UPDATE exige collaborator+
(`20260719_saga_items_update_policy.sql:6-9`). Las tablas nuevas nacen bien, pero **esta asimetría no
se arregla en esta PR**: es un cambio de permisos en producción y merece su propio diagnóstico, no ir
de polizón en una feature. Queda como issue.
