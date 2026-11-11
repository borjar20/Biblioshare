# «Mi registro» como línea de lectura — diseño

[Histórico · congelado 2026-11-11]

**Estado:** aprobado por Borja (brainstorming 2026-11-11).
**Antecedente:** `2026-11-10-ficha-acciones-design.md`, que llevó el estado y la nota a la tarjeta
del pase y dejó «Mi registro» para el historial.
**Prototipo:** `.superpowers/brainstorm/2026-11-11/ficha-con-gesto.html`, opción A (no
versionado).
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
  524 P».

## Decisiones

1. **La pestaña cuenta el recorrido.** La tarjeta es para actuar; «Mi registro», para ver por
   dónde has pasado. Se descartaron «cuaderno por lectura» (resumen y gráfico, pero sigue siendo
   un panel de listas) y «solo limpieza».
2. **La línea es solo para libros.** Series y películas reciben la limpieza de duplicados y
   conservan sus listas.
3. **Lecturas anteriores como capítulos cerrados.** La línea muestra la lectura activa; cada
   lectura anterior es un bloque plegado.
4. **Sin esquema ni consultas nuevas.** Se usan las sesiones del pase activo, las notas de la
   obra (`getNotesForItem`) y las notas en el margen (`getItemMarginNotes`) que la ficha ya
   carga. Sin `use cache`: todo depende de quién mira (regla #437).

## Qué se ve (libros)

De arriba abajo:

1. **Cabecera:** ordinal de la lectura («1.ª lectura»), la edición como chip y «Nuevo pase» (con
   la regla de hoy: no se pinta sobre un pendiente). Pulsar el chip abre el selector de edición.
   Sin edición asignada, el chip dice «Elegir edición».
2. **Punto de cabeza**, según el estado del pase activo:
   - *Pendiente o en curso:* «Vas por la página N · P %» (solo con total de páginas conocido;
     sin él, solo la página), con «Registrar sesión» y «Añadir nota o cita». Si la pregunta «¿qué
     edición estás leyendo?» está pendiente, se pinta aquí.
   - *Terminado o abandonado:* el cierre de esa lectura (fecha, nota, reseña, motivo de abandono,
     visionado conjunto), con la edición de la entrada que hoy da el Diario.
3. **Paradas**, de la sesión más reciente a la más antigua. Cada una: fecha, tramo de páginas
   («pág. 107 → 144 · 37 páginas») y duración si la hay, con sus acciones de editar y borrar.
   Bajo cada sesión, las notas cuya página cae en su tramo.
4. **Inicio de la lectura:** última parada, con la fecha de la primera sesión. Sin sesiones no se
   pinta.
5. **«Sin página»:** notas sin anclar, al final de la línea.
6. **Lecturas anteriores:** un `<details>` por lectura cerrada que no sea la activa, plegado, con
   el contenido y la edición que hoy tiene su tarjeta del Diario.
7. **«Añadir a colección»**, al final de la pestaña.

**Vacío único.** Un pase sin sesiones ni notas muestra solo la cabecera y el punto de cabeza con
una frase y sus dos acciones. Desaparecen los tres vacíos actuales.

**Aviso de cierre automático.** «Al registrar una sesión que llegue a la pág. N, el pase pasa solo
a Completado» solo se muestra cuando queda menos del 10 % del libro.

## Reglas de la línea

Viven en una función pura, `buildReadingLine`, en `src/lib/passes/reading-line.ts`:

- **Tramo de una sesión:** de la página alcanzada por la sesión anterior (0 para la primera) a la
  suya. Las sesiones se ordenan por `sessionDate` y, a igualdad, por `createdAt`.
- **Tramo vacío o hacia atrás** (una sesión que no avanza o corrige la página a menos): la parada
  se pinta con su página y sin recuento de páginas; no recibe notas.
- **Una nota pertenece a la primera sesión cuyo tramo la contiene:** `desde < página ≤ hasta`.
  Una nota en la página exacta donde acabó una sesión es de esa sesión.
- **Notas por delante de la página actual** (de una lectura anterior): grupo «Más adelante»,
  plegado, encima del punto de cabeza, ordenado por página.
- **Notas sin página:** grupo «Sin página».
- **Dentro de una parada**, las notas van por página y, a igualdad, por fecha de creación
  (`compareNotes`).
- **Notas en el margen:** las encontradas y las propias se colocan por su ancla con la misma
  regla. Un ancla que no es de página se convierte con el criterio de `anchorSortKey`; si no se
  puede situar, va a «Sin página».
- **Notas de lecturas anteriores** se sitúan igual que las demás (las notas cuelgan de la obra, no
  del pase) y su tarjeta ya muestra la fecha.
- **Pase activo cerrado:** no hay «Más adelante»; todas las notas con página entran en su tramo o,
  si quedan más allá de la última sesión, en una parada final «Después de la última sesión».

## Qué desaparece

En los tres tipos:

- El panel «Progreso» (`PassDataPanel`): su nota y su página ya están en la tarjeta del pase.
- La barra de progreso de la pestaña (`PassProgress`) y los enlaces extra de «Registrar sesión».
- La tarjeta que envuelve la pestaña y la caja de `NoteForm`.
- La edición dentro de los títulos de sección.

Series y películas conservan `SessionList`, `PassDiary`, `NotesSection` y `MarginSection`. El
selector de edición y la pregunta pendiente pasan, en ellas, a una fila de cabecera con el chip de
edición (las series no tienen ediciones: sin chip).

## Cómo se construye

| Pieza | Tipo | Qué hace |
|---|---|---|
| `src/lib/passes/reading-line.ts` | Función pura | `buildReadingLine({ sessions, notes, marginFound, marginMine, activePass, currentPage })` devuelve las paradas ya ordenadas y agrupadas. |
| `src/components/detail/reading-line.tsx` | Servidor | Espera `notesPromise` y `marginPromise`, llama a la función y pinta la línea con `NoteCard` y `MarginNoteCard`. Mantiene montados `MarginReveal` y `MarginRetroSeen`. |
| `src/components/detail/reading-line-head.tsx` | Cliente | Cabecera y punto de cabeza. Usa `useItemStatus` y `usePassActions`, como la tarjeta: estado optimista, «Registrar sesión», «Nuevo pase». Cubre la ventana de `AddingPlaceholder`. |
| `src/components/detail/session-row.tsx` | Cliente | Fila de sesión con editar y borrar, extraída de `session-list.tsx`, que pasa a usarla. |
| `src/components/detail/past-readings.tsx` | Cliente | Los capítulos plegados, con la tarjeta de pase extraída de `pass-diary.tsx`. |
| `src/components/detail/edition-chip.tsx` | Cliente | Chip de edición que abre `EditionPicker`; lo usan la línea y la cabecera de series y películas. |

- `src/app/libro/[id]/page.tsx` monta `ReadingLine` en el hueco `log`, en lugar de
  `LogPanel` + `NotesSection` + `MarginSection`.
- `LogPanel` queda para series y películas, sin `PassDataPanel`, sin `PassProgress` y sin la
  tarjeta envolvente.
- Los títulos de sección siguen la regla de `WorkScope` (`h2` o `data-section-title`).
- La línea se dibuja con CSS (un borde continuo y un marcador por parada), con el tramo recorrido
  en el acento de la obra. El marcador del punto de cabeza late solo fuera de
  `prefers-reduced-motion: reduce`.

## Pruebas

- **Unitarias de `buildReadingLine`:**
  - tramos de varias sesiones y de la primera;
  - nota en el borde de dos sesiones;
  - sesión que no avanza o retrocede;
  - notas por delante de la página actual y sin página;
  - relectura con notas de la lectura anterior;
  - pase sin sesiones;
  - pase activo cerrado con notas más allá de la última sesión;
  - nota en el margen con ancla que no es de página.
- **De componente:** vacío único; capítulos plegados; el punto de cabeza en cada estado; el chip
  de edición con y sin edición.
- **E2E:** adaptar los que localizan sesiones, diario, cuaderno y margen en la ficha de libro. Los
  de series y películas no deben cambiar salvo por el panel «Progreso» retirado.
- **Navegador:** libro en curso, terminado, abandonado, pendiente y relectura; claro y oscuro;
  móvil y escritorio.

## Documentación al cerrar

- `decisiones.md`: entrada nueva (la pestaña como línea de lectura en libros; retirada del panel
  «Progreso»).
- `backlog.md`, `docs/UI-GLOSARIO.md` (nombres nuevos de cara al usuario) y
  `docs/architecture/graph.json` (nodos de la ficha, de notas y de margen).

## Fuera de alcance

- La línea para series y para películas.
- Cargar las sesiones de pases cerrados: una lectura anterior no despliega su propia línea.
- Estadísticas de ritmo o previsión de fin.
- Los fallos vistos de paso, que van en issues propias: la etiqueta de edición duplicada
  («Nocturna · Nocturna») y una obra en «Pendiente» que conserva página y barra de progreso.
