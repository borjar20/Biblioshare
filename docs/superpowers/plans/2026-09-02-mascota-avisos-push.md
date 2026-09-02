# Mascota fase 3: avisos push por racha y humor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La mascota manda, como mucho, un push al día: «tu racha se acaba a medianoche» (racha ≥ 3 hasta ayer y nada hoy) o «lleva N días dormida/triste» (exactamente 2 / 4 días sin actividad vivida). Sin campana, respetando una categoría nueva «Mascota» y la compañera oculta.

**Architecture:** Claim en SQL (`public.claim_pet_nudges`, security definer, solo service_role) que calcula candidatos, decide el tipo e inserta en `pet_nudges` devolviendo solo filas nuevas; pg_cron cada hora llama a `private.dispatch_pet_nudges()`, que solo a las 20:00 Europe/Madrid hace `net.http_post` a `/api/cron/pet-nudges`; la ruta (Node) llama al claim y envía con `sendPushToUser` (categoría `pet`). Calcado del cron de recordatorios de club (`20260824_club_event_reminder_scheduler.sql`, `src/app/api/cron/event-reminders/route.ts`).

**Tech Stack:** Next.js 16 App Router (route handler), Supabase (Postgres, pg_cron, pg_net, Vault), TypeScript, Vitest, Playwright, next-intl (`getTranslations` de `next-intl/server`).

Spec: `docs/superpowers/specs/2026-09-02-mascota-avisos-push-design.md`. Rama: `feat/mascota-push` desde `main`.

## Global Constraints

- **Actividad VIVIDA**, misma regla que `get_companion_state()` (`supabase/migrations/20260905_get_companion_state.sql`): día de sesión ∪ `finished_on` de pase vivido ∪ post ∪ voto; pase historial = `finished_on < día de alta` ∨ `created_at` medianoche UTC exacta ∨ día de alta con ≥ 10 pases. Días en **Europe/Madrid**.
- Tipos exactos: `kind ∈ { 'streak_at_risk', 'mood_sleepy', 'mood_sad' }`. Racha mínima **3**. Humor a **exactamente** 2 y 4 días sin actividad (`BALANCE.mood.sleepyFrom` / `sadFrom`).
- **Un push al día por usuario**: `unique (user_id, day)` en `pet_nudges`. Sin fila en `notifications`, nunca.
- Candidato: `pet_state.companion_hidden = false` ∧ algún `push_devices.enabled = true` ∧ `notification_preferences.category_pet` no es `false` (sin fila = activa).
- Push: `category: "pet"`, `title` = nombre de la mascota, `path: "/mascota"`, canal Android `biblioshare_pet`. Tipos `pet_streak_at_risk` | `pet_mood_sleepy` | `pet_mood_sad` **fuera** del enum `notification_type` de la BD y fuera de `NOTIFICATION_CATEGORY` / `NOTIFICATION_TYPE_KEY`.
- Cron: job `pet-nudges`, `0 * * * *`; despacha solo si `extract(hour from timezone('Europe/Madrid', now())) = 20`. Secretos de Vault ya existentes: `app_base_url`, `cron_secret`. Ruta: 503 sin `CRON_SECRET`, 401 si no casa (`timingSafeEqual`), `POST`.
- El día del barrido lo decide SQL (`p_day default (timezone('Europe/Madrid', now()))::date`); la ruta no calcula fechas. **Nunca** `.slice(0,10)` sobre un timestamptz.
- Migraciones: **dev primero** (`supabase-dev`), prod la aplica el controlador tras el merge (Task 6). Bloque **completo** en `supabase/schema-baseline.sql` (con la línea `create`). Tras añadir la columna `category_pet`: superficie 6 de `docs/DRIFT-CHECK.md`.
- Sin `use cache` en nada de esto. Copia en `messages/es.json`. Commits con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4`.

---

### Task 1: Categoría `pet` en tipos, preferencias, despachador y ajustes

**Files:**
- Modify: `src/lib/push/types.ts` (`PushCategory`, `ANDROID_CHANNEL_BY_CATEGORY`, `PushContent.type`)
- Modify: `src/lib/push/preferences.ts` (`NotificationPreferences`, `DEFAULT_PREFERENCES`, `CATEGORY_COLUMN`)
- Modify: `src/lib/push/preference-actions.ts` (`ALLOWED_KEYS`, `select` de `loadMyPreferences`)
- Modify: `src/lib/push/send-push.ts` (el `select` de `notification_preferences`)
- Modify: `src/components/push/notification-preferences.tsx` (`CATEGORY_KEYS`, `CATEGORY_I18N`, nota bajo «Mascota»)
- Modify: `messages/es.json` (`push.categoryPet`, `push.categoryPetHint`)
- Modify: `src/lib/supabase/database.types.ts` (`notification_preferences` Row/Insert/Update: `category_pet`)
- Create: `src/lib/pet/nudges/types.ts`
- Test: `src/lib/push/preferences.test.ts`

**Interfaces:**
- Produces: `PetNudgeKind = "streak_at_risk" | "mood_sleepy" | "mood_sad"`, `PetNudgeType = "pet_streak_at_risk" | "pet_mood_sleepy" | "pet_mood_sad"`, `PET_NUDGE_TYPE: Record<PetNudgeKind, PetNudgeType>`, `isPetNudgeKind(v: unknown): v is PetNudgeKind` en `src/lib/pet/nudges/types.ts`. `PushCategory` incluye `"pet"`; `PushContent.type: NotificationType | PetNudgeType`; `NotificationPreferences.category_pet: boolean`.

- [ ] **Step 1: Test que falla**

Añadir a `src/lib/push/preferences.test.ts`:

```ts
describe("categoría pet (mascota fase 3)", () => {
  it("está activa por defecto y se apaga con category_pet=false", () => {
    expect(isPushAllowed(prefs(), "pet", "web_push")).toBe(true);
    expect(isPushAllowed(prefs({ category_pet: false }), "pet", "web_push")).toBe(false);
    expect(isPushAllowed(prefs({ category_pet: false }), "pet", "fcm_android")).toBe(false);
    // apagar la mascota no toca al resto
    expect(isPushAllowed(prefs({ category_pet: false }), "social", "web_push")).toBe(true);
  });
});
```

- [ ] **Step 2: Comprobar que falla**

Run: `npx vitest run src/lib/push/preferences.test.ts`
Expected: FAIL (tipo `"pet"` no es `PushCategory` / `category_pet` no existe).

- [ ] **Step 3: Tipos**

`src/lib/pet/nudges/types.ts`:

```ts
// Avisos push de la mascota (spec 2026-09-02-mascota-avisos-push §1 y §4).
// `kind` es lo que guarda pet_nudges y devuelve claim_pet_nudges(); el tipo de
// push es su etiqueta en el data payload (SW y FCM). NO entran en el enum
// notification_type: nunca se inserta una fila en `notifications`.
export const PET_NUDGE_KINDS = ["streak_at_risk", "mood_sleepy", "mood_sad"] as const;
export type PetNudgeKind = (typeof PET_NUDGE_KINDS)[number];

export type PetNudgeType = "pet_streak_at_risk" | "pet_mood_sleepy" | "pet_mood_sad";

export const PET_NUDGE_TYPE: Record<PetNudgeKind, PetNudgeType> = {
  streak_at_risk: "pet_streak_at_risk",
  mood_sleepy: "pet_mood_sleepy",
  mood_sad: "pet_mood_sad",
};

export function isPetNudgeKind(v: unknown): v is PetNudgeKind {
  return typeof v === "string" && (PET_NUDGE_KINDS as readonly string[]).includes(v);
}
```

`src/lib/push/types.ts`:
- `export type PushCategory = "social" | "clubs" | "progress" | "system" | "pet";` — y ampliar el comentario: «`pet` = avisos de la mascota (fase 3); no hay `NotificationType` que la produzca: llega por `PetNudgeType`».
- `PushContent`/`NotificationEvent.type`: `type: NotificationType | PetNudgeType;` con `import type { PetNudgeType } from "@/lib/pet/nudges/types";`.
- `ANDROID_CHANNEL_BY_CATEGORY`: añadir `pet: "biblioshare_pet",`.
- `NOTIFICATION_CATEGORY` **no cambia** (sigue siendo `Record<NotificationType, PushCategory>`).

Comprobar con `Grep` que nada más indexa por `PushCategory` como `Record<PushCategory, …>` sin el valor nuevo (p. ej. `src/lib/push/android.ts` recorre `ANDROID_CHANNEL_BY_CATEGORY`, que ya lo trae; si `messages/es.json` o el nativo tienen nombres de canal por categoría, añadir «Mascota»).

`src/lib/push/preferences.ts`: añadir `category_pet: boolean;` al tipo, `category_pet: true,` a `DEFAULT_PREFERENCES`, `pet: "category_pet",` a `CATEGORY_COLUMN`.

`src/lib/push/preference-actions.ts`: `"category_pet"` en `ALLOWED_KEYS`; el `select` de `loadMyPreferences` pasa a `"web_push_enabled, android_push_enabled, category_social, category_clubs, category_progress, category_system, category_pet"`.

`src/lib/push/send-push.ts`: mismo `select` con `category_pet` al final.

`src/lib/supabase/database.types.ts`: en `notification_preferences`, añadir `category_pet: boolean` (Row), `category_pet?: boolean` (Insert y Update), en orden alfabético con las demás `category_*`.

- [ ] **Step 4: Ajustes**

`src/components/push/notification-preferences.tsx`:
- `CATEGORY_KEYS`: añadir `"category_pet"` al final; `CATEGORY_I18N.category_pet = "categoryPet"`.
- Debajo del interruptor de `category_pet` (dentro del `map`, solo para esa clave) una línea de ayuda:

```tsx
{key === "category_pet" ? (
  <p className="text-xs text-muted-foreground">{t("categoryPetHint")}</p>
) : null}
```

(el `div` de la fila pasa a envolver `[fila, hint]`: cambiar el `div key={key}` por un `div key={key} className="flex flex-col gap-1"` que contenga el `div` de siempre y el `<p>`).

`messages/es.json`, sección `push`: `"categoryPet": "Mascota"`, `"categoryPetHint": "Tu racha en peligro y cuando lleve días sin verte. Si escondes a la compañera, tampoco te escribe."`.

- [ ] **Step 5: Verificar**

Run: `npx vitest run src/lib/push && npx tsc --noEmit -p . && npx eslint src/lib/push src/lib/pet/nudges src/components/push`
Expected: todo verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/push src/lib/pet/nudges/types.ts src/components/push/notification-preferences.tsx messages/es.json src/lib/supabase/database.types.ts
git commit -m "feat(push): categoría «Mascota» en preferencias y tipos de aviso de la mascota"
```

---

### Task 2: Migración `20260906_pet_nudges.sql` (tabla, columna, funciones, cron) aplicada y probada en dev

**Files:**
- Create: `supabase/migrations/20260906_pet_nudges.sql`
- Modify: `supabase/schema-baseline.sql` (bloque completo al final)
- Modify: `src/lib/supabase/database.types.ts` (tabla `pet_nudges`; función `claim_pet_nudges`)
- Modify: `src/lib/pet/balance.ts` (`nudges: { streakMin: 3 }`)

**Interfaces:**
- Produces: `public.claim_pet_nudges(p_day date default …) returns table (user_id uuid, name text, kind text, streak integer)`; tabla `public.pet_nudges (id, user_id, day, kind, streak, created_at)`; `private.pet_lived_activity_days(p_user uuid) returns table (day date)`; `private.dispatch_pet_nudges()`; job `pet-nudges`.

- [ ] **Step 1: `balance.ts`**

Tras el bloque `missions:` añadir:

```ts
  // Avisos push (spec fase 3): racha mínima para avisar de que se acaba. Los
  // umbrales de humor son mood.sleepyFrom / sadFrom. claim_pet_nudges()
  // (20260906) lleva los tres COPIADOS: si cambian aquí, cambia el SQL.
  nudges: { streakMin: 3 },
```

- [ ] **Step 2: La migración**

`supabase/migrations/20260906_pet_nudges.sql`:

```sql
-- Mascota fase 3: avisos push por racha y humor
-- (docs/superpowers/specs/2026-09-02-mascota-avisos-push-design.md).
--
-- Un push al día como mucho. Sin fila en `notifications`: el rastro y la
-- idempotencia son `pet_nudges` (unique user_id, day). Claim en SQL, envío en
-- Node (/api/cron/pet-nudges), calcado de 20260824_club_event_reminder_scheduler.

-- 1. Preferencia: categoría «Mascota». Grant de tabla entera (20260829): no hay
--    grant por columna que añadir, pero pasa la superficie 6 de DRIFT-CHECK.
alter table public.notification_preferences
  add column if not exists category_pet boolean not null default true;

comment on column public.notification_preferences.category_pet is
  'Avisos push de la mascota (racha en peligro, humor). Sin fila = activa.';

-- 2. Rastro de los avisos.
create table public.pet_nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Día LOCAL (Europe/Madrid) del barrido que lo decidió.
  day date not null,
  kind text not null check (kind in ('streak_at_risk', 'mood_sleepy', 'mood_sad')),
  -- Longitud de la racha en peligro; null en los de humor.
  streak integer,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

comment on table public.pet_nudges is
  'Mascota fase 3: un aviso push por usuario y día (racha en peligro o humor). Lo escribe SOLO claim_pet_nudges() (service_role). Ver spec 2026-09-02-mascota-avisos-push.';

alter table public.pet_nudges enable row level security;

create policy "pet_nudges select own" on public.pet_nudges
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.pet_nudges from anon, authenticated;
grant select on public.pet_nudges to authenticated;

-- 3. Días con actividad VIVIDA de un usuario dado. Misma regla que
--    get_companion_state() (20260905) y splitPassHistory (src/lib/pet/counts.ts):
--    historial = finished_on < día de alta, o created_at medianoche UTC exacta,
--    o día de alta con >= 10 pases (BALANCE.history.burstMin). Recibe un user_id
--    arbitrario: en `private` y sin execute para anon/authenticated.
create or replace function private.pet_lived_activity_days(p_user uuid)
returns table (day date)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select finished_on,
           created_at,
           (timezone('Europe/Madrid', created_at))::date as created_day
    from public.passes
    where user_id = p_user
  ),
  bursts as (
    select created_day from mine group by created_day having count(*) >= 10
  ),
  lived as (
    select finished_on as day
    from mine
    where finished_on is not null
      and finished_on >= created_day
      and created_at <> (date_trunc('day', created_at at time zone 'utc') at time zone 'utc')
      and created_day not in (select created_day from bursts)
  )
  select distinct d.day
  from (
    select session_date as day from public.progress_sessions where user_id = p_user
    union all
    select day from lived
    union all
    select (timezone('Europe/Madrid', created_at))::date from public.club_posts where author_id = p_user
    union all
    select (timezone('Europe/Madrid', voted_at))::date from public.club_poll_votes where user_id = p_user
  ) d
  where d.day is not null;
$$;

revoke all on function private.pet_lived_activity_days(uuid) from public, anon, authenticated;

-- 4. El claim. Para cada candidato (mascota visible, algún dispositivo push
--    activo, category_pet no apagada) calcula el último día vivido y la racha
--    que termina AYER, decide el tipo e inserta; devuelve SOLO las filas nuevas.
--    Un segundo claim el mismo día devuelve cero. Umbrales copiados de
--    src/lib/pet/balance.ts: streak >= 3 (nudges.streakMin), 2 = mood.sleepyFrom,
--    4 = mood.sadFrom.
--    En `public` (PostgREST solo expone public) pero solo service_role puede
--    ejecutarla, como claim_due_event_reminders.
create or replace function public.claim_pet_nudges(
  p_day date default (timezone('Europe/Madrid', now()))::date
)
returns table (user_id uuid, name text, kind text, streak integer)
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select p.user_id, p.name
    from public.pet_state p
    where p.companion_hidden = false
      and exists (
        select 1 from public.push_devices d
        where d.user_id = p.user_id and d.enabled = true
      )
      and coalesce(
        (select np.category_pet from public.notification_preferences np where np.user_id = p.user_id),
        true
      )
  ),
  activity as (
    select c.user_id, c.name, a.day
    from candidates c
    cross join lateral private.pet_lived_activity_days(c.user_id) a
  ),
  last_day as (
    select user_id, name, max(day) as last_day
    from activity
    group by user_id, name
  ),
  -- Racha que termina en p_day - 1: con los días en orden descendente y
  -- numerados desde 1, la fila n forma parte de la racha sii day + n = p_day
  -- (días distintos: el primer hueco rompe la igualdad para siempre).
  streaks as (
    select user_id, count(*) filter (where day + rn = p_day)::integer as streak
    from (
      select user_id, day,
             row_number() over (partition by user_id order by day desc)::integer as rn
      from activity
      where day < p_day
    ) x
    group by user_id
  ),
  decided as (
    select l.user_id, l.name,
      case
        when l.last_day = p_day - 1 and coalesce(s.streak, 0) >= 3 then 'streak_at_risk'
        when l.last_day = p_day - 2 then 'mood_sleepy'
        when l.last_day = p_day - 4 then 'mood_sad'
      end as kind,
      case when l.last_day = p_day - 1 and coalesce(s.streak, 0) >= 3 then s.streak end as streak
    from last_day l
    left join streaks s on s.user_id = l.user_id
  ),
  inserted as (
    insert into public.pet_nudges (user_id, day, kind, streak)
    select d.user_id, p_day, d.kind, d.streak
    from decided d
    where d.kind is not null
    on conflict (user_id, day) do nothing
    returning pet_nudges.user_id, pet_nudges.kind, pet_nudges.streak
  )
  select i.user_id, d.name, i.kind, i.streak
  from inserted i
  join decided d on d.user_id = i.user_id;
$$;

revoke all on function public.claim_pet_nudges(date) from public, anon, authenticated;
grant execute on function public.claim_pet_nudges(date) to service_role;

-- 5. Despacho: cada hora, pero solo actúa a las 20:00 de Europe/Madrid. pg_cron
--    programa en UTC y una hora fija se movería con el cambio de hora; mirar la
--    hora local aquí lo evita sin tocar el job. Mismos secretos de Vault que el
--    cron de recordatorios (app_base_url, cron_secret): no hay que crear nada.
create or replace function private.dispatch_pet_nudges()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if extract(hour from timezone('Europe/Madrid', now())) <> 20 then
    return;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret';

  if v_url is null or v_secret is null then
    raise warning 'dispatch_pet_nudges: faltan los secretos app_base_url/cron_secret en Vault; no se despacha nada';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/api/cron/pet-nudges',
    headers := jsonb_build_object(
                 'content-type', 'application/json',
                 'x-cron-secret', v_secret
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;

revoke all on function private.dispatch_pet_nudges() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'pet-nudges') then
    perform cron.unschedule('pet-nudges');
  end if;
  perform cron.schedule(
    'pet-nudges',
    '0 * * * *',
    $job$ select private.dispatch_pet_nudges(); $job$
  );
end $$;
```

- [ ] **Step 3: Aplicar en dev y verificar objetos**

Con `mcp__supabase-dev__apply_migration` (name `pet_nudges`, el SQL completo). Luego `mcp__supabase-dev__execute_sql`:

```sql
select
  (select count(*) from information_schema.columns where table_name = 'notification_preferences' and column_name = 'category_pet') as col,
  (select relrowsecurity from pg_class where relname = 'pet_nudges') as rls,
  (select count(*) from pg_policies where tablename = 'pet_nudges') as policies,
  (select count(*) from information_schema.column_privileges where table_name = 'pet_nudges' and grantee = 'authenticated' and privilege_type = 'INSERT') as auth_insert,
  (select has_function_privilege('authenticated', 'public.claim_pet_nudges(date)', 'execute')) as auth_claim,
  (select has_function_privilege('service_role', 'public.claim_pet_nudges(date)', 'execute')) as sr_claim,
  (select count(*) from cron.job where jobname = 'pet-nudges') as job;
```

Expected: `1 | true | 1 | 0 | false | true | 1`. Pegar el resultado en el informe.

- [ ] **Step 4: Probar el claim con datos sembrados**

Elegir un usuario de dev con `pet_state` (o crearlo: `insert into pet_state (user_id, name, class) values ('<uid>', 'Prueba', 'warrior')`) y asegurar `companion_hidden = false`, una fila en `push_devices` con `enabled = true` (si no tiene: `insert into push_devices (user_id, platform, endpoint, p256dh, auth) values ('<uid>', 'web_push', 'https://example.invalid/e', 'x', 'y')`) y sin fila o `category_pet = true` en `notification_preferences`. Anotar lo que se inserta para borrarlo al final. Trabajar con un `p_day` fijo, p. ej. `date '2026-09-10'`, y limpiar entre casos con `delete from pet_nudges where user_id = '<uid>'; delete from progress_sessions where user_id = '<uid>' and session_date between '2026-09-01' and '2026-09-10';`.

Casos (cada uno: sembrar, `select * from public.claim_pet_nudges(date '2026-09-10');`, anotar, limpiar):

| # | Siembra en `progress_sessions` (`user_id, pass_id, session_date, duration_minutes`; `pass_id` = un pase real del usuario) | Esperado |
|---|---|---|
| 1 | 09-07, 09-08, 09-09 | 1 fila `streak_at_risk`, `streak = 3` |
| 2 | 09-08, 09-09 | 0 filas |
| 3 | 09-07, 09-08, 09-09 y **09-10** | 0 filas (ya hubo actividad hoy) |
| 4 | 09-08 | 1 fila `mood_sleepy`, `streak null` |
| 5 | 09-07 | 0 filas |
| 6 | 09-06 | 1 fila `mood_sad` |
| 7 | caso 1 y repetir el claim sin limpiar | segunda llamada: 0 filas; `pet_nudges` tiene 1 fila |
| 8 | caso 1 con `update pet_state set companion_hidden = true` | 0 filas (restaurar después) |
| 9 | caso 1 con `update push_devices set enabled = false where user_id = …` | 0 filas (restaurar después) |
| 10 | caso 1 con `notification_preferences.category_pet = false` (upsert) | 0 filas (restaurar después) |
| 11 | sin sesiones; un pase con `status = 'completed'`, `finished_on = '2026-09-08'`, `created_at = '2026-09-10 10:00+02'` (retroactivo) | 0 filas: el historial no es actividad |

Pegar la tabla con los resultados reales en el informe. Dejar el usuario como estaba (borrar filas sembradas).

- [ ] **Step 5: Baseline y tipos**

Añadir al final de `supabase/schema-baseline.sql` una línea en blanco, `-- 20260906_pet_nudges` y **todo** el SQL de la migración (desde el primer `alter table`).

`src/lib/supabase/database.types.ts`:
- Tabla `pet_nudges` (en orden alfabético entre `pet_daily_missions` y `pet_state`), Row `{ id: string; user_id: string; day: string; kind: string; streak: number | null; created_at: string }`, Insert/Update con todo opcional salvo `user_id`, `day`, `kind` en Insert, `Relationships: []`.
- En `Functions`: `claim_pet_nudges: { Args: { p_day?: string }; Returns: { user_id: string; name: string; kind: string; streak: number | null }[] }` (orden alfabético, antes de `claim_due_event_reminders` si va antes alfabéticamente: `claim_due…` < `claim_pet…`).

Run: `npx tsc --noEmit -p .` → limpio.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260906_pet_nudges.sql supabase/schema-baseline.sql src/lib/supabase/database.types.ts src/lib/pet/balance.ts
git commit -m "feat(pet): tabla pet_nudges, claim_pet_nudges() y cron horario de avisos de la mascota"
```

---

### Task 3: Copia, entrega y ruta `/api/cron/pet-nudges`

**Files:**
- Create: `src/lib/pet/nudges/copy.ts`, `src/lib/pet/nudges/copy.test.ts`
- Create: `src/lib/pet/nudges/deliver.ts`, `src/lib/pet/nudges/deliver.test.ts`
- Create: `src/app/api/cron/pet-nudges/route.ts`, `src/app/api/cron/pet-nudges/route.test.ts`
- Modify: `messages/es.json` (`pet.nudges.*`)

**Interfaces:**
- Consumes: `PetNudgeKind`, `PET_NUDGE_TYPE` (Task 1); `claim_pet_nudges` (Task 2); `sendPushToUser(userId, content)` de `src/lib/push/send-push.ts`; `createServiceRoleClient()` de `src/lib/supabase/service-role.ts`.
- Produces: `petNudgeCopy(kind, streak, t): { body: string }`, `deliverPetNudges(admin, deps?): Promise<{ claimed: number; sent: number }>`.

- [ ] **Step 1: Copia — test**

`src/lib/pet/nudges/copy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { petNudgeCopy } from "./copy";

// t de mentira: devuelve la clave con los valores interpolados, para afirmar
// clave y argumentos sin cargar es.json.
const t = (key: string, values?: Record<string, string | number>) =>
  `${key}${values ? ":" + JSON.stringify(values) : ""}`;

describe("petNudgeCopy", () => {
  it("racha: clave streakAtRisk con el número de días", () => {
    expect(petNudgeCopy("streak_at_risk", 7, t)).toEqual({ body: 'nudges.streakAtRisk:{"n":7}' });
  });

  it("humor: sleepy y sad, sin argumentos", () => {
    expect(petNudgeCopy("mood_sleepy", null, t)).toEqual({ body: "nudges.sleepy" });
    expect(petNudgeCopy("mood_sad", null, t)).toEqual({ body: "nudges.sad" });
  });

  it("racha sin número (fila corrupta) cae a 0 en vez de reventar", () => {
    expect(petNudgeCopy("streak_at_risk", null, t)).toEqual({ body: 'nudges.streakAtRisk:{"n":0}' });
  });
});
```

- [ ] **Step 2: Copia — implementación**

`src/lib/pet/nudges/copy.ts`:

```ts
import type { PetNudgeKind } from "./types";

/** `t` es la de `getTranslations("pet")`: se inyecta para que esto sea puro. */
export type NudgeT = (key: string, values?: Record<string, string | number>) => string;

// Cuerpo del push (spec §3). El título es el nombre de la mascota y lo pone
// quien envía; aquí solo el cuerpo.
export function petNudgeCopy(kind: PetNudgeKind, streak: number | null, t: NudgeT): { body: string } {
  switch (kind) {
    case "streak_at_risk":
      return { body: t("nudges.streakAtRisk", { n: streak ?? 0 }) };
    case "mood_sleepy":
      return { body: t("nudges.sleepy") };
    case "mood_sad":
      return { body: t("nudges.sad") };
  }
}
```

`messages/es.json`, dentro de `pet` (junto a `missions`):

```json
"nudges": {
  "streakAtRisk": "Tu racha de {n} días se acaba a medianoche",
  "sleepy": "Lleva dos días dormida. Un ratito y se despierta",
  "sad": "Lleva cuatro días triste. Te echa de menos"
}
```

Run: `npx vitest run src/lib/pet/nudges/copy.test.ts` → PASS.

- [ ] **Step 3: Entrega — test**

`src/lib/pet/nudges/deliver.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { deliverPetNudges, type ClaimRow } from "./deliver";

const t = (key: string, values?: Record<string, string | number>) =>
  `${key}${values ? ":" + JSON.stringify(values) : ""}`;

function admin(rows: ClaimRow[] | null, error: { message: string } | null = null) {
  return { rpc: vi.fn(async () => ({ data: rows, error })) } as unknown as Parameters<typeof deliverPetNudges>[0];
}

describe("deliverPetNudges", () => {
  it("claim vacío: no envía nada", async () => {
    const send = vi.fn(async () => {});
    const report = await deliverPetNudges(admin([]), { send, t });
    expect(report).toEqual({ claimed: 0, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("una fila por usuario: título = nombre, cuerpo según kind, categoría pet, ruta /mascota", async () => {
    const send = vi.fn(async () => {});
    const rows: ClaimRow[] = [
      { user_id: "u1", name: "Nuez", kind: "streak_at_risk", streak: 5 },
      { user_id: "u2", name: "Bellota", kind: "mood_sad", streak: null },
    ];
    const report = await deliverPetNudges(admin(rows), { send, t });
    expect(report).toEqual({ claimed: 2, sent: 2 });
    expect(send).toHaveBeenCalledWith("u1", {
      category: "pet",
      type: "pet_streak_at_risk",
      title: "Nuez",
      body: 'nudges.streakAtRisk:{"n":5}',
      path: "/mascota",
    });
    expect(send).toHaveBeenCalledWith("u2", expect.objectContaining({ type: "pet_mood_sad", title: "Bellota", body: "nudges.sad" }));
  });

  it("un kind desconocido se salta y cuenta como reclamado pero no enviado", async () => {
    const send = vi.fn(async () => {});
    const report = await deliverPetNudges(admin([{ user_id: "u1", name: "Nuez", kind: "otro", streak: null }]), { send, t });
    expect(report).toEqual({ claimed: 1, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("si el claim falla, lanza (la ruta responde 500)", async () => {
    await expect(deliverPetNudges(admin(null, { message: "boom" }), { send: vi.fn(), t })).rejects.toBeTruthy();
  });

  it("un envío que revienta no impide los demás", async () => {
    const send = vi.fn(async (userId: string) => {
      if (userId === "u1") throw new Error("push down");
    });
    const rows: ClaimRow[] = [
      { user_id: "u1", name: "A", kind: "mood_sleepy", streak: null },
      { user_id: "u2", name: "B", kind: "mood_sleepy", streak: null },
    ];
    const report = await deliverPetNudges(admin(rows), { send, t });
    expect(report).toEqual({ claimed: 2, sent: 1 });
  });
});
```

- [ ] **Step 4: Entrega — implementación**

`src/lib/pet/nudges/deliver.ts`:

```ts
import { getTranslations } from "next-intl/server";
import { sendPushToUser } from "@/lib/push/send-push";
import type { PushContent } from "@/lib/push/types";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { petNudgeCopy, type NudgeT } from "./copy";
import { isPetNudgeKind, PET_NUDGE_TYPE } from "./types";

type AdminClient = ReturnType<typeof createServiceRoleClient>;

/** Fila que devuelve claim_pet_nudges() (20260906). */
export type ClaimRow = { user_id: string; name: string; kind: string; streak: number | null };

export type NudgeReport = { claimed: number; sent: number };

type Deps = {
  send?: (userId: string, content: PushContent) => Promise<void>;
  t?: NudgeT;
};

// Entrega de los avisos de la mascota (spec §3). Claim en SQL (decide el día,
// los candidatos y el tipo; inserta pet_nudges y devuelve SOLO lo nuevo) y un
// push por fila. Si un envío falla después del claim, la fila queda y NO se
// reintenta ese día: un «tu racha se acaba» a las 23:00 por reintento es peor
// que ninguno. Módulo plano (sin "use server"): lo llama la ruta del cron.
export async function deliverPetNudges(admin: AdminClient, deps: Deps = {}): Promise<NudgeReport> {
  const { data, error } = await admin.rpc("claim_pet_nudges");
  if (error) throw error;
  const rows = (data ?? []) as ClaimRow[];
  if (rows.length === 0) return { claimed: 0, sent: 0 };

  const send = deps.send ?? sendPushToUser;
  const t: NudgeT = deps.t ?? (await getTranslations("pet"));

  let sent = 0;
  for (const row of rows) {
    if (!isPetNudgeKind(row.kind)) {
      console.error("deliverPetNudges: kind desconocido", row.kind);
      continue;
    }
    const content: PushContent = {
      category: "pet",
      type: PET_NUDGE_TYPE[row.kind],
      title: row.name,
      ...petNudgeCopy(row.kind, row.streak, t),
      path: "/mascota",
    };
    try {
      await send(row.user_id, content);
      sent += 1;
    } catch (e) {
      // sendPushToUser no lanza; esto cubre un `send` inyectado o un fallo raro.
      console.error("deliverPetNudges: envío fallido", e);
    }
  }
  return { claimed: rows.length, sent };
}
```

Si `getTranslations` no encaja con `NudgeT` por tipos (la firma de next-intl es genérica), envolverla: `const tr = await getTranslations("pet"); const t: NudgeT = (key, values) => tr(key as never, values as never);`.

Run: `npx vitest run src/lib/pet/nudges` → PASS. Si Vitest se queja de `next-intl/server` en el import, añadir al principio del test `vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }))` (los tests inyectan `t`).

- [ ] **Step 5: Ruta — test**

`src/app/api/cron/pet-nudges/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pet/nudges/deliver", () => ({ deliverPetNudges: vi.fn(async () => ({ claimed: 0, sent: 0 })) }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({}) }));

import { POST } from "./route";

describe("POST /api/cron/pet-nudges", () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
  });
  afterEach(() => {
    process.env.CRON_SECRET = original;
  });

  it("503 sin CRON_SECRET configurado", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(new Request("http://x/api/cron/pet-nudges", { method: "POST" }));
    expect(res.status).toBe(503);
  });

  it("401 con secreto que no casa", async () => {
    const res = await POST(new Request("http://x/api/cron/pet-nudges", { method: "POST", headers: { "x-cron-secret": "nope" } }));
    expect(res.status).toBe(401);
  });

  it("200 con el informe cuando el secreto casa", async () => {
    const res = await POST(new Request("http://x/api/cron/pet-nudges", { method: "POST", headers: { "x-cron-secret": "s3cret" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ claimed: 0, sent: 0 });
  });
});
```

- [ ] **Step 6: Ruta — implementación**

`src/app/api/cron/pet-nudges/route.ts` (copia de `event-reminders/route.ts` con el nombre cambiado):

```ts
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { deliverPetNudges } from "@/lib/pet/nudges/deliver";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Avisos push de la mascota (spec 2026-09-02-mascota-avisos-push). Lo llama
// pg_cron cada hora vía pg_net (supabase/migrations/20260906_pet_nudges.sql) y
// la función SQL solo despacha a las 20:00 de Europe/Madrid; nunca un navegador.
// POST y sin caché, por lo mismo que /api/cron/event-reminders.
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("/api/cron/pet-nudges: falta CRON_SECRET; no se atiende");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!secretsMatch(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const report = await deliverPetNudges(createServiceRoleClient());
    // Solo recuentos, y solo cuando hubo algo: ni ids ni nombres de mascota.
    if (report.claimed > 0) console.log("pet-nudges", report);
    return NextResponse.json(report);
  } catch (error) {
    console.error("/api/cron/pet-nudges: barrido fallido", error);
    return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
  }
}

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

Si `vitest.config` excluye `src/app/**` de los tests, mover el test a `src/lib/pet/nudges/route.test.ts` importando `@/app/api/cron/pet-nudges/route`.

Run: `npx vitest run src/lib/pet/nudges src/app/api/cron/pet-nudges && npx tsc --noEmit -p . && npx eslint src/lib/pet/nudges src/app/api/cron/pet-nudges` → verde.

- [ ] **Step 7: Prueba real en dev (opcional si hay `CRON_SECRET` en `.env.local`)**

Con `next dev` en 3000: `curl -s -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/pet-nudges` → `{"claimed":N,"sent":M}`. Sembrar antes el caso 1 de la Task 2 para ver un `claimed: 1`. Limpiar `pet_nudges` después. Apagar `next dev`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pet/nudges src/app/api/cron/pet-nudges messages/es.json
git commit -m "feat(pet): entrega de avisos de la mascota y ruta /api/cron/pet-nudges"
```

---

### Task 4: E2E del interruptor «Mascota» y documentación

**Files:**
- Create: `e2e/ajustes-push-mascota.spec.ts`
- Modify: `docs/requirements/data-model.md` (§8bis.4 `pet_nudges` + `category_pet` + funciones; fecha de verificación)
- Modify: `docs/DRIFT-CHECK.md` (fila `pet_nudges` en la tabla de grants; `notification_preferences` pasa a 10 columnas si la tabla lista recuentos)
- Modify: `docs/requirements/decisiones.md` (entrada al final)
- Modify: `docs/requirements/backlog.md` (marcar «Mascota fase 3»)
- Modify: `docs/architecture/graph.json` (nodo `m-pet`: `nudges/`; nodo `r-cron` o nuevo `r-cron-pet`; flujo `flow-pet-nudges`) y regenerar con `node docs/architecture/sync.mjs`

- [ ] **Step 1: E2E**

Mirar `e2e/mascota.spec.ts` para el login y el helper `api()` (PostgREST con service-role) y `src/app/ajustes/page.tsx` para dónde se pinta `NotificationPreferences`. Spec:

```ts
import { expect, test } from "@playwright/test";
// Reutilizar los helpers de login/API de e2e/mascota.spec.ts (copiar los que
// hagan falta; si viven en e2e/helpers, importarlos de ahí).

test("el interruptor «Mascota» de avisos persiste en notification_preferences.category_pet", async ({ page }) => {
  // login como el usuario de pruebas (mismo que mascota.spec.ts)
  await page.goto("/ajustes");
  const sw = page.getByRole("switch", { name: "Mascota" });
  await expect(sw).toBeVisible();
  const before = await sw.getAttribute("aria-checked");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
  // Comprobación por API (service role): la fila refleja el cambio.
  const rows = (await (await api(`notification_preferences?user_id=eq.${userId}&select=category_pet`)).json()) as { category_pet: boolean }[];
  expect(rows[0]?.category_pet).toBe(before !== "true");
  // Dejarlo como estaba.
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", before ?? "true");
});
```

Run contra build de producción (`npx next build && npx next start -p 3000`, con el puerto 3000 libre): `npx playwright test e2e/ajustes-push-mascota.spec.ts` → 1 passed. Apagar el servidor al terminar.

- [ ] **Step 2: Docs**

`docs/requirements/data-model.md`, tras §8bis.3, nueva **§8bis.4 `pet_nudges`, `category_pet` y el cron de avisos (dev 2026-09-02; prod: ver `decisiones.md`)**: tabla (columnas, UNIQUE, RLS select propio, sin escritura para authenticated), columna `notification_preferences.category_pet` (default true; grant de tabla entera), `private.pet_lived_activity_days(uuid)` (regla copiada de `get_companion_state`; en `private`), `public.claim_pet_nudges(date)` (security definer, solo service_role, idempotente por el UNIQUE, umbrales copiados de `balance.ts`), `private.dispatch_pet_nudges()` + job `pet-nudges` cada hora con filtro 20:00 Madrid, secretos de Vault reutilizados. Resultado de la verificación de dev (Task 2 Step 3).

`docs/DRIFT-CHECK.md`: en la tabla de grants por columna añadir `| pet_nudges | 6 | 0 | 0 | solo lectura para authenticated; escribe claim_pet_nudges() (service_role) |`. Si la tabla lista `notification_preferences`, actualizar su recuento de columnas.

`docs/requirements/decisiones.md` (append): «2026-09-02 — Mascota fase 3: avisos push por racha y humor»: las decisiones de la spec (alcance 1+2, 20:00 fija, transición, racha ≥ 3, categoría `pet`, oculta = silencio, sin campana, claim en SQL, cron horario con filtro de hora local por el DST, `claim_pet_nudges` en `public` por PostgREST, regla de historial copiada por segunda vez en SQL → issue de unificación).

`docs/requirements/backlog.md`: `- [x] Mascota fase 3: avisos push por humor y racha (#1014) — spec 2026-09-02-mascota-avisos-push; rama feat/mascota-push.`

`docs/architecture/graph.json`: en `m-pet` añadir `src/lib/pet/nudges/types.ts`, `copy.ts`, `deliver.ts` a `files` y una frase al `summary` («Fase 3: `nudges/` entrega los avisos push que reclama `claim_pet_nudges()`; sin fila en `notifications`»); en el nodo de la ruta cron (`r-cron`) añadir `src/app/api/cron/pet-nudges/route.ts` y ampliar el summary; nuevo flujo `flow-pet-nudges` («Barrido de las 20:00: reclama y envía los avisos de la mascota») con pasos: `r-cron` (route.ts) → `m-pet` (deliver.ts) → `t-push`/`x-webpush` (send-push.ts), y una `notes` con «Un push al día por UNIQUE; si el envío falla tras el claim no se reintenta ese día». Ejecutar `node docs/architecture/sync.mjs` y comprobar que `map.html` cambia.

- [ ] **Step 3: Commit**

```bash
git add e2e/ajustes-push-mascota.spec.ts docs
git commit -m "test+docs(pet): e2e del interruptor «Mascota» y documentación de la fase 3"
```

---

### Task 5: Issues de «fuera de fase 3» y revisión final de rama

**Files:** ninguno (GitHub + ledger).

- [ ] **Step 1: Abrir las issues de la spec §6**, una por línea, con las tres etiquetas (`gh issue create --label "area:ui,tipo:feature,P3" …`), cuerpo con qué se decidió y por qué:
  - «Mascota: aviso de misiones pendientes» (`area:ui,tipo:acta,P3` — descartado por ruido, se solapa con la racha).
  - «Mascota: hora del aviso configurable por usuario» (`area:ui,tipo:feature,P3`).
  - «Mascota: unificar `private.pet_lived_activity_days` y la regla de `get_companion_state()`» (`area:infra,tipo:deuda,P2` — dos copias de la regla de historial en SQL, más la de TS; enlazar #1044).
  - «Mascota: repetir el aviso de humor pasados N días» (`area:ui,tipo:acta,P3` — descartado: máquina de culpa).
  - Comentar en #1020 que la detección de nivel en el barrido se valoró y se dejó fuera (exige derivar XP de todos los usuarios cada día).
- [ ] **Step 2: Revisión final de rama** (subagent-driven-development: `scripts/review-package $(git merge-base main HEAD) HEAD` + revisor en el modelo más capaz), con las Global Constraints como lente. Corregir Critical/Important con un único fixer, re-revisar.
- [ ] **Step 3:** `npx tsc --noEmit -p . && npx vitest run && npx eslint .` verdes; push y PR contra `main` con el cuerpo: qué cambia, los resultados reales de la Task 2 Step 4 (tabla), verificación, y «migración aplicada en dev; prod tras el merge (Task 6)».

---

### Task 6: Prod (lo hace el controlador, tras el merge)

- [ ] **Step 1:** Mergear la PR. Esperar al deploy de Vercel (la ruta `/api/cron/pet-nudges` tiene que existir antes de que el job la llame; si el job la llama antes, `net.http_post` recibe un 404 y no pasa nada).
- [ ] **Step 2:** `mcp__supabase-prod__apply_migration` con el SQL de `20260906_pet_nudges.sql` y la consulta de verificación de la Task 2 Step 3 → `1 | true | 1 | 0 | false | true | 1`. Comprobar que los secretos existen: `select name from vault.decrypted_secrets where name in ('app_base_url','cron_secret')` → 2 filas.
- [ ] **Step 3:** Actualizar `data-model.md` §8bis.4 («dev y **prod**») y `decisiones.md`; commit directo a `main` solo de docs.
- [ ] **Step 4:** Al día siguiente a las 20:05 Madrid: `select * from pet_nudges order by created_at desc limit 5` en prod y `select status, response from net._http_response order by created desc limit 3` para ver el 200 de la ruta. Si no hay filas, no es fallo: puede no haber candidatos. Anotar en la issue #1014 antes de cerrarla.
