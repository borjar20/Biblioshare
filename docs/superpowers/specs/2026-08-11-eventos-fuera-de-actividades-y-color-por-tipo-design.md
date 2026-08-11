# Eventos fuera de Actividades, y color por tipo de evento

[Canónico · verificado 2026-08-11]

Dos cambios que comparten superficie: sacar los eventos del listado de la
pestaña Actividades, y que el calendario los pinte de colores distintos según
qué clase de evento son —y, en los lanzamientos, de qué medio.

Continúa `2026-08-04`/PR #551 («tipos de evento»), que dio al evento su
`event_type`, su `config` tipada y su ficha propia. **Este spec no cambia el
modelo de datos: lo consume.**

## 1. Problema

Un evento de club se ve hoy en tres sitios: como tarjeta en el grupo "Fechas
señaladas" de la pestaña **Actividades**, como marca en el **Calendario**, y en
su **ficha propia** (`/club/[slug]/evento/[id]`).

Las Actividades son cosas en las que se participa —un buddy read, una tierlist,
un reto—; un evento no es ninguna de esas. Mezclado con ellas ensucia la lista
de lo que sí pide acción del miembro, y repite lo que el calendario cuenta
mejor. Desde que el evento tiene ficha propia con moderación completa (editar,
cancelar, posponer, reprogramar), la tarjeta del listado ya no es ni siquiera el
sitio donde se gestiona.

Aparte, el calendario pinta **todos** los eventos del mismo `type-series`
(`mark-accent.ts:36`). Un club que sigue tres estrenos y una quedada ve cuatro
marcas idénticas: el calendario dice *cuándo*, pero no *de qué*. El dato para
distinguirlas ya existe en la base desde PR #551 —solo que el calendario no lo
lee.

## 2. Lo que ya existe (y este spec NO toca)

Comprobado en `main` a fecha de hoy:

| Cosa | Dónde |
|---|---|
| `EventType = "encuentro" \| "lanzamiento" \| "fecha_destacada"` | `event-types.ts:6` |
| `ClubActivity.eventType: EventType \| null` | `core.ts:44`, poblada en `core.ts:287` y `:455` |
| `LanzamientoConfig.item: { itemType: ItemType; itemId } \| null` | `event-types.ts:17-23` |
| `parseEventConfig(eventType, raw)`, tolerante | `event-types.ts:44` |
| Ficha del evento con `EventModeration` completa | `event/event-moderation.tsx`, montada en `event-detail-view.tsx:322,357` |
| La marca del calendario ya enlaza a la ficha | `calendar-marks.ts:102` |
| `MarkAccent` con `Icon` y `border` por clase (WCAG 1.4.1, #147) | `mark-accent.ts:26-32` |

**El medio de un lanzamiento ya está guardado**: es `config.item.itemType`
(`book`/`movie`/`series`). No hace falta ninguna migración, ni columna, ni campo
de formulario nuevo. Cero SQL en todo este spec.

## 3. Alcance

**Dentro:**

- Retirar los eventos del listado de Actividades (activos y archivados).
- Borrar `EventCardActions`, que queda sin montar.
- Colorear la marca del calendario por `eventType` y, en `lanzamiento`, por el
  `itemType` de su ítem.

**Fuera:**

- El modelo de datos, el formulario de evento y la ficha del evento. Intactos.
- El asistente de "Proponer actividad" y cualquier otro camino de creación.
- Los colores de `inicio`, `hito` y `cierre`.

## 4. Color

### 4.1 El eje cambia

Hoy `MARK_ACCENT` se indexa por `CalendarMarkKind` (`evento | hito | inicio |
cierre`). Con eventos tipados eso ya no basta: dos marcas `evento` del mismo día
pueden ser de colores distintos.

```ts
export type MarkAccentKey =
  | "inicio" | "hito" | "cierre"
  | "encuentro" | "fecha_destacada"
  | "lanzamiento_book" | "lanzamiento_movie" | "lanzamiento_series";

export const MARK_ACCENT: Record<MarkAccentKey, MarkAccent> = { /* … */ };

/** markKind manda: un hito de una actividad evento sigue siendo un hito. */
export function accentKeyFor(mark: CalendarMark): MarkAccentKey;
```

Se conserva la propiedad que el fichero ya tiene: `MARK_ACCENT` es un `Record`
**exhaustivo**, así que una clave nueva rompe la compilación ahí en vez de
quedarse sin color y sin icono en silencio.

`accentKeyFor` mira `markKind` primero, y solo desciende a `eventType` cuando la
marca es un evento. Un checkpoint de una actividad evento llega con `markKind
=== "hito"` y debe seguir pintándose de hito.

Un `lanzamiento` **sin ítem** (`config.item === null`, que `parseEventConfig`
permite) no tiene medio del que sacar color. Su resolución está en §4.3.

### 4.2 Paleta e iconos

| Clave | Token | Icono |
|---|---|---|
| `inicio` | `green` | `PlusIcon` |
| `hito` | `accent` | `TargetIcon` |
| `cierre` | `gold` | `CheckIcon` |
| `encuentro` | `spine` | `UsersIcon` |
| `fecha_destacada` | `event-highlight` **(token nuevo)** | `StarIcon` |
| `lanzamiento_book` | `type-book` | `BookIcon` |
| `lanzamiento_movie` | `type-movie` | `FilmIcon` |
| `lanzamiento_series` | `type-series` | `SeriesIcon` |

El evento genérico **tiene que** dejar `type-series`: ese token pasa a significar
"lanzamiento de serie", y mantenerlo haría que una quedada y un estreno de serie
fueran el mismo púrpura.

`spine` (el beige-nexo de las sagas) es el único token de la paleta que no está
ya comprometido con otra clase de marca ni con un `status-*` de lectura, así que
lo toma `encuentro`. `fecha_destacada` estrena `--event-highlight`, un azul: es
el hueco que queda en la rueda tras terracota, teal, púrpura, verde, oro,
naranja y beige. Se define en los tres bloques de `globals.css` (`:root`,
`.dark` y el `@media (prefers-color-scheme: dark)`) más su `--color-*` en
`@theme`.

Los iconos no son decoración: desde #147 son la señal **no dependiente del
color** que exige WCAG 1.4.1, y viven en el mismo `Record` que el color
precisamente para que no acaben siendo dos mapas que divergen.

### 4.3 El lanzamiento sin ítem

`LanzamientoConfig.item` es nullable y `parseEventConfig` lo deja a `null` ante
cualquier forma que no case. Un lanzamiento sin ítem no tiene medio del que
sacar color.

Cae a **`fecha_destacada`**, y no a una clave propia: son cinco colores ya, y un
sexto para "lanzamiento del que no sabemos el medio" sería una entrada de
leyenda que no significa nada para quien mira. Su chip dirá "Lanzamiento" a
secas (§4.5), así que el texto sigue siendo cierto aunque el color sea el
genérico.

Es un caso de degradación, no de error: nada bloquea guardar un lanzamiento sin
ítem, y el calendario no es el sitio donde reclamarlo.

### 4.4 Lo que la marca tiene que llevar

`CalendarMark` gana dos campos:

```ts
eventType: EventType | null;   // null si markKind !== "evento"
medium: ItemType | null;       // null salvo lanzamiento con ítem
```

`CalendarActivityRow` gana `eventType: EventType | null` y `config: Json | null`.
`getClubCalendarMarks` añade `event_type, config` a su `select` de
`club_activities`, y `buildCalendarMarks` deriva `medium` con el
`parseEventConfig` que ya existe —no con un parser propio.

Ambos van a `null` en las marcas de hito, inicio y cierre.

### 4.5 Dónde se ve

**Leyenda** (`club-calendar.tsx`), tres filas etiquetadas en vez de una tira:

```
MARCAS        ● Empieza  ● Hito  ● Cierre
EVENTOS       ● Encuentro  ● Fecha destacada
LANZAMIENTOS  ● Libro  ● Película  ● Serie
```

Las tres se derivan de las claves de `MARK_ACCENT` particionadas, nunca de listas
escritas a mano: el fichero ya avisa de que dos constantes gemelas acaban
divergiendo y dejarían la leyenda contradiciendo a la rejilla sin que nada
saltara. `ORDEN_MARCA` sigue rigiendo el orden de la primera fila.

**Rejilla** (`month-grid.tsx`), **agenda** (`agenda-list.tsx`) y **tira
"Próximo"** (`club-summary.tsx`): `MARK_ACCENT[accentKeyFor(mark)]` sustituye a
`MARK_ACCENT[mark.markKind]` en los cuatro sitios. Los tres consumen el mismo
`MarkAccent`, así que heredan color, tinte, borde e icono de golpe.

**Etiqueta de texto.** El chip pasa de decir `EVENTO` a decir la clase real:
`Lanzamiento · Película`, `Encuentro`, `Fecha destacada`, o `Lanzamiento` a secas
cuando no hay ítem. El color acompaña, no informa solo (WCAG 1.4.1). Vive en una
función pura `markLabel(mark, t)` porque la necesitan tres sitios —el chip de la
agenda, el `title` de la rejilla y el resumen `sr-only` del día— y repetir el
`if` tres veces es donde diverge.

## 5. Retirada de la pestaña Actividades

### 5.1 Agrupación

`groupActivities` pierde el grupo `events` de su tipo de retorno, y `finished`
pasa a excluir `kind === "evento"`. Este segundo es el que se olvida: `active` ya
los excluía explícitamente, pero un evento **archivado** cae hoy en `finished` y
seguiría a la vista.

Al caer el grupo, la función deja de necesitar `today` —era su único consumidor,
para ordenar futuros antes que pasados. La firma pasa a
`groupActivities(activities)`.

`isPastEvent` **no** se borra: la usa `activity-card.tsx` para atenuar cualquier
actividad activa cuya fecha de inicio ya pasó, no solo eventos.

### 5.2 Listado y código muerto

`ActivityList` pierde el `<Group title={t("groupEvents")}>` entero. Con eso,
`EventCardActions` deja de montarse en ningún sitio: **se borra el fichero**, no
se deja huérfano. Su función la cumple `EventModeration` en la ficha del evento,
con cuatro controles en vez de dos.

La clave i18n `groupEvents` ("Fechas señaladas") se borra también.

### 5.3 Lo que no cambia

El badge de propuestas pendientes de `ClubTabs` y el pip del sidebar cuentan
`status === "proposed"`; un evento nunca lo está. La marca del calendario ya
enlaza a la ficha desde PR #551, así que el calendario es un punto de entrada
completo sin tocar nada más.

## 6. Pruebas

**Unit nuevos**

- `mark-accent.test.ts`: `accentKeyFor` devuelve las ocho claves; en concreto que
  un hito de una actividad `evento` da `"hito"`, y que un lanzamiento sin ítem
  da `"fecha_destacada"`. Y que las tres filas de la leyenda **particionan** las
  claves de `MARK_ACCENT` sin huecos ni repetidos —es el test que evita que una
  clave nueva quede fuera de la leyenda.
- `mark-label.test.ts`: las cuatro formas de etiqueta, con un traductor de
  mentira que devuelve la clave (así el test comprueba qué claves se piden, sin
  depender de una copy que puede cambiar sin ser un bug).

**Unit tocados**

- `group-activities.test.ts`: evento `active` **y** evento `archived` fuera de
  los tres grupos.
- `calendar-marks.test.ts`: `eventType` y `medium` propagados; `null` en
  hito/inicio/cierre; lanzamiento sin ítem deja `medium` a `null`.

**e2e** — los specs de evento que anclan en la sección "Fechas señaladas" de la
pestaña Actividades hay que reapuntarlos al calendario o a la ficha. Se
inventarían al planificar: `grep -rn "Fechas señaladas" e2e/`.

## 7. Riesgos

**`spine` y el token nuevo, en los dos temas.** `spine` se eligió para el lienzo
oscuro del grafo de sagas, pero su muestra de leyenda va sobre `--surface`. Y
`--event-highlight` nace aquí. Ambos hay que mirarlos en claro y en oscuro antes
de cerrar; el umbral que aplica es 3:1 (objeto gráfico), porque desde #147 el
token colorea icono, tinte y borde —nunca el título del chip, que va en
`text-foreground`.

**Cuatro consumidores de `MARK_ACCENT`, no tres.** `club-summary.tsx:118` (la
tira "Próximo" del resumen del club) es fácil de olvidar porque no está en
`calendar/`. Si se queda, no compila —el `Record` cambió de clave— pero conviene
saberlo antes.

**`MAX_CHIPS = 3` en la rejilla.** Un día con cuatro eventos esconde colores sin
decir cuáles. No lo empeora este cambio, pero sí lo hace más visible: antes los
escondidos eran del mismo color que los visibles.

## 8. Decisiones

Van a `docs/requirements/decisiones.md` al cerrar:

1. **El color se indexa por `MarkAccentKey`, no por `CalendarMarkKind`.** La
   clase de marca y la clase de evento son ejes distintos, y el segundo tiene
   ocho valores.
2. **El medio sale de `config.item.itemType`, sin campo nuevo.** El dato ya
   estaba; lo que faltaba era que el calendario lo leyera.
3. **`fecha_destacada` estrena `--event-highlight`; `encuentro` toma `spine`.**
   No quedaba más de un token libre y cinco clases de evento necesitan cinco
   colores.
4. **Un lanzamiento sin ítem cae a `fecha_destacada`.** Un sexto color para "no
   sabemos el medio" sería una entrada de leyenda sin significado.
5. **`EventCardActions` se borra, no se reubica.** La ficha del evento ya tiene
   `EventModeration`, con más controles.

## 9. Documentación al cerrar

- `docs/requirements/backlog.md`: marcar la casilla; y **corregir la entrada de
  «Eventos de club»**, que termina en «grupo "Fechas señaladas" en la lista de
  actividades» y deja de ser cierta.
- `docs/requirements/decisiones.md`: las cinco entradas de §8, al final.
- `data-model.md` **no** se toca: no hay cambio de esquema.
- Lo que quede pendiente o dudoso, como issue en el repo.
