# Sagas fase 3: el mapa deja de ser una tabla — diseño

> **[Canónico · verificado contra el repo y contra prod el 2026-07-27]**
> Cierra la unificación que empezaron `2026-07-25-sagas-orden-unificado-design.md` (fase 1),
> `2026-07-26-sagas-fase-2a-editor-secuencia-design.md` (2a, PR #201) y
> `2026-07-26-sagas-fase-2b-ventanas-design.md` (2b, PR #207). El estado de la feature vive en
> `docs/requirements/backlog.md`; lo accionable, en issues. Los números marcados **[MEDIDO]** salen
> de `SELECT` de solo lectura contra **producción** el 2026-07-27, con la fase 2b ya desplegada y el
> Cosmere ya curado.

## La frase que resume la fase

**El grafo no se retira: se deja de guardar.** La vista se queda —el usuario la quiere— y pasa a
dibujarse de lo que ya está curado. Lo que muere son sus tablas, su RPC y su código de resolución.

Es la última consecuencia de la tesis con la que empezó todo: *una verdad, varias vistas*. Hasta hoy
el mapa era una **segunda verdad**, escrita a mano en su propio lienzo y capaz de contradecir a la
ficha. A partir de esta fase es una vista más, como la ficha o la card.

## Lo que hay hoy, medido

Cuatro sagas tienen grafo. **[MEDIDO]**

| saga | nodos | con `order_no` | aristas | qué dice el grafo que el modelo nuevo no diga ya |
|---|---:|---:|---:|---|
| **Trono de Cristal** | 8 | 8 | 8 | **Nada.** `order_no` coincide con `saga_items.position` uno a uno, **empate en el 6 incluido** (*Torre del Alba* / *Imperio de Tormentas*), que en el modelo nuevo ya es un tándem. |
| **Maasverse** | 1 | 0 | 0 | **Nada.** Un único nodo que apunta a una subsaga y sin orden. Es el mismo hallazgo que convirtió en no-op la migración «de rescate» de la 2a. |
| **Cosmere** | 20 | 19 | 18 | Un orden de **19 obras entrelazadas entre bloques**: *Esquirla del Amanecer* entre *Juramentada* y *El Ritmo de la Guerra*; *Viento y Verdad* después de *El Hombre Iluminado*; las cuatro *Novelas secretas* repartidas por el final. **Es más fino que lo curado en 2b**, que es a nivel de bloque. |
| **Mundodisco** | 26 | 0 | 28 | 21 aristas que son las cadenas internas de sus 5 hilos, **redundantes** —las 26 obras ya tienen su hueco dentro de su hilo, 3/3, 5/5, 8/8, 7/7 y 3/3—, más **7 aristas que cruzan hilos**, que no las dice nadie más. |

Dos datos más que gobiernan el diseño, los dos **[MEDIDO]**:

- **`saga_routes` está vacía en producción.** Cero itinerarios. La función existe desde la #175/#181,
  se cura paso a paso con notas, y nadie la ha estrenado.
- **`saga_route_entries` tiene un unique en `(route_id, position)`.** Un itinerario es
  **estrictamente lineal**: no admite dos pasos en el mismo número, así que no puede expresar «estas
  dos cosas van en paralelo». Esto decide cómo se migra Mundodisco (§ El migrador).

### Las 7 aristas que cruzan hilos

Son el único contenido irreducible de Mundodisco. **[MEDIDO]**

| desde | hilo | hasta | hilo |
|---|---|---|---|
| Ladrón del Tiempo | La Saga de la Muerte | Ronda de Noche | Los Guardias |
| ¡Zas! | Los Guardias | Regimiento Monstruoso | Revolución Industrial |
| El Quinto Elefante | Los Guardias | La Verdad | Revolución Industrial |
| Ronda de Noche | Los Guardias | La Verdad | Revolución Industrial |
| Eric | Los Magos | Imágenes en Acción | Revolución Industrial |
| Imágenes en Acción | Revolución Industrial | Tiempos Interesantes | Los Magos |
| Regimiento Monstruoso | Revolución Industrial | Cartas en el Asunto | Húmedo Von Mustachen |

## Qué se construye

1. **El mapa se deriva de la curación**: secuencia, tándems, bloques y ventanas.
2. **El itinerario se resalta encima** de ese mismo dibujo.
3. **Un migrador de una sola pasada** que convierte en itinerarios lo que solo el grafo sabe.
4. **Un generador**: «Generar itinerario» construye uno desde la curación.
5. **La retirada**: `saga_nodes`, `saga_edges`, `save_saga_graph` y el código que los resuelve.

### Fuera de alcance

- **Curar el mapa.** Sigue siendo de solo lectura: su editor se retiró en la 2a y no vuelve. Se cura
  en el editor de secuencia, con listas y selectores, nunca arrastrando.
- **Relajar la restricción dura de la 2b.** Máximo una ventana por entrada y dos anclas. Si al
  dibujar apetece «una arista más», es exactamente la señal que la 2b pidió no ignorar: se para y se
  dice en voz alta.
- **Ventanas sobre obras de dentro de un bloque.** Hoy una ventana es de una entrada `libre` de la
  saga que se cura. Las 7 aristas de Mundodisco son entre obras de hilos distintos, así que **no**
  caben como ventanas. Viven en su itinerario, y punto.
- **Editar el itinerario generado desde el propio mapa.** Se genera y luego se edita en el editor de
  itinerarios que ya existe.

---

## El mapa derivado

Los nodos son **obras individuales**, expandiendo los bloques hasta la misma profundidad 4 que ya usa
`fetchDescendants` en `get-saga-detail.ts`. Es una decisión explícita del responsable: la ficha
cuenta la saga por bloques, y el mapa la cuenta por obras. Son dos lecturas distintas del mismo dato,
y esa es justamente la gracia de tener dos vistas.

### De dónde sale cada cosa

| en el dibujo | sale de |
|---|---|
| nodo | cada obra del subárbol, expandiendo bloques |
| columna (x) | el hueco: el `position` de la obra dentro de su bloque, precedido del hueco del bloque en su padre |
| fila (y) | el bloque al que pertenece la obra — un hilo por fila |
| dos nodos en la misma columna | un **tándem** (dos entradas en el mismo hueco), que ya existe desde la 2a |
| arista de la cadena | dos huecos consecutivos dentro del mismo bloque |
| **arista que cruza** | **una ventana**: el ancla `after` es una arista entrante, la `before` una saliente |
| nodo suelto, sin aristas | una entrada `libre` **sin** ventana |
| agrupación / leyenda | el bloque; **no** es un nodo |

### Las ventanas son las aristas, literalmente

La migración de la 2b se abre con este aviso: *«⚠️ Esto son aristas otra vez, con otro nombre»*. Lo
era, y lo sigue siendo. Lo que la 2b hizo fue meterlas en una restricción dura —una fila por entrada,
dos anclas, solo para lo `libre`, curadas con selectores— para que no volvieran a degenerar en el
lienzo que la 2a retiró.

Esta fase cierra el círculo **dibujándolas como lo que son**, sin darles ni un gramo de poder nuevo:

- `after` («a partir de X») → arista **X → entrada**, del tipo `requisito`.
- `before` («recomendable antes de Y») → arista **entrada → Y**, del tipo `opcional`.

El tipo de arista no se inventa: `edge_type` ya tenía esos tres valores (`principal`, `opcional`,
`requisito`) y el dibujo ya sabe colorearlos. La cadena de huecos es `principal`.

### El dibujo ya no tiene coordenadas guardadas

`saga_nodes` guarda `x`/`y` colocadas a mano. Al derivar el mapa **no hay coordenadas**: hay que
calcularlas. La buena noticia es que el consumidor no necesita un sistema concreto —`scaleNodes` en
`derive-timeline.ts` normaliza lo que le den al viewport—, así que basta con un criterio
determinista:

- **x** = el hueco, aplanado: los bloques colocados van en el orden de la ficha, y dentro de cada uno
  las obras por su `position`. Un tándem comparte x.
- **y** = una fila por bloque, en el orden en que el bloque aparece en la ficha. Los `libre` van
  después de los colocados, que es donde ya los pone la #198.

Para Mundodisco eso da **cinco filas paralelas** —una por hilo— que es, casualmente, la forma del
diagrama clásico de esa saga.

### Lo que se pierde, y por qué se acepta

Tres cosas que solo existían porque el grafo se curaba a mano:

- **La colocación a ojo** (`x`/`y`). Se sustituye por el cálculo de arriba. Es lo que hace que el
  mapa **pueda existir** para todas las sagas curadas y no solo para las cuatro que alguien dibujó
  a mano — "pueda", no "exista ya": el curador decide con el interruptor `sagas.show_map`
  (`false` por defecto; el backfill solo lo enciende para esas cuatro), así que una saga curada
  sin grafo no enseña mapa hasta que alguien lo active.
- **`label_override`.** Un nodo podía llamarse distinto que la obra. **No se pierde nada: hay 0 de 55
  con valor** **[MEDIDO]**. El nodo es la obra y se llama como ella.
- **`level` (`principal`/`menor`).** **53 `principal` y 2 `menor` de 55** **[MEDIDO]**. Se sustituye
  por lo que el modelo nuevo ya sabe: `optional` y el rol narrativo (#167), que la ficha ya pinta.
  Hay que mirar **cuáles son esos dos** antes de borrar, y comprobar que su condición de «menor» ya
  está dicha por `optional` o por el rol; si no lo está, se cura a mano, que son dos.

## El itinerario, encima

Si hay itinerario activo, su recorrido se resalta **sobre el mismo dibujo**: los pasos numerados y el
camino marcado.

La regla que evita la contradicción: **el itinerario manda sobre lo que dice, y el mapa sobre lo que
el itinerario calla**. Un paso del itinerario se ve aunque debajo no haya ninguna arista derivada
—que es exactamente el caso del entrelazado fino del Cosmere y de las 7 cruces de Mundodisco—, y una
arista derivada se sigue viendo aunque el itinerario no pase por ahí.

El selector de la pestaña ya existe (`RouteSelector`, con `lectura` / `publicacion` / las curadas),
así que esto es un cambio de qué pinta `lectura`, no una pantalla nueva.

## El migrador, una sola pasada

Convierte en itinerario lo que solo el grafo sabe. Es SQL de datos, y es **reversible borrando el
itinerario**: no toca nada más.

### Cosmere → 19 pasos

Sus 19 nodos con `order_no` ya son una lista. Se copian en orden. El nodo sin `order_no` (*Arcanum
Ilimitado*) **no entra**: no estaba en el orden.

### Mundodisco → 26 pasos

Aquí está la única decisión difícil de la fase. El grafo es un **DAG**, el itinerario es
**estrictamente lineal** (unique en `(route_id, position)`), y un orden topológico **no es único**:
hay que elegir uno y saber explicar por qué.

Criterio, en este orden:

1. Orden topológico de las 28 aristas (Kahn).
2. Cuando varias obras están listas a la vez, gana la del **hilo que ya se estaba leyendo**; en su
   defecto, el hilo cuyo nombre va antes alfabéticamente — los cinco hilos son `libre` y ninguno
   tiene hueco, así que no hay un orden de hilos que respetar.
3. Dentro del hilo, por su `position`.

Esto agrupa cada hilo todo lo que las cruces permiten, en vez de ir saltando de hilo en hilo, y es
determinista: dos ejecuciones dan el mismo itinerario. **Se comprueba ejecutándolo dos veces y
comparando.**

El resultado hay que **mirarlo con ojos de lector** antes de darlo por bueno: si la linealización
produce un orden que nadie recomendaría, es preferible ajustarlo a mano después —para eso el
itinerario se edita— que aceptar un artefacto del algoritmo.

### Los dos que no se migran

**Trono de Cristal** y **Maasverse** no producen itinerario: está medido que uno es redundante hasta
el empate del hueco 6 y el otro está vacío. Migrarlos crearía dos itinerarios que no dicen nada y que
alguien tendría que mantener.

## El generador

Botón **«Generar itinerario»** en la sección de itinerarios del editor, junto a lo que ya hay.

- Recorre la curación **en el mismo orden que el mapa** (obras individuales, bloques expandidos) y
  crea un itinerario con esos pasos.
- **Crea uno nuevo; nunca pisa** los existentes. Una saga admite varios (`saga_routes` tiene `slug`,
  `name` y `position`), así que no hay razón para sobrescribir nada.
- Después se edita a mano como cualquier otro, con sus notas por paso (#175).
- Si la saga no tiene nada curado, el botón lo dice en vez de crear un itinerario vacío — la lección
  de la #181 y de la línea que se añadió en la #198.

Es lo que convierte esta fase en algo más que una retirada: hoy un itinerario se empieza en blanco, y
por eso hay cero en producción.

## La retirada

Se borran, en este orden:

1. **El código que lee las tablas**: `graph-data.ts` y su test, la consulta de `saga_nodes` en
   `get-saga-detail.ts`, y la de `get-followed-sagas.ts:98`.
2. **`main-order.ts`**, que hoy mezcla la heurística vieja con el grafo (#204). El orden principal
   pasa a salir de la secuencia curada, que es la misma fuente que el mapa. Su cabecera ya avisa de
   que la asimetría del #185 «muere en la fase 3».
3. **El RPC `save_saga_graph`** y, por fin, **`saga_nodes` y `saga_edges`**.

`@xyflow/react` **se queda**: la vista es lo que el responsable quiere conservar.

### El orden, que esta vez sí es el de siempre

Al revés que en la 2b, aquí **el código va primero y la migración después**. Borrar una tabla que el
bundle desplegado todavía consulta rompe la ficha entera; borrarla cuando ya nadie la lee no rompe
nada. Así que: desplegar el mapa derivado, comprobar que sirve, y **solo entonces** el `drop`.

El migrador va **antes** del `drop`, obviamente: lee de las tablas que el `drop` se lleva.

## Lo que no cambia

- **El progreso.** Ni el numerador ni el denominador. El Cosmere marca **9 de 11** y tiene que seguir
  marcándolo al acabar. Desde la fase 1 el progreso sale de la pertenencia, no del orden, y esta fase
  no toca la pertenencia.
- **La ficha.** La sección «Títulos que la componen» sigue contando la saga por bloques, con su
  reparto entre lista ordenada y «Cuando quieras» hecho **en el render** (#198) y sus líneas de
  ventana (2b).
- **La curación.** El mapa es de lectura.

## Riesgos conocidos

- **El mapa derivado de Mundodisco sale sin cruces.** Sus 5 hilos son `libre` y no tienen ventanas,
  así que el dibujo derivado son cinco cadenas paralelas sueltas. Las 7 cruces viven en su
  itinerario, que se resalta encima. **No caben como ventanas**: son entre obras, y una ventana es de
  una entrada de la saga que se cura, con dos anclas como mucho — 5 bloques × 2 anclas < 7 aristas
  entre obras. Está aceptado a sabiendas.
- **El mapa del Cosmere cambiará de aspecto.** Hoy dibuja 19 obras entrelazadas a mano; mañana
  dibujará el orden por bloques que se curó en la 2b. Es la misma información que ya enseña la ficha,
  y el entrelazado fino queda en el itinerario migrado. Conviene mirarlo tras desplegar y no
  confundirlo con un fallo — es la familia del aviso de acentos de la #202.
- **La linealización puede producir un orden raro.** Ver § El migrador: se mira antes de aceptarlo.
- **Sagas grandes.** El mapa deja de estar acotado a lo que alguien dibujó y pasa a tener un nodo por
  obra del subárbol. Conviene medir el mayor caso real antes de dar por buena la vista.

## Pruebas

- **Puras, y son la mayoría**: la derivación del mapa (nodos, columnas, filas, tándems y las aristas
  de ventana con su `edge_type`), la linealización topológica (determinista: la misma entrada da el
  mismo orden, comprobado con varias permutaciones de la entrada, como se hizo con el comparador de
  la #198) y el generador.
- **Inyección de fallo**, como en toda la rama: cada regla nueva se desactiva y tiene que caer **su**
  prueba y solo la suya.
- **E2E**: que la pestaña «Mapa de lectura» siga pintando algo en una saga curada sin grafo —el caso
  que hoy no existe y que esta fase estrena— y que el generador cree un itinerario recorrible.
- **Contra producción, antes y después**: el itinerario migrado del Cosmere tiene 19 pasos y el de
  Mundodisco 26; el progreso sigue en 9 de 11.

## Deuda

Se cierran:

- **#204** — `main-order.ts` con la heurística vieja: desaparece el fichero.
- **#196** — que el grafo nunca tuvo la colocación de 11 de las 12 hijas: deja de tener sentido
  cuando el grafo no guarda colocación alguna. Se cierra explicando por qué, no en silencio.
- **#185** — la asimetría entre «con grafo» y «sin grafo». Su título habla del denominador del
  progreso, pero eso lo arregló la fase 1: hoy la asimetría solo sobrevive en la **secuencia**
  (con grafo, un nodo sin `order_no` no entra; sin grafo, entran todos los miembros), y la cabecera
  de `main-order.ts` ya la señala como muerta en esta fase. Se cierra explicando esa diferencia.

Sigue viva la **#206** (deuda menor de la 2b), que esta fase no toca.

## Dependencia

Ninguna pendiente: la 2a y la 2b están desplegadas, el Cosmere curado y las tres migraciones de la 2b
aplicadas a producción, con una sola firma de `save_saga_sequence` viva.
