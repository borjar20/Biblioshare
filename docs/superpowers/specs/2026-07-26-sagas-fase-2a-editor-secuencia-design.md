# Sagas fase 2a: un solo editor de secuencia — diseño

> **[Canónico · verificado contra el repo y contra prod el 2026-07-26]**
> Spec de diseño. Continúa `2026-07-25-sagas-orden-unificado-design.md` (fase 1, mergeada en la
> PR #195). El estado de la feature vive en `docs/requirements/backlog.md`; lo accionable, en issues.
> Los números marcados **[MEDIDO]** salen de `SELECT` de solo lectura contra producción los días
> 2026-07-25 y 2026-07-26, y de `wc -l` sobre el repo a la altura del commit `785d1e9`.
>
> **Maqueta:** `Paper - Editor de secuencia (propuestas).html`, en `D:\Proyectos\Personal\Mockups\`
> (fuera del repo, como el resto de maquetas Paper). Trae dos propuestas completas y una
> recomendación explícita; este spec adopta esa recomendación y resuelve lo que la maqueta dejó
> abierto o contradictorio.

## El problema que queda abierto

La fase 1 hizo que **el progreso dejara de depender del orden**. No tocó dónde se cura ese orden, y
ahí sigue el reparto de siempre:

| Camino | Pantalla | Estado tras la fase 1 |
|---|---|---|
| Lista numerada | `/saga/[id]/editar` | un `<form>` por fila, un guardado por fila |
| Grafo | `/saga/[id]/mapa/editar` | intacto: canvas, nodos, aristas, ~840 líneas propias |
| Itinerarios | `/saga/[id]/rutas/[slug]/editar` | intacto, y solo alcanzable desde la ficha |

Y hay una consecuencia de la fase 1 que aún no se ha pagado. La fase 1 dio a las obras dos ejes
nuevos —`placement` y `optional`— y los expuso como **dos controles más** en el formulario por fila.
El resultado, medido un día después de aplicarla: **342 filas `fijo`, 9 sin clasificar, 0 `libre`,
0 `optional`** **[MEDIDO 2026-07-26]**. Nadie ha usado los ejes nuevos todavía. Un `<select>` con
tres valores no enseña la diferencia entre «se lee en cualquier momento» y «no cuenta»; la maqueta
apuesta a que **la zona donde vive la fila sí lo enseña**, y esta fase existe para comprobarlo.

Hay además una deuda concreta que la fase 1 dejó anotada y con fecha de caducidad: **las 12 sagas
hijas quedaron sin `position_in_parent`** **[MEDIDO]**, porque las 12 cuelgan de un padre con grafo y
ahí su colocación no se deduce de `min(position)` sino de `saga_nodes.order_no`. Mientras el grafo
viva, la app las ordena leyendo esa tabla. **En el momento en que se retira el editor de grafo, esa
información deja de tener quien la escriba** — así que rescatarla no es opcional en esta fase, es su
paso más delicado.

## Qué se construye

`/saga/[id]/editar` pasa a ser **la** pantalla del orden:

1. **Tres zonas** —la secuencia, «Cuando quieras», «Sin clasificar»— donde la zona en la que vive una
   fila **es** su `placement`. Desaparece el desplegable de colocación.
2. **Dos cáscaras**: propuesta **A en escritorio** (tres zonas apiladas + rail lateral) y **B en
   móvil** (zonas como pestañas + hoja por fila), sobre **una sola capa de estado**.
3. **Tándem** (#168): dos entradas comparten hueco. Sin cambio de esquema.
4. **Colocación de bloques-subsaga** con las columnas que la fase 1 ya dejó en prod
   (`position_in_parent`, `placement_in_parent`, `optional_in_parent`), incluido el **rescate de las
   12 hijas** descrito arriba.
5. **RPC `save_saga_sequence`**: un guardado atómico para toda la pantalla, en lugar de un guardado
   por fila.
6. **Retirada del editor de grafo**: `/saga/[id]/mapa/editar` se borra y redirige. El **mapa de solo
   lectura sobrevive intacto**.
7. **Itinerarios como sección de esta pantalla**, no como enlace suelto (lección de la #181).

### Fuera de alcance

- **`saga_placement_windows` y la curación de ventanas → fase 2b.** Es la única pieza que necesita
  tabla nueva y la que el spec de fase 1 marcó como riesgo de volver a ser un grafo. Y hay un
  argumento medido para no adelantarla: **hoy hay 0 entradas `libre`** **[MEDIDO]**, así que el
  editor de ventanas se estrenaría sin una sola fila que editar. La zona «Cuando quieras» sí entra en
  2a con todo lo demás —mover una fila a ella la marca `libre` y le quita el número—; lo único que no
  se construye es el control **«+ Añadir ventana»** y sus dos anclas. En 2a una fila `libre` es una
  fila sin hueco, y ya.
- **Retirada de `saga_nodes` / `saga_edges` / `save_saga_graph` y el renombrado de `main-order.ts` →
  fase 3.** En 2a las tablas siguen vivas alimentando el mapa de solo lectura.
- **La migración de los cuatro grafos a itinerarios** (§«Los cuatro grafos, uno a uno» del spec de
  fase 1) → fase 3, con una excepción que sí entra aquí: el rescate de las 12 hijas, porque sin él la
  pantalla nueva no puede ordenar los bloques.

## La pantalla

### Por qué A en escritorio y B en móvil

Es la recomendación de la maqueta, y el motivo es el mismo por los dos lados: **cuántas zonas caben a
la vez sin empujar el trabajo real fuera de la pantalla.**

En escritorio caben las tres, y verlas juntas es justo lo que enseña que `libre` y `optional` son
ejes distintos. El rail resuelve además el añadir desde catálogo, que hoy no tiene sitio en
`/editar`. A 400 px, en cambio, apilar tres zonas de las que **dos estarán vacías en todas las sagas
el día 1** **[MEDIDO]** empuja la lista de 5 obras —el caso real— hacia abajo. Con pestañas, la saga
típica abre directamente en su lista y las otras dos zonas son un recuento que no miente ni estorba.

### La consecuencia que esto tiene en el código

Escoger dos disposiciones distintas para la misma pantalla choca de frente con una regla ya escrita
en el repo (`docs/redesign/README.md`, **regla de los dos árboles**): cuando una pantalla pinta lo
mismo en dos árboles por breakpoint, el que no toca se queda en el DOM oculto — y la regla avisa de
que **«el patrón solo es seguro para duplicados sin estado»**. Esta pantalla es lo contrario: un
borrador de secuencia con reordenación y tándems.

**Decisión: una capa de estado, dos cáscaras.** El borrador y sus operaciones viven en un hook y un
reducer puros, sin JSX; `A` y `B` son componentes de presentación que reciben el mismo estado y
disparan las mismas operaciones. Duplicar el editor entero por breakpoint queda explícitamente
prohibido: serían dos borradores vivos sobre los mismos datos.

Y una consecuencia de pruebas que ya ha roto tests dos veces (#50, #69): **la suite de Playwright
corre a 1280**, así que por defecto **solo verá el árbol A**. Los casos de la variante móvil fijan su
propio viewport, y todo locator lleva `:visible`.

### La fila

Una fila es una **obra** o un **bloque-subsaga**. Casi todo es común, pero **no llevan los mismos
atributos**, y la maqueta se equivoca aquí:

| | obra (`saga_items`) | bloque-subsaga (`sagas`) |
|---|---|---|
| identidad | portada, título, tipo con su color | color de acento, nombre, «BLOQUE · 8 OBRAS» |
| hueco | número derivado de la posición | ídem (`position_in_parent`) |
| zona | `placement` | `placement_in_parent` |
| `optional` | casilla | casilla (`optional_in_parent`) |
| rol narrativo | selector | **no existe** |
| navegación | — | **enlace a su propio editor** |

> El frame A3 dibuja un selector de rol también en la fila de bloque. **No hay dónde guardarlo**: la
> fase 1 dio a `sagas` tres columnas (`position_in_parent`, `placement_in_parent`,
> `optional_in_parent`) y ninguna de rol, mientras que `role` es una columna de `saga_items`
> **[verificado en `20260725_saga_placement_blocks.sql`]**. La fila de bloque va sin ese control.
> Añadir `role_in_parent` sería esquema nuevo y no lo pide nadie: el rol narrativo de una subsaga
> entera («La Guardia es un spin-off») no ha aparecido como necesidad en ninguna conversación de
> curación.

Un bloque puede vivir en **cualquiera de las tres zonas**, igual que una obra: colocado con su hueco,
en «Cuando quieras» (una subsaga que se lee en varios puntos) o sin clasificar. Es lo que hace falta
para el rescate de las 12 hijas descrito más abajo, donde varias van a caer en la zona 3.

Los miembros de una subsaga **no se editan aquí**: se editan en la pantalla de esa subsaga. Eso cierra
la **#187** por construcción, igual que lo describía el spec de fase 1.

En escritorio los cuatro atributos están a la vista en la fila (más asa de arrastre y ↑ ↓). En móvil
la fila muestra número, portada, título, `optional` y `role`, y todo lo demás vive en una **hoja** que
se abre desde la fila: cambiar de zona, subir, bajar, emparejar en el mismo hueco, quitar de la saga.

### El número no se teclea

**El número lo deriva la posición en la lista.** No hay campo donde escribirlo. Esto es lo que hace
*imposible* violar el invariante `fijo ⇔ tiene número` desde la interfaz —el mismo que el CHECK
`saga_items_placement_position` impone en la base de datos— y de paso elimina el caso absurdo de
teclear un 7 en una lista de 5.

> **Contradicción de la maqueta, resuelta aquí.** El frame C3 dibuja un estado de error bloqueante
> («Mort está en la secuencia sin número»). Con el número derivado de la posición **ese estado es
> inalcanzable desde la interfaz**. La validación correspondiente no desaparece —sigue en el CHECK de
> la base de datos y en la validación previa al envío, que es donde protege frente a un cliente con
> un bug—, pero **no se diseña una pantalla de error para un estado que el usuario no puede
> producir**. La barra conserva sus otras tres caras: cambios pendientes, guardando, guardado.

### El tándem

Se pide desde la fila («mismo hueco que…»), se elige la obra en un selector filtrable, y el resultado
se pinta como dos filas apiladas bajo un número con corchete. No hay estado de colisión que resolver:
**el empate es el dato**, no un error.

**Regla de renumerado, que la maqueta insinúa pero no fija:** las posiciones son consecutivas desde 1
**admitiendo empates**, así que un tándem en el hueco 3 produce `1, 2, 3, 3, 4` — nunca `1, 2, 3, 3,
5`. El hueco siguiente al empate es el número siguiente, no el siguiente + 1.

### Vocabulario

Los frames A3 y B3 usan **«Sin clasificar»** como valor vacío del selector de rol. Es una colisión:
«Sin clasificar» ya nombra la **zona 3**, que es un estado de *colocación*. Serían dos ejes distintos
compartiendo etiqueta — exactamente la confusión que la fase 1 deshizo. **Se usa «Sin rol»**, que es
lo que ya dice el frame B1 y lo que ya existe en el código (`memberRoleNone`).

Vocabulario fijado, sin sinónimos: «La secuencia», «Cuando quieras», «Sin clasificar» (zona),
«Sin rol», «opcional», «bloque», «itinerario».

### El rail (escritorio)

Se reutiliza `editor-left-panel.tsx` (223 líneas), la única pieza que sobrevive de los tres editores,
**sin su sección «Herramientas»** (los tipos de arista, que mueren con el grafo). Conserva: buscar en
catálogo, lista de subsagas con su color y su contador, crear subsaga, anidar una existente, sacar del
universo. En móvil ese contenido vive tras el botón «+ Añadir obra o bloque».

Las operaciones del rail que tocan la tabla `sagas` —crear, anidar, desanidar, cambiar acento— siguen
siendo **acciones inmediatas** (`editor-actions.ts`), no operaciones del borrador: cambian la
estructura del árbol, no la secuencia.

## Guardado

RPC `save_saga_sequence`, `SECURITY DEFINER` con gate `has_min_role('collaborator')` interno,
`revoke ... from public, anon` + `grant ... to authenticated` — el patrón exacto de
`save_saga_route` (`20260723_saga_routes.sql`).

```sql
create or replace function public.save_saga_sequence(
  p_saga_id  uuid,
  p_entries  jsonb,  -- obras: item_type, item_id, position, placement, optional, role
  p_blocks   jsonb,  -- hijas DIRECTAS: child_saga_id, position_in_parent, placement_in_parent, optional_in_parent
  p_removed  jsonb   -- bajas explícitas: item_type, item_id
) returns void
```

En una transacción:

- **`saga_items` de esta saga**: `insert ... on conflict do update` de las filas de `p_entries`
  (`position`, `placement`, `optional`, `role`). El `insert` es lo que permite **dar de alta desde el
  rail sin escribir en la base de datos hasta que se guarda**.
- **Hijas directas**: `update` de las tres columnas `*_in_parent` de las filas de `p_blocks`. Sin
  `insert` ni `delete`: anidar y desanidar son competencia de `editor-actions.ts`, no de la secuencia.
- **Bajas**: `delete` de las filas de `p_removed`, y **solo de esas**.

### Por qué la baja es explícita y no por omisión

`save_saga_graph` y `save_saga_route` borran todo y reinsertan. Aquí **no** se hace eso, y la
diferencia importa: los pasos de un itinerario solo los escribe su editor, pero las filas de
`saga_items` las crea también el formulario «Saga» de la ficha (`assignItemToSaga`), desde otra
pantalla y por otra persona. Con borrado por omisión, un curador que abriera el editor, se fuera a
comer y guardara **borraría la obra que otro añadió mientras tanto**, sin que nadie viera un error.
Con `p_removed`, la peor consecuencia de un borrador rancio es que una obra nueva no aparezca en él.

`assignItemToSaga` y `removeItemFromSaga` siguen existiendo para el formulario de la ficha. La regla
que los mantiene compatibles es la que ya fijó la fase 1: **fuera del editor de secuencia, nadie
escribe `position`.**

### Validación previa al envío

En la línea de `validate-route-draft.ts`:

- Posiciones consecutivas desde 1, **admitiendo empates**.
- Nada en «Cuando quieras» ni en «Sin clasificar» lleva número (por construcción, pero se comprueba:
  es la última red antes del 23514).
- **Aviso no bloqueante** si quedan filas sin clasificar, con su recuento. Es deuda, no un error, y
  se puede guardar con ella.
- Con las zonas en pestañas (móvil), un problema puede estar donde no estás mirando: **la barra
  resume cuántos y en qué zona**, la pestaña afectada lleva punto, y pulsar el aviso salta a la fila.

## Migración: el rescate de las 12 hijas

Es el paso irreversible de esta fase y va en su propia migración, después de un **volcado de
`saga_nodes` y `saga_edges` a `backups/`** (55 + 54 filas) **[MEDIDO]**, como ya se hizo en
`backups/prod-2026-07-14-antes-de-reiniciar.json`.

Para cada saga hija cuyo padre tiene grafo:

- si su nodo tiene `order_no` → `position_in_parent = order_no`, `placement_in_parent = 'fijo'`;
- si no lo tiene → **se queda sin clasificar** y aparece en la zona 3 del padre.

El segundo caso no es hipotético: **ningún nodo de Mundodisco tiene `order_no`** **[MEDIDO]** —su
orden vive solo en 28 aristas—, que es exactamente el origen del 0/0 que la fase 1 arregló. Sus
bloques van a caer en «Sin clasificar», y eso **es el resultado correcto**: la alternativa sería
inventar una colocación derivada de las aristas y presentarla como curada. Queda como trabajo humano
explícito, anotado en su issue, no escondido en un script.

Orden no negociable (`AGENTS.md`): **dev primero, prod después**, verificando contra `pg_proc` /
`pg_class` / `pg_policies`, nunca contra `list_migrations`.

## Lo que se borra en esta fase

| Fichero | Líneas |
|---|---|
| `src/app/saga/[id]/mapa/editar/page.tsx` | 91 |
| `src/components/saga/editor/saga-graph-editor.tsx` | 410 |
| `src/components/saga/editor/editor-inspector.tsx` | 161 |
| `src/components/saga/editor/editor-node.tsx` | 70 |
| `src/lib/sagas/validate-graph-draft.ts` (+ su test) | 66 |

≈ **800 líneas**, más sus tests y sus claves de i18n. `/saga/[id]/mapa/editar` pasa a redirigir a
`/saga/[id]/editar` en vez de dar 404: hay enlaces vivos y gente con la URL guardada.

**Sobrevive intacto**: todo `src/components/saga/graph/` (392 líneas, el mapa de solo lectura),
`graph-data.ts` (150), `editor-left-panel.tsx` (223, sin «Herramientas»), `editor-actions.ts` (110).
La RPC `save_saga_graph` se queda huérfana pero viva hasta la fase 3, que es cuando se borran las
tablas.

## Pruebas

- **Unitarias, sobre el reducer del borrador** (función pura, sin React): mover arriba/abajo, enviar a
  otra zona, emparejar y deshacer tándem, renumerar con empates, alta y baja. Es donde vive la lógica
  de verdad y donde una prueba cuesta milisegundos.
- **Unitarias, sobre la validación**: cada regla con su caso que la dispara y su caso que no.
- **E2E en dos viewports.** A 1280 el árbol A; los casos de B fijan viewport de móvil explícitamente,
  porque si no **la variante móvil se queda sin cobertura sin que nadie lo note**. Todo locator con
  `:visible`.
- **Prueba de la baja explícita**: guardar un borrador que no incluye una obra añadida después de
  abrirlo **no** la borra. Es el fallo que la decisión de `p_removed` existe para evitar, así que
  tiene que estar cubierto.
- **Inyección de fallos** en las pruebas nuevas, como en la fase 1: desactivar una regla y ver caer su
  prueba.

## Riesgos conocidos

- **Dos árboles con un estado compartido.** Mitigado con la separación hook/presentación, pero es la
  parte del diseño donde un atajo se paga caro. Si en la revisión aparece estado dentro de `A` o `B`,
  es un defecto, no un detalle.
- **El arrastre.** `@dnd-kit/core` y `@dnd-kit/sortable` **ya son dependencias** del proyecto, con un
  precedente funcionando en `src/components/clubs/tierlist/`, así que el asa de escritorio no añade
  peso nuevo. Ojo con una afirmación equivocada del spec de fase 1: decía que se reutilizaría «el drag
  & drop de `route-editor.tsx`», y **`route-editor.tsx` no tiene drag & drop** — usa ↑/↓, y su
  comentario explica que fue deliberado (teclado y lector de pantalla gratis). El precedente bueno es
  el de tierlist; el patrón de ↑/↓ es el que se conserva como vía principal.
- **Accesibilidad.** Lo que hay hoy es un formulario de selectores: accesible por construcción. Cada
  gesto de arrastre necesita su gemelo pulsable y tecleable, y el arrastre es el extra, no la vía.
- **Perder curación al matar el grafo.** Cubierto por el volcado a `backups/` y por dejar Mundodisco
  sin clasificar en vez de inventarle un orden.
- **Una pantalla que hace demasiado.** Metadatos, secuencia e itinerarios en la misma ruta. Se acepta
  porque los tres se curan en la misma sesión y separarlos es lo que hizo inalcanzable la curación de
  itinerarios (#181), pero es la razón por la que metadatos e itinerarios van plegados y la secuencia
  se queda con el cuerpo de la pantalla.

## Dependencia

Ninguna abierta. La fase 1 está mergeada (PR #195) y su esquema aplicado en producción desde el
2026-07-26: `placement`, `optional`, las tres columnas `*_in_parent` y los tres CHECK en forma `CASE`
ya existen. Esta fase no añade ni una columna — solo una función.
