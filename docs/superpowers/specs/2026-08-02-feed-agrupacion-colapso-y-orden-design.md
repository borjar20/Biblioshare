---
[Canónico · verificado 2026-08-02]
---

# Feed: ventana de agrupación, colapso de Colección y orden real de las reseñas

Tres cambios sobre la presentación del feed. Comparten fichero y, sobre todo,
comparten la clave de orden: por eso van en una sola spec y en un orden de
implementación fijo (§Orden de implementación).

## Problema

**1. La agrupación de altas no tiene ventana.** `groupPersonEntries` agrupa las
altas por `actor + día natural exacto`. Dos altas del mismo actor separadas por
unas horas, pero a caballo de la medianoche, salen como dos tarjetas. Las
sesiones sí tienen ventana, pero es de 7 días: demasiado ancha, una tarjeta de
progreso puede abarcar más de una semana.

**2. Las tarjetas de Colección crecen sin límite.** `CollectionCard` pinta todas
sus filas. Cada fila lleva portada, subtítulo, reacciones y botón de alta, así
que una tarjeta de seis obras ocupa varias pantallas. El timeline de progreso ya
resolvió esto con un colapso; la de Colección no lo tiene. Ensanchar la ventana
de agrupación (cambio 1) agrava el problema.

**3. Las reseñas no muestran su antigüedad y se ordenan mal.** Son dos fallos
con causas distintas:

- `ReviewCard` renderiza el `timeAgo` solo cuando recibe `hideActor`, que únicamente
  es `true` en «Reseñas recientes» del perfil. En el feed no se pinta nunca.
- El orden global compara `eventDate` **como cadena**, y las fuentes mezclan
  granularidades: las altas usan `passes.created_at`
  (`"2026-08-01T18:22:06.236816+00:00"`), y las reseñas y los episodios usan
  `finished_on` / `watched_on`, que son columnas `date` (`"2026-08-01"`). La
  cadena corta es prefijo de la larga, así que **siempre ordena por debajo**: una
  reseña de hoy a las 23:00 cae bajo un alta de hoy a las 00:01. Y como todas las
  reseñas de un mismo día empatan en la misma cadena, el desempate cae en
  `id desc`, que es un uuid: entre ellas el orden es **aleatorio**.

## Comportamiento acordado

### Ventana de agrupación

- Una constante compartida, `GROUP_WINDOW_DAYS = 2`, sustituye a
  `PROGRESS_WINDOW_DAYS = 7`.
- **Altas (`added`), por span:** un grupo abarca como máximo **2 días
  naturales**. Se compara cada evento contra el **más nuevo del grupo**.
- **Sesiones (`progressed`), por hueco:** se mantiene la semántica actual y solo
  baja el umbral. Parte cuando entre dos sesiones **consecutivas** pasan **más de
  2 días**; un hueco de exactamente 2 días sigue agrupando.
- La asimetría es deliberada: en altas se acota la extensión del grupo, en
  sesiones se detecta el parón de una lectura. Un libro leído a diario durante
  tres semanas sigue siendo **una** tarjeta de progreso.
- Los grupos se forman desde el evento más nuevo, porque el feed va de más nuevo
  a más viejo. Con altas el lunes, martes y miércoles el resultado es
  `[miércoles + martes]` y `[lunes]`, no `[lunes + martes]` y `[miércoles]`.

### Colapso de `CollectionCard`

- Se ven **2 obras** con la tarjeta colapsada.
- Colapsa solo a partir de **4 obras**: con 3 se ofrecería «ver 1 más», que no
  ahorra nada. Es el mismo umbral que ya usa el timeline (`> visibles + 1`).
- El estado es local del componente; por defecto colapsado.
- El colapso es **presentación y nada más**:
  - el encabezado sigue diciendo «añadió N títulos» con el total;
  - el pie «Guardar los N» sigue contando y enviando **todas** las obras
    pendientes del grupo, no solo las visibles;
  - el botón «Añadir» por fila se pinta solo en las filas visibles, que es
    consecuencia de no renderizarlas, no una regla aparte.

### Tiempo y orden de las reseñas

- `ReviewCard` pinta el «hace x» **siempre**, no solo con `hideActor`.
- La clave de orden del feed pasa a ser **`(día, created_at, id)`**, descendente:
  1. **día**: los primeros 10 caracteres de `eventDate`. Normaliza las dos
     granularidades y elimina el hundimiento de las fechas sin hora.
  2. **`created_at`**: siempre un timestamp real. Dentro de un día, todo se
     ordena por su hora de registro, y reseñas y altas se intercalan.
  3. **id**: desempate final, para que el orden sea total y la paginación
     determinista.
- El feed **conserva su significado**: sigue siendo «lo que ha pasado». Un libro
  terminado en junio y registrado hoy se queda en junio, no salta al principio.
- El «hace x» de cada tarjeta se calcula sobre su `eventDate` semántico, con una
  salvedad obligada que se describe justo debajo.

### Base del «hace x» para las fechas sin hora

Hacer visible el «hace x» de las reseñas destapa un defecto que hoy está oculto:
`finished_on` y `watched_on` son columnas `date`, y `new Date("2026-08-02")` se
interpreta como **medianoche UTC**, no local. En Madrid (UTC+2) una reseña de hoy
diría «hace 8 horas» a las 10 de la mañana, y el desfase crece durante el día.
Publicar el dato tal cual sería mostrar un número que sabemos falso.

Se resuelve con el criterio que el proyecto ya aplica a las sesiones,
`sessionRelativeBasis`: **si el evento es de hoy se usa `created_at`, que es
preciso; si está backdateado se queda en el día**, porque de una reseña de
anteayer no se conoce la hora y fingir una sería peor. El `created_at` ya se
selecciona para el orden, así que no cuesta ninguna consulta extra.

Esto **no** altera la clave de orden: el componente día es el mismo en ambos
casos. Y cubre solo la mitad de hoy del defecto general de las fechas sin hora;
la otra mitad —que un evento backdateado siga arrancando en medianoche UTC— se
rastrea como issue aparte junto con el resto de ese problema.

## Enfoque elegido

### Orden y cursor (se implementa primero)

Cada evento gana un `sortDate` obligatorio con su `created_at`. Hoy el campo ya
existe en `FeedEvent`, pero es opcional y solo lo rellenan las sesiones; pasa a
ser el segundo componente de la clave de orden para las cuatro fuentes.

Las queries de reseñas (`feed.ts:288`) y de episodios (`feed.ts:304`) no piden
`created_at` hoy: hay que añadirlo al `select`. Las tres tablas implicadas
(`passes`, `progress_sessions`, `episode_watches`) ya tienen la columna, así que
no hace falta esquema ni migración.

El cursor keyset pasa de `${eventDate}~${id}` a `${día}~${created_at}~${id}`, e
`isAfterCursor` refleja exactamente la nueva clave. **Los tres van juntos**: la
comparación del cursor tiene que ser el mismo orden total que el `sort`, o al
paginar se pierden o se repiten filas. Las cotas `lte` de cada fuente se siguen
derivando del componente **día** del cursor, que es lo que las columnas `date`
pueden filtrar; el descarte fino lo hace `isAfterCursor` en cliente, igual que
hoy.

El separador del cursor sigue siendo `~`, que no aparece ni en fechas ISO ni en
los ids de evento. Un cursor con dos separadores es del formato nuevo; con uno,
del formato anterior; con ninguno, del legado. El parseo degrada sin romper.

### Agrupación

`groupKey` deja de incluir el día para las altas: pasa de
`added:${actorId}:${día}` a `added:${actorId}`. El corte por días se traslada a
la fase de troceado, que ya existe para las sesiones. Ahí conviven las dos
reglas:

- span (altas): abre grupo cuando `día(grupo[0]) − día(evento) > 1`;
- hueco (sesiones): abre grupo cuando `día(anterior) − día(evento) > 2`.

### Colapso

Se reutiliza el helper del timeline. Como pasa a servir a dos tarjetas, el
módulo `progress-collapse.ts` se renombra a `feed-collapse.ts` y sus exports
`splitProgressSteps` / `PROGRESS_VISIBLE` a `splitCollapsedItems` /
`COLLAPSE_VISIBLE`. Es un rename mecánico: mismo contrato, mismo umbral, y su
test ya existente lo cubre.

El copy del timeline («ver N sesiones anteriores») no sirve para obras. Se añade
`feed.grouped.showMore` a `messages/es.json`, y se reutiliza el «ver menos» que
ya existe.

## Orden de implementación

1. **Orden y cursor.** Da a los demás cambios un `sortDate` fiable en las cuatro
   fuentes.
2. **Ventana de agrupación.** `groupPersonEntries` ordena por `eventDate` y
   `sortDate`; hacerlo después evita retocar la agrupación dos veces.
3. **Colapso.** Presentación pura, independiente de los dos anteriores.

## Alternativas descartadas

**Orden por `created_at` global.** Clave única y cursor más simple, pero cambia
el significado del feed: pasa a ser «lo que se ha registrado». Lo backdateado
sube al principio con un «hace 48 días» en la esquina, que es incoherente con su
posición.

**`created_at` solo como desempate, manteniendo `eventDate` como clave.** Es el
cambio más pequeño y el menos arriesgado para el cursor, pero solo arregla el
orden aleatorio entre reseñas del mismo día; deja intacto el hundimiento bajo las
altas, que es la mitad visible del problema.

**Agrupar las altas por hueco, como las sesiones.** Sería la regla más
consistente con el código actual, pero una racha de altas diarias produciría una
sola tarjeta que abarca semanas — justo lo contrario de «ventana máxima de 2
días».

**Partir las sesiones por span.** Simétrico con las altas, pero trocearía la
lectura de un libro largo en una decena de tarjetas de progreso.

**Importar `splitProgressSteps` sin renombrar.** Evita tocar el timeline, pero
deja dos nombres que mienten (`PROGRESS_VISIBLE` en una tarjeta de Colección) en
código que ya se está editando.

## Datos y fronteras

- Sin cambios de esquema, RLS ni migraciones. `created_at` ya existe en las tres
  tablas.
- El único fichero de i18n que se toca es `messages/es.json`, y solo para añadir
  `feed.grouped.showMore`.
- `FeedEvent.sortDate` pasa de opcional a obligatorio. Es un tipo interno del
  módulo del feed; sus consumidores (`group-feed-entries`, las tarjetas) no lo
  leen salvo para ordenar.
- La agrupación sigue ocurriendo **dentro de una página**: un grupo puede quedar
  partido en el límite de paginación. Es el comportamiento actual y no cambia.
- El día se sigue derivando de `eventDate.slice(0, 10)`, que es el **día UTC**.
  Un alta a la 01:00 de Madrid cuenta como del día anterior. Es un defecto
  preexistente, queda fuera de esta spec y se rastrea como issue aparte.

## Pruebas

**Orden y cursor** (unitario sobre `feed.ts`, con cliente Supabase de prueba):

- Una reseña y un alta del mismo día se ordenan por `created_at`, no por
  granularidad: la reseña de las 23:00 va **por encima** del alta de las 00:01.
- Dos reseñas backdateadas al mismo día pasado quedan en orden de `created_at`,
  de forma determinista y repetible.
- Paginación con fechas mezcladas: recorrer el feed entero página a página
  devuelve **cada fila exactamente una vez**, sin pérdidas ni repeticiones. Es la
  prueba que protege el acoplamiento clave/cursor.
- Un cursor del formato anterior no rompe la paginación.
- Una reseña con `finished_on` de hoy muestra un «hace x» derivado de su
  `created_at`, no de la medianoche UTC; una backdateada se queda en el día.

**Agrupación** (unitario sobre `group-feed-entries.ts`):

- Altas del mismo día → un grupo (caso ya cubierto, debe seguir verde).
- Altas de días adyacentes → un grupo. **Sustituye** al test actual «no agrupa
  altas de días distintos», que codifica el comportamiento viejo.
- Altas con 2 días de diferencia → dos grupos, y el par pegado es el de los dos
  días más nuevos.
- Sesiones con hueco de exactamente 2 días → un grupo; con 3 → dos. **Sustituyen**
  a los tres casos de borde de 7 días.

**Colapso** (unitario sobre `feed-collapse.ts`, adaptando el test existente):

- 3 obras → no colapsa.
- 4 obras → colapsa: 2 visibles, 2 escondidas.
- Expandido devuelve todas y sigue marcando `collapsible`, para poder pintar el
  «ver menos».

**End to end**: extender `e2e/feed-tarjetas-por-tipo.spec.ts` para que la tarjeta
de Colección con 4 obras muestre 2 filas y el botón de expandir, y que «Guardar
los N» siga contando el total y no las visibles.

## Riesgos y comprobaciones

- **El riesgo real está en el cursor.** La clave de orden, `isAfterCursor` y las
  cotas `lte` de las cuatro fuentes son un único invariante repartido en tres
  sitios. Si se cambia uno solo, la paginación falla de una forma que no rompe
  ningún tipo y que un test de una sola página no detecta. De ahí el test de
  recorrido completo.
- La paginación es compartida por Inicio, Actividad de perfil y ambos «Cargar
  más». Ejecutar `gitnexus impact getFeed --direction upstream` antes de editar.
- Ensanchar la ventana de altas produce grupos mayores, así que el cambio 1
  aumenta la frecuencia con que se dispara el colapso del cambio 2. Es el efecto
  buscado, pero conviene mirarlo junto en la verificación de UI.
- Cambiar el orden dentro de un día altera lo que el usuario ve en Inicio aunque
  no haya datos nuevos. No es una regresión, pero sí un cambio visible que hay
  que confirmar en navegador.
