# Rediseño de la pestaña Actividades del club — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `/club/[slug]?tab=actividades` en una vista completa —En curso / Próximas / Historial, tarjetas grandes con progreso real, rail de contexto y estados vacíos intencionados— sin tocar la pestaña Inicio ni el modelo de estados.

**Architecture:** Cuatro grupos derivados en una función pura (`groupActivities`, con `today` del servidor). Progreso colectivo y personal de `buddy_read` / `list_challenge` / `tierlist` en **una** RPC nueva de solo lectura en lote; `criteria_challenge` se resuelve en TS con el motor de conteo que ya existe. Tres densidades de tarjeta según la sección. El asistente de proponer se abre por `searchParam`, así el botón puede vivir en el shell y el asistente en el contenido sin compartir estado.

**Tech Stack:** Next.js (App Router, RSC), TypeScript, Supabase (Postgres + RLS), next-intl, Tailwind, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-12-actividades-club-rediseno-design.md`

## Global Constraints

- **Ni una sola función de esta cadena lleva `use cache`.** `viewer_done` depende de `auth.uid()`; cachear y compartir la entrada sirve el progreso de un miembro a otro (regla #437, `AGENTS.md`). No se ve en desarrollo con una sola cuenta abierta.
- **`today` siempre del servidor** (`todayISO()` en la RSC), nunca `new Date()` en el navegador (#271).
- **Fechas de Postgres se parten a mano**, nunca `new Date("2026-08-16")`: un `date` no lleva zona y pasarlo por `Date` puede retroceder un día. Usar `formatDayMonth` / `formatEventDate` de `src/lib/clubs/activities/format-date.ts`.
- **Un solo locale:** `messages/es.json`. Todo texto visible va por `useTranslations("activity")` / `getTranslations("activity")`; nada de literales en JSX.
- **Migraciones: dev primero** (`supabase-dev`), prod después y solo cuando el usuario lo pida. «No aparece en `list_migrations`» ≠ «no está en prod».
- **Clases Tailwind literales y enteras**, nunca construidas por concatenación (lo exige `ACTIVITY_ACCENT`).
- **No se añade ninguna columna**, así que la superficie 6 de `docs/DRIFT-CHECK.md` (grants por columna) no aplica.
- Node: el shell por defecto trae v20 y rompe Vitest — forzar v22 (`fnm use 22`) antes de `npm test`.
- Un solo `next dev`, en el puerto 3000. `npm run test:e2e` reutiliza el que haya.

---

### Task 1: Cuatro grupos en `groupActivities`

Función pura, sin base de datos: es la única pieza que se puede cerrar entera con TDD antes de tocar nada más, y todo lo demás depende de su forma.

**Files:**
- Modify: `src/lib/clubs/activities/group-activities.ts`
- Test: `src/lib/clubs/activities/group-activities.test.ts`

**Interfaces:**
- Consumes: `ClubActivity` de `@/lib/clubs/activities/core`.
- Produces: `groupActivities(activities: ClubActivity[], today: string): ActivityGroups` con `ActivityGroups = { enCurso, proximas, proposed, finished }`, todos `ClubActivity[]`. El campo `active` **desaparece**; el único llamador de producción es `activity-list.tsx` (Task 10).

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `src/lib/clubs/activities/group-activities.test.ts`. Los tests existentes de `isPastEvent` se dejan intactos; los cuatro de `groupActivities` se reescriben para la firma nueva.

```ts
describe("groupActivities — en curso vs próximas se parte por la fecha de inicio", () => {
  it("activa sin fecha de inicio está EN CURSO: nada dice que sea futura", () => {
    const groups = groupActivities([act({ id: "a", startsOn: null })], HOY);
    expect(groups.enCurso.map((a) => a.id)).toEqual(["a"]);
    expect(groups.proximas).toHaveLength(0);
  });

  it("activa que empieza HOY está EN CURSO, no en próximas", () => {
    const groups = groupActivities([act({ id: "a", startsOn: HOY })], HOY);
    expect(groups.enCurso.map((a) => a.id)).toEqual(["a"]);
    expect(groups.proximas).toHaveLength(0);
  });

  it("activa que empieza mañana es PRÓXIMA", () => {
    const groups = groupActivities([act({ id: "a", startsOn: "2026-07-23" })], HOY);
    expect(groups.proximas.map((a) => a.id)).toEqual(["a"]);
    expect(groups.enCurso).toHaveLength(0);
  });

  it("el reparto solo mira `active`: una propuesta con fecha futura NO es próxima", () => {
    const groups = groupActivities(
      [act({ id: "p", status: "proposed", startsOn: "2026-07-23" })],
      HOY,
    );
    expect(groups.proximas).toHaveLength(0);
    expect(groups.proposed.map((a) => a.id)).toEqual(["p"]);
  });
});
```

Y reescribir los cuatro tests existentes de eventos para la firma nueva, cambiando `groups.active` por `groups.enCurso`:

```ts
describe("groupActivities — los eventos viven en el calendario y en su ficha, no aquí", () => {
  it("un evento activo no está en ninguno de los cuatro grupos", () => {
    const groups = groupActivities(
      [
        act({ id: "e", kind: "evento", status: "active", startsOn: "2026-08-01" }),
        act({ id: "a", kind: "buddy_read", status: "active" }),
      ],
      HOY,
    );
    expect(groups.enCurso.map((a) => a.id)).toEqual(["a"]);
    expect(groups.proximas).toHaveLength(0);
    expect(groups.proposed).toHaveLength(0);
    expect(groups.finished).toHaveLength(0);
  });

  it("un evento ARCHIVADO tampoco cae en finalizadas — es el que se olvida", () => {
    const groups = groupActivities(
      [
        act({ id: "e", kind: "evento", status: "archived", startsOn: "2026-08-01" }),
        act({ id: "f", kind: "tierlist", status: "finished" }),
      ],
      HOY,
    );
    expect(groups.finished.map((a) => a.id)).toEqual(["f"]);
  });

  it("un evento 'finished' tampoco: el filtro es por kind, no por estado", () => {
    const groups = groupActivities(
      [act({ id: "e", kind: "evento", status: "finished", startsOn: "2026-08-01" })],
      HOY,
    );
    expect(groups.finished).toHaveLength(0);
  });

  it("un evento activo con fecha futura NO se cuela en próximas", () => {
    const groups = groupActivities(
      [act({ id: "e", kind: "evento", status: "active", startsOn: "2026-09-01" })],
      HOY,
    );
    expect(groups.proximas).toHaveLength(0);
  });

  it("propuestas y finalizadas no-evento se agrupan como antes", () => {
    const groups = groupActivities(
      [
        act({ id: "p", status: "proposed" }),
        act({ id: "f", status: "finished" }),
        act({ id: "ar", status: "archived" }),
      ],
      HOY,
    );
    expect(groups.proposed.map((a) => a.id)).toEqual(["p"]);
    expect(groups.finished.map((a) => a.id)).toEqual(["f", "ar"]);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm test -- src/lib/clubs/activities/group-activities.test.ts`
Expected: FAIL — `Property 'enCurso' does not exist on type 'ActivityGroups'` y `Expected 1 arguments, but got 2`.

- [ ] **Step 3: Implementar**

Reemplazar el tipo y la función en `src/lib/clubs/activities/group-activities.ts` (el bloque de comentario de `isPastEvent` y la propia función se quedan como están — su borrado es la issue #587):

```ts
export type ActivityGroups = {
  /** Activas que ya han empezado, o que nunca dijeron cuándo empezaban. */
  enCurso: ClubActivity[];
  /** Activas con fecha de inicio en el futuro. */
  proximas: ClubActivity[];
  proposed: ClubActivity[];
  /** Finalizadas y archivadas. Sin eventos: los archivados también salen. */
  finished: ClubActivity[];
};

// Los eventos NO se agrupan aquí: viven en el calendario y en su ficha propia
// (spec 2026-08-11). Se filtran por `kind`, no por estado, y en TODOS los grupos
// -- el que se olvida es `finished`, donde caía el evento ARCHIVADO.
//
// `today` volvió a hacer falta (spec 2026-08-12) por un motivo NUEVO, no por una
// vuelta atrás: partir las activas en las que ya corren y las que aún no
// empiezan. Viene del SERVIDOR; con el reloj del visitante, una actividad
// cambiaría de sección según el huso y contradiría al calendario del club (#271).
//
// Una PROPUESTA con fecha futura no es "próxima": `proposed` es una cola de
// moderación y puede acabar rechazada (spec 2026-08-12, D2). Por eso el reparto
// por fecha se aplica SOLO a las activas.
export function groupActivities(
  activities: ClubActivity[],
  today: string,
): ActivityGroups {
  const sinEventos = activities.filter((a) => a.kind !== "evento");
  const activas = sinEventos.filter((a) => a.status === "active");

  return {
    enCurso: activas.filter((a) => !a.startsOn || a.startsOn <= today),
    proximas: activas.filter((a) => a.startsOn !== null && a.startsOn > today),
    proposed: sinEventos.filter((a) => a.status === "proposed"),
    finished: sinEventos.filter(
      (a) => a.status === "finished" || a.status === "archived",
    ),
  };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test -- src/lib/clubs/activities/group-activities.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Parche mínimo en el llamador, para que el árbol siga compilando**

`activity-list.tsx` es el único llamador de producción y usa `active`, que ya no
existe. La Task 10 reescribe ese fichero entero, pero **hasta entonces median
ocho tareas**: dejarlo roto significa ocho commits que no compilan, y quien
bisecte esa franja —o interrumpa la rama a la mitad— se queda con un árbol que no
arranca. Se arregla aquí, en diez líneas, y la Task 10 lo sustituye igual.

En `src/components/clubs/activity-list.tsx`, cambiar SOLO la desestructuración y
añadir el grupo nuevo. Nada más: ni tarjetas nuevas, ni rail, ni estados vacíos
—eso es la Task 10—.

```tsx
  const { enCurso, proximas, proposed, finished } = groupActivities(
    activities,
    today,
  );

  const sinActividades =
    enCurso.length === 0 &&
    proximas.length === 0 &&
    proposed.length === 0 &&
    finished.length === 0;
```

Y en el JSX, sustituir el `<Group>` de activas por dos, dejando el resto igual:

```tsx
      <Group title={t("groupOngoing", { count: enCurso.length })}>
        {enCurso.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            clubSlug={clubSlug}
            today={today}
          />
        ))}
      </Group>

      <Group title={t("groupUpcoming", { count: proximas.length })}>
        {proximas.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            clubSlug={clubSlug}
            today={today}
          />
        ))}
      </Group>
```

`groupOngoing` y `groupUpcoming` son de la Task 5, que aún no ha corrido. Añadir
**solo esas dos claves** a `messages/es.json` ahora (`"groupOngoing": "En curso ·
{count}"`, `"groupUpcoming": "Próximas · {count}"`); la Task 5 añadirá el resto y
se encontrará estas ya puestas. La clave `groupActive` queda huérfana: **no
borrarla aquí** — la Task 10 la retira junto con `empty`, en el mismo commit que
deja de usarlas.

- [ ] **Step 6: Verificar que compila y que la suite sigue verde**

Run: `npx tsc --noEmit`
Expected: **sin errores**.

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/clubs/activities/group-activities.ts src/lib/clubs/activities/group-activities.test.ts src/components/clubs/activity-list.tsx messages/es.json
git commit -m "feat(actividades): partir las activas en 'en curso' y 'próximas'"
```

---

### Task 2: RPC `get_activities_progress`

**Files:**
- Create: `supabase/migrations/20260853_activities_progress.sql`

**Interfaces:**
- Produces: `public.get_activities_progress(p_activity_ids uuid[])`, que devuelve filas `(activity_id uuid, kind text, collective_done int, collective_total int, viewer_done int, viewer_total int, participants int)`. La consume Task 3.

- [ ] **Step 1: Confirmar que el número de migración sigue libre**

```bash
ls supabase/migrations | tail -3
```
Expected: la última es `20260852_event_reminder_default_1w.sql`. Si hubiera algo posterior, usar el siguiente número libre y ajustar el nombre del fichero en todos los pasos.

- [ ] **Step 2: Escribir la migración**

Crear `supabase/migrations/20260853_activities_progress.sql`:

```sql
-- Progreso de N actividades de club en UNA consulta (spec 2026-08-12).
--
-- Por qué RPC y no lectura de cliente: el progreso COLECTIVO se calcula sobre
-- los `passes` y los checkpoint_reads de TODOS los participantes, y la RLS de
-- esas tablas no deja agregarlos desde el cliente. Por qué en lote: la pestaña
-- Actividades pinta una tarjeta por actividad en curso, y una llamada por
-- actividad es justo lo que hasta hoy impedía enseñar progreso ahí.
--
-- GATE: ser miembro activo del club (is_club_member). Es MÁS ANCHO que el de
-- get_list_challenge_progress (is_activity_participant) a propósito: la tarjeta
-- la ve todo el club y el número colectivo es lo que ayuda a decidir si unirse
-- -- el mismo criterio que ya rige los checkpoints, "visibles a todo el club
-- (no solo a participantes)". Lo que NO se ensancha es el detalle: aquí solo
-- salen CONTADORES, nunca quién ha completado qué, y viewer_done es siempre del
-- propio llamante.
--
-- criteria_challenge NO está aquí a propósito: su conteo no es una consulta
-- (criterio por género/saga sobre el catálogo) y vive en countForChallenge,
-- src/lib/challenges/match.ts. Reescribirlo en SQL sería un segundo motor de
-- conteo. La capa de app lo resuelve con el motor que ya existe.
create or replace function public.get_activities_progress(p_activity_ids uuid[])
returns table (
  activity_id uuid,
  kind text,
  collective_done int,
  collective_total int,
  viewer_done int,
  viewer_total int,
  participants int
)
language sql
stable
security definer
set search_path = public
as $$
  with visibles as (
    select ca.id, ca.kind::text as kind, ca.config
      from public.club_activities ca
     where ca.id = any(p_activity_ids)
       and ca.kind <> 'evento'
       and public.is_club_member(ca.club_id)
  ),
  roster as (
    select v.id,
           (select count(*)::int
              from public.club_activity_participants p
             where p.activity_id = v.id) as participants
      from visibles v
  ),

  -- ── buddy_read ────────────────────────────────────────────────────────────
  -- El colectivo es el "hito seguro del grupo" que ya calcula
  -- getActivityCheckpoints (checkpoints.ts:112): el MÍNIMO, entre participantes,
  -- del MÁXIMO order alcanzado por cada uno. `order` es 0-based (createCheckpoint
  -- lo asigna con `count ?? 0`), así que el contador es order + 1, y -1 (nadie
  -- ha llegado a nada) da 0. Se replica esa definición, no una parecida: dos
  -- números distintos con el mismo nombre en dos pantallas es una discrepancia
  -- que alguien acabará reportando como bug.
  buddy as (
    select v.id,
           (select count(*)::int
              from public.club_activity_checkpoints c
             where c.activity_id = v.id) as total,
           (select count(*)::int
              from public.club_activity_checkpoint_reads r
              join public.club_activity_checkpoints c on c.id = r.checkpoint_id
             where c.activity_id = v.id
               and r.user_id = auth.uid()) as viewer_done,
           coalesce((
             select min(per_user.max_order)
               from (
                 select coalesce(max(c."order"), -1) as max_order
                   from public.club_activity_participants p
                   left join public.club_activity_checkpoint_reads r
                     on r.user_id = p.user_id
                   left join public.club_activity_checkpoints c
                     on c.id = r.checkpoint_id
                    and c.activity_id = v.id
                  where p.activity_id = v.id
                  group by p.user_id
               ) per_user
           ), -1) as group_safe_order
      from visibles v
     where v.kind = 'buddy_read'
  ),

  -- ── list_challenge ────────────────────────────────────────────────────────
  -- Mismo criterio de "completado" que get_list_challenge_progress: en modo
  -- 'window', un pase terminado dentro de la ventana; en modo 'any', el pase
  -- activo y completado sin mirar fechas.
  list_done as (
    select v.id, p.user_id, i.item_type, i.item_id
      from visibles v
      cross join lateral public.activity_window(v.id) w
      join public.club_activity_participants p on p.activity_id = v.id
      join public.club_activity_items i on i.activity_id = v.id
      join public.passes d
        on d.user_id = p.user_id
       and d.item_type = i.item_type
       and d.item_id = i.item_id
     where v.kind = 'list_challenge'
       and (
         case when coalesce(v.config ->> 'completionMode', 'window') = 'any'
           then d.is_active and d.status = 'completed'
           else d.finished_on between w.window_start and w.window_end
         end
       )
     group by v.id, p.user_id, i.item_type, i.item_id
  ),
  list as (
    select v.id,
           (select count(*)::int
              from public.club_activity_items i
             where i.activity_id = v.id) as total,
           (select count(distinct (ld.item_type, ld.item_id))::int
              from list_done ld
             where ld.id = v.id) as collective_done,
           (select count(*)::int
              from list_done ld
             where ld.id = v.id
               and ld.user_id = auth.uid()) as viewer_done
      from visibles v
     where v.kind = 'list_challenge'
  ),

  -- ── tierlist ──────────────────────────────────────────────────────────────
  -- "Ya ha votado" = tiene al menos UNA colocación. Colocar un solo ítem no es
  -- terminar la tierlist, pero sí es haber empezado, que es lo que la tarjeta
  -- pregunta ("4 de 6 participantes han votado").
  tier as (
    select v.id,
           (select count(distinct pl.user_id)::int
              from public.club_activity_placements pl
             where pl.activity_id = v.id) as voters,
           (select case when exists (
                     select 1 from public.club_activity_placements pl
                      where pl.activity_id = v.id and pl.user_id = auth.uid()
                   ) then 1 else 0 end) as viewer_voted
      from visibles v
     where v.kind = 'tierlist'
  )

  select v.id,
         v.kind,
         case v.kind
           when 'buddy_read'     then greatest(b.group_safe_order + 1, 0)
           when 'list_challenge' then l.collective_done
           when 'tierlist'       then t.voters
           else 0
         end as collective_done,
         case v.kind
           when 'buddy_read'     then b.total
           when 'list_challenge' then l.total
           when 'tierlist'       then r.participants
           else 0
         end as collective_total,
         case v.kind
           when 'buddy_read'     then b.viewer_done
           when 'list_challenge' then l.viewer_done
           when 'tierlist'       then t.viewer_voted
           else 0
         end as viewer_done,
         case v.kind
           when 'buddy_read'     then b.total
           when 'list_challenge' then l.total
           when 'tierlist'       then 1
           else 0
         end as viewer_total,
         r.participants
    from visibles v
    join roster r on r.id = v.id
    left join buddy b on b.id = v.id
    left join list  l on l.id = v.id
    left join tier  t on t.id = v.id;
$$;

comment on function public.get_activities_progress(uuid[]) is
  'Progreso colectivo y del llamante de N actividades de club, en una consulta (spec 2026-08-12). Gate: miembro activo del club. Devuelve SOLO contadores agregados, nunca quién ha hecho qué. criteria_challenge queda fuera: su conteo vive en countForChallenge (match.ts) y no se duplica en SQL.';

revoke execute on function public.get_activities_progress(uuid[]) from public, anon;
grant execute on function public.get_activities_progress(uuid[]) to authenticated;
```

- [ ] **Step 3: Aplicar en DEV**

Usar `mcp__supabase-dev__apply_migration` con `name: "activities_progress"` y el contenido del fichero.
Expected: sin error.

- [ ] **Step 4: Verificar contra datos reales de dev**

Con `mcp__supabase-dev__execute_sql`, coger una actividad `buddy_read` activa de dev y comparar el resultado de la RPC con el número que enseña su tablero de detalle:

```sql
-- 1) elegir actividades vivas
select id, kind, title from public.club_activities
 where status = 'active' and kind <> 'evento' limit 5;

-- 2) la RPC sobre ellas
select * from public.get_activities_progress(array['<id1>','<id2>']::uuid[]);

-- 3) contraste para un buddy_read: total de hitos y hito seguro del grupo
select count(*) from public.club_activity_checkpoints where activity_id = '<id1>';
```

Expected: `collective_total` = número de hitos; `collective_done` entre 0 y ese total; `participants` = filas en `club_activity_participants`. Si `collective_done` sale mayor que `collective_total`, el `order` no era 0-based en esos datos — parar y revisar antes de seguir.

- [ ] **Step 5: Verificar el gate con un id de otro club**

```sql
-- un id de actividad de un club del que el usuario de prueba NO es miembro
select * from public.get_activities_progress(array['<id-ajeno>']::uuid[]);
```
Expected: **cero filas**, sin error.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260853_activities_progress.sql
git commit -m "feat(db): RPC en lote con el progreso de las actividades de un club"
```

---

### Task 3: `getActivitiesProgress` (envoltorio + criteria_challenge)

**Files:**
- Create: `src/lib/clubs/activities/progress.ts`

**Interfaces:**
- Consumes: la RPC de Task 2; `getCriteriaChallengeProgress` de `./criteria-challenge`; `ClubActivity` de `./core`.
- Produces:
  ```ts
  export type ActivityProgress = {
    collective: { done: number; total: number } | null;
    viewer: { done: number; total: number } | null;
    participants: number;
  };
  export async function getActivitiesProgress(
    activities: Pick<ClubActivity, "id" | "kind">[],
  ): Promise<Map<string, ActivityProgress>>;
  ```
  Lo consumen Tasks 4, 6 y 10.

- [ ] **Step 1: Escribir el fichero**

Recibe **actividades**, no ids, porque necesita el `kind` para saber cuáles van por RPC y cuáles por el motor de conteo.

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCriteriaChallengeProgress } from "./criteria-challenge";
import type { ClubActivity } from "./core";

// Progreso de las tarjetas de la pestaña Actividades (spec 2026-08-12).
//
// NADA de esto lleva `use cache`, ni puede llevarlo: `viewer` depende de
// auth.uid(), así que una entrada compartida serviría el progreso de un miembro
// a otro (regla #437). No se ve con una sola cuenta abierta en desarrollo.
export type ActivityProgress = {
  /** null cuando no hay denominador: sin él NO se pinta barra. */
  collective: { done: number; total: number } | null;
  /** null si quien mira no participa. */
  viewer: { done: number; total: number } | null;
  participants: number;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

function ratio(done: number, total: number): { done: number; total: number } | null {
  return total > 0 ? { done, total } : null;
}

export async function getActivitiesProgress(
  activities: Pick<ClubActivity, "id" | "kind">[],
): Promise<Map<string, ActivityProgress>> {
  const result = new Map<string, ActivityProgress>();
  if (activities.length === 0) return result;

  const { supabase, userId } = await requireUser();

  const porRpc = activities.filter((a) => a.kind !== "criteria_challenge" && a.kind !== "evento");
  const porMotor = activities.filter((a) => a.kind === "criteria_challenge");

  if (porRpc.length > 0) {
    const { data, error } = await supabase.rpc("get_activities_progress", {
      p_activity_ids: porRpc.map((a) => a.id),
    });
    if (error) throw error;
    for (const row of data ?? []) {
      result.set(row.activity_id, {
        collective: ratio(row.collective_done, row.collective_total),
        viewer: ratio(row.viewer_done, row.viewer_total),
        participants: row.participants,
      });
    }
  }

  // criteria_challenge no pasa por la RPC: su conteo depende del criterio
  // (género, saga) sobre el catálogo y vive en countForChallenge. Duplicarlo en
  // SQL sería un segundo motor de conteo. Se paga una llamada por actividad,
  // acotado porque esto solo se pide para el grupo "En curso".
  const criteria = await Promise.all(
    porMotor.map(async (a) => [a.id, await getCriteriaChallengeProgress(a.id)] as const),
  );
  for (const [id, view] of criteria) {
    if (!view) continue;
    const meta = view.config.targetCount;
    const mio = view.participants.find((p) => p.userId === userId);
    result.set(id, {
      collective: ratio(view.clubTotal, meta * Math.max(view.participants.length, 1)),
      viewer: mio ? ratio(mio.count, meta) : null,
      participants: view.participants.length,
    });
  }

  return result;
}
```

- [ ] **Step 2: Ajustar los nombres al tipo real de `CriteriaChallengeView`**

Run: `sed -n '1,80p' src/lib/clubs/activities/criteria-challenge-types.ts`

Comprobar los nombres exactos de `CriteriaParticipantProgress` (¿`count`? ¿`completed`? ¿`userId`?) y de `clubTotal`, y corregir las tres líneas del bloque `criteria` para que compilen. **No inventar campos:** si `clubTotal` no significa «ítems conseguidos por todo el club», usar el que sí y dejarlo comentado.

- [ ] **Step 3: Regenerar los tipos de Supabase**

Usar `mcp__supabase-dev__generate_typescript_types` y volcar el resultado en `src/lib/supabase/database.types.ts`. Sin esto, `supabase.rpc("get_activities_progress", …)` no tipa y `row.collective_done` es `any`.

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep -v "activity-list.tsx"`
Expected: sin errores en `progress.ts` (los de `activity-list.tsx` siguen pendientes de la Task 10).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clubs/activities/progress.ts src/lib/supabase/database.types.ts
git commit -m "feat(actividades): progreso en lote de las actividades en curso"
```

---

### Task 4: `kind-metrics.ts` — qué dice la tarjeta de cada tipo

Función pura y con test propio: es la pieza con más reglas y la única de la capa de presentación que se puede probar sin navegador.

**Files:**
- Create: `src/lib/clubs/activities/kind-metrics.ts`
- Test: `src/lib/clubs/activities/kind-metrics.test.ts`

**Interfaces:**
- Consumes: `ActivityKind` de `./core`, `ActivityProgress` de `./progress`.
- Produces:
  ```ts
  export type ProgressLabels = {
    collectiveLabel: string | null;   // "3/5 hitos"
    viewerLabel: string | null;       // "4/5 hitos"
    collectivePercent: number | null; // 0..100
    viewerPercent: number | null;
  };
  export type Translate = (key: string, values?: Record<string, unknown>) => string;
  export function describeProgress(
    kind: ActivityKind,
    progress: ActivityProgress | undefined,
    t: Translate,
  ): ProgressLabels;
  ```
  La consume Task 6.

**Trampa de tipos, que salta al montar la tarjeta (Task 6):** el `t` que devuelve
`useTranslations("activity")` acepta **solo las claves que existen**, no
`string`, así que NO es asignable a `Translate` (una función que acepta una unión
estrecha no vale donde se espera una que acepta cualquier `string`). En la
tarjeta se envuelve una vez:

```tsx
const t = useTranslations("activity");
const tr: Translate = (key, values) => t(key as never, values as never);
const labels = describeProgress(activity.kind, progress, tr);
```

El `as never` está acotado a esa línea a propósito: `describeProgress` elige la
clave según el `kind` y esas claves existen todas en `messages/es.json` (Task 5).
La alternativa —devolver clave y valores para que traduzca la tarjeta— reparte la
regla en dos sitios y es peor.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { describeProgress } from "./kind-metrics";
import type { ActivityProgress } from "./progress";

// Traductor de mentira: devuelve la clave y los valores, así el test comprueba
// QUÉ clave se elige sin depender del texto de messages/es.json.
const t = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}(${Object.values(values).join(",")})` : key;

const prog = (over: Partial<ActivityProgress> = {}): ActivityProgress => ({
  collective: { done: 3, total: 5 },
  viewer: { done: 4, total: 5 },
  participants: 6,
  ...over,
});

describe("describeProgress", () => {
  it("buddy_read cuenta hitos", () => {
    const labels = describeProgress("buddy_read", prog(), t);
    expect(labels.collectiveLabel).toBe("metricCheckpoints(3,5)");
    expect(labels.viewerLabel).toBe("metricCheckpoints(4,5)");
    expect(labels.collectivePercent).toBe(60);
    expect(labels.viewerPercent).toBe(80);
  });

  it("list_challenge cuenta ítems completados", () => {
    expect(describeProgress("list_challenge", prog(), t).collectiveLabel).toBe(
      "metricCompleted(3,5)",
    );
  });

  it("criteria_challenge cuenta conseguidos", () => {
    expect(describeProgress("criteria_challenge", prog(), t).collectiveLabel).toBe(
      "metricAchieved(3,5)",
    );
  });

  it("tierlist cuenta votantes, no ítems", () => {
    const labels = describeProgress("tierlist", prog({ collective: { done: 4, total: 6 } }), t);
    expect(labels.collectiveLabel).toBe("metricVoted(4,6)");
  });

  it("sin denominador NO hay barra: nada de un 0% que parece progreso", () => {
    const labels = describeProgress("buddy_read", prog({ collective: null }), t);
    expect(labels.collectiveLabel).toBeNull();
    expect(labels.collectivePercent).toBeNull();
  });

  it("quien no participa no tiene barra propia", () => {
    expect(describeProgress("buddy_read", prog({ viewer: null }), t).viewerLabel).toBeNull();
  });

  it("sin progreso cargado devuelve todo a null, sin reventar", () => {
    const labels = describeProgress("buddy_read", undefined, t);
    expect(labels.collectiveLabel).toBeNull();
    expect(labels.viewerPercent).toBeNull();
  });

  it("un evento no tiene métrica: nunca llega a esta tarjeta, pero no debe romper", () => {
    expect(describeProgress("evento", prog(), t).collectiveLabel).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- src/lib/clubs/activities/kind-metrics.test.ts`
Expected: FAIL — `Failed to resolve import "./kind-metrics"`.

- [ ] **Step 3: Implementar**

```ts
import type { ActivityKind } from "./core";
import type { ActivityProgress } from "./progress";

// Qué mide cada tipo de actividad. Separado de la tarjeta porque es la parte con
// más reglas y la única testeable sin navegador: "0 participantes" en algo a lo
// que nadie se apunta no informa de nada, y una barra al 0% por falta de
// denominador se lee como "abandonada".
export type ProgressLabels = {
  collectiveLabel: string | null;
  viewerLabel: string | null;
  /** 0..100, o null si no hay denominador. */
  collectivePercent: number | null;
  viewerPercent: number | null;
};

/** El `t` de next-intl acepta solo claves válidas; quien llame envuelve. */
export type Translate = (key: string, values?: Record<string, unknown>) => string;

const VACIO: ProgressLabels = {
  collectiveLabel: null,
  viewerLabel: null,
  collectivePercent: null,
  viewerPercent: null,
};

// Una clave por tipo. `evento` no llega nunca aquí (groupActivities lo descarta),
// pero el Record obliga a decidirlo en vez de a olvidarlo.
const METRIC_KEY: Record<ActivityKind, string | null> = {
  buddy_read: "metricCheckpoints",
  list_challenge: "metricCompleted",
  criteria_challenge: "metricAchieved",
  tierlist: "metricVoted",
  evento: null,
};

function percent(part: { done: number; total: number } | null): number | null {
  if (!part || part.total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((part.done / part.total) * 100)));
}

export function describeProgress(
  kind: ActivityKind,
  progress: ActivityProgress | undefined,
  t: Translate,
): ProgressLabels {
  const key = METRIC_KEY[kind];
  if (!key || !progress) return VACIO;

  return {
    collectiveLabel: progress.collective
      ? t(key, { done: progress.collective.done, total: progress.collective.total })
      : null,
    viewerLabel: progress.viewer
      ? t(key, { done: progress.viewer.done, total: progress.viewer.total })
      : null,
    collectivePercent: percent(progress.collective),
    viewerPercent: percent(progress.viewer),
  };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test -- src/lib/clubs/activities/kind-metrics.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clubs/activities/kind-metrics.ts src/lib/clubs/activities/kind-metrics.test.ts
git commit -m "feat(actividades): métrica por tipo de actividad"
```

---

### Task 5: Textos nuevos en `messages/es.json`

Todas las claves de golpe, para que ninguna tarea posterior tenga que pararse a inventar copy.

**Files:**
- Modify: `messages/es.json` (namespace `activity`)

**Interfaces:**
- Produces: las claves que consumen Tasks 6, 7, 8, 9 y 10.

- [ ] **Step 1: Añadir las claves**

Dentro del objeto `activity`, junto a las que ya existen:

```json
"pageSubtitle": "Organiza y participa en actividades del club",
"groupOngoing": "En curso · {count}",
"groupUpcoming": "Próximas · {count}",
"groupHistory": "Historial · {count}",
"navAll": "Todas",
"navOngoing": "En curso",
"navUpcoming": "Próximas",
"navHistory": "Historial",
"metricCheckpoints": "{done}/{total} hitos",
"metricCompleted": "{done}/{total} completados",
"metricAchieved": "{done}/{total} conseguidos",
"metricVoted": "{done} de {total} han votado",
"progressGroup": "El grupo",
"progressViewer": "Tu avance",
"cardStartsOn": "Empieza el {date}",
"cardEndsOn": "Termina el {date}",
"daysLeft": "{count, plural, one {queda # día} other {quedan # días}}",
"ctaContinue": "Continuar",
"ctaJoin": "Participar",
"ctaView": "Ver actividad",
"ctaResults": "Ver resultados",
"emptyAllTitle": "Aún no hay actividades",
"emptyAllBody": "Una lectura conjunta, un reto o una tierlist: así es como el club se pone de acuerdo en qué leer.",
"emptyUpcomingTitle": "No hay próximas actividades",
"emptyUpcomingBody": "¿Tenéis alguna lectura, maratón o reto en mente?",
"emptyHistoryTitle": "Todavía no hay actividades terminadas",
"emptyHistoryBody": "Aquí aparecerán las actividades completadas por el club.",
"asideDates": "Próximas fechas",
"asideClub": "Este club",
"asideActive": "{count, plural, one {# actividad activa} other {# actividades activas}}",
"asideFinished": "{count, plural, one {# completada} other {# completadas}}",
"asideMembers": "{count, plural, one {# participante} other {# participantes}}",
"asideStarts": "Comienza {title}",
"asideEnds": "Termina {title}"
```

**`groupOngoing` y `groupUpcoming` ya están**: las añadió la Task 1 para que su
parche del llamador compilara. No duplicarlas — si el JSON tuviera la misma clave
dos veces, la segunda gana en silencio.

La clave `empty` que ya existe se queda: la usa el mensaje viejo hasta que la Task 10 la sustituya por `emptyAllTitle`/`emptyAllBody`. Se borra en la Task 10, no antes. Lo mismo con `groupActive`, huérfana desde la Task 1.

**`startsOn` y `endsOn` ya existen y NO se tocan.** Son las etiquetas de los dos
campos de fecha del asistente de proponer (`propose-wizard.tsx:319,328`): valen
«Empieza el» y «Termina el», sin parámetro. Por eso las de la tarjeta se llaman
`cardStartsOn` / `cardEndsOn`. Convertir las originales en plantillas con
`{date}` deja las etiquetas del formulario mostrando el marcador literal.

- [ ] **Step 2: Verificar que el JSON sigue siendo válido**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add messages/es.json
git commit -m "chore(i18n): textos del rediseño de Actividades"
```

---

### Task 6: Las tarjetas — grande y media

**Files:**
- Create: `src/components/clubs/activity-card-large.tsx`
- Create: `src/components/clubs/activity-card-upcoming.tsx`

**Interfaces:**
- Consumes: `ClubActivity` (`./core`), `ActivityProgress` (`./progress`), `describeProgress` (`./kind-metrics`), `ACTIVITY_ACCENT` (`./kinds/accent`), `formatEventDate` (`./format-date`), `buttonVariants` (`@/components/ui/button`).
- Produces: `<ActivityCardLarge activity clubSlug progress today />` y `<ActivityCardUpcoming activity clubSlug />`. Las consume Task 10.

- [ ] **Step 1: Escribir `activity-card-large.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ClubActivity } from "@/lib/clubs/activities/core";
import type { ActivityProgress } from "@/lib/clubs/activities/progress";
import { describeProgress, type Translate } from "@/lib/clubs/activities/kind-metrics";
import { ACTIVITY_ACCENT } from "@/lib/clubs/activities/kinds/accent";
import { formatEventDate } from "@/lib/clubs/activities/format-date";

// La tarjeta de "En curso" (spec 2026-08-12). La compacta (activity-card.tsx) se
// queda para el historial: la densidad la fija la SECCIÓN, no el estado de la
// fila -- una tarjeta grande por cada actividad terminada convierte el historial
// en un muro.
//
// Toda la tarjeta es clicable con UN solo <Link>, y el CTA es un <span> con
// aspecto de botón: un <button> dentro de un <a> es HTML inválido y un lío para
// el teclado.
export function ActivityCardLarge({
  activity,
  clubSlug,
  progress,
  today,
}: {
  activity: ClubActivity;
  clubSlug: string;
  progress: ActivityProgress | undefined;
  /** "Hoy" del SERVIDOR (#271): los días restantes no pueden depender del reloj
   *  del visitante o contradirían al calendario del club. */
  today: string;
}) {
  const t = useTranslations("activity");
  // El `t` de next-intl solo acepta claves existentes, así que no encaja en
  // Translate (que acepta cualquier string). Se envuelve UNA vez, aquí: las
  // claves que elige describeProgress existen todas en messages/es.json.
  const tr: Translate = (key, values) => t(key as never, values as never);
  const accent = ACTIVITY_ACCENT[activity.kind];
  const labels = describeProgress(activity.kind, progress, tr);
  const participants = progress?.participants ?? activity.participantCount;

  const cta = activity.viewerIsParticipant ? t("ctaContinue") : t("ctaJoin");
  const restantes = activity.endsOn ? diasHasta(today, activity.endsOn) : null;

  return (
    <Link
      href={`/club/${clubSlug}/actividad/${activity.id}`}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent/40"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border ${accent.borderSoft} ${accent.bgSoft} ${accent.text}`}
        >
          <accent.Icon className="h-4 w-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-serif text-base font-semibold text-foreground">
            {activity.title}
          </span>
          <span className="label-section">{t(`kind_${activity.kind}`)}</span>
        </div>
        <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[10px] tracking-wider text-accent uppercase">
          {t("status_active")}
        </span>
      </div>

      {activity.description && (
        <p className="line-clamp-2 text-[13px] text-muted-foreground">
          {activity.description}
        </p>
      )}

      {labels.collectiveLabel && (
        <ProgressRow
          caption={t("progressGroup")}
          label={labels.collectiveLabel}
          percent={labels.collectivePercent}
          bar={accent.bar}
        />
      )}
      {labels.viewerLabel && activity.viewerIsParticipant && (
        <ProgressRow
          caption={t("progressViewer")}
          label={labels.viewerLabel}
          percent={labels.viewerPercent}
          bar={accent.bar}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="label-section">
          {t("participants", { count: participants })}
          {activity.endsOn && ` · ${t("cardEndsOn", { date: formatEventDate(activity.endsOn) })}`}
          {restantes !== null && restantes >= 0 && ` · ${t("daysLeft", { count: restantes })}`}
        </span>
        <span className={buttonLikeClasses}>{cta} →</span>
      </div>
    </Link>
  );
}

const buttonLikeClasses =
  "shrink-0 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-mono text-[11px] tracking-wide text-accent uppercase";

function ProgressRow({
  caption,
  label,
  percent,
  bar,
}: {
  caption: string;
  label: string;
  percent: number | null;
  bar: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 label-section">{caption}</span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <span
          className={`block h-full rounded-full ${bar}`}
          style={{ width: `${percent ?? 0}%` }}
        />
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

// Días entre dos fechas ISO. Se construye desde NÚMEROS (hora local), nunca
// `new Date("2026-08-16")`, que se interpreta como UTC y puede retroceder un día.
function diasHasta(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split("-").map(Number);
  const [y2, m2, d2] = hasta.split("-").map(Number);
  const ms = new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime();
  return Math.round(ms / 86_400_000);
}
```

- [ ] **Step 2: Escribir `activity-card-upcoming.tsx`**

Sin barras: no hay progreso que contar y una barra al 0% se lee como abandonada. Manda la fecha de inicio.

```tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ClubActivity } from "@/lib/clubs/activities/core";
import { ACTIVITY_ACCENT } from "@/lib/clubs/activities/kinds/accent";
import { formatDayMonth } from "@/lib/clubs/activities/format-date";

// Tarjeta de "Próximas": densidad media. Lo que se pregunta de algo que aún no
// ha empezado es CUÁNDO empieza, así que la fecha ocupa el sitio de la baldosa
// de tipo y el icono se va al renglón de la meta.
export function ActivityCardUpcoming({
  activity,
  clubSlug,
}: {
  activity: ClubActivity;
  clubSlug: string;
}) {
  const t = useTranslations("activity");
  const accent = ACTIVITY_ACCENT[activity.kind];
  const fecha = activity.startsOn ? formatDayMonth(activity.startsOn) : null;

  return (
    <Link
      href={`/club/${clubSlug}/actividad/${activity.id}`}
      className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent/40"
    >
      {fecha && (
        <span
          aria-hidden
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-[10px] border ${accent.borderSoft} ${accent.bgSoft} ${accent.text}`}
        >
          <span className="flex flex-col items-center leading-none">
            <span className="font-mono text-sm font-semibold">{fecha.day}</span>
            <span className="font-mono text-[9px] tracking-wider uppercase">{fecha.month}</span>
          </span>
        </span>
      )}

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-serif text-sm font-semibold text-foreground">
          {activity.title}
        </span>
        <span className="label-section">
          {t(`kind_${activity.kind}`)}
          {` · ${t("participants", { count: activity.participantCount })}`}
        </span>
      </span>

      <span className="shrink-0 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        {t("ctaView")} →
      </span>
    </Link>
  );
}
```

- [ ] **Step 3: Verificar que compilan**

Run: `npx tsc --noEmit 2>&1 | grep -E "activity-card-(large|upcoming)"`
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add src/components/clubs/activity-card-large.tsx src/components/clubs/activity-card-upcoming.tsx
git commit -m "feat(actividades): tarjeta grande con progreso y tarjeta de próximas"
```

---

### Task 7: Estados vacíos

**Files:**
- Create: `src/components/clubs/activity-empty-state.tsx`

**Interfaces:**
- Produces: `<ActivityEmptyState title body actionHref? actionLabel? />`. La consume Task 10.

- [ ] **Step 1: Escribir el componente**

```tsx
import Link from "next/link";

// Un estado vacío que parece intencionado: dice qué iría aquí y, cuando hay algo
// que hacer, ofrece hacerlo. Nunca una tarjeta grande hueca para rellenar hueco
// -- eso es justo lo que hacía que la pestaña pareciera un borrador.
//
// Sin botón cuando no hay nada que el club pueda hacer HOY para llenarlo (el
// historial se llena solo, terminando actividades).
export function ActivityEmptyState({
  title,
  body,
  actionHref,
  actionLabel,
}: {
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border px-4 py-8 text-center">
      <p className="font-serif text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-[13px] text-muted-foreground">{body}</p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-1 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-mono text-[11px] tracking-wide text-accent uppercase"
        >
          <span aria-hidden>+</span> {actionLabel}
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep "activity-empty-state"`
Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add src/components/clubs/activity-empty-state.tsx
git commit -m "feat(actividades): estados vacíos de la pestaña"
```

---

### Task 8: Rail de escritorio y chips de navegación

**Files:**
- Create: `src/components/clubs/activities-aside.tsx`
- Create: `src/components/clubs/activity-section-nav.tsx`

**Interfaces:**
- Consumes: `CalendarMark` (`@/lib/clubs/activities/calendar-marks`), `formatDayMonth`, `MARK_ACCENT`/`accentKeyFor` (`./calendar/mark-accent`), `markLabel` (`./calendar/mark-label`).
- Produces: `<ActivitiesAside marks clubSlug activeCount finishedCount memberCount />` y `<ActivitySectionNav sections />`. Las consume Task 10.

- [ ] **Step 1: Escribir el rail**

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { CalendarMark } from "@/lib/clubs/activities/calendar-marks";
import { formatDayMonth } from "@/lib/clubs/activities/format-date";

// Rail derecho de la pestaña Actividades (spec 2026-08-12). NO duplica el de
// Inicio: allí ClubSummary enseña la tira compacta de "qué hace el club ahora";
// aquí van las FECHAS y los contadores, que es contexto de la vista completa.
//
// Cada módulo se oculta solo si no tiene dato, y si no queda ninguno el
// componente devuelve null para que la columna principal se centre en vez de
// dejar un rail con títulos y nada debajo.
export async function ActivitiesAside({
  marks,
  clubSlug,
  activeCount,
  finishedCount,
  memberCount,
}: {
  /** Ya recortadas por quien llama (proximasMarcas). */
  marks: CalendarMark[];
  clubSlug: string;
  activeCount: number;
  finishedCount: number;
  memberCount: number;
}) {
  const t = await getTranslations("activity");
  const hayContadores = activeCount > 0 || finishedCount > 0;
  if (marks.length === 0 && !hayContadores) return null;

  return (
    <aside className="hidden flex-col gap-5 lg:sticky lg:top-[96px] lg:flex">
      {marks.length > 0 && (
        <section className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4 shadow-card">
          <h2 className="label-section">{t("asideDates")}</h2>
          {marks.map((mark) => {
            const { day, month } = formatDayMonth(mark.date);
            return (
              <div key={`${mark.date}-${mark.activityId}-${mark.markKind}`} className="flex items-center gap-3">
                <span className="w-12 shrink-0 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                  {day} {month}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                  {mark.title}
                </span>
              </div>
            );
          })}
          <Link
            href={`/club/${clubSlug}/calendario`}
            className="mt-1 font-mono text-[11px] tracking-wide text-accent uppercase"
          >
            {t("summarySeeCalendar")}
          </Link>
        </section>
      )}

      {hayContadores && (
        <section className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-4 shadow-card">
          <h2 className="mb-1 label-section">{t("asideClub")}</h2>
          {activeCount > 0 && (
            <p className="text-[13px] text-muted-foreground">
              {t("asideActive", { count: activeCount })}
            </p>
          )}
          {finishedCount > 0 && (
            <p className="text-[13px] text-muted-foreground">
              {t("asideFinished", { count: finishedCount })}
            </p>
          )}
          <p className="text-[13px] text-muted-foreground">
            {t("asideMembers", { count: memberCount })}
          </p>
        </section>
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Escribir los chips**

Son **anclas**, no filtro: con tres secciones ya visibles, un filtro que las oculta dice lo mismo dos veces y añade un caso vacío por filtro (spec D5).

```tsx
// Chips de la cabecera: navegación interna por ancla, NO filtro. Cero estado de
// cliente -- por eso este componente no lleva "use client".
export function ActivitySectionNav({
  sections,
}: {
  /** Solo las secciones que existen en esta página, en orden. */
  sections: { id: string; label: string }[];
}) {
  if (sections.length === 0) return null;

  return (
    <nav className="flex gap-2 overflow-x-auto pb-1">
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="shrink-0 rounded-full border border-border bg-surface px-3 py-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase hover:border-accent/40 hover:text-accent"
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Verificar que compilan**

Run: `npx tsc --noEmit 2>&1 | grep -E "activities-aside|activity-section-nav"`
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add src/components/clubs/activities-aside.tsx src/components/clubs/activity-section-nav.tsx
git commit -m "feat(actividades): rail de contexto y chips de sección"
```

---

### Task 9: El asistente se abre por `searchParam`

**Files:**
- Modify: `src/components/clubs/activity-composer.tsx`

**Interfaces:**
- Produces: `<ProposeActivityLink clubSlug className? />` (un `<Link>`, puede ir en un componente de servidor) y `<ActivityComposer clubId clubSlug isModerator open />`, que monta el asistente solo si `open`.
- Las consumen Tasks 10 (los tres puntos de entrada) y 7 (el botón del estado vacío usa el mismo `href`).

- [ ] **Step 1: Reescribir el fichero**

El botón vive en el shell (`ClubMainHeader action`) y el asistente en el contenido: no comparten árbol de React, así que un `useState` no vale. El `searchParam` los conecta y, de paso, hace «proponer» enlazable.

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { ProposeWizard } from "./propose/propose-wizard";

/** El href único de "proponer". Los TRES puntos de entrada (cabecera de
 *  escritorio, cabecera móvil, estado vacío de Próximas) apuntan aquí, y hay una
 *  sola instancia del asistente. */
export function proposeHref(clubSlug: string): string {
  return `/club/${clubSlug}?tab=actividades&nueva=1`;
}

// El botón. Es un <Link>, no un <button> con estado: así puede vivir en la
// cabecera del shell (servidor) mientras el asistente vive en el contenido.
export function ProposeActivityLink({
  clubSlug,
  className = "",
}: {
  clubSlug: string;
  className?: string;
}) {
  const t = useTranslations("activity");
  return (
    <Link href={proposeHref(clubSlug)} className={buttonVariants("primary", className)}>
      {/* El "+" es decoración de la maqueta, no parte del nombre del botón: sin
          aria-hidden se cuela en el nombre accesible y quien use lector de
          pantalla oye el glifo. */}
      <span aria-hidden>+</span> {t("propose")}
    </Link>
  );
}

// El asistente. Se monta cuando ?nueva=1 está en la URL; cerrarlo o proponer lo
// quita. Al proponer no hace falta refrescar la lista a mano: proposeActivity
// revalida y la RSC vuelve con la propuesta nueva.
export function ActivityComposer({
  clubId,
  clubSlug,
  isModerator,
  open,
}: {
  clubId: string;
  /** Solo lo necesita la rama de evento del asistente, que navega a la ficha
   *  recién creada porque un evento ya no aparece en este listado. */
  clubSlug: string;
  isModerator: boolean;
  open: boolean;
}) {
  const router = useRouter();
  if (!open) return null;

  function cerrar() {
    router.replace(`/club/${clubSlug}?tab=actividades`);
  }

  return (
    <ProposeWizard
      clubId={clubId}
      clubSlug={clubSlug}
      isModerator={isModerator}
      onProposed={cerrar}
      onCancel={cerrar}
    />
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep "activity-composer"`
Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add src/components/clubs/activity-composer.tsx
git commit -m "feat(actividades): abrir el asistente por parámetro de URL"
```

---

### Task 10: Montar la página

La tarea que enciende todo lo anterior. Al terminarla, `npx tsc --noEmit` debe quedar limpio del todo.

**Files:**
- Modify: `src/components/clubs/activity-list.tsx` (reescritura completa)
- Modify: `src/app/club/[slug]/page.tsx:152-162` (rama `tab === "actividades"`) y `:144` (`desktopHeader`)
- Modify: `messages/es.json` (borrar la clave `empty`, ya sin uso)

**Interfaces:**
- Consumes: todo lo de Tasks 1, 3, 4, 6, 7, 8, 9.
- Produces: la pestaña terminada.

- [ ] **Step 1: Reescribir `activity-list.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { type ClubActivity } from "@/lib/clubs/activities/core";
import type { ActivityProgress } from "@/lib/clubs/activities/progress";
import { groupActivities } from "@/lib/clubs/activities/group-activities";
import { ActivityComposer, ProposeActivityLink, proposeHref } from "./activity-composer";
import { ActivityCard } from "./activity-card";
import { ActivityCardLarge } from "./activity-card-large";
import { ActivityCardUpcoming } from "./activity-card-upcoming";
import { ActivityEmptyState } from "./activity-empty-state";
import { ActivitySectionNav } from "./activity-section-nav";
import { ProposalModeration } from "./proposal-moderation";

// Las actividades se agrupan por lo que el miembro viene a preguntar --qué toca
// ahora, qué viene, qué hicimos-- no por el `status` crudo de la fila. Y las
// propuestas van en su propio bloque: son una cola de moderación, no una
// actividad programada (spec 2026-08-12).
export function ActivityList({
  clubId,
  clubSlug,
  initialActivities,
  isModerator,
  today,
  progress,
  composerOpen,
  aside,
}: {
  clubId: string;
  clubSlug: string;
  initialActivities: ClubActivity[];
  isModerator: boolean;
  /** "Hoy" del SERVIDOR (YYYY-MM-DD): decide qué es "en curso" y qué "próxima",
   *  y con el reloj del visitante eso cambiaría según el huso (#271). */
  today: string;
  /** Solo trae las de "En curso": del resto no se pide progreso. */
  progress: Map<string, ActivityProgress>;
  composerOpen: boolean;
  /** El rail, ya resuelto en servidor. null si no tiene nada que decir. */
  aside: ReactNode;
}) {
  const t = useTranslations("activity");
  const tt = useTranslations("club.tabs");
  // Deriva de props: proponer/moderar revalida y la RSC re-ejecuta con las
  // actividades frescas. Sin espejo local ni re-fetch cliente.
  const { enCurso, proximas, proposed, finished } = groupActivities(
    initialActivities,
    today,
  );

  const sinNada =
    enCurso.length === 0 &&
    proximas.length === 0 &&
    proposed.length === 0 &&
    finished.length === 0;

  const sections = [
    enCurso.length > 0 ? { id: "en-curso", label: t("navOngoing") } : null,
    { id: "proximas", label: t("navUpcoming") },
    { id: "historial", label: t("navHistory") },
  ].filter((s): s is { id: string; label: string } => s !== null);

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera propia SOLO en móvil: en escritorio el título y el botón ya
          están en la cabecera sticky del shell, y repetirlos sería dos veces la
          misma acción en la misma pantalla. */}
      <div className="flex flex-col gap-2 lg:hidden">
        <h1 className="font-serif text-[23px] leading-tight font-semibold text-foreground">
          {tt("actividades")}
        </h1>
        <p className="text-[13px] text-muted-foreground">{t("pageSubtitle")}</p>
        <ProposeActivityLink clubSlug={clubSlug} className="w-full justify-center" />
      </div>

      <ActivityComposer
        clubId={clubId}
        clubSlug={clubSlug}
        isModerator={isModerator}
        open={composerOpen}
      />

      {sinNada ? (
        <ActivityEmptyState
          title={t("emptyAllTitle")}
          body={t("emptyAllBody")}
          actionHref={proposeHref(clubSlug)}
          actionLabel={t("propose")}
        />
      ) : (
        <>
          {!composerOpen && <ActivitySectionNav sections={sections} />}

          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-7">
            <div className="flex min-w-0 flex-col gap-6">
              <ProposalModeration
                proposals={proposed}
                clubSlug={clubSlug}
                canModerate={isModerator}
                today={today}
                layout="grid"
              />

              {enCurso.length > 0 && (
                <Section id="en-curso" title={t("groupOngoing", { count: enCurso.length })}>
                  {enCurso.map((activity) => (
                    <ActivityCardLarge
                      key={activity.id}
                      activity={activity}
                      clubSlug={clubSlug}
                      progress={progress.get(activity.id)}
                      today={today}
                    />
                  ))}
                </Section>
              )}

              <Section id="proximas" title={t("groupUpcoming", { count: proximas.length })}>
                {proximas.length > 0 ? (
                  proximas.map((activity) => (
                    <ActivityCardUpcoming
                      key={activity.id}
                      activity={activity}
                      clubSlug={clubSlug}
                    />
                  ))
                ) : (
                  <ActivityEmptyState
                    title={t("emptyUpcomingTitle")}
                    body={t("emptyUpcomingBody")}
                    actionHref={proposeHref(clubSlug)}
                    actionLabel={t("propose")}
                  />
                )}
              </Section>

              <Section id="historial" title={t("groupHistory", { count: finished.length })}>
                {finished.length > 0 ? (
                  <div className="grid gap-2 lg:grid-cols-2">
                    {finished.map((activity) => (
                      <ActivityCard
                        key={activity.id}
                        activity={activity}
                        clubSlug={clubSlug}
                        today={today}
                        muted
                      />
                    ))}
                  </div>
                ) : (
                  <ActivityEmptyState
                    title={t("emptyHistoryTitle")}
                    body={t("emptyHistoryBody")}
                  />
                )}
              </Section>
            </div>

            {aside}
          </div>
        </>
      )}
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-3">
      <h2 className="label-section">{title}</h2>
      {children}
    </section>
  );
}
```

- [ ] **Step 2: Modificar `page.tsx`**

En `src/app/club/[slug]/page.tsx`:

1. Añadir a los imports:

```tsx
import { getActivitiesProgress } from "@/lib/clubs/activities/progress";
import { ActivitiesAside } from "@/components/clubs/activities-aside";
import { ProposeActivityLink } from "@/components/clubs/activity-composer";
```

2. Leer el parámetro nuevo — cambiar la firma de `searchParams`:

```tsx
  searchParams: Promise<{ tab?: string; nueva?: string }>;
```
```tsx
  const { tab: tabParam, nueva } = await searchParams;
```

3. Cambiar `desktopHeader` para que la pestaña Actividades lleve su acción:

```tsx
      desktopHeader={
        <ClubMainHeader
          title={tt(tab)}
          action={
            tab === "actividades" ? <ProposeActivityLink clubSlug={club.slug} /> : undefined
          }
        />
      }
```

4. Sustituir la rama `tab === "actividades"` (hoy en las líneas 152-162) por una sección propia detrás de su `<Suspense>`, igual que hace el feed:

```tsx
      {tab === "actividades" && (
        <Suspense fallback={<ClubContentSkeleton />}>
          <ClubActivitiesSection
            club={club}
            activities={activities}
            canModerate={canModerate}
            userId={user.id}
            composerOpen={nueva === "1"}
          />
        </Suspense>
      )}
```

5. Añadir la sección al final del fichero, junto a `ClubFeedSection`:

```tsx
// Pestaña Actividades: el progreso de las que están en curso y las próximas
// fechas del club se consultan aquí, detrás de su boundary, para que la cabecera
// y las pestañas pinten sin esperarlos.
async function ClubActivitiesSection({
  club,
  activities,
  canModerate,
  userId,
  composerOpen,
}: {
  club: ClubDetail;
  activities: ClubActivities;
  canModerate: boolean;
  userId: string;
  composerOpen: boolean;
}) {
  // UNA sola lectura de "hoy" por respuesta.
  const hoy = todayISO();
  const { enCurso, finished } = groupActivities(activities, hoy);

  const [progress, marks] = await Promise.all([
    // Solo las de "En curso": de una próxima el progreso es 0 por definición y
    // de una terminada ya no cambia.
    getActivitiesProgress(enCurso),
    getClubCalendarMarks(club.id, club.slug, hoy, userId),
  ]);

  return (
    <ActivityList
      clubId={club.id}
      clubSlug={club.slug}
      initialActivities={activities}
      isModerator={canModerate}
      today={hoy}
      progress={progress}
      composerOpen={composerOpen}
      aside={
        <ActivitiesAside
          marks={proximasMarcas(marks, hoy, 4)}
          clubSlug={club.slug}
          activeCount={enCurso.length}
          finishedCount={finished.length}
          memberCount={club.memberCount}
        />
      }
    />
  );
}
```

6. Añadir el import de `groupActivities` arriba:

```tsx
import { groupActivities } from "@/lib/clubs/activities/group-activities";
```

- [ ] **Step 3: Borrar las claves que quedan huérfanas**

Quitar de `messages/es.json`:
- `"empty": "Todavía no hay actividades en este club.",` — la sustituyen `emptyAllTitle` / `emptyAllBody`.
- `"groupActive": "Activas · {count}",` — huérfana desde la Task 1, que partió el grupo en dos.

Este es el commit en el que dejan de usarse, así que es el commit en el que se borran.

Run: `grep -rn 't("empty")\|t("groupActive")\|groupActive' src/`
Expected: sin salida.

- [ ] **Step 4: Typecheck y unitarios completos**

Run: `npx tsc --noEmit`
Expected: **sin errores**. Si `activity-list.tsx` se queja por `ActivityCard` y su prop `today`, revisar que se sigue pasando.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verificar en el navegador contra build de producción**

Una función con `use cache` mal puesta **pasa `next build` y falla en `next start`**, así que la comprobación no vale en `next dev`:

```bash
npm run build && npm start
```
Abrir `/club/<slug>?tab=actividades` y comprobar: tres secciones, tarjeta grande con barra, rail a la derecha, chips que llevan a su sección, y `?nueva=1` que abre el asistente.
Expected: build sin el error `next-request-in-use-cache`, y la página como se describe.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubs/activity-list.tsx src/app/club/\[slug\]/page.tsx messages/es.json
git commit -m "feat(actividades): montar la pestaña con secciones, progreso y rail"
```

---

### Task 11: e2e

**Files:**
- Create: `e2e/club-activities-page.spec.ts`

**Interfaces:**
- Consumes: la página terminada de Task 10.

- [ ] **Step 1: Leer un spec existente para copiar el arranque de sesión**

Run: `sed -n '1,40p' e2e/club-activity-changes.spec.ts`

Copiar de ahí el patrón de login y de club de prueba. **No inventar helpers:** usar los que ese fichero ya usa.

- [ ] **Step 2: Escribir el spec**

```ts
import { test, expect } from "@playwright/test";
// … los mismos imports/fixtures que e2e/club-activity-changes.spec.ts

test.describe("pestaña Actividades", () => {
  test("un club con una sola actividad activa sigue pareciendo una vista completa", async ({ page }) => {
    await page.goto(`/club/${CLUB_SLUG}?tab=actividades`);

    await expect(page.getByRole("heading", { name: /En curso/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Próximas/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Historial/ })).toBeVisible();
  });

  test("el estado vacío de Próximas ofrece proponer, y el de Historial no", async ({ page }) => {
    await page.goto(`/club/${CLUB_SLUG}?tab=actividades`);

    await expect(page.getByText("No hay próximas actividades")).toBeVisible();
    await expect(page.getByText("Todavía no hay actividades terminadas")).toBeVisible();
    // El historial se llena solo: no hay nada que ofrecer ahí.
    const historial = page.locator("#historial");
    await expect(historial.getByRole("link", { name: /Proponer actividad/ })).toHaveCount(0);
  });

  test("?nueva=1 abre el asistente y cerrarlo lo quita de la URL", async ({ page }) => {
    await page.goto(`/club/${CLUB_SLUG}?tab=actividades&nueva=1`);
    await expect(page.getByRole("button", { name: /Proponer actividad/ })).toBeVisible();

    await page.getByRole("button", { name: /Cancelar/ }).click();
    await expect(page).toHaveURL(new RegExp(`tab=actividades$`));
  });

  test("los chips llevan a su sección", async ({ page }) => {
    await page.goto(`/club/${CLUB_SLUG}?tab=actividades`);
    await page.getByRole("link", { name: "Historial", exact: true }).click();
    await expect(page).toHaveURL(/#historial$/);
  });
});
```

Ajustar `CLUB_SLUG` y los nombres de los botones del asistente a lo que use la suite existente.

- [ ] **Step 3: Correr los e2e**

Run: `npm run test:e2e -- e2e/club-activities-page.spec.ts`
Expected: PASS. (Reutiliza el `next dev` que haya en el 3000; no arrancar otro.)

- [ ] **Step 4: Commit**

```bash
git add e2e/club-activities-page.spec.ts
git commit -m "test(e2e): la pestaña Actividades y sus estados vacíos"
```

---

### Task 12: Verificación con dos cuentas, docs e issues

Sin esto el cambio no está «hecho»: un doc canónico que ha dejado de ser cierto es peor que no tenerlo.

**Files:**
- Modify: `docs/requirements/data-model.md`
- Modify: `docs/requirements/decisiones.md`
- Modify: `docs/requirements/backlog.md` (solo si hay casilla que marcar)

- [ ] **Step 1: La comprobación que no se automatiza — dos cuentas**

Con el build de producción corriendo:
1. Cuenta A: unirse a una actividad en curso y avanzar (confirmar un hito o completar un ítem).
2. Cuenta B (miembro del mismo club, **no** participante): abrir la pestaña Actividades.

Expected: B ve la barra **El grupo** con el número colectivo, y **no** ve ninguna barra «Tu avance». Si B ve el avance de A, hay una caché indebida o un `viewer_done` mal filtrado — parar y arreglar antes de seguir.

- [ ] **Step 2: `data-model.md`**

Añadir `get_activities_progress(uuid[])` a la lista de funciones, con: qué devuelve, que el gate es `is_club_member`, que es más ancho que el de `get_list_challenge_progress` y por qué, y que `criteria_challenge` queda fuera a propósito. Actualizar la fecha de verificación de la cabecera.

- [ ] **Step 3: `decisiones.md`**

**Al final del fichero** (es append-only, no reescribir las anteriores), dos entradas:

- Por qué una propuesta no es una «próxima actividad»: `proposed` es una cola de moderación y puede acabar rechazada; «Próximas» son activas con `starts_on` futuro, sin estado nuevo en el esquema.
- Por qué el progreso de la pestaña pasa a ser real y en lote, y por qué `criteria_challenge` es la excepción que se resuelve en TS.

- [ ] **Step 4: Abrir las issues de lo que queda**

Con las tres etiquetas, en el mismo comando:

```sh
gh issue create --label "area:clubes,tipo:feature,P2" \
  --title "Editar fecha de fin, título y descripción de una actividad ya creada" \
  --body "…"

gh issue create --label "area:clubes,tipo:bug,P2" \
  --title "El editor de hitos está enterrado y bloqueado en propuesta" \
  --body "…"
```

En el cuerpo de la segunda, dejar escrito lo averiguado para que no se pierda: `updateCheckpoint`/`deleteCheckpoint`/`reorderCheckpoints` **existen** (`src/lib/clubs/activities/checkpoints.ts:174-241`) y sus políticas RLS los permiten; lo que falla es el acceso — el editor vive dentro de «Modificar actividad» y está gateado a `isModerator` + `kind='buddy_read'` + `disabled` si `status !== 'active'` (`activity-detail.tsx:238`), y no se pinta si el pool está vacío (`checkpoint-editor.tsx:38`). **Un diagnóstico equivocado que sobrevive en el repo es peor que no tener issue**: si al confirmarlo resulta que la puerta era otra, corregirlo en la issue.

- [ ] **Step 5: Aplicar la migración en producción**

Solo cuando el usuario lo pida. `mcp__supabase-prod__apply_migration` con el mismo contenido. Después, verificar contra los objetos reales, no contra el ledger:

```sql
select proname from pg_proc where proname = 'get_activities_progress';
```
Expected: una fila.

- [ ] **Step 6: Commit**

```bash
git add docs/requirements/
git commit -m "docs: sincronizar data-model y decisiones con el rediseño de Actividades"
```

---

## Notas de revisión del plan

Repasado contra la spec: cubiertas §4 (Tasks 2-3), §5 (Task 10), §6 (Tasks 4, 6), §7 (Task 7), §8 (Task 9), §10 (todas), §11 (Tasks 11-12).

Tres puntos donde el implementador va a tener que decidir con la cabeza, y están marcados en su paso:

1. **Task 3, Step 2** — los nombres de campo de `CriteriaChallengeView` se leen del fichero, no se dan por buenos desde aquí.
2. **Task 2, Step 4** — si `collective_done` sale mayor que `collective_total` en un `buddy_read`, el `order` no era 0-based en esos datos: parar.
3. **Task 11, Step 1** — los helpers de sesión se copian del spec e2e existente, no se inventan.
