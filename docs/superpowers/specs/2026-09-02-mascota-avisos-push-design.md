# Mascota fase 3: avisos push por racha y humor

> **[Histórico · congelado 2026-09-02]** Spec de diseño de la fase 3 de la mascota (#1014): la
> mascota escribe al usuario, una vez al día como mucho, cuando su racha está en peligro o cuando
> lleva días sin verle. Extiende la fase 1 (`2026-09-02-mascota-rpg-design.md`) y la 2
> (`2026-09-02-mascota-misiones-logros-design.md`). Explica el *porqué*; el estado de hoy manda en
> el código.

## Criterio

El de siempre: **espejo, no máquina de culpa**. Un aviso de la mascota es una nota corta que muere con
la pantalla: no se acumula en la campana, no se repite, no escala. Quien esconde a la compañera no
recibe nada. Y **todo lo que ya existe se reutiliza**: el despachador de push con sus preferencias y
su salud de dispositivos, el patrón «claim en SQL, envío en Node» y el pg_cron de los recordatorios
de club.

Decisiones del usuario (2026-09-02, brainstorming en terminal): alcance **racha en peligro + humor**
(misiones pendientes y subida de nivel fuera); hora fija **20:00 Europe/Madrid**; humor **solo en la
transición** (día 2 y día 4, nunca repetido); racha desde **3 días**; **categoría propia «mascota»**
en preferencias y **compañera oculta = sin push**; **solo push, sin fila en la campana**.

## 1. Qué avisa y cuándo

Tres tipos de aviso (`kind`), sobre la **actividad VIVIDA** — la misma definición que usan el humor,
los días activos y la RPC `get_companion_state()`: día de sesión ∪ cierre de un pase vivido ∪ post ∪
voto; el historial volcado no cuenta.

| `kind` | Condición a las 20:00 (día local D) | Cuerpo |
|---|---|---|
| `streak_at_risk` | sin actividad en D; racha de días consecutivos de actividad que termina en D−1 con longitud ≥ 3 | «Tu racha de {n} días se acaba a medianoche» |
| `mood_sleepy` | último día con actividad = D−2 (exactamente 2 días sin verle) | «Lleva dos días dormida. Un ratito y se despierta» |
| `mood_sad` | último día con actividad = D−4 | «Lleva cuatro días triste. Te echa de menos» |

Propiedades que salen de la tabla, sin lógica extra:

- **Excluyentes**: la racha exige actividad en D−1; el humor exige 2 o 4 días sin actividad. Nunca
  compiten.
- **Solo en transición**: a D−3 y D−5 no hay regla. Un usuario que sigue triste el día 10 no recibe
  nada más hasta que vuelva.
- **Máximo un push al día**: por construcción, y además por `unique (user_id, day)` en la tabla.
- Los umbrales (2, 4) son `BALANCE.mood.sleepyFrom` y `sadFrom`; el 3 de la racha es nuevo:
  `BALANCE.nudges.streakMin`. Igual que el `burstMin`, la función SQL los lleva **copiados** y el
  comentario dice dónde está el original.

Título del push: el **nombre de la mascota**. Ruta: `/mascota`. Sin imagen.

Quién es candidato, todo en la consulta del claim:

1. tiene `pet_state` y `companion_hidden = false`;
2. tiene al menos un `push_devices.enabled = true`;
3. `notification_preferences.category_pet` no está a `false` (sin fila = activa, como el resto).

El canal (web / Android) se decide después, en `sendPushToUsers`, con las preferencias por canal ya
existentes. La condición 3 se comprueba dos veces (claim y despachador): en el claim para no crear
filas fantasma, en el despachador porque es su contrato.

## 2. Datos

`supabase/migrations/20260906_pet_nudges.sql` (**dev primero, luego prod**):

- **`public.pet_nudges`**: `id`, `user_id` (FK `auth.users` cascade), `day` (date, día local
  Europe/Madrid del barrido), `kind` (text: `streak_at_risk` | `mood_sleepy` | `mood_sad`, CHECK),
  `streak` (int, null salvo racha), `created_at`. `unique (user_id, day)`. Es el **rastro y la
  idempotencia**: una fila = «hoy ya se le escribió». RLS activa: `select` propio para `authenticated`
  (ajustes y e2e); **sin** insert/update/delete para `authenticated` — solo escribe el claim
  (`security definer`). `revoke all … from anon, authenticated; grant select … to authenticated`.
- **`notification_preferences.category_pet boolean not null default true`**. La tabla tiene grant de
  tabla entera (no por columna): no hay grant nuevo que añadir, pero se pasa la superficie 6 de
  DRIFT-CHECK igualmente.
- **`private.pet_lived_activity_days(p_user uuid) returns table (day date)`**: la regla de historial
  de `get_companion_state()` (retroactivo, medianoche UTC, volcado ≥ 10) extraída a una función que
  devuelve los días con actividad vivida de un usuario dado, en Europe/Madrid.
  `security definer`, en `private`, sin `execute` para `anon`/`authenticated`: recibe un `user_id`
  arbitrario, así que no puede ser pública. `get_companion_state()` **no** se toca en esta fase
  (tiene `p_tz` y corre con la sesión); queda como issue unificar las dos si molesta mantener dos
  copias.
- **`public.claim_pet_nudges(p_day date) returns table (user_id uuid, name text, kind text,
  streak integer)`** (en `public`, no en `private`: PostgREST solo expone `public`, y `admin.rpc()`
  no llega a otro esquema — mismo motivo por el que `claim_due_event_reminders` vive en `public`): en una sola sentencia calcula, para cada candidato (§1), su último día vivido
  y su racha hasta `p_day − 1`, decide el `kind`, e inserta en `pet_nudges` con
  `on conflict (user_id, day) do nothing` devolviendo **solo las filas nuevas** (`returning`). Un
  segundo claim el mismo día devuelve cero filas. `security definer`, `set search_path = ''`,
  `execute` solo para `service_role` (revocada de `public`, `anon`, `authenticated`).
- **Programación**, en la misma migración, calcada de `20260824_club_event_reminder_scheduler.sql`:
  `private.dispatch_pet_nudges()` lee `app_base_url` y `cron_secret` de Vault (ya existen en dev y
  prod: **no hay secretos nuevos**) y hace `net.http_post` a `/api/cron/pet-nudges`; el job
  `pet-nudges` corre **cada hora** (`0 * * * *`) y la función **solo despacha si
  `extract(hour from timezone('Europe/Madrid', now())) = 20`**. pg_cron programa en UTC y el cambio
  de hora movería una hora fija; comprobar la hora local en la función lo evita sin tocar el job.

Ambas migraciones se añaden a `supabase/schema-baseline.sql` con el bloque completo (revisión de
#1046: un bloque sin la línea `create` deja el baseline sin replay).

## 3. Ruta y envío

`src/app/api/cron/pet-nudges/route.ts`, `POST`, copia de `event-reminders/route.ts`: 503 sin
`CRON_SECRET`, 401 si no casa (`timingSafeEqual`), nunca cacheada. Cuerpo del trabajo en
`src/lib/pet/nudges/deliver.ts` (módulo plano, recibe el cliente service-role):

1. El día lo decide SQL, no Node: `claim_pet_nudges(p_day date default
   (timezone('Europe/Madrid', now()))::date)`. La ruta corre en Vercel en UTC y `todayISO()` usa la
   zona de Node, así que la ruta **no calcula ningún día**; llama al claim sin argumentos.
2. `admin.rpc("claim_pet_nudges")` → filas nuevas `(user_id, name, kind, streak)`.
3. Por cada fila, `sendPushToUser(userId, content)` con `content = { category: "pet", type, title:
   name, body, path: "/mascota" }`. El título es el nombre de la mascota, así que no hay lote que
   compartir; son decenas de envíos, no miles.
4. Devuelve `{ claimed, sent }` y loguea solo recuentos, solo si `claimed > 0`.

Si el envío falla después del claim, la fila queda y **no se reintenta ese día**: un recordatorio de
racha a las 23:00 por un reintento es peor que ninguno. `sendPushToUsers` ya no lanza.

Copia en `src/lib/pet/nudges/copy.ts`: `petNudgeCopy(kind, streak, t)` → `{ title?, body }` con
claves `pet.nudges.streakAtRisk` («Tu racha de {n} días se acaba a medianoche»), `sleepy`, `sad`
en `messages/es.json`. Se resuelven con `getTranslations` en la ruta (locale único hoy).

## 4. Tipos y preferencias

- `PushCategory` gana `"pet"`; `ANDROID_CHANNEL_BY_CATEGORY.pet = "biblioshare_pet"` (los canales se
  crean en cliente con `createChannel`, que no falla si ya existe: no exige nueva build nativa para
  registrarlo, solo para que el teléfono lo conozca antes del primer push).
- `NotificationPreferences.category_pet`, `DEFAULT_PREFERENCES.category_pet = true`,
  `CATEGORY_COLUMN.pet = "category_pet"`, `ALLOWED_KEYS` de `preference-actions.ts`, y el `select`
  del despachador (`send-push.ts`) incluye la columna.
- `PushContent.type` pasa de `NotificationType` a `NotificationType | PetNudgeType`, con
  `PetNudgeType = "pet_streak_at_risk" | "pet_mood_sleepy" | "pet_mood_sad"` en
  `src/lib/pet/nudges/types.ts`. **No** entran en el enum `notification_type` de la BD ni en
  `NOTIFICATION_CATEGORY`/`NOTIFICATION_TYPE_KEY`: nunca se inserta una fila en `notifications`. El
  `type` viaja en el `data` del push (SW y FCM) solo como etiqueta; la ruta es lo que se usa.
- Ajustes: quinto interruptor en `notification-preferences.tsx` (`category_pet`, clave i18n
  `push.categoryPet` = «Mascota»), y bajo él la nota «Si escondes a la compañera, tampoco te
  escribe» (`push.categoryPetHint`).

## 5. Testing

- **Vitest**: `petNudgeCopy` (los tres tipos, el número de racha interpolado); `isPushAllowed` con
  `category: "pet"` y `category_pet: false`; `sanitize` de `preference-actions` acepta
  `category_pet`; la ruta responde 503 sin secreto y 401 con secreto malo (mismo test que la de
  recordatorios); `deliverPetNudges` con un cliente de mentira: claim vacío → no envía; dos filas →
  dos envíos con el título = nombre y el cuerpo según `kind`.
- **SQL en dev** (`execute_sql`, un usuario de prueba, sembrando `progress_sessions`): racha de 3
  días hasta ayer y nada hoy → una fila `streak_at_risk` con `streak = 3`; racha de 2 → nada; última
  actividad hace 2 días → `mood_sleepy`; hace 3 → nada; hace 4 → `mood_sad`; volver a llamar el mismo
  día → 0 filas; con `companion_hidden = true` → nada; sin dispositivo activo → nada; con
  `category_pet = false` → nada; un pase cerrado hace 2 días pero **retroactivo** (`finished_on <`
  día de alta) no cuenta como actividad. Los resultados se pegan en la PR.
- **E2E** (`e2e/ajustes-push.spec.ts` o el existente de ajustes): el interruptor «Mascota» persiste
  en `notification_preferences.category_pet` (comprobación por API). El barrido no se prueba en e2e:
  no es accionable desde el navegador.
- **Prod**: aplicar la migración, comprobar `cron.job` con `jobname = 'pet-nudges'`, y a las 20:00
  del primer día mirar `pet_nudges` y el log de la ruta.

## 6. Fuera de fase 3

Cada línea, una issue al cerrar esta spec:

- Misiones pendientes como aviso (descartado por ruido: se solapa con la racha).
- Subida de nivel detectada en el barrido (#1020): exige derivar XP de todos los usuarios cada día.
- Hora del aviso configurable por usuario.
- Unificar `private.pet_lived_activity_days` y la regla de `get_companion_state()` en una sola
  función SQL (dos copias hoy).
- Repetir el aviso de humor pasados N días más (descartado a propósito: máquina de culpa).
