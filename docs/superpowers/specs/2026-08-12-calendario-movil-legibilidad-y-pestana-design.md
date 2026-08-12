# Calendario de club en móvil: legibilidad, agenda en columnas y pestaña propia

[Canónico · verificado 2026-08-12]

Cinco cambios sobre el calendario de club, todos de móvil salvo el último, que
también toca la navegación.

Continúa `2026-08-11-eventos-fuera-de-actividades-y-color-por-tipo-design.md`,
que dio a cada evento su color y su icono por clase. Ese spec dejó el escritorio
resuelto; este arregla lo que en móvil se quedó a medias.

## 1. Problema

Tres cosas, visibles en una captura de un mes con seis eventos:

**La rejilla no dice qué es cada cosa.** En móvil la celda pinta puntos de 6 px
(`month-grid.tsx`, rama `lg:hidden`), mientras el escritorio pinta chips con
icono y texto. El color solo, a 6 px, no distingue un encuentro de un
lanzamiento de libro para quien no afina el tono — y para quien no lo distingue
en absoluto, no distingue nada.

**La leyenda contradice a la rejilla, y encima ocupa media pantalla.** Las tres
filas de la leyenda explican **iconos** (⊞ empieza, ★ fecha destacada, ▶
película…) que la rejilla móvil **no pinta**. Y ocupan ~120 px antes de que
empiece la rejilla.

**La agenda obliga a un scroll infinito.** Una tarjeta por marca, a ancho
completo, con su bloque de fecha repetido en cada una. Un mes con veinte eventos
son veinte tarjetas y veinte veces la misma fecha.

Aparte, y de navegación: **en móvil no se puede llegar al calendario por las
pestañas.** Son Feed · Actividades · Gestión; el calendario solo se alcanza por
el enlace «Ver calendario ›» de la tira «Próximo» del resumen. En PC el raíl
lateral sí lo tiene como par de Feed y Actividades desde que existe.

## 2. Alcance

**Dentro:**

- Iconos en vez de puntos en la celda del mes (móvil).
- Hoja inferior al tocar un día (móvil).
- Leyenda plegable (móvil).
- Agenda agrupada por día, en dos columnas (tres desde tablet).
- Pestaña Calendario en la barra de pestañas (móvil).

**Fuera:**

- El escritorio: los chips, la leyenda y la agenda de `lg` arriba no se tocan.
- El modelo de datos, el color y los tokens: los fijó el spec del 2026-08-11.
- `Miembros`, que tiene el mismo hueco de navegación que el calendario. Queda
  como issue, no se resuelve aquí.

## 3. La celda del mes: iconos en vez de puntos

El punto de 6 px (`bar`, un fondo de color) pasa a ser el **icono de la clase**
(`Icon` + `text`, un glifo de color), el mismo que ya pintan la leyenda y el chip
de escritorio.

```tsx
<accent.Icon className={`h-2.5 w-2.5 shrink-0 ${accent.text}`} aria-hidden />
```

No hay pieza nueva: `MARK_ACCENT[accentKeyFor(mark)]` ya trae `Icon` y `text`, y
el contraste de `text` ya lo cubre el test de `mark-accent.test.ts` a 4.5:1 —
umbral **más estricto** que el 3:1 que le correspondería a un glifo de 10 px, así
que el cambio entra con margen.

Esto cierra el desajuste: la leyenda pasa a explicar exactamente lo que la
rejilla pinta.

Lo que **no** cambia: el tope de tres marcas por celda con su `+N`, y la campana
única del día cuando hay algo seguido. La campana sigue siendo del DÍA y no de
cada marca — con glifos de 10 px pegados, una campana por marca vuelve la celda
ilegible, que es el problema que veníamos a resolver.

## 4. La hoja del día

Tocar un día abre una hoja inferior con **todas** sus marcas.

`DaySheet`, en `src/components/clubs/calendar/day-sheet.tsx`, siguiendo el patrón
que el repo ya usa en `list-challenge/item-connect-sheet.tsx`: `<dialog>` nativo
gobernado por `showModal()`/`close()` desde un efecto, con props `open` y
`onClose`. No se inventa un mecanismo de modal nuevo.

La celda pasa de `<div>` a `<button>` **solo cuando el día tiene marcas** — un
día vacío no debe anunciarse como pulsable. Su nombre accesible es el resumen que
la celda ya pinta en `sr-only`.

Contenido: la fecha larga como título, y una fila por marca con el icono de su
clase, la etiqueta de `markLabel(mark, t)` y el título. Cada fila enlaza a
`mark.href` cuando lo hay (los eventos tienen ficha; los hitos de una actividad
evento, no).

Solo móvil (`lg:hidden`): en escritorio el chip ya lleva el texto y montar la
hoja sería una segunda superficie que mantener sincronizada.

**Efecto secundario deliberado:** el `+N` deja de ser un callejón sin salida. Hoy
un día con cinco marcas enseña tres y esconde dos sin decir cuáles (issue #583);
con la hoja, tocar el día las enseña todas.

## 5. La leyenda plegable

`<details>`/`<summary>` nativos: cero JavaScript, semántica de disclosure y
teclado de serie, y el estado lo lleva el navegador.

- Móvil: plegada por defecto, con el `<summary>` visible («Leyenda»).
- `lg` arriba: abierta y sin disclosure, exactamente como hoy.

**No persiste entre visitas, a propósito.** El componente no se remonta al
cambiar de mes —el mes viaja por `pushState` y lo lee `useSearchParams`— así que
quien despliega la leyenda la conserva abierta mientras navega de agosto a
septiembre a octubre, que es el caso real. Persistirla pediría `localStorage` y
un efecto de hidratación para un caso que no aparece: nadie cierra la app para
volver a mirar la misma leyenda.

## 6. La agenda, agrupada por día

Función pura nueva en `calendar-marks.ts`, junto a las que ya viven ahí:

```ts
export type DayGroup = { date: string; marks: CalendarMark[] };
export function groupMarksByDay(marks: CalendarMark[]): DayGroup[];
```

Depende de que `marks` llegue ya ordenada por fecha ascendente —lo hace
`buildCalendarMarks`, y está testeado— así que **no reordena**: agrupa
consecutivos. Un día sin marcas no produce grupo.

`AgendaList` pinta una cabecera por día (`Mar 12`) y bajo ella una rejilla
`grid-cols-2 md:grid-cols-3`. La tarjeta **pierde su bloque de fecha**, que ahora
vive en la cabecera; eso es justo lo que la hace caber en los ~185 px de una
media columna a 390 px.

El filtro «Todo / Sigues» se aplica **antes** de agrupar. Si se aplicara después,
un día cuyas marcas se filtran todas dejaría una cabecera huérfana sobre una
rejilla vacía.

El estado vacío del mes no cambia.

## 7. La pestaña Calendario

`ClubTab` gana `"calendario"` y el orden pasa a **Feed · Actividades ·
Calendario · Gestión**, el mismo del raíl de PC.

**El obstáculo que hay que resolver:** `ClubTabs` construye todos sus enlaces
como `` `${basePath}?tab=${tab}` ``, pero el calendario **es una ruta**
(`/club/[slug]/calendario`), no un parámetro de la página del club. Sin tocar
eso, la pestaña llevaría a `?tab=calendario`, que la página del club no sabe
pintar y resolvería al feed.

Cada pestaña pasa a tener su href: las tres de siempre conservan `?tab=`, y
`calendario` apunta a `` `${basePath}/calendario` ``. Es la diferencia entre una
pestaña que es un estado de la misma página y una que es otra página — el
componente tenía asumido que todas eran lo primero.

La página del calendario monta `ClubTabs` con `active="calendario"` en su
cabecera móvil. **Su comentario actual dice explícitamente lo contrario** («NO se
añade ClubTabs aquí: el calendario es una decisión de diseño para que NO sea una
pestaña más») y se corrige: esa decisión se revierte, y el comentario no puede
sobrevivir contradiciendo al código que tiene debajo.

Cambio **solo móvil**: en PC las pestañas no se pintan (el raíl las sustituye) y
ya tenía Calendario.

La clave i18n `club.tabs.calendario` **ya existe** — la usa el raíl
(`club-shell.tsx`). No hay copy nueva que añadir.

## 8. Pruebas

**Unit nuevos**

- `groupMarksByDay`: agrupa consecutivos del mismo día; conserva el orden de
  entrada dentro del grupo; una lista vacía da `[]`; no inventa días sin marcas.

**e2e**

- Tocar un día con marcas abre la hoja y lista **todas** las de ese día,
  incluidas las que el `+N` esconde en la celda.
- La pestaña Calendario navega a `/club/[slug]/calendario` y queda marcada como
  activa (no a `?tab=calendario`).
- La agenda agrupa: un día con dos marcas pinta **una** cabecera.

## 9. Riesgos

**La celda se queda sin sitio.** Tres glifos de 10 px más la campana más el `+N`
en una celda de móvil es más apretado que tres puntos de 6 px. Hay que mirarlo a
390 px con un día cargado antes de cerrar; si no cabe, la salida es bajar el tope
de la celda a dos y fiar el resto a la hoja —que para eso está—, no encoger el
glifo por debajo de 10 px.

**Dos columnas a 390 px truncan títulos.** «El nombre del viento» en ~120 px de
texto se corta. Es el precio aceptado de ver más de un mes de un vistazo, y la
hoja del día y la ficha dan el título entero. Lo que no debe pasar es que el
chip de clase se trunque: primero se corta el título.

**La pestaña nueva estrecha las demás.** Cuatro pestañas a 390 px con
«Actividades» y «Calendario» en serif de 15.5 px van justas. Si no caben, la
salida es reducir el `gap`, no abreviar las etiquetas.

## 10. Decisiones

Van a `docs/requirements/decisiones.md` al cerrar:

1. **La celda de móvil pinta el icono de la clase, no un punto de color.** El
   punto obligaba a distinguir por tono a 6 px y contradecía a una leyenda que
   habla de iconos.
2. **La hoja del día usa `<dialog>` nativo**, el patrón que el repo ya tiene, en
   vez de un modal propio.
3. **La leyenda usa `<details>` nativo y no persiste entre visitas.** El estado
   sobrevive a la navegación de meses, que es el caso real.
4. **La agenda agrupa por día en vez de repetir la fecha por tarjeta.** Es lo que
   de verdad acorta el scroll; las columnas solas no bastaban.
5. **Se REVIERTE la decisión de 2026-07-22 de que el calendario no fuera una
   pestaña.** En móvil dejaba el calendario sin ninguna vía de acceso salvo un
   enlace del resumen del club. `decisiones.md` es append-only: la entrada nueva
   dice que revierte, no se reescribe la vieja.

## 11. Documentación al cerrar

- `docs/requirements/decisiones.md`: las cinco entradas de §10, al final.
- `docs/requirements/backlog.md`: entrada nueva.
- `data-model.md` **no** se toca: no hay cambio de esquema.
- Issue por `Miembros`, que se queda con el mismo hueco de navegación que este
  spec le arregla al calendario.
