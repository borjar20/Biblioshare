# Rediseño de la pestaña Actividades del club

[Canónico · verificado 2026-08-12]

La pestaña **Actividades** de un club (`/club/[slug]?tab=actividades`) se ve vacía
incluso cuando el club tiene vida: una lista de tarjetas de una línea, un botón
suelto arriba y, en escritorio, dos tercios de pantalla en blanco. Este spec la
reestructura en **En curso / Próximas / Historial**, convierte lo activo en
tarjetas grandes con progreso real, y añade un rail de contexto en escritorio.

Continúa `2026-08-11` («Eventos fuera de Actividades»), que sacó los eventos de
este listado y dejó los cuatro *kinds* participativos —`buddy_read`, `tierlist`,
`list_challenge`, `criteria_challenge`— como único contenido de la pestaña.

**Alcance:** solo esta pantalla. La edición de una actividad ya creada (cambiar
fecha de fin, tocar hitos fuera de la ventana actual) es un problema distinto,
con migración de escritura y RLS propia, y va en **spec B aparte** — ver §9.

---

## 1. Problema

Tres cosas se suman para que la página parezca un borrador.

**La tarjeta no dice nada.** `activity-card.tsx` es una fila: baldosa de 40px con
el icono del tipo, título, una meta de un renglón (`lectura conjunta · 6
participantes`) y una píldora de estado. Un club con una lectura conjunta en
marcha ve exactamente lo mismo que un club que la propuso ayer. No hay progreso,
ni fechas, ni quién participa, ni a qué invita hacer clic.

Es una tarjeta que se diseñó para una lista de muchas y se usa en una lista de
una.

**Los grupos no responden a las preguntas que se traen.** Hoy son tres —
`active`, `proposed`, `finished`— derivados directos del `status` de la fila.
Pero un miembro no entra preguntándose «¿qué está en estado active?»; entra
preguntándose *qué toca ahora*, *qué viene* y *qué hicimos*. Una actividad activa
que empieza dentro de dos semanas está mezclada con la que se lee esta noche.

**En escritorio sobra la mitad de la pantalla.** El contenido va en
`lg:max-w-4xl` y a la derecha no hay nada, mientras que la pestaña Inicio sí
tiene rail (`ClubSummary` + miembros). La pestaña que trata de actividades tiene
menos contexto sobre actividades que la portada del club.

El objetivo, dicho con las palabras del encargo: **que una página con una sola
actividad siga pareciendo una vista completa e intencionada, sin contenido
ficticio para llenar hueco.**

---

## 2. Estado actual (lo que ya existe y no hay que rehacer)

| Pieza | Dónde | Qué hace |
|---|---|---|
| `groupActivities` | `src/lib/clubs/activities/group-activities.ts:39` | 3 grupos por `status`, filtra `kind='evento'` |
| `ActivityList` | `src/components/clubs/activity-list.tsx` | Orquesta composer + 3 grupos + moderación |
| `ActivityCard` | `src/components/clubs/activity-card.tsx` | Tarjeta compacta de una línea |
| `ActivityComposer` | `src/components/clubs/activity-composer.tsx` | Botón que abre `ProposeWizard` inline |
| `ProposalModeration` | `src/components/clubs/proposal-moderation.tsx` | Cola de propuestas, tinte dorado |
| `ClubMainHeader` | `src/components/clubs/club-shell.tsx:57` | Cabecera sticky de escritorio, **ya acepta `action`** |
| `ClubShell` | `src/components/clubs/club-shell.tsx:17` | `desktopHeader` **ya es opcional** |
| `getClubCalendarMarks` / `proximasMarcas` | `src/lib/clubs/activities/calendar*.ts` | Marcas del club (hitos, inicios, fines, eventos) |
| `ClubSummary` | `src/components/clubs/club-summary.tsx` | Rail de **Inicio**: tira compacta de activas + próximo |

Y el progreso, que es donde está el coste:

| Función | Fichero | Forma |
|---|---|---|
| `getListChallengeProgress` | `list-challenge.ts:38` | 1 actividad, vía RPC `get_list_challenge_progress` |
| `getCriteriaChallengeProgress` | `criteria-challenge.ts:36` | 1 actividad |
| `getActivityCheckpoints` | `checkpoints.ts:63` | 1 actividad, tablas planas |
| `getTierlists` | `tierlist.ts:31` | 1 actividad |

Todas son **por actividad**, y las de reto van por RPC `security definer` porque
el progreso colectivo se calcula sobre los `passes` de **todos** los
participantes: la RLS de `passes` impide agregarlos desde el cliente
(`20260717_pass_hub_c_rename.sql:116`).

Por eso `ClubSummary` pinta hoy una barra de **tiempo transcurrido**, con el
motivo escrito en el propio fichero: *«el progreso real por hitos costaría una
query por actividad»*. Ese apaño es aceptable en una tira de portada; no lo es en
la pantalla cuyo propósito es contar cómo va cada actividad.

---

## 3. Decisiones tomadas

Cinco, y el porqué de cada una.

### D1 · Dos specs, esta primero

El encargo mezcla rediseño (componentes + una lectura nueva) con edición
(migración de escritura, RPC nueva, política RLS nueva). Riesgos incomparables:
mezclarlos hace la revisión imposible y bloquea el rediseño detrás de un cambio
de esquema con superficie de seguridad. Van en dos specs y dos PRs.

### D2 · «Próximas» = activas con fecha de inicio futura

No existe —ni se crea— un estado «aprobada y aún no empezada». `proposed`
significa *espera moderación*, que es una **cola de trabajo del moderador**, no
una actividad programada: una propuesta puede rechazarse, así que llamarla
«próxima» sería mentir en la etiqueta. Los cuatro grupos salen de datos que ya
viajan, sin tocar el esquema:

```
proposals   status = 'proposed'                                  bloque propio, arriba
enCurso     status = 'active' && (!startsOn || startsOn <= today)
proximas    status = 'active' && startsOn > today
historial   status = 'finished' | 'archived'
```

`kind = 'evento'` sigue excluido de los cuatro (spec 2026-08-11).

### D3 · Progreso real, con una RPC nueva en lote

Una tarjeta grande sin progreso es una tarjeta pequeña con más aire. Y repetir la
barra de tiempo de `ClubSummary` sería duplicar en Actividades justo lo que
Inicio ya hace.

Se añade **una** función de solo lectura que resuelve las N actividades de un
golpe. Es una migración pequeña, `stable security definer`, sin escritura y sin
política nueva — categoría distinta de la migración de la spec B.

### D4 · Rail en Actividades; Inicio no se toca

`ClubSummary` **ya es** la «versión compacta para saber qué hace el club ahora»
que pide el encargo. Adelgazarla más cambiaría una pantalla que nadie ha pedido
cambiar. La no-duplicación se cumple porque las tarjetas son distintas: tira
horizontal con barra de tiempo en Inicio, tarjeta grande con progreso real en
Actividades.

### D5 · Chips de navegación, no de filtro

Con tres secciones ya visibles, un filtro que las oculta dice lo mismo dos veces
y añade un caso vacío por filtro. Los chips son **anclas de scroll**: cero estado
de cliente, cero casos nuevos, y sirven cuando el historial crece.

---

## 4. Arquitectura de datos

### 4.1 La RPC

`get_activities_progress(p_activity_ids uuid[])`, `stable security definer`,
`set search_path = public`. Devuelve **una fila por actividad visible**:

```
activity_id      uuid
kind             activity_kind
collective_done  int      -- numerador colectivo
collective_total int      -- denominador colectivo (0 = sin denominador -> sin barra)
viewer_done      int      -- numerador del que mira
viewer_total     int
participants     int
```

Qué mide cada `kind` (los tres primeros reaprovechan lógica ya probada; no se
inventa aritmética nueva):

| kind | colectivo | del viewer | fuente |
|---|---|---|---|
| `buddy_read` | hito seguro del grupo / total de hitos | hitos alcanzados / total | `club_activity_checkpoints` + `club_activity_checkpoint_reads` |
| `list_challenge` | ítems completados por alguien / tamaño del pool | completados por el viewer / pool | cuerpo de `get_list_challenge_progress` |
| `criteria_challenge` | conseguidos / meta | del viewer | cuerpo de `get_criteria_challenge_progress` |
| `tierlist` | participantes que ya han colocado algo / participantes | votó: 1/1 o 0/1 | `club_activity_placements` |

**«Hito seguro del grupo»** es el `groupSafeOrder` que ya calcula
`getActivityCheckpoints` (`checkpoints.ts:112`): el mínimo de los máximos por
participante. Se mantiene idéntico a propósito — dos definiciones distintas del
mismo número en dos pantallas es una discrepancia que alguien acabará reportando
como bug.

**Visibilidad.** Gate idéntico al de las funciones que reemplaza: ser miembro del
club de la actividad (`is_activity_participant` / pertenencia, según el kind).
La función devuelve **solo** las filas que el llamante puede ver; un id no
visible sencillamente no sale, sin error. La agregación se hace *dentro* de la
función precisamente porque el detalle por usuario no es visible al llamante:
sale un contador, no una lista de quién ha leído qué.

Fichero: `supabase/migrations/20260853_activities_progress.sql` (siguiente libre
tras `20260852`; confirmar el número al implementar). **Dev primero
(`supabase-dev`), luego prod.**

### 4.2 El envoltorio de app

`src/lib/clubs/activities/progress.ts`

```ts
export type ActivityProgress = {
  collective: { done: number; total: number } | null;
  viewer: { done: number; total: number } | null;
  participants: number;
};

export async function getActivitiesProgress(
  activityIds: string[],
): Promise<Map<string, ActivityProgress>>;
```

Devuelve `Map` vacío si `activityIds` está vacío — sin ir a la base. `collective`
es `null` cuando `collective_total = 0`: **sin denominador no se pinta barra**,
nunca una barra al 0% que parece progreso real.

Se pide **solo para `enCurso`**. `proximas` no ha empezado (progreso 0 por
definición) e `historial` ya terminó; gastar la agregación en ellas es pagar por
un número que nadie mira.

### 4.3 Caché: aquí no

**Ninguna función de esta cadena lleva `use cache`** — ni `getActivitiesProgress`,
ni nada que la llame. `viewer_done` depende de `auth.uid()`: cachearla y
compartir la entrada es servirle a un miembro el progreso de otro. Es la regla
#437 exactamente, con su agravante: con una sola cuenta abierta en desarrollo la
caché acierta siempre y el fallo solo aparece en producción.

Los datos del rail (marcas del calendario, contadores) tampoco se cachean en esta
entrega: viajan bajo la misma RLS de club y no compensan el riesgo por un rail.

### 4.4 «Hoy» viene del servidor

`today` sigue llegando como prop desde la RSC (`todayISO()`), nunca de
`new Date()` en el navegador. Es lo que ya hace `ActivityList`, y ahora pesa más:
`enCurso` vs `proximas` se decide comparando con `today`, así que un huso del
visitante distinto movería actividades de sección y contradiría al calendario del
club (#271).

### 4.5 `groupActivities` recupera `today`

La firma vuelve a `groupActivities(activities, today)`. El comentario actual
explica que dejó de necesitarlo al salir los eventos; ese comentario se
**actualiza**, no se borra: ahora lo necesita por otro motivo (partir `active` en
dos), y conviene que el siguiente que lo lea sepa que no es una regresión al
diseño viejo.

`isPastEvent` se queda como está —muerta salvo su test—: su borrado es la issue
**#587** y no se mezcla aquí.

---

## 5. Estructura de la página

```
┌─ ClubMainHeader (sticky, escritorio) ──────────────────────┐
│  Actividades                        [+ Proponer actividad] │
└────────────────────────────────────────────────────────────┘

  ── cabecera móvil (lg:hidden), dentro del contenido ──
  Actividades
  Organiza y participa en actividades del club
  [+ Proponer actividad]                      (ancho completo)

  [Todas] [En curso] [Próximas] [Historial]   chips-ancla

┌── columna principal ────────────┬── rail (lg, sticky) ──┐
│ PROPUESTAS (2)   solo si hay    │ PRÓXIMAS FECHAS       │
│   [tarjeta + aprobar/rechazar]  │  16 AGO  Termina …    │
│                                 │  24 AGO  Comienza …   │
│ EN CURSO (1)                    │  Ver calendario →     │
│   [tarjeta GRANDE con progreso] │                       │
│                                 │ ESTE CLUB             │
│ PRÓXIMAS (1)                    │  1 actividad activa   │
│   [tarjeta media]               │  4 completadas        │
│                                 │  8 participantes      │
│ HISTORIAL (4)                   │                       │
│   [tarjetas compactas]          │                       │
└─────────────────────────────────┴───────────────────────┘
        lg:grid-cols-[minmax(0,1fr)_320px]
```

En móvil: misma arquitectura, sin rail, tarjetas a ancho completo.

Cada sección **se omite entera si está vacía**, salvo Próximas e Historial, que
tienen estado vacío propio (§7). Propuestas nunca lo tiene: una cola vacía es una
cola que no hace falta enseñar.

---

## 6. Tarjetas: tres densidades

Una sola tarjeta «grande» aplicada a todo convierte el historial en un muro. La
densidad la fija **la sección**, no el estado de la fila.

### 6.1 En curso — tarjeta grande

```
┌──────────────────────────────────────────────────────┐
│ ▣  Saltire y Cenizas                     EN CURSO    │
│    lectura conjunta                                  │
│                                                      │
│    Leemos la trilogía entera antes de que salga la   │
│    adaptación. Dos capítulos por semana.             │
│                                                      │
│    El grupo   ███████████░░░░░░  3/5 hitos           │
│    Tu avance  ██████████████░░░  4/5 hitos           │
│                                                      │
│    ●●●● +2 participan      Termina el 16 AGO · 4 días│
│                                     Continuar →      │
└──────────────────────────────────────────────────────┘
```

- Baldosa de tipo (icono + color de `ACTIVITY_ACCENT`), como hoy.
- Descripción a **2 líneas** (`line-clamp-2`); si no hay, no se reserva hueco.
- Barra colectiva siempre que haya denominador; **«Tu avance» solo si el viewer
  participa** — a quien no participa no se le enseña una barra vacía suya.
- Stack de avatares (máx. 4 + resto), del que ya trae `ActivityDetail`.
- Fecha de fin y días restantes solo si hay `endsOn`.

### 6.2 Próximas — tarjeta media

Sin barras: no hay progreso que contar y una barra al 0% se lee como
«abandonada». Manda la **fecha de inicio** (`24 AGO`, en la baldosa), el tipo, la
descripción a una línea y cuántos se han apuntado.

### 6.3 Historial — compacta

`ActivityCard` actual con `muted`, sin cambios. Es exactamente la densidad que
pide una lista de cosas terminadas.

### 6.4 Métrica por tipo

Solo lo que significa algo para ese `kind` — criterio que la tarjeta actual ya
respeta al no decir «0 participantes» en un evento:

| kind | En curso enseña |
|---|---|
| `buddy_read` | progreso del grupo y del viewer en hitos, participantes, fecha de fin |
| `list_challenge` | `18/30 completados`, progreso propio, participantes, fecha límite |
| `criteria_challenge` | `7/15 conseguidos`, progreso propio, participantes, fecha límite |
| `tierlist` | `4 de 6 participantes han votado`, si el viewer ya votó, participantes |

Vive en `src/lib/clubs/activities/kind-metrics.ts`: una función pura
`describeProgress(kind, progress, t)` que devuelve las etiquetas. Pura y aparte
porque es la parte con más reglas y la única que merece test unitario propio.

### 6.5 CTA y clic

| Situación | CTA |
|---|---|
| Activa y participa | `Continuar →` |
| Activa y no participa | `Participar` |
| Próxima | `Ver actividad` |
| Terminada / archivada | `Ver resultados` |

La tarjeta entera es clicable: **un solo `<Link>` envolvente** y el CTA como
`<span>` con aspecto de botón. Nada de un `<button>` dentro de un `<a>`. Todas
las rutas apuntan a `/club/[slug]/actividad/[id]`, que ya gestiona unirse y ver
según rol y estado; esta pantalla no adquiere lógica de participación.

---

## 7. Estados vacíos

Intencionados y útiles; nunca una tarjeta grande hueca para rellenar.

**Sin ninguna actividad** (los cuatro grupos vacíos) — un solo bloque:

> **Aún no hay actividades**
> Una lectura conjunta, un reto o una tierlist: así es como el club se pone de acuerdo en qué leer.
> `+ Proponer actividad`

**Próximas vacío** (pero hay algo en curso o en historial):

> **No hay próximas actividades**
> ¿Tenéis alguna lectura, maratón o reto en mente?
> `+ Proponer actividad`

**Historial vacío**:

> **Todavía no hay actividades terminadas**
> Aquí aparecerán las actividades completadas por el club.

Sin botón: no hay nada que hacer para llenarlo hoy.

Forma: texto centrado, borde punteado suave, altura mínima contenida.

---

## 8. Punto de entrada al asistente

`+ Proponer actividad` aparece en **tres sitios** (cabecera de escritorio,
cabecera móvil, estado vacío de Próximas), y el asistente es uno solo.

El botón de escritorio vive en el shell (`ClubMainHeader action`) y el asistente
en el contenido: no comparten árbol de React, así que un `useState` no vale. Se
resuelve con **searchParam**:

- Los tres botones son `<Link href="?tab=actividades&nueva=1">`.
- `ActivityList` monta `ProposeWizard` cuando el param está.
- Cerrar o proponer quita el param.

Ventajas sobre un contexto o un estado elevado: proponer queda **enlazable**
(útil desde una notificación o el propio empty state), hay una sola instancia del
asistente, y el patrón ya se usa en esta ruta para `?tab=`. Coste: una navegación
RSC al abrir, igual que cambiar de pestaña.

`ActivityComposer` deja de ser «botón + asistente» y se parte en dos: el botón es
un `<Link>` (puede ser servidor) y el asistente se monta desde `ActivityList`.

---

## 9. Fuera de alcance (spec B)

Lo que el encargo pide y **no** entra aquí, con lo averiguado para que la spec B
no empiece de cero:

**Editar fecha de fin.** `club_activities` no tiene política UPDATE de cliente, a
propósito (`20260713_club_activities.sql:196`): las transiciones van por RPC. Hoy
solo existe `update_club_event` (solo `kind='evento'`) y `update_activity_config`
(solo `config`, y solo en `proposed`). Para cambiar `ends_on`, `starts_on`,
`title` o `description` de un `buddy_read` **falta una RPC** que valide creador o
moderador en servidor.

**Hitos «no mejorables».** Matiz importante: `createCheckpoint`,
`updateCheckpoint`, `deleteCheckpoint` y `reorderCheckpoints` **sí existen**
(`checkpoints.ts:174-241`) y sus políticas RLS los permiten. Lo que falla es el
acceso: el editor está enterrado dentro de «Modificar actividad» en el detalle, y
triple-gateado a `isModerator` + `kind='buddy_read'` + `disabled` si
`status !== 'active'` (`activity-detail.tsx:238`), además de no pintarse si el
pool está vacío (`checkpoint-editor.tsx:38`). Antes de tocar RLS hay que confirmar
con el usuario cuál de esas cuatro puertas es la que se cerró en su cara.

Cuando esta entrega esté cerrada, ambas cosas se abren como issue con sus tres
etiquetas.

---

## 10. Ficheros

```
nuevo   supabase/migrations/20260853_activities_progress.sql
nuevo   src/lib/clubs/activities/progress.ts
nuevo   src/lib/clubs/activities/kind-metrics.ts
nuevo   src/lib/clubs/activities/kind-metrics.test.ts
nuevo   src/components/clubs/activity-card-large.tsx
nuevo   src/components/clubs/activity-card-upcoming.tsx
nuevo   src/components/clubs/activities-aside.tsx
nuevo   src/components/clubs/activity-empty-state.tsx
nuevo   src/components/clubs/activity-section-nav.tsx        chips-ancla

edita   src/lib/clubs/activities/group-activities.ts         4 grupos, vuelve `today`
edita   src/lib/clubs/activities/group-activities.test.ts
edita   src/components/clubs/activity-list.tsx               orquesta
edita   src/components/clubs/activity-composer.tsx           botón <Link> / wizard por param
edita   src/app/club/[slug]/page.tsx                         desktopHeader + carga + Suspense
edita   messages/*.json                                      claves nuevas

intacto src/components/clubs/activity-card.tsx               sigue siendo la compacta
intacto src/components/clubs/club-summary.tsx                el rail de Inicio no se toca
intacto src/components/clubs/proposal-moderation.tsx
```

La carga nueva (progreso + marcas) va detrás de un `<Suspense>` propio, como ya
hace `ClubFeedSection`: el shell y las pestañas no deben esperar por el rail.

---

## 11. Verificación

**Unitario (Vitest)**
- `group-activities.test.ts`: activa sin `startsOn` → En curso; `startsOn` = hoy
  → En curso (empieza hoy, no es futura); `startsOn` = mañana → Próximas;
  `archived` → Historial; `evento` → fuera de los cuatro.
- `kind-metrics.test.ts`: cada `kind` con progreso presente, con
  `collective_total = 0` (sin barra) y sin progreso.

**e2e (Playwright, contra build de producción)**
- Club con una sola actividad activa: se ven las tres secciones, la tarjeta
  grande con su barra, y los estados vacíos de Próximas e Historial.
- Club sin ninguna: bloque vacío único con el botón, y **ningún** rail.
- `?nueva=1` abre el asistente; cerrar lo quita de la URL.
- Los chips llevan a su sección.

**Manual, no automatizable — dos cuentas**
Miembro A participa, miembro B no: B **no** ve la barra «Tu avance» de A. Es la
comprobación de la regla #437 y no se detecta con una sola sesión abierta.

**Después del cambio**
- `docs/requirements/data-model.md` — la RPC nueva y su fecha de verificación.
- `docs/requirements/decisiones.md` — append: D2 (por qué `proposed` no es
  «próxima») y D3 (por qué el progreso pasa a ser real).
- `docs/requirements/backlog.md` — marcar si corresponde.
- No se añade ninguna columna → la superficie 6 de `DRIFT-CHECK.md` (grants por
  columna) no aplica.

---

## 12. Riesgos

**La RPC agrega cuatro lógicas distintas en una función.** Es su peor rasgo: si
mañana cambia cómo se cuenta un `list_challenge`, hay dos sitios que actualizar
(la RPC de detalle y esta). Se acepta a cambio de una sola consulta en lugar de
N, y se mitiga reutilizando literalmente el cuerpo de las funciones existentes en
vez de reescribir la aritmética. Alternativa descartada: N llamadas por actividad,
que es justo lo que hoy impide enseñar progreso.

**`security definer` sobre datos de otros usuarios.** La función lee `passes` de
todos los participantes. Devuelve **solo contadores agregados**, nunca filas por
usuario, y comprueba pertenencia al club antes de nada. Cualquier campo que se le
añada después tiene que pasar por esa misma pregunta.

**El rail puede quedarse a medias.** Si el club no tiene marcas próximas ni
contadores útiles, no se pinta rail y la columna principal se centra — nunca una
caja con un título y nada debajo.
