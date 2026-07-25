# Rol narrativo de un miembro de saga — diseño

> **[Canónico · verificado contra el repo el 2026-07-22]**
> Spec de diseño para la issue #167. El estado de la feature vive en
> `docs/requirements/backlog.md` y lo accionable, en issues.

## El problema

Hoy una saga solo sabe decir "esta obra es la nº 5", o no decir nada. Todo lo que no tiene número
comparte el mismo tratamiento de posición: contorno discontinuo dorado y ausencia de badge numérico
(`src/components/saga/saga-info.tsx:129-133` y `:141-145`). Los marcadores de estado —✓ de
completado, velo con ◉ de lectura en curso (`:146-161`)— se aplican aparte y son independientes de
`position`. Es decir: una precuela, un relato suelto y un nexo son indistinguibles **en cuanto a qué
son**.

El caso de referencia es **La Rueda del Tiempo**: 14 libros lineales más *Nueva Primavera*, una
precuela que puede leerse en varios puntos. Hoy hay dos formas de expresar algo así, y ninguna
sirve: curar el grafo entero en `/saga/[id]/mapa/editar`, o crear itinerarios lineales en
`/saga/[id]/rutas` (`src/app/saga/[id]/rutas/page.tsx:10-13`, curación `collaborator+` que no toca
`saga_nodes`/`saga_edges`). Las dos son desproporcionadas para una saga que es una lista con una
excepción, y ninguna sabe decir, dentro de un solo itinerario, que una precuela es leíble en varios
puntos.

### El vocabulario ya existe, y miente

Esto es lo que la issue no sabía, y cambia la naturaleza del trabajo: **no estamos añadiendo
vocabulario a un hueco vacío, estamos desambiguando un vocabulario ya conflacionado.** Ninguna
columna dice "spin-off"; las palabras se inventan al vuelo en `deriveTimeline`:

- `derive-timeline.ts:45` — `e.type === "requisito" ? "requisito" : "opcional"`. Una arista
  `principal` hacia un nodo fuera de la espina sale etiquetada **"Spin-off · opcional"**.
- `derive-timeline.ts:78-81` — un nodo suelto dentro de su subsaga se cuelga con
  `edgeType: "opcional"` hardcodeado, sin que ninguna arista lo diga.
- `derive-timeline.ts:64-73` — **"Nexo entre tramos · léelo en cualquier punto"** se dispara para un
  nodo-ítem que cumpla **tres** condiciones: `orderNo === null` (`:65`), `groupSagaId === null`
  (`:67`) y tener al menos una arista a la espina (`:66`). El nodo se emite como `{ kind: "bridge" }`
  y es ese `kind` —no el `groupSagaId`— lo que hace que `reading-timeline.tsx:15` pinte el hint.
  `groupSagaId === null` significa *"miembro directo del universo, sin subsaga"*
  (`get-saga-detail.ts:169`), **no** "léelo donde quieras". Y un nexo sin conexión a la espina se
  descarta en silencio (`:68-69`).

Además el **trazo discontinuo dorado** significa cosas distintas según dónde mires: "opcional" en
SagaInfo (`saga-info.tsx:131`) y "arista opcional" en la leyenda (`graph-legend.tsx:25`, dashed
dorada — ojo, la *punteada* de `:28` es "requisito", justo lo contrario). En el grafo, el
`border-dashed` atenuado marca "no empezado", pero con el color del acento de la saga, no dorado
(`graph-nodes.tsx:44,52,75`).

La spec de itinerarios llamó a esta feature *«la feature hermana y la base compartida»*
(`2026-07-22-sagas-itinerarios-design.md:28-29`) y dejó dicho que se harían los itinerarios primero.
Serlo implica **derogar lo que miente**, no apilarse encima.

## Qué se construye

Un eje: **rol narrativo**, en `saga_items`. Qué *es* la obra dentro de esta saga concreta.

### Un solo eje, no dos

La issue pedía dos ejes ortogonales: rol y **colocación** (hueco fijo / libre / recomendada aquí).
Se construye solo el primero, por dos razones:

1. **`position` ya es el eje de colocación.** `NULL` = sin hueco fijo, número = hueco fijo. Es
   nullable desde siempre (`schema-baseline.sql:522`, sin CHECK ni default). Lo que faltaba nunca
   fue un segundo eje: era el *porqué*.
2. **La colocación fina ya la expresan los itinerarios, y mejor.** `saga_route_entries.position` +
   `note` de 200 chars (`schema-baseline.sql:7391-7407`) dice "aquí, en este paso exacto, y por
   esto" con precisión arbitraria. Un `anchor_from`/`anchor_to` en `saga_items` sería un segundo
   mecanismo diciendo lo mismo peor — y dos capas que pueden contradecirse (obra marcada `libre`
   mientras una ruta curada la fija en el paso 3), con la más expresiva perdiendo.

La issue se escribió antes de que itinerarios se mergeara (#179, #181). Con esa feature en el repo,
la mitad "colocación" está cubierta.

### Fuera de alcance (issues aparte)

- **Tándem** con guía de intercalado, dos obras compartiendo hueco (#168). No se implementa, pero
  ver "Riesgos" — el vocabulario se elige con ella delante.
- **Cambiar el denominador del progreso.** Ver "Decisiones".
- **Arreglar el borrado por omisión** del formulario de alta de saga. Ver "Deuda".
- **La asimetría grafo/sin-grafo** de `main-order.ts`. Ver "Deuda".

## Modelo de datos

Una columna nueva. Ninguna tabla existente cambia de forma.

```sql
create type public.saga_item_role as enum ('precuela', 'spin_off', 'relato', 'paralela');
alter table public.saga_items add column role public.saga_item_role;
```

- **Nullable, sin default, sin backfill.** `NULL` = "sin clasificar".
- Valores en minúscula, siguiendo `saga_edge_type` (`principal`, `opcional`, `requisito`) y
  `saga_node_level` (`schema-baseline.sql:6916-6917`). `spin_off` con guion bajo por ser
  identificador; la presentación ("Spin-off") vive en `messages/es.json`.
- El `ALTER TYPE ... ADD VALUE` va en **su propio fichero de migración** (`data-model.md:231-232`),
  porque Postgres prohíbe usar un valor de enum en la misma transacción que lo añade. El `CREATE
  TYPE` de aquí no tiene esa restricción y puede ir con el `ALTER TABLE`.
- El atributo es **por saga**, gratis: el unique es `(saga_id, item_type, item_id)`. Un libro puede
  ser precuela en una saga y obra principal en otra, que es lo correcto.

Tres cosas salen gratis por ser aditiva y nullable:

- `link_tmdb_saga_item` (`schema-baseline.sql:7290-7322`) y `sync_tmdb_saga_items` (`:7324-7346`)
  siguen funcionando sin tocarse: crean filas sin mencionar la columna nueva y obtienen `NULL`.
- RLS ya está resuelta y la columna hereda sin trabajo adicional: SELECT público (`:530`) y
  escrituras directas `collaborator+` — INSERT lo cerró #169
  (`20260722_saga_items_rls_hardening.sql:104-108`); UPDATE (`20260719_saga_items_update_policy.sql:6-9`)
  y DELETE (`rbac_curation_hardening` §4) ya lo exigían de antes. **Excepción**: las `SECURITY
  DEFINER` `link_tmdb_saga_item`/`sync_tmdb_saga_items` (mismo fichero, `:30-99`) siguen escribiendo
  sin rol, acotadas a `sagas.source = 'tmdb'`.
- Despliegue **puramente aditivo**, sin dependencia de orden con el código. Dev primero
  (`supabase-dev`), verificando contra objetos reales (`pg_class`/`pg_proc`/`pg_attribute`), **nunca
  contra `list_migrations`**, luego prod.

### Por qué no hay backfill

Podría parecer razonable backfillear los `position IS NULL` existentes a un valor tipo "suelto". No
se hace: **sería escribir una mentira masiva en la BD.** Buena parte de esos nulls son descuido de
curación — que es literalmente la queja de la issue —, no una decisión editorial de que la obra sea
opcional.

Con `NULL` = "sin clasificar", una obra sin número deja de afirmar "soy opcional" (que era falso) y
pasa a decir honestamente "nadie ha dicho todavía qué soy", que es lo que siempre fue. Y le da al
curador una señal de trabajo pendiente en vez de enterrarla bajo un valor inventado.

## Decisiones y su porqué

### El rol no toca el denominador del progreso

Marcar una obra como precuela **no la saca del cómputo**. Quién cuenta para el progreso de la saga
—hero, cards de Mi Biblioteca, timeline— lo siguen decidiendo `position`/`order_no` exactamente como
hoy, dentro de `src/lib/sagas/main-order.ts`, única definición del orden principal. (El progreso de
un *itinerario* se calcula aparte, en `src/lib/sagas/resolve-route.ts:15-52`, sobre sus propias
entradas; el predicado de «completado» vive en `src/lib/sagas/completion.ts:10-24`. Ninguno de los
dos cambia aquí.)

Duplicar o bifurcar la regla del progreso es la familia de fallo del **#91** (el hero decía 2/7
donde la card decía 2/5). Está reenunciada en al menos cinco documentos que descienden todos de la
§1.5 de sagas v2 —la mención canónica y vigente es `data-model.md:244-248`— y el **#170** acaba de
asentar el criterio de qué entra. Un cambio de cálculo de progreso no viaja de polizón en una PR de
vocabulario visual.

Hay una asimetría real ahí debajo —con grafo los opcionales se excluyen, sin grafo se cuentan— pero
es **preexistente** y se abre como issue con su diagnóstico. Ver "Deuda".

### Se retira el contorno discontinuo dorado de la pestaña Info

Dentro de la sección nueva "Fuera del orden principal" el contorno discontinuo es redundante: la
sección ya dice eso. Retirándolo de `saga-info.tsx:131`, el **dorado discontinuo** deja de tener dos
significados y queda solo como "arista opcional" en el lenguaje del grafo (`graph-legend.tsx:25`).
El `border-dashed` de los nodos sin empezar no entra en el conflicto: va con el acento de la saga,
no en dorado.

### El timeline lee el rol real, y se derogan los badges derivados

`branchOptional` (`messages/es.json:1019`) y `bridgeHint` (`:1021`) dejan de calcularse por
heurística. Si el miembro tiene rol, se pinta su rol; si no, no se pinta nada.

Añadir el vocabulario nuevo encima del viejo dejaría dos fuentes para la misma palabra y el timeline
seguiría llamando spin-off a lo que no lo es. Esto rompe dos aserciones de
`e2e/sagas-v2-mapa.spec.ts:38,40`, que fijan las cadenas literales — es **cambio esperado, no
regresión**.

## UI de lectura

Tres sitios, y conviene saber cuál sirve a qué.

**La pestaña Mapa se pinta si la saga tiene grafo (`saga_nodes`) _o_ al menos un itinerario curado no
sintético** (`src/app/saga/[id]/page.tsx:75-79`, `saga-tabs.tsx:55-61` — el comentario de `:9-10`
está obsoleto). Pero su contenido de "orden de lectura" —la lista lineal y `ReadingTimeline`
(`saga-map-tab.tsx:72`)— se deriva **del grafo**. Así que para el caso de referencia, una Rueda del
Tiempo sin grafo, **el sitio que importa es `saga-info`**; los otros dos sirven a sagas que ya
tienen grafo curado.

| Sitio | Cambio | ¿Sirve sin grafo? |
|---|---|---|
| `saga-info.tsx:126-168` | Sección "Fuera del orden principal" al final, con chip de rol por obra. Se retira el contorno discontinuo | **Sí** |
| `saga-map-tab.tsx:77-98` | Deja de omitir los no numerados de la lista de **orden de lectura** (hoy `.filter(n => n.kind === "item" && n.orderNo !== null)`) | No |
| `derive-timeline.ts:45,78-81` | Deja de inventar `edgeType`; emite el rol real | No |

Ojo con el alcance de la fila del medio: la que omite es la lista de *orden de lectura*, derivada de
`graph.nodes`. La rama de **publicación** (`saga-map-tab.tsx:36-55`) usa `sortByPublication(allMembers)`
sobre `detail.groups`, así que ésa ya pinta hoy todos los miembros, numerados o no.

El cambio del timeline es **aguas arriba**: `reading-timeline.tsx:101` ya pinta lo que le llega en
`b.edgeType`, no adivina nada. Quien adivina es `deriveTimeline`.

### Flujo del dato hasta el timeline

El rol vive en `saga_items`, pero el timeline opera sobre nodos de grafo. Hay que propagarlo:
`saga_items.role` → el lookup de membresías de `buildSagaGraph` (`graph-data.ts:77,97`) →
`SagaGraphNode` (`graph-data.ts:31-47`) → `deriveTimeline` → `ReadingTimeline`.

No es un camino nuevo: es el mismo por el que ya viaja `groupSagaId`, que tampoco está en el nodo.

### Sección "Fuera del orden principal"

Bloque separado bajo la lista numerada, con chip de rol por obra donde iría el número. Reutiliza el
patrón de agrupación que la pestaña ya tiene, y arregla de paso el bug de fondo: hoy en la lista de
orden de lectura del Mapa esas obras **no aparecen en absoluto**.

**Qué entra en la sección lo decide `position`, no el rol.** Son dos condiciones distintas y conviene
no confundirlas:

- `position === null` → la obra va a la sección. Es el criterio de pertenencia.
- `role !== null` → la obra luce chip de rol. Es el criterio de decoración.

De donde salen los cuatro casos, todos legítimos: numerada con rol (una precuela que además tiene
hueco fijo: se queda en la lista principal, con su número y su chip), numerada sin rol (el caso
normal de hoy), sin número con rol (*Nueva Primavera*: sección, con chip) y **sin número ni rol**
(sección, sin chip — el "sin clasificar" de arriba, que es trabajo de curación pendiente y debe
verse como tal, no disfrazarse de nada).

## Curación

Lista de miembros nueva bajo `/saga/[id]/editar`, que hoy solo edita la ficha de la saga (nombre,
sinopsis, portada, acento, saga padre) y ofrece una zona de peligro para borrarla
(`saga-meta-editor.tsx:216-244`), **sin listar ni gestionar miembros**
(`editar/page.tsx:20-24,39-48`). Cada miembro con su título, su posición y su rol, editables.

Es la superficie que falta. Hoy la única forma de tocar la `position` de un miembro es reenviar el
formulario de alta desde la ficha del libro (`catalog-editor.tsx:645-651`); los chips de membresía
ya existentes (`:597-636`) **ni siquiera muestran la posición actual**.

Gate `collaborator+` como el resto de la página (`editar/page.tsx:18`). Doble gate obligatorio: el
action re-comprueba `hasMinRole` aunque RLS ya lo haga (`route-actions.ts:42-46`: *"Los dos, nunca
solo uno"*). Contrato de error `{ error: código }` + clave en `messages/es.json`, nunca mensajes
(patrón de todo el dominio; el repo **no usa zod**). El action valida la pertenencia ítem↔saga.

### Dos sitios donde el campo se perdería en silencio

Esto ya pasó en este repo y está documentado como hallazgo de revisión en
`hydrate-route-draft.ts:11-22`: la paleta del editor de rutas se esparcía con `note: null` y el
full-replace borraba las notas reales. Los dos análogos aquí **hay que hilarlos explícitamente**:

1. **`manage-saga-actions.ts:85-94`** hace `upsert` de la fila entera con
   `{ onConflict: "saga_id,item_type,item_id" }`. Un re-submit del formulario de alta desde la ficha
   del libro —que es a la vez "añadir" y "editar"— escribiría `role: undefined` y lo borraría.
2. **`apply-membership-ops.ts:49-56`** hace delete+insert copiando `position` a mano
   (`carried?.position ?? null`). El `role` hay que arrastrarlo igual, o se pierde en cada
   movimiento de subsaga del editor de grafo.

## Pruebas

Política por defecto: verificación **automática** tras implementar UI, con Playwright o
`qa-verifier` (`docs/TESTING.md:30-46`).

**Unitarias** (`vitest run`, funciones puras):
- `derive-timeline.test.ts` — los badges salen del rol, no de la heurística de aristas.
- El reparto de la sección "Fuera del orden principal" (numerados vs no numerados).
- `apply-membership-ops.test.ts` — que un movimiento de subsaga **conserva el rol**. Es la red contra
  el modo de fallo de `hydrate-route-draft`.

**E2E** (`playwright test`, `workers: 1`, reutiliza el server que haya):
- Actualizar `e2e/sagas-v2-mapa.spec.ts:38,40` (cambio esperado).
- Spec nueva: marcar un rol en `/saga/[id]/editar`, verlo en Info, y comprobar que una obra sin
  número **aparece** en la lista de orden de lectura del Mapa.
- Una obra sin número **y sin rol** aparece en la sección, sin chip. Es el caso que separa
  "pertenencia" de "decoración" y el que más fácil se rompe al refactorizar.
- **Que el número del hero no se mueva al marcar un rol.** Ésta es la red contra el #91.

Si la spec nueva necesita seed, **no sembrar más UUIDs a mano en dev**: es exactamente la deuda de
#177 (cinco specs dependen de filas irreproducibles que en CI no existen). Es la ocasión de escribir
un fixture idempotente.

## Riesgos conocidos

**El vocabulario se elige una sola vez, con #168 en la mesa.** #168 (tándem) necesita expresar "dos
obras comparten el hueco 5". Eso es *colocación*, el eje que aquí se deja fuera a propósito — y está
bien que lo sea, porque un tándem es una relación entre dos obras, no un atributo de una. Lo que no
debe pasar es que #168 acabe montando una tabla de emparejamiento que reexprese el rol por otro
camino. `role` es per-membresía; un tándem será per-par.

**Ampliar el enum no dará error de tipo.** Las uniones del dominio (`types.ts:34`,
`graph-data.ts:28,33,36`, `derive-timeline.ts:16`) son literales escritos a mano, **no**
`Database["public"]["Enums"][...]` — cero referencias a eso en todo `src/lib/sagas/`. Añadir un
valor en BD no rompe la compilación en ningún sitio: hay que buscarlos a mano.

**`database.types.ts`: parche quirúrgico, no regeneración a ciegas.** Los tres puntos a tocar son la
tabla (`:1505`), `Enums` (`:2249-2250`) y `Constants` (`:2422-2423`). Regenerar entero es práctica
mixta en el repo —hay planes que lo hacen (`plans/2026-07-22-club-eventos.md:419`) reaplicando a
mano el parche de `reorder_queue`— pero al menos un plan lo desaconseja por derivas de firmas de RPC
entre dev y prod (`docs/superpowers/plans/2026-07-11-epic05-bloque-b-reactions-comments.md:15`).
Para un cambio de tres líneas como éste, el parche es claramente lo barato.

**Revalidación manual.** `revalidateItemPage` / `revalidateSagaPage` se llaman a mano al final de
cada action (`manage-saga-actions.ts:97-98`).

## Deuda que se toca de refilón

Todo esto queda como **issue aparte**, no se arregla aquí:

1. **Asimetría del denominador en `main-order.ts`.** Con grafo, los nodos sin `order_no` se excluyen
   del orden principal (`:91`). Sin grafo, **todos** los miembros directos entran, incluidos los de
   `position === null` (`:100-108`), que solo se ordenan al final. El comentario de cabecera (`:12-13`)
   afirma *«Los opcionales nunca entran, así que no penalizan el avance»*, lo cual solo es cierto con
   grafo. Consecuencia: **hoy la única forma de que una obra opcional no penalice el progreso es
   montar un grafo** — justo lo que esta issue existe para evitar.
2. **Borrado por omisión en el alta de saga.** `manage-saga-actions.ts:38-43`: `"abc"`, `0` y `2.5`
   caen a `null` sin código de error. El usuario ve un guardado correcto que borró el dato.
3. **Contradicción documental sobre itinerarios.** `backlog.md:51` dice que sus migraciones están
   *«solo en dev»*; `data-model.md:302`, posterior y canónico, dice que están en prod.
4. **`data-model.md` no lista las columnas de `saga_items`** en ningún punto (solo prosa en §7), y
   omite `saga_route_entries.note` pese a existir (`schema-baseline.sql:7398`).

## Definición de hecho

- `docs/requirements/data-model.md` §7 + fecha de verificación de la cabecera.
- Casilla en `docs/requirements/backlog.md` (sección Sagas).
- Entrada **al final** de `docs/requirements/decisiones.md` (append-only).
- `supabase/schema-baseline.sql`, anexado en el **orden real de aplicación en prod**, no alfabético
  (`README.md:86-87`), en la misma pasada que la aplicación a prod.
- Issues abiertas por los cuatro puntos de "Deuda".
