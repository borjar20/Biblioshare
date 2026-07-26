# Sagas: un solo modelo de orden, y un progreso que no depende de él — diseño

> **[Canónico · verificado contra el repo y contra prod el 2026-07-25]**
> Spec de diseño. El estado de la feature vive en `docs/requirements/backlog.md`; lo accionable, en
> issues. Los números de producción de este documento se midieron con `SELECT` de solo lectura el
> 2026-07-25 y van marcados **[MEDIDO]**.

## El problema

Biblioshare sabe decir "en qué orden se lee esta saga" de **tres maneras distintas**, cada una con su
tabla, su pantalla de curación y su render. Las tres coexisten, ninguna sabe de las otras, y el
progreso del lector se calcula *a partir de* la que haya — así que cada vez que se toca el orden, el
número se rompe.

| Camino | Curación | Datos | Uso real en prod **[MEDIDO]** | Código |
|---|---|---|---|---|
| Lista numerada | `/saga/[id]/editar` | `saga_items.position` | **71 de 75** sagas con miembros | pequeño |
| Grafo | `/saga/[id]/mapa/editar` | `saga_nodes` + `saga_edges` | **4 sagas**, 55 nodos, 54 aristas | ~2.100 líneas + `@xyflow/react` |
| Itinerarios | `/saga/[id]/rutas` | `saga_routes` / `_entries` / `_choices` | **0 rutas, 0 pasos, 0 adopciones** | ~1.230 líneas |

Y un cuarto a medias: `saga_items.role` (rol narrativo, issue #167). **La columna ya está aplicada en
prod** y tiene 2 filas escritas, pero el código que la lee vive sin mergear en la PR #189.

### Los cuatro grafos que sostienen 2.100 líneas **[MEDIDO]**

| Saga | Nodos | Con `order_no` | Aristas no-principales | Miembros directos | Seguidores |
|---|---|---|---|---|---|
| Mundodisco | 26 | **0** | 10 | 0 (viven en 5 subsagas) | 2 |
| Cosmere | 20 | 19 | 6 | 1 | 2 |
| Trono de Cristal | 8 | 8 | 0 | 8 | 0 |
| Maasverse | 1 (nodo-saga) | 0 | 0 | 0 | 1 |

- **Trono de Cristal** es una lista lineal dibujada en 2D: el grafo no añade nada sobre `position`.
- **Maasverse** es un grafo vacío.
- **Mundodisco está roto en producción ahora mismo.** Como ningún nodo tiene `order_no`,
  `createMainOrder` devuelve lista vacía → el hero no pinta progreso (0/0), `deriveTimeline` devuelve
  `[]` → el timeline móvil sale vacío, y "como lista lineal" sale vacía. Solo se ve el lienzo 2D en
  PC. **El caso de referencia de toda la feature es el que peor funciona.**
- **`requisito` no existe**: las 16 aristas no-principales de prod son todas `opcional`.

### Dos órdenes que ya se contradicen sin que nadie lo vea **[MEDIDO]**

En Trono de Cristal, `saga_items.position` y `saga_nodes.order_no` discrepan hoy en prod:

| obra | `position` | `order_no` |
|---|---|---|
| La Espada de la Asesina | 1 | 3 |
| Trono de Cristal | 2 | 1 |
| Corona de Medianoche | 3 | 2 |
| Imperio de Tormentas | 6 | **6** |
| Torre del Alba | 7 | **6** |

Las dos últimas filas son el hallazgo importante: **el grafo ya expresa un tándem** —dos obras
compartiendo hueco— que es exactamente el caso de referencia de la issue #168, ya tecleado en
producción. El empate no es una hipótesis de diseño: es dato existente que el modelo de lista no sabe
leer.

### El progreso se rompe porque depende de la curación

`createMainOrder` produce una lista y `computeProgress` cuenta sobre ella: **el denominador *es* el
orden**. De ahí salen cuatro fallos con una sola causa:

- **#91** — la regla estaba duplicada; el hero decía 2/7 y la card 2/5 sobre la misma saga.
- **#170** — los nodos huérfanos contaban en el denominador pero no se pintaban: el avance no podía
  llegar al 100%.
- **#185** — `main-order.ts` tiene dos ramas que se contradicen (con grafo, lo no numerado no cuenta;
  sin grafo, cuenta todo). La rama que la doc describe aplica a **1 saga de 70** **[MEDIDO]**.
- **Mundodisco 0/0** — descrito arriba.

## Qué se construye

**Un solo modelo de orden, y un progreso que no lo mira.**

1. El orden de una saga es **una secuencia**, curada en **una sola pantalla**.
2. Cada entrada —obra o bloque-subsaga— lleva tres atributos independientes: **colocación** (dónde se
   lee), **opcionalidad** (si cuenta) y **rol** (qué es, issue #167).
3. El **progreso** cuenta obras, no huecos: *todos los miembros del subárbol menos los marcados
   `optional`*. El orden pasa a ser **solo presentación**.
4. El **grafo sobrevive como vista de solo lectura**, derivada de la secuencia, y solo donde aporta.
   El editor de grafo se retira.
5. Los **itinerarios** se quedan como lo que son: secuencias *alternativas*. Reciben, por fin,
   contenido real (ver Migración).

### Fuera de alcance (siguen como issue)

- **#168** — el **empate de hueco** (el tándem propiamente dicho) entra en este spec. La **guía de
  intercalado** por tramos ("cap. 1-15 → cap. 1-12") no: necesita tabla y UI propias, y llega encima
  de este modelo sin tener que tocarlo.
- **#171** — itinerarios creados por usuarios.
- **#186** — mover un ítem entre subsagas pierde `role`/`position` cuando ya existe fila en destino.
  (**#188 sí entra**, y por obligación: ver «El otro escritor de `position`».)
- **#173 / #174 / #175 / #177** — cobertura y contratos de error de la curación de itinerarios.

## Modelo de datos

### Dos ejes ortogonales, no uno

La confusión que este diseño deshace: **"se lee en cualquier momento" y "no cuenta para el progreso"
son dos hechos distintos** sobre una entrada, y se necesitan las cuatro combinaciones.

| | cuenta | no cuenta (`optional`) |
|---|---|---|
| **`fijo`** | *El Camino de los Reyes* — el caso normal | un spin-off con hueco propio que no quieres exigir |
| **`libre`** | *Nueva Primavera* — se lee en varios puntos, pero la cuentas | *Novelas secretas*, *Esquirla del Amanecer* |

### `saga_items` (obras)

| columna | estado | qué dice |
|---|---|---|
| `position` | existe | el hueco en la secuencia |
| `role` | **ya en prod**, código en PR #189 | qué *es*: `precuela \| spin_off \| relato \| paralela` |
| `placement` | **nueva** — enum `saga_placement ('fijo','libre')`, nullable | *dónde* se lee. `null` = sin clasificar |
| `optional` | **nueva** — `boolean not null default false` | si **no** cuenta en el progreso |

```sql
create type public.saga_placement as enum ('fijo', 'libre');

alter table public.saga_items
  add column placement public.saga_placement,
  add column optional boolean not null default false,
  add constraint saga_items_placement_position check (
    (placement = 'fijo'  and position is not null) or
    (placement = 'libre' and position is null)     or
    (placement is null   and position is null)
  );
```

El CHECK ata colocación y hueco sin ambigüedad posible: **`placement='fijo'` ⇔ tiene número**. Así
"sin clasificar" nunca puede llevar número, y `libre` tampoco — su *dónde* es la ventana (abajo), no
un hueco.

> **Corrección [2026-07-26, review final de la rama]**: esa era la intención, pero el CHECK de tres
> ramas con `OR` tal como está escrito arriba **no la cumplía**. Con `placement IS NULL` las dos
> primeras ramas dan `NULL` (comparar con `NULL` da `NULL`, no `FALSE`) y la tercera da `FALSE`, así
> que el `OR` entero da `NULL` — y un CHECK solo rechaza `FALSE`, así que la fila
> (`placement=NULL`, `position=7`) **pasaba**, justo la combinación que el párrafo de arriba dice
> que es imposible. Dev llegó a tener una fila así, creada durante la propia ejecución de esta rama.
> El CHECK realmente aplicado (`supabase/migrations/20260725_saga_placement.sql`, y su gemelo
> `sagas_placement_position` en `_blocks.sql`) sustituye el `OR` por un `CASE`, que no tiene ese
> agujero porque un `WHEN` que no da `TRUE` (incluido `NULL`) cae al `ELSE` en vez de propagar el
> `NULL`. La forma final:
>
> ```sql
> check (case when placement = 'fijo' then position is not null else position is null end)
> ```
>
> Con esta forma sí es cierto que `placement='fijo' ⇔ position is not null`, para las tres filas del
> dominio (`fijo`+número, `libre`+sin número, `null`+sin número) y ninguna otra.

**El default `false` de `optional` es deliberado**: las 351 membresías de hoy siguen contando, así
que ningún lector ve moverse su avance por esta migración. La única saga cuyo número cambia es
Mundodisco, que pasa de 0/0 (roto) a 26/26 (real).

**Backfill de `placement`, y por qué este sí es honesto** **[MEDIDO]**: las 342 filas con `position`
pasan a `fijo` — tener número *es* estar colocado, no se inventa nada. Las 9 sin `position` quedan en
`null` y salen en el aviso de curación. Es lo contrario del caso de `role` en #167, donde no hubo
backfill porque el rol de una obra es genuinamente desconocido; la colocación de una obra numerada no
lo es.

Entre esas 9 hay una que demuestra por qué "sin clasificar" tiene que existir como estado propio:
***Antes de que los Cuelguen* es el libro 2 de La Primera Ley** y hoy está sin numerar por descuido,
indistinguible de *Esquirla del Amanecer*, que es un relato sin hueco a propósito.

### `sagas` (bloques-subsaga)

Los mismos tres atributos, aplicados al bloque entero dentro de su padre:

| columna | qué dice |
|---|---|
| `position_in_parent` | el hueco del bloque en la secuencia de su padre |
| `placement_in_parent` | `fijo \| libre \| null` |
| `optional_in_parent` | `boolean not null default false` |

Mismo CHECK que en `saga_items`, más uno que exige que las tres sean nulas/false si `parent_saga_id`
es nulo.

Esto tapa el agujero que abre retirar el editor de grafo: hoy la colocación de una subsaga o vive en
`saga_nodes.child_saga_id + order_no` (solo con grafo) o se **deduce** del menor `position` de sus
miembros (`main-order.ts`, rama sin grafo). Pasa a ser dato explícito y curable. **Backfill**: se
escribe lo que la app ya deduce hoy, así que nadie ve cambiar nada.

### `saga_placement_windows` (la ventana de un `libre`)

Una entrada `libre` puede decir *entre dónde y dónde* se lee. El caso que la motiva, en palabras del
curador: ***Nacidos de la Bruma Era 2* es opcional, a partir de *Era 1*, y recomendable antes de
*Viento y Verdad***.

| columna | notas |
|---|---|
| `saga_id` | uuid NOT NULL, FK → `sagas` ON DELETE CASCADE — la saga en cuya secuencia vive la entrada |
| `item_type` / `item_id` | XOR con `child_saga_id`: el **sujeto** de la ventana (una obra) |
| `child_saga_id` | XOR: el sujeto es un bloque-subsaga |
| `after_item_type` / `after_item_id` / `after_child_saga_id` | ancla **«a partir de»**, XOR entre obra y bloque, opcional |
| `before_item_type` / `before_item_id` / `before_child_saga_id` | ancla **«recomendable antes de»**, misma forma, opcional |

- **Como máximo una fila por entrada**: dos uniques parciales sobre el sujeto —
  `(saga_id, item_type, item_id) WHERE item_id IS NOT NULL` y
  `(saga_id, child_saga_id) WHERE child_saga_id IS NOT NULL`— exactamente el par que ya protege
  `saga_nodes` y `saga_route_entries`.
- CHECK: al menos un ancla presente (una ventana sin anclas es simplemente un `libre` sin ventana, y
  entonces no hay fila).
- Los tripletes XOR son verbosos a propósito: es el mismo patrón que `saga_nodes` y
  `saga_route_entries`, y `item_id` es polimórfico (`book | movie | series`) así que no se puede
  colapsar a una sola columna sin perder el tipo.
- RLS: SELECT público, escritura `collaborator+`. Igual que `saga_items`.

> ⚠️ **Riesgo nombrado: esto son aristas otra vez, con otro nombre.** Lo que impide que degeneren en
> el lienzo que este mismo spec retira es la restricción dura: **una fila por entrada**, solo dos
> anclas, solo para entradas `libre`, y curadas en un formulario con dos selectores — no arrastrando
> en un canvas. Si alguna vez se relaja el unique o se añade un tercer tipo de ancla, se ha vuelto al
> punto de partida y hay que decirlo en voz alta.

La coherencia "solo las `libre` tienen ventana" **no se puede imponer con un CHECK entre tablas**. La
garantiza el RPC de guardado, que es el único escritor y borra las ventanas de las entradas que dejan
de ser `libre`; el render, además, ignora la ventana de una entrada que no sea `libre`.

### Tándem (#168): el hueco admite empate

`position` deja de ser único *de facto*: **dos obras pueden compartir número**, y eso *es* el tándem.

No hace falta ningún cambio de esquema — **[MEDIDO]** `saga_items` solo tiene unique en
`(saga_id, item_type, item_id)`, no en `(saga_id, position)`, así que el empate ya es legal. Lo que
cambia es que el editor deja de tratarlo como colisión a corregir y pasa a tratarlo como intención, y
que el render lo pinta apilado en un hueco.

El progreso no necesita regla nueva: cuenta obras, así que un tándem cuenta **2**.

### Lo que desaparece

`saga_nodes`, `saga_edges`, los enums `saga_edge_type` / `saga_node_level` y la RPC `save_saga_graph`.
Nada de lo que contienen se pierde sin destino (ver Migración).

## Progreso

Una regla, una función, y el orden fuera de la ecuación:

> **Denominador** = las obras del subárbol que **no** estén marcadas `optional`, deduplicadas por
> `item_type:item_id`. **Numerador** = las completadas, con el predicado único que ya vive en
> `completion.ts` desde el #91.

- Un **bloque `optional`** saca a los suyos del denominador de su padre: *Novelas secretas* no
  penaliza el Cosmere. Dentro de **su propia ficha**, en cambio, sus 4 obras cuentan — que es lo que
  un lector espera al abrirla.
- **`libre` no afecta al progreso.** Solo dice dónde se lee.
- **Lo `sin clasificar` cuenta**, como ya hace hoy en 69 de 70 sagas, y por eso lleva aviso de
  curación: la deuda se ve, no se descuenta a escondidas.

Efecto en el Cosmere **[MEDIDO]**: su subárbol son 20 obras. Marcando *Nacidos Era 2* (4) y *Novelas
secretas* (4) como `optional`, el progreso pasa a ser **sobre 12** — 11 si el curador marca también
*Arcanum Ilimitado*, que es una antología de relatos.

`main-order.ts` deja de ser el denominador y se queda con lo que debió ser siempre: **ordenación para
pintar** (la columna del timeline y la expansión de bloques dentro de un itinerario), sin ninguna
suma. El renombrado a `build-sequence.ts` —para que el nombre deje de sugerir que de ahí sale un
número— se hace en la **fase 3**, junto con la retirada de `saga_nodes`: es cuando muere su rama de
grafo y el fichero queda con una sola forma, en vez de tocar todos sus imports dos veces.

**Lo que esto cierra por construcción, no por parche:** #185 (no puede haber dos ramas si el progreso
no mira el grafo), #170 (los nodos huérfanos desaparecen con la tabla), el 0/0 de Mundodisco, y la
familia entera del #91 — el hero, la card de Mi Biblioteca y cualquier vista futura no *pueden*
discrepar porque ya no hay dos cosas que sumar.

El **contador del itinerario** se queda ("llevas 3 de 8 pasos de esta ruta"): es un número sobre *esa
ruta*, no sobre la saga, y comparte el predicado de completado.

## Curación: un solo sitio

`/saga/[id]/editar` pasa a ser **la** pantalla del orden.

- `/saga/[id]/mapa/editar` **se borra** (redirect a `/editar`).
- `/saga/[id]/rutas` **sobrevive** —un itinerario es una secuencia alternativa, no el orden de la
  saga— pero deja de ser un enlace suelto y cuelga de `/editar` como sección. Es la lección de #181:
  lo que solo se alcanza desde una vista condicional acaba siendo inalcanzable.

### Tres zonas, y arrastrar entre ellas *es* curar la colocación

No hay desplegable de "colocación" que rellenar: la zona en la que vive una fila *es* su colocación.

1. **La secuencia** — lista ordenable. Cada fila es una obra o un **bloque-subsaga** (acento + "La
   Guardia · 8 obras" + enlace a *su* editor). Reordenar renumera. Soltar dos filas en el mismo hueco
   = tándem.
2. **Cuando quieras** — sin orden. Lo que cae aquí es `libre`, y ahí puede abrir su **ventana** (dos
   selectores: *a partir de* / *recomendable antes de*).
3. **Sin clasificar** — solo aparece si hay deuda, y solo pide una cosa: arrastrar cada fila a una de
   las dos zonas de arriba.

`optional` es una casilla por fila, independiente de la zona — porque los dos ejes son ortogonales. El
`role` (#167) es el selector por fila que ya trae la PR #189.

Se reutiliza `editor-left-panel.tsx` (buscar en catálogo + listar subsagas), la única pieza que
sobrevive de los tres editores, y el drag & drop de `route-editor.tsx`.

### Guardado

RPC `save_saga_sequence(p_saga_id uuid, p_entries jsonb)`, `SECURITY DEFINER` con gate
`has_min_role('collaborator')` interno, **reemplazo total atómico** — mismo patrón y mismas garantías
que `save_saga_graph` y `save_saga_route`. En una transacción escribe:

- `position` / `placement` / `optional` / `role` de las filas de `saga_items` **de esta saga**,
- `position_in_parent` / `placement_in_parent` / `optional_in_parent` de sus **hijas directas**,
- las filas de `saga_placement_windows` de esta saga (borra y reinserta).

Los miembros de una subsaga se editan **en la pantalla de esa subsaga**, no aquí. Eso cierra **#187**
(la curación listaba el subárbol plano sin decir de qué subsaga colgaba cada fila) por construcción.

### El otro escritor de `position`: `assignItemToSaga` (issue #188)

El formulario «Saga» de la ficha (`manage-saga-actions.ts`) hace `upsert` de la membresía **escribiendo
`position`**, y lo pone a `null` si el campo va vacío — de ahí el #188: reasignar la saga borra la
posición curada sin decir nada.

**Con el CHECK nuevo eso deja de ser una pérdida silenciosa y pasa a ser una escritura imposible**: una
fila con `placement='fijo'` y `position=null` viola la restricción, así que la BD rechaza el upsert y
el formulario de la ficha se rompe. Por tanto **no es un efecto colateral gratuito, es trabajo obligado
de este alcance**: `assignItemToSaga` deja de escribir `position` y se queda solo con lo suyo —dar de
alta la membresía—, porque el hueco pasa a ser competencia exclusiva del editor de secuencia. Eso cierra
el #188 por eliminación del segundo escritor, no por parche.

### Validación previa al guardado

En la línea de `validate-graph-draft.ts` / `validate-route-draft.ts`:

- Posiciones consecutivas desde 1, admitiendo empates (tándem).
- El CHECK de colocación replicado en cliente (nada `libre` con número, nada `fijo` sin él).
- Anclas que apunten a algo del mismo árbol y nunca a la propia entrada.
- **Aviso no bloqueante** si quedan entradas sin clasificar.

## Vistas

### Info

Como hoy, más:

- una sección **"Cuando quieras"** con las entradas `libre` (obras y bloques) y su ventana en texto:
  *"a partir de Nacidos Era 1 · recomendable antes de Viento y Verdad"*;
- un chip **opcional** sobre la portada de las entradas `optional` — mismo vocabulario que la leyenda
  del grafo ya usa hoy;
- para `collaborator+`, un aviso *"3 obras sin clasificar"* que enlaza a `/editar`.

Lo sin clasificar **sigue apareciendo en su grupo**: es miembro, no es invisible; simplemente no tiene
número.

### Mapa

El selector de itinerario se queda tal cual (lectura · curadas · publicación).

- **`lectura`** deja de derivarse del grafo y se deriva de **la secuencia**: timeline en móvil, grafo
  2D en PC. **Desaparece "como lista lineal"**, que era una tercera copia lineal de lo mismo en la
  misma pantalla.
- **`publicación`** y las **curadas**, sin cambios (contador de ruta incluido).
- La pestaña se muestra cuando la saga tiene subsagas o itinerarios curados.

### El grafo 2D, derivado y solo donde aporta

**Heurística automática, sin knob nuevo:** se dibuja cuando la secuencia tiene **2 o más
bloques-subsaga**, que es cuando hay ramificación que una columna no sabe transmitir.

Contra prod **[MEDIDO]**: Mundodisco (5 subsagas) ✓, Cosmere (6) ✓, Trono de Cristal (0) ✗, Maasverse
(1) ✗ — exactamente el reparto donde el grafo aporta hoy y donde es una lista disfrazada.

**Qué dibuja**: la columna de huecos `fijo`; un carril por bloque-subsaga con su acento; las entradas
`libre` en un carril lateral, unidas a sus anclas con flecha punteada (la misma información que hoy
llevan las aristas `opcional`); el rol como etiqueta del nodo; el tándem apilado en un hueco; y el
itinerario activo resaltado encima del dibujo.

**El layout pasa a calcularse.** Las coordenadas `x`/`y` dejan de persistirse porque ya no hay quien
las coloque a mano. Se implementa como función **pura y testeable** (`layout-sequence.ts`) que recibe
la secuencia y devuelve posiciones; `@xyflow/react` se queda **solo como renderer**. Este es el trozo
de trabajo real de la retirada: no es "borrar el editor y ya".

## Migración

Orden no negociable, según `AGENTS.md`: **dev primero, prod después**, y verificando contra los
objetos reales (`pg_class` / `pg_proc` / `pg_policies`), nunca contra `list_migrations`.

### 1. Esquema

`saga_placement` + `placement`/`optional` en `saga_items` + las tres columnas en `sagas` +
`saga_placement_windows` + la RPC `save_saga_sequence`. Backfills descritos arriba. Todo **aditivo**:
ninguna columna existente cambia de tipo ni se borra en este paso.

### 2. Los cuatro grafos, uno a uno

Antes de tocar nada, **volcado completo de `saga_nodes` y `saga_edges` a `backups/`** (55 + 54 filas),
como ya se hizo en `backups/prod-2026-07-14-antes-de-reiniciar.json`.

- **Cosmere** → la secuencia son los **6 bloques por su primer hueco** (Elantris → Nacidos Era 1 →
  Aliento → Archivo → Nacidos Era 2 → Novelas secretas), y **los 19 pasos exactos del grafo se
  vuelcan a un itinerario** *"Orden de lectura del Cosmere"*. Cero pérdida: el orden del grafo cruza
  subseries obra a obra (1 Elantris → 2-4 Nacidos Era 1 → 5 Aliento → 6-10 Archivo → 11-14 Era 2 → 15
  El Hombre Iluminado → 16 Viento y Verdad…), que es la definición literal de un itinerario.
  *Nacidos Era 2* y *Novelas secretas* quedan `libre` + `optional`, con la ventana de Era 2 anclada
  como pidió el curador. *Arcanum Ilimitado* (único miembro directo, sin `order_no`) queda **sin
  clasificar** a propósito: lo resuelve una persona.
- **Trono de Cristal** → **manda el grafo**, que es la curación más específica y la que trae el
  tándem: `order_no` pasa a `position`, con *Imperio de Tormentas* y *Torre del Alba* **compartiendo
  hueco 6**. Se acepta conscientemente que *La Espada de la Asesina* pase de la 1ª a la 3ª posición:
  es lo que el curador dejó escrito en el grafo.
- **Mundodisco** → ningún nodo tiene `order_no`; el orden vive solo en 28 aristas. El script propone
  la secuencia de los 5 bloques y un itinerario a partir de la cadena de aristas, pero **esta saga
  necesita repaso humano**: es la que peor está hoy y ningún script la va a dejar curada. Se hace
  explícito en el plan como paso manual, no se esconde.
- **Maasverse** → un nodo-saga vacío, sin aristas ni miembros. Se borra.

### 3. Retirada

`saga_nodes`, `saga_edges`, sus dos enums y `save_saga_graph` se borran **después** de verificar la
migración con una tabla antes/después de las 4 sagas (progreso del hero, contenido del timeline,
contenido del mapa). Es el único paso destructivo del plan y va en su propia migración.

## Pruebas

**Unitarias** — donde está la lógica:

- La regla de progreso: `optional` fuera; bloque `optional` saca a su subárbol del padre pero no de sí
  mismo; dedup por obra; tándem cuenta 2; `sin clasificar` cuenta.
- La secuencia: orden con empates, expansión de bloques, `libre` fuera de la columna.
- `layout-sequence.ts`: determinista, carriles por subsaga, `libre` al lateral.
- Validación del borrador, incluido el CHECK de colocación replicado.

**E2E**, sobre las 6 specs de sagas que ya existen:

1. El número del hero **no se mueve** al cambiar de itinerario (la red contra el #91, ya existe).
2. Una saga sin grafo y con miembros sin numerar **muestra progreso** (el caso Mundodisco).
3. Marcar un bloque `optional` baja el denominador del padre y **no** el de su propia ficha.
4. Las tres zonas del editor: arrastrar entre ellas cambia la colocación y sobrevive al guardado.
5. **#180 / #182** — la suite de sagas se toca entera, así que se arregla de paso que "adoptar una
   ruta" deje su fila en dev y envenene la siguiente pasada.

## Riesgos conocidos

- **Las anclas son aristas con otro nombre.** Ya está dicho arriba; la restricción dura es lo único
  que lo impide. Merece una revisión explícita en la PR.
- **El layout calculado puede quedar peor que el colocado a mano**, sobre todo en Mundodisco (26
  nodos). Mitigación: se mide contra el dibujo actual antes de borrar nada, y el volcado en
  `backups/` permite reconstruirlo si el resultado no convence.
- **Mundodisco necesita curación humana** después de la migración. Si nadie la hace, queda una saga
  con 5 bloques sin orden fino — pero con progreso correcto, que hoy no tiene.
- **`optional` es un botón fácil de abusar**: un curador puede marcar media saga como opcional y
  vaciar el denominador. No se pone límite técnico; se asume, igual que se asume que puede escribir
  cualquier `position`.

## Dependencia

La PR #189 (rol narrativo, issue #167) **está mergeada en `main` desde el 2026-07-25** (commit
`2c31f93`). Su columna `role` ya estaba en prod, y su editor de miembros en `/saga/[id]/editar`
(`saga-members-editor.tsx` + `member-actions.ts`) es la semilla sobre la que crece la pantalla única de
curación de este spec: la fila por miembro con `position` y `role` ya existe, y lo que se le añade son
las tres zonas, `optional` y los bloques-subsaga.
