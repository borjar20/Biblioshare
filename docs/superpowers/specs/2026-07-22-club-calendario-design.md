# Calendario de club — diseño

[Histórico · congelado 2026-07-22] Spec de la feature. Refleja lo decidido al
diseñarla, no necesariamente el estado de hoy. El estado vivo está en el código
y en `docs/requirements/`.

**Depende de:** el kind `evento` (spec `2026-07-22-club-eventos-design.md`, rama
`feat/club-eventos` / PR #146). Esta rama sale de aquélla, no de `main`.

## El problema

Un club acumula cosas con fecha en tres sitios distintos y no hay ningún lugar
donde se vean juntas: los hitos de una lectura conjunta (`due_on`), las fechas
señaladas (`kind='evento'`) y la ventana de cada actividad (`starts_on` /
`ends_on`). El feed las enseña a medias, en dos bloques separados que repiten la
misma idea con dos formas de datos distintas.

`upcoming.ts:70-73` dejó el hueco escrito por adelantado:

> *Consulta APARTE de los hitos a propósito: unir ambas fuentes en una sola línea
> de tiempo es el trabajo del calendario, y adelantarlo aquí a medias significa
> escribirlo dos veces.*

Esto es ese trabajo.

## Qué se construye

1. **Una vista de calendario** en `/club/[slug]/calendario`: rejilla del mes más
   agenda del mes.
2. **Una tira «Próximo» en el feed** que sustituye a los dos bloques de fechas
   actuales y enlaza al calendario.

Referencias visuales: `Paper - Calendario Club PC.html` y
`Paper - Club Feed - Calendario.html`.

> Los dos mockups **discrepan**: la leyenda de PC tiene cuatro clases (evento,
> hito, inicio, cierre) y la de móvil tres (sin «inicio»). Manda la de PC — se
> decidió incluir las cuatro. Si al implementar el móvil parece que sobra
> «inicio», eso es una observación para una issue, no una licencia para
> desviarse del spec.

## No se construye (y por qué)

- **Ninguna migración.** `due_on` ya existe (`20260713_checkpoint_due_on.sql`),
  el kind `evento` ya existe, y al no filtrar por rango de fechas el índice
  `idx_club_activities_club` ya cubre la consulta. No se toca
  `docs/requirements/data-model.md`.
- **Hora del día.** El mockup pinta «18:30 · Café literario», pero `starts_on`
  es un `date`, sin hora. Añadir hora es un cambio de esquema con su propia
  trampa de zonas horarias. Fuera de esta feature → issue.
- **Asistencia a eventos** («6 asisten» en el mockup). Un evento no tiene
  participantes por diseño. Fuera → issue.
- **Portadas en la agenda.** El mockup pinta la carátula de la peli en la
  tarjeta de evento; un evento no tiene ítems asociados. Fuera → issue.
- **Pestaña de calendario en móvil.** Se entra por «Ver calendario ›» desde el
  feed, igual que hoy se entra a Miembros desde la cabecera.

## 1 · El modelo unificado

El núcleo del diseño: una sola forma que todas las superficies consumen.

```ts
export type CalendarMarkKind = "evento" | "hito" | "inicio" | "cierre";

export type CalendarMark = {
  date: string;              // ISO YYYY-MM-DD, nunca un Date
  markKind: CalendarMarkKind;
  title: string;             // "Café literario" | "Hito 4"
  detail: string | null;     // "Fundación" | "hasta pág 420"
  activityId: string;
  activityKind: ActivityKind;
  href: string | null;       // null SOLO para evento (no tiene ficha)
  past: boolean;             // date < hoy
};
```

### Reglas de derivación

| Fuente | Produce |
|---|---|
| actividad `kind='evento'`, `starts_on` no nulo | una marca `evento`, `href: null` |
| actividad normal, `starts_on` no nulo | marca `inicio` |
| actividad normal, `ends_on` no nulo | marca `cierre` |
| checkpoint con `due_on` no nulo | marca `hito` |

Reglas que deben quedar explícitas porque son las que se rompen al refactorizar:

- **Un `evento` NO produce marcas `inicio`/`cierre`.** Su `ends_on` se ignora
  siempre, aunque tenga valor: el kind no lo usa.
- **`href` es `null` exactamente cuando `markKind === "evento"`.** Cualquier
  superficie que construya su propio enlace a la ficha de actividad debe honrar
  esto o llevará a un 404. Es el mismo fallo que ya apareció tres veces en la
  feature de eventos (feed de inicio, tira de resumen, notificación).
- **Una actividad puede producir dos marcas** (`inicio` y `cierre`) en fechas
  distintas. No se deduplica.

### Filtro de estado

Entran `active` y `finished`. Quedan fuera `proposed` y `archived`.

- `proposed`: una propuesta que nadie ha aprobado no es un compromiso del club.
- `archived`: se retiró a propósito.
- `finished` **sí entra**: un calendario que borra el pasado deja de ser un
  calendario. Los meses anteriores deben seguir siendo ciertos.

### `past` se deriva de la fecha, no de la confirmación

`past = date < hoy`, comparando cadenas ISO (lexicográfico == cronológico para
`YYYY-MM-DD`). Estricto: **una marca de hoy NO es pasado** — mismo borde que ya
cubre `isPastEvent` en `group-activities.ts`.

Deliberadamente NO se usa «el grupo confirmó el hito», que exigiría cruzar
`club_activity_checkpoint_reads` y haría que el mismo gris significara dos cosas
distintas («ya pasó» y «el grupo llegó»). Una señal, un significado.

## 2 · Reparto en capas

### `src/lib/clubs/activities/calendar.ts` — acceso a datos

```ts
export async function getClubCalendarMarks(clubId: string): Promise<CalendarMark[]>
```

Dos consultas, sin filtro de rango de fechas:

1. `club_activities` del club con `status in ('active','finished')`.
2. `club_activity_checkpoints` con `due_on not null`, join `!inner` a
   `club_activities` filtrando por club y los mismos estados.

La RLS existente ya limita a miembros del club, así que **no hay gate nuevo en
la capa de datos**. El join `!inner` llega como objeto pero postgrest-js lo tipa
como array cuando no puede probar la cardinalidad — hay que normalizarlo, como
ya hace `upcoming.ts:44-48`.

«Hoy» se calcula con `todayISO()` de `@/lib/stats/dates`. Una sola vez, y se
pasa como argumento a las puras — nunca `new Date()` disperso.

### `src/lib/clubs/activities/calendar-marks.ts` — puras

Todo lo testeable con Vitest vive aquí (el repo restringe Vitest a funciones
puras):

```ts
buildCalendarMarks(activities, checkpoints, today): CalendarMark[]
monthGrid(year, month): MonthCell[]          // 1-indexed month
marksByDate(marks): Map<string, CalendarMark[]>
agendaForMonth(marks, month, today): CalendarMark[]
```

- `buildCalendarMarks` aplica las reglas de derivación y ordena por `date`.
- `monthGrid` devuelve las celdas de la rejilla empezando en **lunes**, con
  relleno de días del mes anterior/siguiente marcados `outside: true`.
- `agendaForMonth(marks, "2026-08", today)`: las marcas de ese mes en orden. Si
  el mes es el actual, empieza en `today` (así «lo que viene» sigue siendo
  cierto al entrar); si es otro mes, las lista todas.

#### La trampa de las fechas — leer entero

El repo ya pagó este bug: `new Date("2026-07-04")` sobre un `date` de Postgres
se interpreta como medianoche **UTC** y al leerlo en local puede retroceder un
día. Por eso `format-date.ts` parte la cadena a mano.

Pero eso **no** significa «nada de `Date`». `monthGrid` sí necesita aritmética
de calendario (en qué día de la semana cae el 1, cuántos días tiene el mes) y no
hay forma sensata de hacerla partiendo cadenas. La regla exacta:

- **Prohibido:** `new Date(isoString)` sobre una fecha venida de la BD.
- **Permitido y correcto:** `new Date(Date.UTC(y, m - 1, d))` con getters UTC
  (`getUTCDay`, `getUTCDate`). Construido y leído en UTC, no hay zona que
  desplace nada.
- Formatear una marca para pantalla usa `formatDayMonth` de `format-date.ts`,
  que ya existe. No se escribe otro formateador.

## 3 · La vista

`src/app/club/[slug]/calendario/page.tsx`, server component.

- Gate: `if (!club || !club.viewerRole) notFound()` — igual que
  `actividad/[id]/page.tsx:33`. Un club privado no filtra sus fechas por URL.
- Carga `getClubCalendarMarks(club.id)` y entrega el array al componente
  cliente.

### El mes en la URL sin viaje al servidor

Decisión de fondo (opción B de tres evaluadas): **todas las marcas del club se
cargan una vez y la navegación de meses ocurre en memoria.**

El componente cliente guarda el mes visible en `useState`, inicializado desde
`?mes=YYYY-MM`, y al cambiarlo sincroniza la URL con `window.history.pushState`.
El App Router integra la History API nativa: la URL cambia, el botón atrás
funciona y **el server component no se vuelve a ejecutar**.

- `router.push`/`router.replace` harían lo contrario: re-ejecutan el server
  component y dejan las flechas tan lentas como la opción A que se descartó.
  **No usarlos aquí.**
- Un `?mes=` inválido o ausente cae al mes actual. Nunca 404.

> **AGENTS.md manda leer `node_modules/next/dist/docs/` antes de escribir
> código.** El implementador debe confirmar allí la integración de `pushState`
> con el App Router en la versión instalada, no fiarse de este párrafo. Si en
> esta versión no funciona como se describe, es un BLOCKED: parar y consultar,
> no improvisar con `router.replace`.

#### Por qué cargarlo todo

El techo por club son las actividades de toda su vida (decenas) más los hitos,
que solo tiene `buddy_read` (~5-10 por lectura). Un club veterano con 20
lecturas y 50 actividades ronda **300 marcas, ~35 KB**. No crece sin límite:
crece con lo que el club ha organizado. Acotar a una ventana de meses es
complejidad pagada por adelantado contra un problema que puede no llegar — y si
llega, la ventana sigue siendo la salida.

### Layout

Un solo árbol de componentes; solo el chrome se desdobla por breakpoint — el
mismo principio que ya sigue `ClubShell` (ver su comentario en las líneas 11-16
sobre no romper locators e2e a 1280px).

- **`lg:`** → `grid-cols-[minmax(0,1fr)_320px]`: rejilla a la izquierda, agenda
  sticky a la derecha. Celdas altas (~112px) con chips de texto completo.
- **móvil** → celdas cuadradas con puntos de color; la agenda va debajo.

### Desbordamiento de celda

El mockup no lo resuelve y hace falta: **hasta 3 chips por celda; el resto se
resume en «+N»**. Sin esa regla, un día con cinco hitos rompe la altura de la
fila. En móvil son puntos, así que el tope es visual y no de layout.

### Colores

`ACTIVITY_ACCENT` (`kinds/accent.ts`) colorea por `activityKind`, no por
`markKind`. Pero la leyenda del calendario habla de las cuatro clases de marca.
Hace falta un mapa nuevo, pequeño y propio: `MARK_ACCENT[markKind]`. Los tokens
del mockup:

| Marca | Token |
|---|---|
| `evento` | el acento de series/morado |
| `hito` | acento principal |
| `inicio` | verde |
| `cierre` | dorado |

Se usan los tokens CSS existentes de Tailwind v4 del proyecto, **no** los
hex del mockup.

### «+ Evento»

Botón en la cabecera de la vista, **solo moderador+** (`canModerate`). Reutiliza
`EventForm` tal cual, que ya sirve para crear y editar. No se escribe otro
formulario.

## 4 · Entrada a la vista

- **Rail de PC** (`ClubSidebar`, `club-shell.tsx:78-191`): nueva ranura
  «Calendario» **entre Actividades y Miembros**, en ese orden exacto (el del
  mockup).
- **Móvil**: no se añade pestaña a `ClubTabs`. Miembros tampoco está ahí; se
  entra por «Ver calendario ›» en la tira del feed. Se sigue el precedente
  existente en vez de inventar uno nuevo.

## 5 · El feed

`src/components/clubs/club-summary.tsx` pierde dos secciones y gana una:

- **Fuera** `summaryUpcoming` («Próximos hitos») y `summaryDates` («Fechas
  señaladas»).
- **Dentro** una sección única «Próximo» con enlace «Ver calendario ›».

Contenido de la tira: **solo marcas `hito` y `evento`**, las 3 siguientes desde
hoy. No entran `inicio`/`cierre` porque justo encima está «Actividades activas»
hablando de esas mismas actividades — fue el motivo de descartar esa variante.

Se conserva intacta la sección «Actividades activas», con su `timeProgress`.

### Efecto colateral: `upcoming.ts` se borra

`page.tsx` deja de llamar a `getUpcomingCheckpoints` y `getUpcomingEvents` y
pasa a llamar a `getClubCalendarMarks`. Eso deja `upcoming.ts` sin consumidores.

- **Verificar antes de borrar** que no queda ningún otro consumidor (`grep` por
  `getUpcomingCheckpoints`, `getUpcomingEvents`, `UpcomingCheckpoint`,
  `UpcomingEvent`).
- Con él se va su incoherencia conocida: calcula «hoy» con `new Date()` en la
  línea 25 y con `todayISO()` en la 79, en el mismo fichero.
- Dos consultas menos en la carga del feed; una en su lugar.

## 6 · Pruebas

**Vitest** (`calendar-marks.test.ts`) — sobre las puras:

- Un `evento` con `ends_on` poblado produce **una sola** marca, de tipo
  `evento`, y `href === null`.
- Una actividad normal con ambas fechas produce **dos** marcas.
- `proposed` y `archived` no producen ninguna marca; `finished` sí.
- `past`: una marca de **hoy** es `past === false`; la de ayer, `true`.
- `monthGrid`: un mes que empieza en domingo (el peor caso del relleno con
  semana que empieza en lunes) y un febrero bisiesto.
- `agendaForMonth`: en el mes actual empieza en hoy; en otro mes lista todo.

**Playwright** (`e2e/club-calendario.spec.ts`):

- Un moderador crea un evento desde el calendario y aparece en su celda.
- Navegar de mes cambia la URL y el botón atrás vuelve al mes anterior.

Crear usuarios ad-hoc vía `POST /auth/v1/admin/users`, como ya hacen otros
specs. La limpieza usa `fetch` nativo en `try/finally`, **nunca** el fixture
`request` de Playwright: muere con el contexto del navegador y un timeout deja
filas huérfanas (ya pasó — 8 filas huérfanas en dev).

## 7 · Definición de hecho

Según AGENTS.md:

- [ ] Esquema: **no se toca**. `data-model.md` no cambia.
- [ ] `docs/requirements/backlog.md`: marcar la casilla del calendario.
- [ ] `docs/requirements/decisiones.md`: **añadir al final** la decisión «todas
      las marcas en memoria, mes en la URL vía History API», con el porqué
      (payload acotado ~35 KB vs. un viaje al servidor por flecha).
- [ ] Todo lo aplazado de la sección «No se construye» → issues en el repo.
