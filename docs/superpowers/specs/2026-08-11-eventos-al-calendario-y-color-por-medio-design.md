# Eventos fuera de Actividades, y color por tipo/medio

[Canónico · verificado 2026-08-11]

Diseño de dos cambios en los eventos de club que comparten superficie y por eso
van juntos: sacarlos del listado de Actividades y darles color según qué clase
de fecha son.

Continúa `2026-07-22-club-eventos-design.md`, que creó el kind `evento`. Aquel
spec sigue siendo cierto en el modelo (un evento no se propone, no se participa,
no tiene ficha propia); lo que cambia aquí es dónde se ve y cómo se pinta.

## 1. Problema

Un evento de club vive hoy en dos sitios a la vez: como tarjeta en el grupo
"Fechas señaladas" de la pestaña **Actividades**, y como marca en el
**Calendario**. Las Actividades son cosas en las que se participa —un buddy
read, una tierlist, un reto—; un evento no es ninguna de esas, solo es una
fecha. Mezclado con ellas, ensucia la lista de lo que sí pide acción del
miembro, y duplica lo que el calendario ya cuenta mejor.

Aparte, todos los eventos se pintan del mismo color en el calendario. Un club
que sigue tres estrenos y una quedada ve cuatro puntos idénticos: el calendario
dice *cuándo*, pero no *de qué*.

## 2. Alcance

**Dentro:**

- Retirar los eventos del listado de la pestaña Actividades (activos y
  archivados).
- Mover editar/archivar un evento al calendario.
- Dar a cada evento un tipo (`estreno` / `quedada` / `otro`) y, si es estreno,
  un medio (`book` / `movie` / `series`), y colorear el calendario con eso.

**Fuera:**

- El asistente de "Proponer actividad" **sigue ofreciendo "Evento"**. No se
  retira ese camino de creación; solo se corrige a dónde te deja.
- Ningún cambio en los otros cuatro kinds, ni en hitos, ni en el color de
  inicio/hito/cierre.
- Nada de plataforma, hora del día o recurrencia en un evento. Si algún día
  hacen falta, se decide con casos reales delante.

## 3. Modelo de datos

Los dos campos nuevos viven en `club_activities.config`, el JSONB opaco de SD-8
que cada kind interpreta en la capa de app. Es exactamente el caso para el que
existe —`criteria_challenge` ya guarda ahí su criterio— y abrir dos columnas
para un solo kind dejaría `null` en las filas de los otros cuatro.

El contra conocido: un `config` mal formado no lo para Postgres. Lo acota que
crear y editar un evento pasan **solo** por RPC (`club_activities` no tiene
política UPDATE, a propósito, SD-8), así que no hay puerta de atrás desde el
cliente; y que el parseo de lectura es tolerante (§3.2).

### 3.1 Forma

```ts
// src/lib/clubs/activities/event-config.ts (nuevo)
import type { ItemType } from "@/lib/catalog/types";

export type ClubEventType = "estreno" | "quedada" | "otro";

export type ClubEventConfig = {
  eventType: ClubEventType;
  /** Presente si y solo si eventType === "estreno". Es el ItemType del catálogo. */
  medium?: ItemType;
};
```

`medium` reutiliza `ItemType` (`book | movie | series`) en vez de declarar su
propio trío. Es el mismo eje que ya colorea el catálogo, y así el mapa de color
no puede divergir de él.

### 3.2 Lectura tolerante

```ts
export function parseEventConfig(config: Json | null): ClubEventConfig
```

`config` nulo, sin `eventType`, con un `eventType` desconocido o con `medium`
inválido cae a `{ eventType: "otro" }`. Un evento anterior al backfill, o uno
escrito por una versión futura de la app, no puede reventar el calendario
entero: degrada a gris.

Esto NO sustituye al backfill (§3.4). El backfill hace que el dato sea cierto en
la base; el parseo tolerante hace que la pantalla aguante cuando no lo es.

### 3.3 Escritura validada

```ts
export function validateEventConfig(input: {
  eventType: string;
  medium?: string | null;
}): ClubEventConfig
```

Lanza claves snake_case, la convención que #133 dejó cerrada para esta capa:

| Clave | Cuándo |
|---|---|
| `event_type_invalid` | `eventType` fuera de los tres valores |
| `medium_required` | `eventType === "estreno"` sin `medium` |
| `medium_invalid` | `medium` fuera de `book`/`movie`/`series` |

Se valida en **dos** sitios, como ya hacen título y fecha: en cliente
(`validate-event-input.ts`, antes del roundtrip) y en la RPC (autoridad real).
Un `medium` con `eventType !== "estreno"` no es error: se descarta en silencio,
porque es lo que pasa al cambiar el select de tipo con un medio ya elegido.

### 3.4 Migración

Una migración, en dev (`supabase-dev`) antes que en prod.

**RPCs.** `create_club_event` y `update_club_event` ganan dos parámetros:

```sql
p_event_type text default 'otro',
p_medium     text default null
```

Van **al final de la firma**, y no por gusto: Postgres exige que todo parámetro
posterior a uno con default tenga default, y la firma actual ya termina en
`p_description default null, p_starts_on default null` desde `20260810`.
Reordenarlos cambiaría la firma y dejaría dos sobrecargas conviviendo — el mismo
razonamiento que dejó escrito `20260810_club_event_validacion.sql`.

Ambas validan `event_type_invalid` / `medium_required` / `medium_invalid` antes
de escribir, y guardan:

```sql
config = jsonb_build_object('eventType', p_event_type)
      || case when p_event_type = 'estreno'
              then jsonb_build_object('medium', p_medium)
              else '{}'::jsonb end
```

`update_club_event` **reemplaza** el objeto entero, no lo mezcla con el previo:
si mezclara, pasar un estreno a quedada dejaría el `medium` viejo colgando.

**Backfill.**

```sql
update club_activities
   set config = coalesce(config, '{}'::jsonb) || '{"eventType":"otro"}'::jsonb
 where kind = 'evento'
   and (config is null or config->>'eventType' is null);
```

Los eventos que ya existen quedan como `otro` y pintan el color genérico —
exactamente lo que se ve hoy.

## 4. Color

### 4.1 El eje cambia

Hoy `mark-accent.ts` colorea por `CalendarMarkKind` (`evento | hito | inicio |
cierre`). Con estrenos, la clase de marca ya no basta: dos marcas `evento` del
mismo día pueden ser de colores distintos.

```ts
export type MarkAccentKey =
  | "inicio" | "hito" | "cierre"
  | "evento"                                   // quedada + otro
  | "estreno_book" | "estreno_movie" | "estreno_series";

export const MARK_ACCENT: Record<MarkAccentKey, MarkAccent> = { /* … */ };

/** markKind manda: un hito de una actividad evento sigue siendo un hito. */
export function accentKeyFor(mark: CalendarMark): MarkAccentKey;
```

Se conserva la propiedad que ya tenía el fichero: `MARK_ACCENT` es un `Record`
**exhaustivo**, así que una clave nueva rompe la compilación ahí en vez de
quedarse sin color en silencio.

`accentKeyFor` mira `markKind` primero. Solo cuando es `"evento"` desciende a
`eventType`/`medium`. Esto importa: un checkpoint de una actividad evento llega
con `markKind === "hito"` y debe seguir pintándose de hito.

### 4.2 Paleta

| Clave | Token | Nota |
|---|---|---|
| `estreno_book` | `type-book` | terracota; ya es el color del libro en el catálogo |
| `estreno_movie` | `type-movie` | teal |
| `estreno_series` | `type-series` | púrpura |
| `evento` | `spine` | **cambia** |
| `inicio` | `green` | sin tocar |
| `hito` | `accent` | sin tocar |
| `cierre` | `gold` | sin tocar |

El evento genérico **tiene que** dejar `type-series`: ese token ahora significa
"estreno de serie", y mantenerlo haría que una quedada y un estreno de serie
fueran el mismo púrpura. Pasa a `spine` (el beige-nexo de las sagas,
`#b8a98f` / `#8a7d63`), que es el único token de la paleta que no está ya
comprometido con otra clase de marca ni con un `status-*` de lectura.

`quedada` y `otro` **comparten** color. Distinguirlos no aporta: el tipo se lee
en la etiqueta de texto (§4.4), y separarlos añadiría un token y una entrada más
de leyenda para una diferencia que nadie busca en un punto de 6 px. Si algún día
se quiere, es una clave más en el `Record`.

### 4.3 Lo que la marca tiene que llevar

`CalendarMark` gana tres campos:

```ts
eventType: ClubEventType | null;   // null si activityKind !== "evento"
medium: ItemType | null;           // null salvo estreno
description: string | null;        // solo eventos; lo piden las acciones de §5.3
```

`getClubCalendarMarks` añade `config, description` al `select` de
`club_activities` y `buildCalendarMarks` los propaga vía `parseEventConfig`.
Los tres van a `null` en las marcas de hito/inicio/cierre.

`description` no es un capricho de color: sin ella, editar un evento desde la
agenda tendría que ir a buscar la fila otra vez, y el formulario abriría con la
descripción vacía (que al guardar la borraría).

### 4.4 Dónde se ve

**Leyenda** (`club-calendar.tsx`), dos filas etiquetadas:

```
MARCAS    ● Empieza  ● Hito  ● Evento  ● Cierre
ESTRENOS  ● Libro    ● Película  ● Serie
```

Ambas filas se derivan de las claves de `MARK_ACCENT` con dos arrays sobre el
mismo `Record`, nunca con listas escritas a mano: el fichero ya avisa de que dos
constantes gemelas acaban divergiendo y dejarían la leyenda contradiciendo a la
rejilla sin que nada saltara. `ORDEN_MARCA` sigue rigiendo el orden de la
primera fila.

**Rejilla** (`month-grid.tsx`): cada punto en su color final —
`MARK_ACCENT[accentKeyFor(mark)]` sustituye a `MARK_ACCENT[mark.markKind]` en los
tres sitios donde aparece.

**Agenda** (`agenda-list.tsx`): el chip de clase pasa de decir `EVENTO` a decir
`ESTRENO · PELÍCULA` / `QUEDADA` / `EVENTO`. El color acompaña, no informa solo:
si el color fuera la única señal, un daltónico no distinguiría un estreno de
película de uno de serie (WCAG 1.4.1).

El resumen `sr-only` del día en `month-grid.tsx` (hoy `markKind_${m.markKind}:
título`) usa la misma etiqueta ampliada, por el mismo motivo.

## 5. Retirada de la pestaña Actividades

### 5.1 Agrupación

`groupActivities` pierde el grupo `events` de su tipo de retorno, y `finished`
pasa a excluir `kind === "evento"`. Este segundo es el que se olvida: `active` ya
los excluía explícitamente, pero un evento **archivado** cae hoy en `finished` y
seguiría a la vista.

Tras el cambio, los tres grupos (`active`, `proposed`, `finished`) están libres
de eventos por construcción. `proposed` ya lo estaba: un evento nace `active`
por RPC y nunca se propone.

Al caer el grupo, `groupActivities` deja de necesitar `today`: era su único
consumidor (ordenaba futuros antes que pasados). La firma pasa a
`groupActivities(activities)`, y `ActivityList` deja de llamar a `todayISO()`.

`isPastEvent` **no** se borra aunque salga de `groupActivities`: la usa
`activity-card.tsx:56` para atenuar cualquier actividad activa cuya fecha de
inicio ya pasó, no solo eventos.

### 5.2 Listado

`ActivityList` pierde el `<Group title={t("groupEvents")}>` entero y el import de
`EventCardActions`. El estado vacío (`activities.length === 0`) se mantiene tal
cual — un club con solo eventos ahora ve "no hay actividades", que es cierto.

### 5.3 Editar y archivar, en la agenda

`EventCardActions` se muda al ítem de agenda del calendario. Cambia su prop de
`ClubActivity` a lo que la marca puede dar:

```ts
{ clubId, activityId, title, description, startsOn }
```

Solo se pinta con `canModerate` y `markKind === "evento"`. `clubId` ya es prop de
`ClubCalendar` desde la página, así que no hay consulta nueva.

Conserva la propiedad autolimpiante que su comentario documenta, aunque por otra
razón: el calendario solo lee actividades con `status in ('active','finished')`,
así que un evento archivado desaparece de las marcas y sus controles se van con
él, sin lógica de estado extra.

### 5.4 El asistente deja de perder al moderador

El paso 2 del asistente sigue ofreciendo "Evento" — no se retira ese camino.
Pero hoy `onDone={onProposed}` solo cierra el panel, y con el grupo de eventos
fuera del listado el moderador crearía algo que no aparece en ninguna parte de
lo que está mirando.

Al crear un evento desde el asistente, se navega a
`/club/{slug}/calendario?mes=YYYY-MM` con el mes del evento recién creado.
`EventForm.onDone` ya recibe `startsOn` justo para esto (el calendario lo usa
para saltar de mes); aquí se usa para saltar de página.

Eso obliga a pasar `clubSlug` por la cadena `ActivityList → ActivityComposer →
ProposeWizard`. `ActivityList` ya lo tiene.

### 5.5 Lo que no cambia

El badge de propuestas pendientes en `ClubTabs` y el pip del sidebar cuentan
`status === "proposed"`; un evento nunca lo está.

## 6. i18n

Solo hay `messages/es.json`. Claves nuevas bajo `activity`:

- `eventTypeLabel`, `eventType_estreno`, `eventType_quedada`, `eventType_otro`
- `eventMediumLabel`, `eventMedium_book`, `eventMedium_movie`, `eventMedium_series`
- `legendMarks`, `legendPremieres` (los dos rótulos de fila)
- `markAccent_estreno_book` / `_movie` / `_series` para el chip de la agenda
- `eventMediumRequired`, `eventTypeInvalid`, `eventMediumInvalid` (errores)

`groupEvents` ("Fechas señaladas") queda huérfana al caer el grupo: se borra.

## 7. Formulario

`EventForm` gana dos controles, entre descripción y fecha:

- Un `<select>` de tipo, con `otro` preseleccionado al crear.
- Un `<select>` de medio que **solo aparece** si el tipo es `estreno`. Al pasar
  de estreno a otro tipo, el medio elegido se descarta al enviar (§3.3).

Envío bloqueado si es estreno sin medio, con el error visible junto al campo —
mismo patrón que `eventDateRequired`, que ya valida en cliente antes de llamar.

El formulario es compartido por crear y editar a propósito (dos copias acabarían
validando distinto); estos dos campos entran una sola vez y sirven a los dos
caminos.

## 8. Pruebas

**Unit nuevos**

- `event-config.test.ts`: `parseEventConfig` con `null`, `{}`, `eventType`
  desconocido, `medium` inválido, y estreno bien formado. `validateEventConfig`
  con las tres claves de error, más el caso "medio sobrante en no-estreno se
  descarta".
- `mark-accent.test.ts`: `accentKeyFor` devuelve las siete claves; en concreto
  que un hito de una actividad `evento` da `"hito"` y no una clave de estreno.

**Unit tocados**

- `group-activities.test.ts`: evento `active` **y** evento `archived` fuera de
  los tres grupos.
- `calendar-marks.test.ts`: `eventType`/`medium`/`description` propagados a la
  marca; `null` en hito/inicio/cierre.

**e2e** — `club-evento.spec.ts`

- Crear un estreno de película desde el calendario y ver su color y su chip
  `ESTRENO · PELÍCULA`.
- Ese evento **no** aparece en la pestaña Actividades.
- Editarlo desde la agenda conservando la descripción.
- Un estreno sin medio no deja enviar.

## 9. Riesgos

**El backfill toca prod.** Es aditivo (`||` sobre un `coalesce`) y con guarda
`config->>'eventType' is null`, así que es idempotente y no pisa nada escrito. El
peor caso si falla a medias son eventos sin `eventType`, que `parseEventConfig`
ya pinta como `otro`.

**`spine` en la leyenda.** El token se eligió para un lienzo oscuro (el grafo de
sagas), pero su muestra en la leyenda va sobre `--surface`, igual que las otras
seis. Hay que mirarlo en claro y en oscuro antes de cerrar; si no contrasta, el
sustituto es un token nuevo `--event-generic`, no reciclar otro comprometido.

**Firma de las RPCs.** Añadir parámetros con default a una función que ya tiene
defaults es seguro, pero `create or replace` con distinta lista de parámetros
crea una **sobrecarga nueva** en vez de reemplazar. La migración hace `drop
function` de la firma vieja antes del `create`, o PostgREST podrá resolver a la
antigua y los eventos nuevos nacerán sin `config`.

## 10. Decisiones

Van a `docs/requirements/decisiones.md` al cerrar:

1. **Dos ejes (`eventType` + `medium`) en vez de un enum plano.** Un enum
   `estreno_libro | estreno_pelicula | … | quedada | otro` mezcla dos preguntas
   en un select y crece mal. El coste asumido es un estado inválido posible
   (estreno sin medio), cerrado haciendo `medium` obligatorio en estrenos.
2. **`config` JSONB en vez de columnas.** Es el precedente de SD-8 y evita dos
   columnas `null` para los otros cuatro kinds. Se acepta que Postgres no valide
   la forma, porque escribir solo se puede por RPC.
3. **El evento genérico deja `type-series` y pasa a `spine`.** Forzado: ese token
   pasa a significar "estreno de serie".
4. **`quedada` y `otro` comparten color.** El tipo se lee en texto; un color más
   no compra nada en un punto de 6 px.
5. **El asistente sigue creando eventos, pero lleva al calendario.** Retirar el
   camino habría sido más simple, pero es donde el moderador ya sabe ir a crear
   cosas.

## 11. Documentación al cerrar

- `docs/requirements/data-model.md`: forma de `config` para `kind='evento'`, y
  fecha de verificación.
- `docs/requirements/backlog.md`: marcar la casilla.
- `docs/requirements/decisiones.md`: las cinco entradas de §10, al final.
- Lo que quede pendiente o dudoso, como issue en el repo.
