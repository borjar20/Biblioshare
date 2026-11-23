# «Mi registro» como línea de lectura — diseño

[Histórico · congelado 2026-11-20]

**Estado:** aprobado por Borja (brainstorming 2026-11-11; revisado el 2026-11-20: las sesiones se
pintan como una tira del libro más un historial por meses, no como una parada por fila).
**Antecedente:** `2026-11-10-ficha-acciones-design.md`, que llevó el estado y la nota a la tarjeta
del pase y dejó «Mi registro» para el historial.
**Prototipos (no versionados):**
- `.superpowers/brainstorm/2026-11-11/ficha-con-gesto.html`, opción A: la idea de unir sesiones y
  notas en una sola línea.
- `.superpowers/brainstorm/2026-11-20/registro-largo.html`, opción A: la tira del libro y los meses,
  con 3, 16 y 40 sesiones.

**Entrega:** PR propia, después de la de `2026-11-11-ficha-con-gesto-design.md`.

## Problema

Visto en producción el 2026-11-11, en un libro en curso:

- **Todo se repite.** El progreso sale en la tarjeta del pase, en la barra de la pestaña y en «Voy
  por la página 33 de 524». «Registrar sesión» está en tres sitios y «Tu nota», en dos.
- **El panel «Progreso» casi no aporta:** de lo que contiene, solo «Tu edición» no está ya en la
  tarjeta.
- **Cajas dentro de cajas:** la pestaña es una tarjeta que contiene el panel, la tarjeta del
  diario y la caja de «Añadir una nota o cita».
- **Cinco bloques y tres tipos de nota** (nota o cita, Tu cuaderno, Notas en el margen), cada uno
  con su vacío.
- **El diario de un pase en curso está casi vacío:** puntos apagados y «1.ª lectura · En curso».
- El título de sesiones lleva la edición en letra de cartel: «SESIONES · NOCTURNA · NOCTURNA ·
  524 P» (la duplicación es #1624).

Visto el 2026-11-20 en una lectura con 16 sesiones (captura de Borja):

- **La lista es larga y monótona.** Dieciséis filas iguales (punto naranja, «p. A → B · N min»)
  empujan el Diario y las notas fuera de la pantalla, y no se ve el ritmo de la lectura.
- **La fecha no distingue nada:** «hace 3 meses» en casi todas.
- **La primera fila no sigue el formato:** «Pág. 16 · 25 min» frente a «p. 16 → 30 · 30 min».
- **La columna derecha queda vacía** salvo «Añadir a colección».

La primera versión de esta spec ponía una parada por sesión, así que habría heredado el mismo
problema.

## Decisiones

1. **La pestaña cuenta el recorrido.** La tarjeta es para actuar; «Mi registro», para ver por
   dónde has pasado. Se descartaron «cuaderno por lectura» (resumen y gráfico, pero sigue siendo
   un panel de listas) y «solo limpieza».
2. **Las sesiones se ven como una tira del libro.** Un tramo por sesión, del ancho de lo que se
   leyó, con las notas como marcas. Su altura no depende de cuántas sesiones haya. Se descartaron
   una parada por fila (no escala) y el calendario de racha (enseña constancia, no por dónde va el
   libro).
3. **El historial completo va agrupado por mes, plegado.** Bajo la tira solo se ven las tres
   últimas sesiones; el resto, a un toque, por meses.
4. **Fechas absolutas** («9 nov»; con año si no es el actual), nunca «hace N meses».
5. **La tira es solo para libros.** Series y películas reciben la limpieza de duplicados y
   conservan sus listas.
6. **Lecturas anteriores como capítulos cerrados.** La tira muestra la lectura activa; cada
   lectura anterior es un bloque plegado.
7. **Sin esquema ni consultas nuevas.** Se usan las sesiones del pase activo, las notas de la
   obra (`getNotesForItem`) y las notas en el margen (`getItemMarginNotes`) que la ficha ya
   carga. Sin `use cache`: todo depende de quién mira (regla #437).

## Qué se ve (libros)

De arriba abajo:

### 1. Cabecera

Ordinal de la lectura («1.ª lectura»), la edición como chip y «Nuevo pase» (con la regla de hoy:
no se pinta sobre un pendiente). Pulsar el chip abre el selector de edición; sin edición asignada,
el chip dice «Elegir edición». Si la pregunta «¿qué edición estás leyendo?» está pendiente, se
pinta bajo la cabecera.

### 2. Tarjeta de la tira

- **Cifras:** página actual en grande, «de N · P %», y una línea con el número de sesiones, el
  tiempo total y las páginas por sesión.
- **La tira:** una barra de la página 0 a la última del libro.
  - Un tramo por sesión, de ancho proporcional a sus páginas, con 2 px de separación y 4 px más
    donde empieza un mes nuevo.
  - Color: el acento de la obra. Los meses más antiguos van más tenues (opacidad de 0,38 a 1 según
    la antigüedad del mes dentro de la lectura).
  - Lo que queda por leer es pista vacía.
  - Encima, una marca por nota en su página: llena para notas y citas, hueca para notas en el
    margen.
  - Debajo, «pág. 0» y «pág. N», la leyenda de meses y la de marcas.
- **Al tocar un tramo** se marca y se abre debajo su detalle: «Sesión N · fecha · pág. A → B ·
  páginas · duración», las notas que caen en ese tramo y las acciones de la sesión (editar,
  borrar) más «Añadir nota en este tramo» (compositor de notas anclado a la página final del
  tramo). Tocar el mismo tramo, o Escape, lo cierra.
- **Acciones de la lectura:** «Registrar sesión» y «Añadir nota o cita», en la tarjeta.
- **Aviso de cierre automático** («al llegar a la pág. N el pase pasa solo a Completado»): solo
  cuando queda menos del 10 % del libro.

### 3. Últimas sesiones

Las tres más recientes, de la última a la primera. Cada fila: fecha absoluta, «pág. A → B · N
páginas · duración», una pastilla «N notas» si las tiene (al tocarla se selecciona su tramo en la
tira) y una minibarra que dice en qué parte del libro cayó. Menú ⋯ con editar y borrar.

### 4. Historial por meses

Un botón «Ver las N sesiones, por mes» (solo con más de tres) despliega un `<details>` por mes, del
más reciente al más antiguo:

- **Resumen:** nombre del mes, sesiones, páginas, tiempo, notas, y el tramo del libro que cubrió
  con su minibarra.
- **El mes en curso va abierto;** los demás, plegados.
- **Dentro:** las filas de sesión del mes con el formato del punto 3, y bajo cada sesión sus notas
  completas (`NoteCard`, `MarginNoteCard`).

### 5. Notas fuera de tramo

Debajo del historial, solo si existen:

- **«Más adelante»:** notas cuya página queda por delante de la página actual (de una lectura
  anterior), plegado.
- **«Sin página»:** notas sin anclar.

### 6. Lecturas anteriores

Un `<details>` por lectura cerrada que no sea la activa, plegado, con el contenido y la edición que
hoy tiene su tarjeta del Diario.

### 7. «Añadir a colección»

Al final de la pestaña.

### Vacío y casos límite

- **Pase sin sesiones ni notas:** solo la cabecera y la tarjeta de la tira con la pista vacía, una
  frase y sus dos acciones. Desaparecen los tres vacíos actuales.
- **Sin total de páginas** (ni en la edición ni en la obra): la tira usa como escala la página
  actual. No hay pista vacía, porcentaje ni aviso de cierre.
- **Lectura activa cerrada** (terminada o abandonada): las cifras dicen la página final y el
  cierre (fecha, nota, motivo de abandono) va en la cabecera de la tarjeta; no hay «Más adelante».
- **Muchas sesiones:** cada tramo mide al menos 3 px y los tramos encogen para que la tira quepa
  siempre (probado con 40 en el prototipo). En pantallas táctiles, tocar la tira selecciona el
  tramo más cercano al dedo, para no exigir acertar en 3 px.

## Reglas

Viven en una función pura, `buildReadingStrip`, en `src/lib/passes/reading-strip.ts`:

- **Tramo de una sesión:** de la página alcanzada por la sesión anterior (0 para la primera) a la
  suya. Las sesiones se ordenan por `sessionDate` y, a igualdad, por `createdAt`. La primera
  sesión también se escribe «pág. 0 → N».
- **Tramo vacío o hacia atrás** (una sesión que no avanza o corrige la página a menos): no ocupa
  ancho en la tira, sale en las listas con su página y sin recuento, y no recibe notas.
- **Una nota pertenece a la sesión más reciente cuyo tramo la contiene:** `desde < página ≤ hasta` (con un historial que solo avanza es la única; si se volvió atrás y se releyó, la de hoy).
  Una nota en la página exacta donde acabó una sesión es de esa sesión.
- **Notas por delante de la página actual:** grupo «Más adelante», ordenado por página.
- **Notas sin página:** grupo «Sin página».
- **Pase activo cerrado:** las notas con página más allá de la última sesión van a «Después de la
  última sesión», en el lugar de «Más adelante».
- **Notas en el margen:** las encontradas y las propias se colocan por su ancla con la misma regla.
  Un ancla que no es de página se convierte con el criterio de `anchorSortKey`; si no se puede
  situar, va a «Sin página».
- **Dentro de una sesión** las notas van por página y, a igualdad, por fecha de creación
  (`compareNotes`).
- **Mes de una sesión:** el de su `sessionDate`. La antigüedad de cada mes para la opacidad es su
  posición entre los meses de la lectura (el más antiguo 0, el más reciente 1; con un solo mes, 1).

`buildReadingStrip({ sessions, notes, marginFound, marginMine, totalPages, currentPage, closed })`
devuelve:

- `segments`: por sesión, `{ sessionId, from, to, pages, date, minutes, monthKey, recency,
  notes }`.
- `months`: por mes, del más reciente al más antiguo, `{ key, sessions, pages, minutes,
  notesCount, from, to }`.
- `loose`: `{ ahead, unpaged, afterLast }`.
- `scale`: el total usado para los anchos (`totalPages` o, sin él, `currentPage`).

## Qué desaparece

En los tres tipos:

- El panel «Progreso» (`PassDataPanel`): su nota y su página ya están en la tarjeta del pase.
- La barra de progreso de la pestaña (`PassProgress`) y los enlaces extra de «Registrar sesión».
- La tarjeta que envuelve la pestaña y la caja de `NoteForm`.
- La edición dentro de los títulos de sección.

Series y películas conservan `SessionList`, `PassDiary`, `NotesSection` y `MarginSection`. El
selector de edición y la pregunta pendiente pasan, en ellas, a una fila de cabecera con el chip de
edición (las series no tienen ediciones: sin chip). Sus fechas de sesión también pasan a absolutas.

## Cómo se construye

| Pieza | Tipo | Qué hace |
|---|---|---|
| `src/lib/passes/reading-strip.ts` | Función pura | `buildReadingStrip`, con las reglas de arriba. |
| `src/components/detail/reading-line.tsx` | Servidor | Espera `notesPromise` y `marginPromise`, llama a la función y compone la pestaña. Mantiene montados `MarginReveal` y `MarginRetroSeen`. |
| `src/components/detail/reading-line-head.tsx` | Cliente | Cabecera y acciones de la lectura. Usa `useItemStatus` y `usePassActions`, como la tarjeta del pase. Cubre la ventana de `AddingPlaceholder`. |
| `src/components/detail/reading-strip.tsx` | Cliente | La tarjeta de la tira: tramos, marcas, selección, detalle del tramo y la selección desde la pastilla «N notas». |
| `src/components/detail/session-row.tsx` | Cliente | Fila de sesión (fecha absoluta, tramo, minibarra, ⋯ con editar y borrar), extraída de `session-list.tsx`, que pasa a usarla. |
| `src/components/detail/session-months.tsx` | Servidor | Botón «Ver las N sesiones» y los `<details>` por mes con sus filas y notas. |
| `src/components/detail/past-readings.tsx` | Cliente | Los capítulos plegados, con la tarjeta de pase extraída de `pass-diary.tsx`. |
| `src/components/detail/edition-chip.tsx` | Cliente | Chip de edición que abre `EditionPicker`; lo usan la tira y la cabecera de series y películas. |

- `src/app/libro/[id]/page.tsx` monta `ReadingLine` en el hueco `log`, en lugar de
  `LogPanel` + `NotesSection` + `MarginSection`.
- `LogPanel` queda para series y películas, sin `PassDataPanel`, sin `PassProgress` y sin la
  tarjeta envolvente.
- Los títulos de sección siguen la regla de `WorkScope` (`h2` o `data-section-title`).
- **Accesibilidad:**
  - Cada tramo es un `<button>` con `aria-pressed` y una etiqueta con fecha, páginas y duración. La
    tira es un `role="group"` con nombre.
  - Las filas de sesión son el camino completo para lector de pantalla y teclado: la tira no
    tiene información que no esté también en las listas.
- **Movimiento:** la selección de un tramo y el despliegue de los meses solo animan fuera de
  `prefers-reduced-motion: reduce`.

## Pruebas

- **Unitarias de `buildReadingStrip`:**
  - tramos de varias sesiones y de la primera («pág. 0 → N»);
  - nota en el borde de dos sesiones;
  - sesión que no avanza o retrocede;
  - notas por delante de la página actual y sin página;
  - relectura con notas de la lectura anterior;
  - pase sin sesiones;
  - pase activo cerrado con notas más allá de la última sesión;
  - nota en el margen con ancla que no es de página;
  - agrupación por mes, recuentos y antigüedad (un mes y varios);
  - escala sin total de páginas.
- **De componente:**
  - vacío único;
  - selección de un tramo y cierre con Escape;
  - la pastilla «N notas» selecciona su tramo;
  - historial: botón solo con más de tres sesiones, mes en curso abierto;
  - capítulos plegados;
  - chip de edición con y sin edición;
  - fechas absolutas con y sin año.
- **E2E:** adaptar los que localizan sesiones, diario, cuaderno y margen en la ficha de libro. Los
  de series y películas no deben cambiar salvo por el panel «Progreso» retirado y las fechas.
- **Navegador:** libro en curso con 3, 16 y 40 sesiones, terminado, abandonado, pendiente y
  relectura; claro y oscuro; móvil y escritorio.

## Documentación al cerrar

- `decisiones.md`: entrada nueva (la pestaña como tira de lectura en libros; historial por meses;
  fechas absolutas; retirada del panel «Progreso»).
- `backlog.md`, `docs/UI-GLOSARIO.md` (nombres nuevos de cara al usuario: tira, tramo, «Más
  adelante», «Sin página») y `docs/architecture/graph.json` (nodos de la ficha, de notas y de
  margen).

## Fuera de alcance

- La tira para series y para películas.
- Cargar las sesiones de pases cerrados: una lectura anterior no despliega su propia tira.
- Estadísticas de ritmo o previsión de fin más allá de «páginas por sesión».
- Los fallos vistos de paso, que van en issues propias: la etiqueta de edición duplicada (#1624) y
  una obra en «Pendiente» que conserva página y barra de progreso (#1625).

## Ajustes al planificar (2026-11-20)

Al leer el código para el plan (`docs/superpowers/plans/2026-11-20-ficha-linea-de-lectura.md`)
cambian estos puntos. Donde contradigan a lo de arriba, mandan estos:

- **Una nota se ve en un solo sitio.** Las filas de sesión (últimas y meses) llevan solo la
  pastilla «N notas»; el texto está en el detalle del tramo seleccionado. Por defecto se abre la
  última sesión, así que sus notas se ven al entrar. Los grupos sueltos van abiertos, no plegados.
- **«Sin página» pasa a «Otras notas»:** recoge también las notas con página que no caen en ningún
  tramo (página 0, o un hueco por una sesión que retrocedió).
- **Sesiones: solo borrar.** La app no tiene edición de sesiones; el detalle y las filas ofrecen
  borrar (con la confirmación de hoy si la sesión tiene publicación). «Añadir nota en este tramo»
  es el compositor de notas anclado a la página final del tramo, dentro del detalle.
- **Lecturas anteriores:** se queda el diario de pases (`PassDiary`) tal cual, con edición,
  borrado y visionados conjuntos. El cierre de una lectura activa cerrada se ve en su tarjeta del
  diario, no en la cabecera de la tira. No hay componente `past-readings`.
- **Cabecera compartida:** `PassLogHead` (no `reading-line-head`) sirve a los tres tipos.
- **Notas en el margen:** se conserva una fila con el título «Notas en el margen» y «Dejar una
  nota en el margen»; las notas en sí van en la tira.
- **Sesiones cargadas:** `getSessions` acepta `{ limit }`; la ficha de libro pide 500
  (`READING_STRIP_SESSION_CAP`). Si llegan exactamente 500, la tira no supone que la primera
  empieza en 0.
- **`buildReadingStrip`** recibe las notas ya convertidas (`noteToStrip`, `marginToStrip`) y no
  los objetos de nota; `loose` es `{ ahead, afterLast, other }`. Las tarjetas las pinta el servidor
  y llegan a la tira por clave.
- **Compositor sin caja:** `NoteForm` gana la prop `bare`.
- **La nota va a la sesión más reciente que contiene su página** (no a la primera): con un historial
  que vuelve atrás, la nota recién escrita caía en un tramo antiguo y no se veía (lo destaparon los
  e2e de `notas-captura` el 2026-11-23).
