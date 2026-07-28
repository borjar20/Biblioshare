# Sagas: menos cruces de aristas en el mapa 2D — diseño

> **[Canónico · verificado contra el repo el 2026-07-28]**
> Continúa la fase 6 (`db33ba6`, PR #244, los cuatro estados en el grafo 2D). No toca esquema: es
> geometría pura sobre lo que `deriveSagaMap` ya deriva. El estado de la feature vive en
> `docs/requirements/backlog.md`; lo accionable, en issues.

## El problema, tal y como se ve

Captura del responsable (2026-07-28, saga Cosmere): el centro del mapa es un nudo de aristas
punteadas ámbar y discontinuas azules cruzándose entre las filas de arriba y las de abajo.

El diagnóstico NO es «el algoritmo de layout es malo». Es que **no hay algoritmo de layout**:
`deriveSagaMap` (`src/lib/sagas/derive-map.ts:76`) asigna coordenadas fijas y ciegas a las aristas.

- `y` = índice del bloque (`rowCursor`).
- `x` = índice de hueco **local al bloque, reiniciado a 0 en cada fila** (`derive-map.ts:182`).

De ahí salen dos causas distintas, y conviene no confundirlas:

1. **Columnas no alineadas entre filas.** Cada bloque empieza en columna 0, así que un nodo de la
   fila 6 y su ancla de la fila 3 casi nunca comparten vertical: toda arista larga sale diagonal.
2. **Aristas largas de otra capa.** Las de ventana (`requisito`/`opcional`, `derive-map.ts:378-402`)
   y los saltos de itinerario (`derive-map.ts:448`) unen filas lejanas por definición. Son las que
   hacen el nudo; las de cadena (`principal`) casi no cruzan.

## Lo que NO se hace, y por qué

**No entra un motor de layout (dagre, elkjs).** Minimizar cruces con Sugiyama exige poder permutar
capas y nodos dentro de capa, y eso destruye el modelo «una fila = un bloque» que la Task 9 decidió a
propósito (`derive-map.ts:113-119`) y que cuatro tests fijan (`derive-map.test.ts:479-560`). Un ELK
con capas fijadas acaba siendo lo que este spec describe, más 40 kB de dependencia.

**No se enrutan las aristas por un canal lateral.** `FloatingEdge` (`floating-edge.tsx:68`) dibuja
bezier centro a centro; desviarlas por un canal las hace más largas y no reduce cruces reales, solo
los reparte.

**No se añade una lente que oculte las capas de ventana e itinerario.** Es la opción con mejor ratio
esfuerzo/resultado visual, pero resuelve el síntoma escondiendo información. Queda anotada como
trabajo posible, no descartada.

**No se cuentan los cruces.** Se valoró una función pura `countEdgeCrossings` como oráculo objetivo.
Decisión del responsable: los tests fijan fila y columna esperadas, como los de hoy. La consecuencia
asumida es que ningún test afirma «esto cruza menos» — solo «esto está donde dije».

## Arquitectura

Tres piezas, dos nuevas. La partición no es estética: **las dos mitades necesitan saber cosas
distintas y por eso corren en momentos distintos.**

| Pieza | Dónde | Qué sabe | Qué hace |
|---|---|---|---|
| `orderBlocksForLayout` | `group-members.ts`, pegada a `partitionGroups` | bloques + ventanas | devuelve los bloques en **orden de pintado** |
| `deriveSagaMap` | `derive-map.ts` | todo | itera el array que le da la anterior; llama a la siguiente al final |
| `alignRowsToLongEdges` | `layout-map.ts` (nuevo) | solo nodos + aristas | desplaza columnas de bloques enteros |

Flujo: `partitionGroups` → `orderBlocksForLayout` → `blocks.forEach` de siempre → aristas de ventana
e itinerario → `alignRowsToLongEdges` → `nodes.sort` de siempre.

Por qué ahí y no en otro sitio:

- **B va antes del `forEach`** porque necesita la semántica de grupos (`placementInParent`, miembros),
  que ahí está toda y que **no viaja en `SagaGraphNode`** — el nodo lleva `groupSagaId`, no el
  placement del bloque. Meterla en el post-pase obligaría a ensanchar un tipo que comparten tres
  consumidores (vista 2D, timeline móvil, mini-preview del CTA).
- **A va después de las aristas** porque necesita las de ventana e itinerario, y esas **no existen
  todavía** cuando el `forEach` corre: se construyen 150 líneas más abajo (`derive-map.ts:359`). A no
  cabe dentro del `forEach` aunque se quisiera.

### Dos cambios obligados dentro de `derive-map.ts`

No son opcionales ni cosméticos: sin ellos, B produce un mapa incorrecto.

1. **La condición de la cadena entre bloques deja de ser un índice.** Hoy `derive-map.ts:272` decide
   «este bloque entra en la cadena» con `y < ordered.length`, que funciona solo porque `blocks` es
   literalmente `[...ordered, ...free]`. Con los libres intercalados ese índice miente: un bloque
   libre en la posición 2 se encadenaría como si fuera colocado. Pasa a ser
   `group.placementInParent !== "libre"` — el mismo predicado exacto que usa `partitionGroups`
   (`group-members.ts:180`), sin concepto nuevo.

2. **`orderCounter` se desacopla del orden de pintado.** Hoy se incrementa dentro del `forEach`, así
   que reordenar el array reordenaría los `orderNo`. Y `orderNo` no es una coordenada: es el índice
   lógico que consume `deriveTimeline` para el timeline de móvil, y tiene que seguir siendo global y
   creciente **en el orden de lectura** (`derive-map.ts:120-128`). Solución: una pre-pasada sobre
   `[...ordered, ...free]` —el orden semántico, no el de pintado— que llena un
   `Map<clave de obra, orderNo>`; el `forEach` lo lee en vez de incrementar.

### Riesgo asumido

Con (2), el mapa 2D puede dibujar un bloque libre arriba mientras el timeline de móvil lo sigue
listando al final. Son dos afirmaciones distintas —dónde se dibuja vs en qué orden se lee— pero un
usuario puede leerlas como una contradicción, que es justo el tipo de divergencia entre vistas que
este código ha pagado caro antes (#91/#185/#203). **Se abre issue.** No se resuelve aquí: la
alternativa —que `orderNo` siga al pintado— rompería el timeline de móvil, que es peor.

## B — orden de bloques

`orderBlocksForLayout(ordered, free, windows): MemberGroup[]`

- Parte de `ordered`, en su orden, **intocable**: ese orden es curación, no layout.
- Ancla de un bloque libre: su ventana `s:<sagaId>` en `windows`, tomando `afterKey ?? beforeKey`. La
  clave se resuelve al **bloque** que la contiene — una clave `s:` es el bloque; una `i:` es el
  bloque de esa obra.
- `after` → se inserta justo **detrás** del bloque ancla. `before` → justo **delante**.
- Pasadas repetidas mientras haya progreso, para el caso de un libre anclado a otro libre.
- Lo que quede sin resolver —sin ventana, ancla rota, o ciclo— se añade **al final**, en su orden
  original. Un ciclo no cuelga: la primera pasada sin progreso corta el bucle.
- Dos libres con la misma ancla y el mismo lado conservan su orden relativo original. Determinista.

Alcance de la decisión: **un bloque libre puede subir e intercalarse entre los colocados.** Se pierde
la zona `libre` como franja reconocible al final del mapa. No hace falta señal visual nueva: un
bloque libre solo sube si tiene ventana, y un sujeto de ventana ya lleva su marco
(`map-overlays.ts`, `WindowFrame`) y su píldora «VENTANA · RECOMENDADA». Los libres sin ancla no
tienen a qué alinearse y se quedan al fondo, donde estaban.

Las obras `loose` (las de la fila propia dentro de un bloque, `derive-map.ts:311`) se ordenan por la
columna de su ancla, con el título como desempate. Pierden el orden alfabético puro; a cambio su
arista de ventana deja de cruzar la fila entera.

Esta pieza es de B conceptualmente —reordenar lo que no tiene orden semántico— pero **se implementa
como segunda fase de A**: necesita la columna FINAL del ancla, que no se sabe hasta que A ha colocado
los bloques. Una fila de sueltas se reconoce sin ambigüedad por `orderNo === null`, que es
exactamente lo que `deriveSagaMap` le pone a una obra sin hueco.

## A — alineación de columnas

`alignRowsToLongEdges(graph: SagaGraph): SagaGraph`. Puro, sin React, sin conocer bloques ni
ventanas: solo lee `nodes` y `edges`.

- **Arista larga** = `type` en `{requisito, opcional, itinerario}`. `principal` queda **fuera**: la
  cadena entre bloques se queda compacta en la columna 0, que es lo que protege la Task 9. Alinear
  también por ella reproduciría la escalera diagonal que la Task 9 mató.
- **La unidad que se mueve es el BLOQUE, no la fila.** Un bloque puede ocupar varias filas (apilado
  de tándem, más la fila de sueltas) y un tándem **comparte columna entre filas**: mover una fila
  suelta lo desapila y deshace lo que arregló la fase 2. Identidad del bloque = `groupSagaId`, que ya
  viaja en el nodo (`null` = el grupo «Nexo», y solo puede haber uno).
- Recorrido de arriba abajo. Para cada bloque se miran sus aristas largas hacia bloques **ya
  colocados** (arriba). Delta por arista, en columnas: `(x del vecino − x mío) / NODE_STEP_X`. Se
  aplica la **mediana** de esos deltas a **todos** los nodos del bloque: óptimo L1, y resistente a un
  ancla rara que tire de un extremo.
- Un bloque sin aristas largas hacia arriba: offset 0. Sigue en la columna 0, como hoy. Es también el
  caso de un libre insertado **delante** de su ancla (ventana `before`): su ancla queda debajo, así
  que él no se mueve y es el ancla la que se alinea a él cuando le toque.
- No muta nada: devuelve un `SagaGraph` con nodos nuevos. La función es pura.
- Normalización final: se resta el mínimo `x`, así el mapa vuelve a empezar en la columna 0.

**Tope: `MAX_COL_OFFSET = 4` columnas.** El offset es **absoluto** —distancia a la columna 0, no al
bloque anterior— y se recorta a `[0, 4]`. Sin él la escalera vuelve por la puerta de atrás: si el
bloque 2 se ancla a la última columna del 1, y el 3 a la última del 2, los offsets se acumulan. El
tope acota el ancho del dibujo a «bloque más largo + 4» y el caso común, con el ancla en las primeras
columnas, se endereza igual.

## Pruebas

Cada caso límite tiene su test; ninguno se deja al criterio del que implemente.

**`group-members.test.ts` (ampliado)** — inserción `after` e inserción `before`; cadena de dos libres
anclados uno al otro; ancla rota → al final sin romper a los demás; ciclo → no cuelga y ambos al
final; dos libres con la misma ancla → orden relativo original.

**`layout-map.test.ts` (nuevo)** — alinea por una arista `requisito`; ignora una `principal`; mueve el
bloque entero, con el tándem sin desapilar; aplica el tope de 4 columnas; normaliza el mínimo a 0; un
grafo sin aristas largas sale idéntico al que entró.

**`derive-map.test.ts`** — un test de integración nuevo con el escenario reducido de la captura (dos
bloques colocados y un libre anclado arriba) que fija fila y columna finales.

El criterio duro de que la Task 9 sobrevive: **los cuatro tests de `derive-map.test.ts:479-560` siguen
verdes sin tocarlos**, porque ninguno tiene ventanas y el offset les sale 0. No es una promesa, es una
comprobación.

Lo que sí cambia son los tests que fijan la fila de un bloque `libre` con ancla. Se actualizan con el
porqué escrito al lado, nunca en silencio.

## Documentación y trabajo que queda

- **No toca esquema.** `docs/requirements/data-model.md` no se mueve.
- Entrada al final de `docs/requirements/decisiones.md` (append-only): los bloques libres se
  intercalan junto a su ancla, y `orderNo` se desacopla del orden de pintado.
- **Issue:** mapa 2D y timeline de móvil pueden colocar el mismo bloque libre en sitios distintos
  (sección «Riesgo asumido»).
- **Issue:** lente para ocultar las capas de ventana e itinerario — el trabajo descartado arriba, que
  merece hacerse algún día.
