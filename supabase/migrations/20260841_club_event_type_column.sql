-- event_type: discriminador de tipo de evento. Default 'encuentro' hace el
-- backfill gratis -- todo evento existente ES un encuentro (lo único creable
-- hasta hoy). Grant por columna igual que `modality` (issue #375: una columna
-- sin grant rompe la escritura ENTERA de la tabla).
--
-- Nota: los grants reales medidos sobre `modality` (information_schema.column_privileges)
-- incluyen SELECT/INSERT/UPDATE/REFERENCES para anon, authenticated y service_role
-- (más postgres, implícito por ser el owner de la tabla) -- se replican EXACTOS aquí,
-- no la referencia simplificada del brief.
alter table public.club_activities
  add column event_type public.club_event_type not null default 'encuentro';

grant select (event_type), insert (event_type), update (event_type), references (event_type)
  on public.club_activities to anon, authenticated, service_role;
