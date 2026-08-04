# Seguimiento de eventos de club — diseño

> [Histórico · congelado el 2026-08-04]

Un miembro puede **seguir** un evento del club para declarar interés, ver quién más lo sigue y
recibir un recordatorio antes de que empiece. Trae consigo lo que hoy falta para que eso tenga
sentido: el evento gana hora, zona horaria, ubicación, modalidad y estado; gana una **ficha
propia**; y el repo gana su **primer trabajo programado**.

---

## 1. Comportamiento actual (verificado contra el código el 2026-08-04)

Un evento es el más delgado de los cinco `kind` de `club_activities`:

| Qué | Dónde | Estado hoy |
|---|---|---|
| Datos | `club_activities` con `kind='evento'` | `title`, `description`, `starts_on` **`date`** (sin hora). `ends_on` se ignora a propósito |
| Ficha | `kinds/evento.ts` → `hasDetailView: false` | `/club/[slug]/actividad/[id]` hace `notFound()` para eventos |
| Calendario | `calendar-marks.ts` | La marca del evento sale con `href: null`, con el comentario *«un evento nunca enlaza: no tiene página propia y el `<Link>` daría 404»* |
| Agenda | `agenda-list.tsx` | Envuelve la fila en `<div>` en vez de `<Link>` cuando `href` es null: **el evento es la única fila muerta de la agenda** |
| Escritura | `create_club_event` / `update_club_event` (RPC) | `club_activities` no tiene política `UPDATE` (SD-8): toda escritura va por RPC `SECURITY DEFINER` con `has_min_club_role(…, 'moderator')` |
| Avisos | `notifyClub(… 'club_event_created')` | Al crear se avisa al club; **al editar no se avisa a nadie** (decisión consciente: «avisar de cada corrección de errata sería ruido») |
| Interés | — | **No existe.** Un evento no tiene participantes, ni asistentes, ni seguidores |

Dos consecuencias que esta spec cambia: el evento es un texto en una rejilla en el que no se
puede entrar, y nadie se enterará de que llega salvo que abra el calendario por su cuenta.

**Sobre §19 (seguir ≠ asistir ≠ organizar):** no hay nada que integrar ni preservar. `evento` es
el único `kind` sin `club_activity_participants`, así que no existe RSVP con el que confundirse.
Quedan dos conceptos, no tres: **organizar** (`created_by`, ya existente) y **seguir** (nuevo).
Si algún día se añade asistencia confirmada, entra como tabla propia sin tocar esta.

---

## 2. Decisión de plataforma: el planificador (cierra el bloqueo de #394)

Es la decisión que condiciona todo lo demás, y el repo ya la tenía pendiente. Issue **#394**
la dejó escrita: no hay cron ni `vercel.json`, montarlo «es una decisión de plataforma con
alcance propio», y **prohíbe expresamente resolverlo «escribiendo al renderizar»** (materializar
el aviso cuando alguien carga la página) porque convierte un GET en escritura, rompe el cacheo
de RSC y hace que el aviso dependa de que otro entre antes.

Verificado el 2026-08-04:

- No hay `vercel.json` ni `vercel.ts`, ni Edge Functions (`list_edge_functions` → `[]`).
- `pg_cron` 1.6.4 y `pg_net` 0.20.3 están **disponibles y sin instalar** en el proyecto.
- La cuenta de Vercel es **Hobby**, donde Cron corre **una vez al día y a una hora no
  garantizada** — incompatible con un recordatorio «15 minutos antes».

**Mecanismo elegido: `pg_cron` + `pg_net` → `POST /api/cron/event-reminders`.**

```
pg_cron (cada 5 min)  ──▶  private.dispatch_event_reminders()   [SQL]
                                    │ pg_net.http_post con cabecera secreta
                                    ▼
                           POST /api/cron/event-reminders        [Node, en Vercel]
                                    │ drena los recordatorios vencidos
                                    ▼
                       notifyMany() + sendPushToUsers()          [lo que YA existe]
```

Por qué así y no de otra forma:

- **Granularidad de minutos** en el plan gratuito de Supabase, que es lo que exige el selector
  de §9.2 («15 minutos antes» con Vercel Hobby es imposible).
- **No duplica el sistema de notificaciones** (§25). El trabajo programado no escribe en
  `notifications` por su cuenta: llama al mismo `notifyMany` que usan el muro y las actividades,
  y por tanto hereda gratis el filtro de bloqueos, la inserción multi-fila y el push en lote.
- **El push necesita Node.** Firmar VAPID es `web-push`, no SQL: una variante «solo `pg_cron`»
  llenaría la campana y no enviaría ningún push. Por eso el salto a HTTP.
- La ventana de 5 minutos es el **único error de puntualidad** del sistema, y es explícito: un
  recordatorio se entrega entre 0 y 5 minutos después de su momento teórico, nunca antes.

El secreto viaja en cabecera (`x-cron-secret`, comparado en tiempo constante) y se guarda en
**Supabase Vault** del lado SQL y en `CRON_SECRET` del lado Vercel. Sin cabecera válida la ruta
responde 401 y no lee nada. La ruta es `POST` y `dynamic = "force-dynamic"`: nunca se cachea.

Esto **no cierra #394** (el aviso de turno de ronda sigue por construir), pero le retira el
bloqueo: el mecanismo queda montado y documentado, y §7.17 puede colgarse del mismo job.

---

## 3. Modelo de datos

### 3.1 El evento gana los campos que la ficha necesita

Columnas nuevas en `club_activities`, todas nullable y con sentido **solo** cuando
`kind='evento'` (SD-8 sigue vigente: el evento es un `kind`, no una tabla aparte):

| Columna | Tipo | Para qué |
|---|---|---|
| `starts_at` | `timestamptz` | El instante real. Es la única fuente para programar recordatorios |
| `ends_at` | `timestamptz` | Fin opcional. Decide «en curso» vs «finalizado» |
| `event_timezone` | `text` NOT NULL DEFAULT `'Europe/Madrid'` | Nombre IANA. Sin él no se puede pintar «18:00» ni sobrevivir a un cambio de horario |
| `location` | `text` | Ubicación física (≤ 200) |
| `modality` | `event_modality` | `presencial` · `online` · `hibrida` |
| `online_url` | `text` | Enlace de acceso (≤ 500). Solo se sirve a miembros |
| `event_state` | `club_event_state` NOT NULL DEFAULT `'programado'` | `programado` · `cancelado` · `pospuesto` |
| `updated_at` | `timestamptz` | «Última actualización» de §7. Lo pone un trigger, no el cliente |

**«En curso» y «finalizado» NO se guardan.** Se derivan del reloj (`starts_at`, `ends_at`)
en una función pura compartida por servidor y cliente. Un estado que se guarda es un estado que
hay que mantener sincronizado, y `group-activities.ts` ya dejó escrita esa lección en este mismo
módulo. Solo se persisten los tres estados que **una persona declara**: programado, cancelado,
pospuesto.

### 3.2 Compatibilidad de `starts_on`: un trigger, no una columna generada

`starts_on` **se queda**, porque de él cuelgan el calendario, `group-activities`, la tira
«Próximo» del feed y los dos eventos que ya existen en producción. Lo mantiene un trigger:

```sql
new.starts_on := (new.starts_at AT TIME ZONE new.event_timezone)::date;
```

No es una columna generada porque no puede serlo: `timezone(text, timestamptz)` es `STABLE`, no
`IMMUTABLE` (depende de la base de datos de zonas), y Postgres rechaza una `GENERATED` que la
invoque. El trigger consigue lo mismo —divergencia estructuralmente imposible, sea quien sea
quien escriba— y deja intactos **todos** los lectores actuales: ni una consulta del calendario
cambia.

*Backfill:* los 2 eventos de producción y los de dev reciben `starts_at = starts_on` a las
**19:00 `Europe/Madrid`**. Es una hora inventada, y se asume a la vista: un evento creado cuando
el modelo no tenía hora no la tiene, y 19:00 es la que menos sorprende para un club de lectura.
La alternativa (dejar `starts_at` null en los antiguos) obligaría a que toda la feature tratara
un evento sin instante como caso especial permanente.

### 3.3 La tabla de seguimiento

```sql
create table public.club_event_followers (
  activity_id            uuid not null references public.club_activities(id) on delete cascade,
  user_id                uuid not null references auth.users(id)             on delete cascade,
  followed_at            timestamptz not null default now(),
  remind_minutes_before  integer,      -- null = sin recordatorio
  reminder_due_at        timestamptz,  -- derivado; null = nada que entregar
  reminded_at            timestamptz,  -- sello de entrega: la idempotencia
  primary key (activity_id, user_id)
);
```

- La **PK compuesta es la restricción única** de §13 («un usuario solo sigue una vez») *y* el
  índice de «seguidores de este evento». Una columna `id` sintética añadiría una unique aparte
  para no ganar nada.
- `create index … on club_event_followers (user_id, activity_id)` — «eventos que sigue esta
  persona» (§16).
- `create index … on club_event_followers (reminder_due_at) where reminded_at is null` — el
  barrido del cron.
- Borrado: `on delete cascade` por los dos lados. Evento borrado, club borrado (cascada hasta
  `club_activities`) o cuenta borrada ⇒ **cero recordatorios huérfanos**, sin código.

**`reminder_due_at` es la única desnormalización, y tiene justificación (§13).** El barrido corre
cada 5 minutos sobre todos los clubes; con el instante precalculado es un `where reminder_due_at
<= now() and reminded_at is null` que usa el índice parcial. Calculando `starts_at - interval` por
fila en cada barrido no hay índice posible. No puede derivar, porque no lo escribe nadie a mano:
lo recalcula un trigger a partir de `(starts_at, event_timezone, event_state, remind_minutes_before)`.

### 3.4 Coherencia seguimiento ↔ recordatorio (§21)

La estrategia es **una sola**: *el recordatorio es un campo derivado de la fila de seguimiento,
mantenido por triggers en la misma transacción que la escritura que lo provoca.* No hay cola, ni
compensación, ni proceso de reconciliación — porque no hay dos escrituras que puedan quedar
desparejadas.

De ahí salen, sin código adicional, las garantías que pide §21:

| Situación a evitar | Por qué no puede pasar |
|---|---|
| Seguidor sin recordatorio registrado | El trigger `before insert` calcula `reminder_due_at` en la misma fila. Es un campo, no otra escritura |
| Recordatorio de quien ya no sigue | El recordatorio **es** la fila de seguimiento. Al dejar de seguir se borra la fila |
| Recordatorio de un evento cancelado | Trigger sobre `club_activities`: `event_state <> 'programado'` ⇒ `reminder_due_at = null` a todos sus seguidores |
| Notificaciones repetidas | `reminded_at` se sella al entregar; el barrido exige `reminded_at is null` |
| Contador distinto de la lista | El contador es `count(*)` de la misma consulta que la lista, en la misma respuesta. Nunca una columna `followers_count` |
| «Siguiendo» con el backend caído | `useOptimisticAction` revierte solo: el estado real no cambió, así que el optimista vuelve al valor de servidor y `failed` pinta el error |

Cambio de fecha ⇒ el trigger recalcula `reminder_due_at` de **todos** los seguidores y pone
`reminded_at = null`, con lo que el recordatorio vuelve a estar armado para la fecha nueva. Es
deliberado que un cambio de fecha re-arme incluso un recordatorio ya entregado: quien recibió
«mañana a las 18:00» necesita saberlo cuando pase a ser el jueves.

### 3.5 Salir del club, ser expulsado, perder permisos

**Se invalida, no se borra.** El barrido y todas las lecturas hacen `join club_members` exigiendo
`status='active'`, así que dejar el club o ser expulsado detiene los recordatorios y saca a la
persona de la lista de seguidores **en un solo sitio**, sin triggers sobre la membresía. Si
vuelve al club, su interés sigue ahí. Una fila de seguimiento sin membresía activa es inerte.

### 3.6 RLS y grants

- `select`: miembros activos del club del evento (mismo gate que el calendario).
- **Sin política `insert`/`update`/`delete`**: se escribe solo por RPC `SECURITY DEFINER`, igual
  que el resto del motor de actividades (SD-8).
- Las columnas nuevas de `club_activities` necesitan su **grant por columna**: esta tabla tiene
  grant fino y una columna sin grant rompe la escritura **entera** de la tabla, no solo el campo
  nuevo (issue #375, ha pasado dos veces). Se corre la superficie 6 de `DRIFT-CHECK.md`.

---

## 4. API: cuatro RPC y un barrido

Todo por RPC `SECURITY DEFINER`, que valida en servidor **membresía activa + visibilidad del
evento** antes de tocar nada (§11: ocultar el botón no es autorización).

| RPC | Contrato |
|---|---|
| `follow_club_event(p_activity_id, p_remind_minutes_before)` | `insert … on conflict (activity_id, user_id) do update` ⇒ **idempotente y a prueba de carrera**: dos peticiones simultáneas dejan una fila, no un 23505 en la cara del usuario. Rechaza evento inexistente, no-evento, club ajeno, membresía no activa y evento ya finalizado |
| `unfollow_club_event(p_activity_id)` | `delete` — idempotente por naturaleza: borrar lo que no está no es un error |
| `set_club_event_reminder(p_activity_id, p_remind_minutes_before)` | Cambia la preferencia; el trigger recalcula. Exige seguir ya el evento |
| `set_club_event_state(p_activity_id, p_state)` | Cancelar / posponer / reprogramar. Moderador+. Dispara el aviso a los seguidores |

`update_club_event` se amplía con los campos nuevos y **valida en SQL**: `starts_at` se construye
como `(fecha || ' ' || hora)::timestamp AT TIME ZONE p_timezone`, nunca lo envía el cliente ya
resuelto. Así cambiar la zona horaria mueve el instante correctamente y el horario de verano lo
resuelve la base de datos de zonas, no aritmética nuestra. Es el mismo principio que ya usa
`club_rounds` (turno y periodo en SQL, `Europe/Madrid`).

Lecturas (§14): `getClubEvent` (ficha), `getEventFollowers` (**paginada**, 24 por página, con
`count: 'exact'` en la misma consulta para que contador y lista no puedan discrepar),
`getFollowedEvents` (§16). Ninguna N+1: los perfiles de los seguidores salen en **una** consulta
sobre `profile_identities` con `in (…)`, el patrón que ya usa `resolveTargetHrefs`.

Códigos de error en `snake_case` (`not_found`, `not_an_event`, `forbidden`, `not_a_member`,
`event_finished`, `not_following`, `invalid_reminder`), como exigió #133 — y **nunca lanzados
desde la server action**: Next.js borra el mensaje de un `Error` de server action al compilar
producción, así que las acciones devuelven un **resultado discriminado** (`{ ok: true } | { ok:
false, code }`) y la UI traduce el código.

### El barrido

`POST /api/cron/event-reminders`, autenticado por cabecera secreta:

1. Selecciona los vencidos: `reminder_due_at <= now()`, `reminded_at is null`,
   `event_state = 'programado'`, membresía activa, y **el evento no ha terminado**
   (`coalesce(ends_at, starts_at) > now()`) — §9.1: nunca se recuerda algo ya pasado.
2. Agrupa por evento y llama a `notifyMany` **una vez por evento** (no por seguidor).
3. Sella `reminded_at = now()` para las filas entregadas.
4. Devuelve un recuento por métrica (§22) y registra fallos con `console.error`.

Sella **después** de entregar: si el proceso muere a medias, el peor caso es que un recordatorio
se repita en el barrido siguiente, no que se pierda. Ante la duda, ruido antes que silencio.

### La notificación

Tres valores nuevos de `notification_type`: `club_event_reminder`, `club_event_updated`,
`club_event_cancelled`. Dos ajustes en el sistema existente, ambos mínimos y opcionales:

- `notifications.actor_id` es `NOT NULL` y un recordatorio no tiene actor humano ⇒ **el actor es
  el organizador** (`created_by`). No se hace nullable una columna del núcleo por esto: obligaría
  a auditar cada lector de la campana, del push y del feed.
- Como consecuencia, `notifyMany` excluye al actor de su propio fan-out — y el organizador **sí**
  debe recibir el recordatorio de su evento (§18). Se le añaden dos parámetros opcionales:
  `includeActor` y `pushBody`. Ambos por defecto se comportan como hoy, así que ningún llamante
  existente cambia.
- `resolveTargetHrefs` deja de mandar `club_event` a la ficha del club: ahora enlaza a
  `/club/[slug]/evento/[id]`, de modo que **la notificación abre el detalle correcto**.

Cuerpo del push (§9.3), sin datos privados en pantalla bloqueada — el `online_url` **nunca** va
en la notificación:

> «Evento mañana: *Entrenamiento de verano*, del Club Horizonte, comienza a las 18:00.»

El tiempo restante se calcula en el momento de entregar, contra `starts_at`, así que es el mismo
para todos los que se entregan en ese barrido: un payload por evento, no uno por persona.

---

## 5. Frontend

### 5.1 Ficha del evento — `/club/[slug]/evento/[id]`

Ruta **propia**, no `hasDetailView: true`. `ActivityDetailView` está construido alrededor del pool
de ítems, los participantes y las opiniones, y un evento no tiene ninguna de las tres: reutilizarlo
sería vaciar tres secciones. `hasDetailView` sigue siendo `false` porque sigue siendo cierto —
describe la ruta *genérica* de actividad — y su comentario se corrige para decir dónde vive la ficha.

Gates, en este orden (idéntico al del calendario y la actividad): sin sesión ⇒ `redirect(loginHref(…))`;
club inexistente o `viewerRole` null ⇒ `notFound()`; actividad de otro club, inexistente o de otro
`kind` ⇒ `notFound()`. Un club privado no filtra sus fechas por URL, y `viewerRole` es null también
para `invited`/`requested`, no solo para extraños. `generateMetadata` da título propio.

Dentro del `ClubShell`, con el rail lateral del club: cabecera con estado y fecha larga, después
descripción, ubicación/modalidad, organizador, y el rail con la acción de seguir, el selector de
recordatorio y los seguidores.

### 5.2 El botón

Estados de §15: no seguido · siguiendo · guardando · error · deshabilitado (finalizado o
cancelado). Sobre `useOptimisticAction` con un reducer puro y testeado, exactamente como
`follow-button.tsx`: el cambio se pinta al instante, `revalidateClubPages()` reconcilia debajo, y
en error el estado real no cambió ⇒ el optimista revierte solo y `failed` pinta el mensaje. El
`disabled={isPending}` es lo que impide la doble pulsación; y aunque se colara, la RPC es
idempotente.

### 5.3 Seguidores

Hasta 8 avatares apilados + total; el resto tras «Ver todos», en un panel con la lista paginada.
Orden estable: **tú primero**, después organizador, después por `followed_at`. Nombre y avatar y
nada más — ni correo, ni teléfono (§8). Enlace al perfil solo si ese perfil es alcanzable. Sin
seguidores ⇒ `EmptyState` que invita a ser el primero.

### 5.4 Calendario

- La fila de la agenda **enlaza** (todo el bloque, como ya hace cuando `href` no es null): es el
  patrón que la agenda ya tiene, no un patrón nuevo. El enlace lleva `?mes=` y el scroll actual,
  así que volver devuelve el calendario donde estaba.
- El control «Seguir» de la fila es un `<button>` **hermano** del enlace, no anidado: un botón
  dentro de un `<a>` es HTML inválido y rompe el teclado.
- Marca de seguido: icono de campana + `aria-label` «Evento seguido», **no solo color** (§17), en
  rejilla y en leyenda.
- Conmutador «Todo / Sigues» sobre la agenda (§16): próximos primero, finalizados al final y
  colapsados, con acción rápida de dejar de seguir.

### 5.5 Fechas en pantalla

`Intl.DateTimeFormat` con la `timeZone` del evento. Se muestra la zona **siempre que difiera de
la del navegador** — así un club con miembros en Canarias y en Madrid no lee la misma línea de dos
formas. Nunca se compara con `<` sobre cadenas de fecha-hora, y no entra ningún
`new Date("2026-08-04T…")` sobre texto de la base de datos sin zona: la trampa que
`calendar-marks.ts` ya documenta.

---

## 6. Pruebas

- **Unitarias (Vitest):** `reminderDueAt` (cada offset, evento pasado, «muy próximo», sin
  recordatorio), estado derivado (programado/en curso/finalizado/cancelado/pospuesto en los
  bordes exactos), **cambio de horario de verano** (un evento el 2026-10-25 en `Europe/Madrid`),
  cruce de medianoche, reducer optimista, validación de entrada.
- **Backend (contra dev):** seguir, dejar de seguir, doble seguimiento concurrente, no-miembro,
  expulsado, evento de club ajeno, paginación, cancelación y reprogramación de recordatorios,
  limpieza en cascada al borrar evento y club.
- **E2E (Playwright):** el flujo de §23 completo —calendario → agenda → detalle → seguir →
  aparecer como seguidor → recargar y seguir estando → cambiar recordatorio → dejar de seguir →
  desaparecer—, más usuario sin permisos, evento cancelado y viewport móvil. Con club desechable
  creado por el propio spec, el patrón de `club-ronda.spec.ts`.

## 7. Migración

Dev primero, verificar, después producción (regla del README). Una migración, en este orden:
enums → columnas → backfill de `starts_at` → triggers → tabla + índices + RLS + **grants por
columna** → RPCs → `pg_cron`/`pg_net` y el job. Reversible: las columnas son nullable con default,
la tabla es nueva, y el job se retira con `cron.unschedule`. `starts_on` no se toca en ningún paso,
así que el bundle anterior sigue funcionando durante el despliegue.

Orden de despliegue: **migración primero, merge después** — la lección de #393, donde
`RoundBlock` tumbó la página de todos los clubes por invertirlo.

## 8. Criterios de aceptación → dónde se cumplen

| Criterio (§27) | Dónde |
|---|---|
| Seguir / dejar de seguir, sin duplicados, persistente | §4 RPC + §3.3 PK |
| Calendario identifica lo seguido; la leyenda abre el detalle; teclado | §5.4 |
| Ficha completa con seguidores y contador coherente | §5.1, §5.3, §4 |
| Permisos y privacidad en backend | §3.5, §3.6, §4 |
| Recordatorio se programa, se cambia, se cancela, se reprograma | §3.4 |
| Nada se recuerda de un evento finalizado | §4 barrido, paso 1 |
| La notificación abre el detalle correcto | §4 `resolveTargetHrefs` |
| Zonas horarias y horario de verano | §3.1, §4, §5.5 |
| Estados de carga, vacío, error, cancelado, finalizado | §5.2, §5.3 |

## 9. Fuera de alcance (y por qué)

- **Portada e imagen del evento** y **categoría/tipo**: decidido con el usuario el 2026-08-04.
  No hay bucket ni taxonomía de eventos, y `title`/`description` cubren el hueco. §7 los pide
  «cuando los datos estén disponibles»: no lo están.
- **Enlace a mapa**: §7 lo condiciona a «cuando el proyecto ya tenga soporte para ello». No lo
  tiene; `location` es texto.
- **Varios recordatorios simultáneos** por seguidor: §9.2 lo deja opcional («si la arquitectura
  lo soporta de forma limpia»). Uno configurable entre seis opciones cubre el requisito con un
  campo en vez de una tabla y un fan-out.
- **Página personal multi-club de eventos seguidos**: la navegación principal es un set fijo de
  cinco destinos y una sexta entrada sería la «navegación artificial» que §16 prohíbe. El listado
  vive en el calendario del club, uno de los sitios que §16 admite.
- **Aviso de turno de ronda (#394)**: sigue abierto. Esta spec le retira el bloqueo montando el
  planificador, pero no construye su aviso.
