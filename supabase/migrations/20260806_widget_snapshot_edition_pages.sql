-- Fix: el total de páginas del libro sale de la EDICIÓN del pase, no de
-- books.total_pages (que casi siempre es null porque la búsqueda ya no lo
-- escribe). Réplica en la RPC del arreglo web e6dec32 (getLibraryItems /
-- pickEditionPages): sin esto, un libro con páginas conocidas salía como
-- "Sin progreso" (percentage null, sin barra) en el widget «En curso».
--
-- Precedencia (idéntica a pickEditionPages): edición del pase → edición
-- primaria → cualquier edición con total → y solo si no, books.total_pages.
-- Único cambio respecto a 20260806_get_widget_snapshot.sql: `ip` arrastra
-- `edition_id` y `cat` resuelve `total_pages` vía LATERAL sobre book_editions.
create or replace function public.get_widget_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := (timezone('Europe/Madrid', now()))::date;
  goal_minutes int;
  today_minutes int;
  global_streak int;
  in_progress jsonb;
  in_progress_total int;
  daily_goal jsonb;
  goal_completed boolean;
  goal_pct int;
  goal_message text;
begin
  if uid is null then
    return null; -- sin sesión: el nativo lo interpreta como "inicia sesión"
  end if;

  select p.daily_goal_minutes into goal_minutes
  from profiles p where p.user_id = uid;

  -- Minutos de HOY: solo sesiones de libro (getWeeklyActivity, §7.14).
  select coalesce(sum(ps.duration_minutes), 0) into today_minutes
  from progress_sessions ps
  join passes p on p.id = ps.pass_id
  where ps.user_id = uid and p.item_type = 'book' and ps.session_date = today;

  -- Racha GLOBAL (getStreaks): islas gaps-and-islands; la vigente es la que
  -- termina en el ancla (hoy si hay actividad hoy, si no ayer).
  with active_days as (
    select distinct d from (
      select session_date d from progress_sessions where user_id = uid and session_date is not null
      union
      select finished_on from passes where user_id = uid and finished_on is not null
    ) s
  ),
  islands as (
    select d, d - (row_number() over (order by d))::int as grp from active_days
  ),
  sized as (
    select grp, count(*)::int len, max(d) last_d from islands group by grp
  ),
  anchor as (
    select case when exists (select 1 from active_days where d = today) then today else today - 1 end a
  )
  select coalesce((select len from sized, anchor where last_d = anchor.a), 0)
  into global_streak;

  -- Ítems en curso (getTodayFocus + hydrateItems).
  with ip as (
    select p.id pass_id, p.item_type, p.item_id, p.position, p.started_on, p.edition_id
    from passes p
    where p.user_id = uid and p.is_active = true and p.status = 'in_progress'
  ),
  reread as ( -- rereadCount = pases CERRADOS de esa obra
    select item_type, item_id, count(*)::int c
    from passes where user_id = uid and finished_on is not null
    group by item_type, item_id
  ),
  notes_by_pass as (
    select pass_id, count(*)::int c from notes
    where user_id = uid and pass_id is not null group by pass_id
  ),
  pass_days as ( -- días activos POR PASE: sesiones ∪ episodios vistos
    select distinct pass_id, d from (
      select pass_id, session_date d from progress_sessions
        where user_id = uid and pass_id is not null
      union
      select pass_id, watched_on from episode_watches
        where user_id = uid and pass_id is not null
    ) u
    where pass_id in (select pass_id from ip)
  ),
  pass_last as (select pass_id, max(d) last_d from pass_days group by pass_id),
  pass_islands as (
    select pass_id, d, d - (row_number() over (partition by pass_id order by d))::int grp
    from pass_days
  ),
  pass_sized as (
    select pass_id, grp, count(*)::int len, max(d) last_d
    from pass_islands group by pass_id, grp
  ),
  pass_streak as (
    select p.pass_id,
      coalesce((
        select ps.len from pass_sized ps
        where ps.pass_id = p.pass_id
          and ps.last_d = case
            when exists (select 1 from pass_days x where x.pass_id = p.pass_id and x.d = today)
            then today else today - 1 end
      ), 0) streak_days
    from (select distinct pass_id from pass_days) p
  ),
  pass_week as ( -- 7 casillas, del más antiguo a HOY
    select ip.pass_id,
      jsonb_agg(
        jsonb_build_object(
          'active', exists (select 1 from pass_days pd where pd.pass_id = ip.pass_id and pd.d = today - 6 + g.i),
          'today', (today - 6 + g.i) = today
        ) order by g.i
      ) week
    from ip cross join generate_series(0, 6) g(i)
    group by ip.pass_id
  ),
  cat as ( -- catálogo por tipo (solo un join casa por fila)
    select ip.*,
      coalesce(b.title, m.title, s.title) title,
      coalesce(b.cover_url, m.cover_url, s.cover_url) cover_url,
      b.author,
      -- Páginas desde la edición del pase → primaria → cualquiera con total, y
      -- solo si no, books.total_pages (fix e6dec32; pickEditionPages en SQL).
      coalesce(ed.total_pages, b.total_pages) total_pages,
      s.total_episodes
    from ip
    left join books b on ip.item_type = 'book' and b.id = ip.item_id
    left join movies m on ip.item_type = 'movie' and m.id = ip.item_id
    left join series s on ip.item_type = 'series' and s.id = ip.item_id
    left join lateral (
      select be.total_pages
      from book_editions be
      where ip.item_type = 'book' and be.book_id = ip.item_id and be.total_pages is not null
      order by (be.id = ip.edition_id) desc nulls last, be.is_primary desc nulls last, be.id
      limit 1
    ) ed on true
  ),
  computed as (
    select
      c.pass_id, c.item_type, c.item_id, c.title, c.cover_url, c.author,
      c.total_pages, c.total_episodes, c.started_on,
      case when c.item_type='book' and (c.position->>'page') ~ '^[0-9]+$'
           then (c.position->>'page')::int end book_page,
      case when c.item_type='series' and (c.position->>'season') ~ '^[0-9]+$'
           then (c.position->>'season')::int end ser_season,
      case when c.item_type='series' and (c.position->>'episode') ~ '^[0-9]+$'
           then (c.position->>'episode')::int end ser_episode,
      coalesce(r.c, 0) reread_count,
      coalesce(n.c, 0) note_count,
      pl.last_d last_session_date,
      coalesce(pstk.streak_days, 0) streak_days,
      pw.week,
      case when c.started_on is not null then (today - c.started_on) + 1 end day_number
    from cat c
    left join reread r on r.item_type = c.item_type and r.item_id = c.item_id
    left join notes_by_pass n on n.pass_id = c.pass_id
    left join pass_last pl on pl.pass_id = c.pass_id
    left join pass_streak pstk on pstk.pass_id = c.pass_id
    left join pass_week pw on pw.pass_id = c.pass_id
    where c.title is not null -- sin catálogo, el ítem no existe (hydrateItems)
  ),
  final as (
    select x.*,
      case
        when x.item_type='book' and x.book_page > 0 and x.total_pages is not null then x.book_page
        when x.item_type='series' and x.ser_episode > 0 and x.total_episodes is not null then x.ser_episode
      end prog_current,
      case
        when x.item_type='book' and x.book_page > 0 and x.total_pages is not null then x.total_pages
        when x.item_type='series' and x.ser_episode > 0 and x.total_episodes is not null then x.total_episodes
      end prog_total
    from computed x
  )
  select
    jsonb_agg(
      jsonb_build_object(
        'passId', pass_id::text,
        'itemType', item_type,
        'itemId', item_id::text,
        'title', title,
        'subtitle',
          case
            when item_type='series' and ser_season is not null and ser_episode is not null
              then 'Temporada ' || ser_season || ' · Episodio ' || ser_episode
            when item_type='book' then author
            else null
          end,
        'coverUrl', cover_url,
        'percentage',
          case when prog_total is not null
            then least(100, round(prog_current::numeric / prog_total * 100))::int
            else null end,
        'progressLabel',
          case
            when item_type='book' and prog_total is not null then prog_current || ' de ' || prog_total || ' páginas'
            when item_type='series' and prog_total is not null then prog_current || ' de ' || prog_total || ' episodios'
            else 'Sin progreso'
          end,
        'deepLink',
          case when item_type <> 'movie' then '/sesion/' || pass_id::text
               else (case item_type when 'book' then '/libro' when 'movie' then '/pelicula' else '/serie' end) || '/' || item_id::text
          end,
        'nthLabel',
          (reread_count + 1) || (case when item_type='book' then '.ª lectura' else '.º visionado' end),
        'contextLabel',
          array_to_string(array_remove(array[
            case when day_number is not null then 'Día ' || day_number end,
            case when started_on is not null then 'desde ' || date_part('day', started_on)::int || '/' || date_part('month', started_on)::int end,
            case when note_count > 0 then (case when note_count = 1 then '1 nota' else note_count || ' notas' end) end
          ], null), ' · '),
        'streakDays', streak_days,
        'week', coalesce(week, '[]'::jsonb),
        'kindLabel', case item_type when 'series' then 'Serie' when 'movie' then 'Película' else 'Libro' end
      )
      order by last_session_date desc nulls last, started_on desc nulls last, title asc
    ),
    count(*)::int
  into in_progress, in_progress_total
  from final;

  -- Objetivo diario (buildDailyGoalData): null si no hay objetivo configurado.
  if goal_minutes is null or goal_minutes <= 0 then
    daily_goal := null;
  else
    goal_completed := today_minutes >= goal_minutes;
    goal_pct := least(100, round(today_minutes::numeric / goal_minutes * 100))::int;
    goal_message := case
      when goal_completed then 'Objetivo completado'
      when today_minutes = 0 then 'Aún no has registrado progreso hoy'
      else 'Te quedan ' || (goal_minutes - today_minutes) || ' minutos'
    end;
    daily_goal := jsonb_build_object(
      'date', today::text,
      'goalType', 'minutes',
      'currentValue', today_minutes,
      'targetValue', goal_minutes,
      'percentage', goal_pct,
      'progressLabel', today_minutes || ' / ' || goal_minutes || ' min',
      'message', goal_message,
      'streak', global_streak,
      'completed', goal_completed,
      'deepLink', '/'
    );
  end if;

  return jsonb_build_object(
    'version', 2, -- WIDGET_SCHEMA_VERSION (src/lib/widgets/types.ts). Súbelo en AMBOS lados.
    'userId', uid::text,
    'generatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'inProgress', coalesce(in_progress, '[]'::jsonb),
    'inProgressTotal', coalesce(in_progress_total, 0),
    'dailyGoal', daily_goal
  );
end;
$$;

grant execute on function public.get_widget_snapshot() to authenticated;
