# Sagas: el orden de lectura recupera su forma — los cuatro estados del timeline — diseño

> **[Canónico · verificado contra el repo y contra prod el 2026-07-28]**
> Continúa la fase 4 (`2026-07-27-sagas-fase-4-orden-designado-y-ventanas-anidadas-design.md`,
> PR #216 y #217, desplegada, con `save_saga_sequence` ya reducida a una sola firma en producción).
> El estado de la feature vive en `docs/requirements/backlog.md`; lo accionable, en issues. Los
> números marcados **[MEDIDO]** salen de `SELECT` de solo lectura contra **producción** el
> 2026-07-28.

## De dónde sale

De usar el producto. En palabras del responsable:

> «con los itinerarios en móvil hemos perdido el impacto gráfico, tanto para móvil como para el pie
> del grafo en PC quiero mostrar el orden de lectura con el estilo planteado en el mockup».

Mockup: `D:\Proyectos\Personal\Mockups\Paper - Sagas (estados del grafo).html`, frames A a E.

El diagnóstico está medido en el código, no supuesto: **hoy, con un itinerario curado activo, el
móvil no pinta ningún timeline.** `saga-map-tab.tsx` solo monta `ReadingTimeline` en la rama
`activeRoute === "lectura"`; cualquier ruta curada cae en la rama de abajo, que en móvil deja
únicamente la lista de `RouteView`. El grafo embebido es solo de PC. Así que elegir un itinerario
—lo más curado que tiene el producto— es exactamente lo que peor se ve.

## Lo que hay hoy, medido

**El escenario es minúsculo, y eso gobierna el diseño.** **[MEDIDO]**

| | |
|---|---|
| tándems en TODA la producción | **1**: Trono de Cristal, hueco 5 (*Imperio de Tormentas* + *Torre del Alba*) |
| ventanas | **4**: *Nacidos de la Bruma. Era 2* (bloque, bajo Cosmere), *El Hombre Iluminado* (bajo Novelas secretas), *Esquirla del Amanecer* (bajo El Archivo), *La Espada de la Asesina* (bajo Trono de Cristal) |
| filas con `role` | **8** de 363: 4 `relato`, 3 `precuela`, 1 `spin_off`, **0 `paralela`** |
| itinerarios | 3, con 2 designados como orden de lectura |
| sagas con `show_map` | 4 |

Dos consecuencias directas:

1. **Retirar `paralela` del enum de roles es gratis en datos** — no hay ni una fila.
2. **Hay un solo tándem**, así que la migración de sus metadatos no puede romper nada masivo; pero
   también significa que el estado 01 se va a estrenar con este caso, y conviene que se vea bien
   precisamente en él.

## Alcance

### Entra

Los cuatro estados del mockup —tándem, ventana recomendada, opcional y roles— dibujados por **un
único componente de orden de lectura**, montado en **dos sitios**: móvil, y al pie del grafo en PC.
El frame D (traducir los estados al grafo 2D) entra como **última fase**, separable.

### No entra — límite duro

- **El progreso no se toca.** Ni `companero` deja de computar, ni el `saltado` mueve el denominador,
  ni existe «progreso con o sin opcionales». `src/lib/sagas/progress.ts` sale de esta feature
  exactamente como entró. El mockup pide lo contrario en dos sitios («desaparece del cómputo», «no
  cuenta para tu progreso») y **se descarta a sabiendas**: reabrir el denominador es la familia de
  fallo que cerraron el #91, el #185 y la fase 1, y no vale la pena pagarla por una etiqueta.
- **Roles personalizados** creados por el moderador (tabla, pantalla de gestión, i18n).
- **Una tercera ancla** por ventana, o más de una ventana por entrada. Lo fijó la 2b; aquí no se
  toca. Si al construir apetece una tercera, **se para y se dice en voz alta**.

## Decisiones tomadas, con su porqué

### 1. Con un itinerario activo, la columna son SUS pasos

`deriveTimeline` construye hoy la columna con `orderNo` —el orden **curado**—, así que pasarle el
grafo del itinerario habría dado la columna en un orden y los números en otro. Es justo lo que hace
que el lector se pierda. La columna pasa a ser 1..N del itinerario, y **la subsaga baja de cabecera
de sección a etiqueta de fila**: en Mundodisco, el hilo de los Magos se partiría en dos trozos con
*Imágenes en Acción* en medio, y repetir la cabecera «Magos» dos veces rompe más de lo que explica.

El dato ya viaja en el nodo (`groupName`, `accent`): no hace falta nada nuevo.

### 2. El timeline sustituye la lista de pasos de `RouteView`, no se suma a ella

`RouteView` conserva lo que solo tiene él: nombre y resumen del itinerario, «Llevas X de Y», el botón
de adoptar y la sección «Sin puesto en este itinerario» que añadió la fase 4. Los pasos los pinta el
timeline. Una sola lista: verlos dos veces seguidos es el ruido que la fase 4 evitó al no numerar por
duplicado.

### 3. «Saltar» una opcional es solo visual

Estado por usuario que tacha y pliega la fila, con «Deshacer». **El denominador no se mueve.** Es lo
que cabe dentro del límite de arriba, y es reversible: si algún día se decide que descuente, el dato
ya estará guardado.

### 4. Los roles se amplían, sin personalizados, y `nexo` cambia de nombre

`nexo` ya significa otra cosa en este producto —el grupo de miembros directos de un universo sin
subsaga, `groupSagaId === null`, el punto beige de la leyenda—, así que usarlo como rol dejaría dos
«nexos» distintos en la misma pantalla. Se llama **`crossover`**, que además es la palabra que usan
los lectores.

`principal` del mockup **no se materializa**: es exactamente lo que hoy es `role = null`, y darle un
valor propio serían dos formas de decir lo mismo — la familia del #91 otra vez, en pequeño.

### 5. El mini-track dibuja el tramo, y la posición solo si hay sesión

La ficha es pública. El tramo sale de las dos anclas, que ya existen; «tu posición» se deriva de lo
que el lector tenga completado. **Derivar no es cambiar**: se LEE el estado con `isMemberCompleted`
(`completion.ts`, el predicado único del #91), no se reimplementa ninguno ni se toca el denominador.
Sin sesión, la barra se pinta sin marcador y sin aviso.

### 6. El interruptor de opcionales es preferencia de usuario, global y persistente

Mismo criterio que `saga_route_choices`: es preferencia personal, no curación. Y no necesita tabla —
`profiles` ya guarda una preferencia de usuario (`daily_goal_minutes`).

### 7. Los metadatos del tándem van en una tabla por HUECO, no en las obras

Es la bifurcación de fondo, porque **un tándem hoy no es una entidad**: es lo que emerge de que dos
filas compartan `position`.

- **Elegido — `saga_tandems (saga_id, position)`**: la pertenencia sigue teniendo **una sola** fuente
  de verdad (el empate de `position`); la tabla solo añade metadatos del hueco. El riesgo obvio
  —renumerar mueve el hueco bajo los pies— se cierra solo: desde la fase 2a `save_saga_sequence` es
  el **único** escritor de `position` (decisión del 2026-07-26, cuando se retiró `assignItemToSaga`
  como segundo escritor) y reescribe la secuencia entera en una transacción, así que los metadatos
  viajan en el mismo payload, indexados por hueco.
- **Descartado — `tandem_id` en `saga_items`**: identidad estable, pero deja DOS fuentes de verdad
  sobre quién está en el tándem (mismo `position` y mismo `tandem_id`) que pueden contradecirse, y
  ningún CHECK puede atarlas porque cruzan filas. Es la familia del #91, el #185 y el #203.
- **Descartado — columnas en cada miembro**: N filas que tienen que decir lo mismo sin nada que lo
  imponga. Lo peor de las dos.

### 8. Un solo componente con dos modos de columna, no dos componentes

Todo lo que cuesta —el render de los cuatro estados— es común. Dos componentes se desincronizarían, y
el pie del grafo de PC monta exactamente el mismo que el móvil.

## Esquema

| Cambio | Forma | Nota |
|---|---|---|
| `saga_tandems` | PK `(saga_id, position)`, `modo` enum `simultaneo\|indistinto`, `nota text` | Metadatos del hueco; la pertenencia sigue siendo el empate de `position` |
| `save_saga_sequence` → **7 argumentos** | `p_tandems`, con **baja explícita** | Misma disciplina que `p_removed` y `p_window_subjects`: un hueco que deja de ser tándem borra su fila en la MISMA transacción. Sobrecarga primero, `drop` después del despliegue |
| `saga_placement_windows.motivo` | enum `spoiler\|contexto`, **nullable** | Sin backfill: las 4 ventanas de prod no lo tienen declarado y nadie lo decidió por ellas |
| `saga_item_role` | añade `novela_corta`, `companero`, `crossover`; retira `paralela` | 0 filas `paralela`. Recrear el enum obliga a mirar quién lo consume (`save_saga_sequence`) |
| `saga_optional_skips` | `(user_id, saga_id, item_type, item_id)` | Clon de `saga_route_choices`: RLS solo-dueño, **sin** gate de rol |
| `profiles.show_optional_readings` | `boolean not null default true` | Mismo patrón que `daily_goal_minutes` |

## Derivación — todo puro, testeable sin Supabase

### `deriveTimeline(graph, { spine })`

- **`spine: "curation"`** (ruta «lectura»): columna por `orderNo`, secciones por subsaga consecutiva.
  Es el comportamiento de hoy, sin cambios.
- **`spine: "route"`** (itinerario): columna por `step`, 1..N, sección única sin cabecera.

`TimelineRow` pasa de dos formas a cuatro:

| Forma | Cuándo | Qué lleva |
|---|---|---|
| `entry` | obra con puesto | lo de hoy, más `branches` |
| `tandem` | **nuevo** — N obras que comparten hueco | los N nodos, `modo`, `nota` |
| `window` | **nuevo** — sujeto `libre` con ventana | nodo, anclas resueltas, `motivo`, `track` |
| `bridge` | nexo entre secciones | lo de hoy |

**En la fase 1, `modo`, `nota`, `motivo` y `track` son siempre `null`**: las formas nacen completas
para no rehacer el tipo después, pero los campos que dependen de columnas nuevas se rellenan en las
fases 2 y 3. La fila `tandem` sí se agrupa desde la fase 1 —el empate de `position` ya existe— y la
fila `window` sí se coloca por su regla, con sus anclas resueltas.

### Un paso del itinerario que no se ve no es una fila

Mismo criterio que fijó la fase 4 para los saltos del mapa: un paso fantasma (obra borrada) o un paso
que nombra un bloque entero no resuelve a ningún nodo, así que **no produce fila**. Y el número que
se pinta es la posición del paso en el itinerario, **no** un recuento de las filas visibles: si el
paso 5 no se ve, el 6 sigue siendo el 6. Numerar solo lo visible haría que el timeline y la lista del
itinerario contaran distinto.

### Dónde cae una ventana en la columna

Hoy un sujeto `libre` no tiene `orderNo` y acaba como rama de su conexión más temprana. Regla nueva,
determinista y sin dato nuevo:

1. justo **después** de la fila de su ancla `después de`;
2. si solo tiene `antes de`, justo **antes** de esa fila;
3. si no resuelve ninguna de las dos, cae a rama, como hoy.

Un ancla puede apuntar a un **bloque** (`s:<uuid>`), y un bloque nunca es una fila. Se usa el nodo al
que ya lo resuelve el mapa —última obra del bloque para un `después de`, primera para un `antes
de`—, exactamente la misma regla que `resolveEntry` en `derive-map.ts`: dos resoluciones distintas
del mismo ancla acabarían discrepando.

### `windowTrack(graph, completed)`

Devuelve el tramo y, si hay sesión, la posición del lector —el `orderNo` más alto entre lo
completado— y uno de los tres avisos: **aún no**, **estás dentro**, **ventana pasada**. Sin sesión,
`null`.

## Componentes y ubicaciones

Una pieza presentacional que recibe secciones ya derivadas, con cuatro sub-piezas (`entry`,
`tandem`, `window`, `branch`) y `RoleChip`, que ya existe.

| Dónde | Hoy | Después |
|---|---|---|
| Móvil · «lectura» | timeline pobre + «Como lista lineal» | timeline nuevo, columna por curación |
| Móvil · itinerario | **solo la lista de `RouteView`** | timeline nuevo dentro de `RouteView`, columna por pasos |
| PC · «lectura» | grafo + leyenda | **+ el mismo timeline al pie** |
| PC · itinerario | grafo + leyenda + `RouteView` | igual, y `RouteView` ya lo lleva dentro |

**Se retira** «Como lista lineal» del móvil en la ruta «lectura»: con el timeline nuevo es un
duplicado de los mismos títulos, uno debajo del otro.

Tres acciones nuevas, todas preferencia personal y clonando `adoptRoute` (RLS solo-dueño, sin gate de
rol): `skipOptional`, `unskipOptional`, `setShowOptionalReadings`.

## Fases

Ordenadas para que **la primera arregle el problema sin ninguna migración**, y para que lo caro se
pueda parar en seco.

| # | Qué | BD |
|---|---|---|
| **0** | **Cerrar la #215**: `globalSetup` de Playwright que restaura la semilla QA a su línea base antes de la suite | ninguna |
| **1** | El motor (`spine`) y el componente en las cuatro ubicaciones. Tándem y ventana dibujados con lo que YA hay | **ninguna** |
| **2** | Metadatos del tándem: `saga_tandems`, RPC de 7 argumentos + su `drop` posterior, controles en el editor | sí |
| **3** | Ventana completa: `motivo` y el mini-track | sí |
| **4** | Opcionales: `saga_optional_skips`, `profiles.show_optional_readings`, las tres acciones y el interruptor | sí |
| **5** | Roles: enum ampliado, cinta en portada, chip y filtro en la cabecera del mapa | sí |
| **6** | Frame D: los estados en el grafo 2D | ninguna |

La fase 0 va primera **a propósito**: sin ella, cada fase siguiente hereda una suite que falla por
motivos ajenos, y la inyección de fallo —que es lo que de verdad valida los tests— deja de ser
fiable. En la fase 4 esa técnica destapó que una de las tres roturas previstas no tumbaba ningún
test (#214); repetirla exige una suite que no mienta por su cuenta.

La fase 1 sola ya devuelve el impacto gráfico en móvil y añade el pie en PC.

## Pruebas

**Unitarias** — el motor entero es puro: las dos columnas, la agrupación del tándem, la regla de
dónde cae una ventana, los tres avisos del track y el `null` sin sesión, y el mapeo de roles.

**E2E** — móvil con itinerario: la columna son los pasos, en su orden; PC: el timeline al pie del
grafo; saltar y deshacer persisten tras recargar; el interruptor vale en otra saga.

**Inyección de fallo**, como en la fase 4: romper el producto por tres sitios, de uno en uno, y
comprobar que cae exactamente el test que debe. Si alguna rotura no tumba su test, el test no vale.

## Riesgos

1. **La #215 muerde si no se cierra primero.** Los e2e de sagas se corrompen entre sí la semilla de
   `[QA Sagas v2] Era Uno`, y la semilla ya estaba desviada al empezar la sesión del 2026-07-28.
   Por eso es la fase 0 y no una nota al pie.
2. **Otra vez el baile de la sobrecarga** en la fase 2: crear con 7 argumentos, desplegar, y solo
   entonces el `drop`. Ya se ha pagado dos veces (fases 2b y 4) y se sabe lo que cuesta.
3. **Recrear el enum de roles** para retirar `paralela` obliga a mirar a su consumidor,
   `save_saga_sequence`, que castea `(e->>'role')::public.saga_item_role`.
4. **El tándem se estrena con un único caso real.** Conviene curar *modo* y *nota* de Trono de
   Cristal y mirarlo antes de dar la fase 2 por buena.
5. **Sin sesión hay que ver el timeline entero**, no solo la mitad: el track sin marcador, las
   opcionales siempre visibles y sin «Saltar». Es fácil construirlo mirando solo la vista con sesión.
