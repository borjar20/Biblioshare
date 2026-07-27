-- supabase/migrations/20260728_sagas_show_map.sql
-- Hasta la fase 3, tener mapa significaba que alguien lo había DIBUJADO a
-- mano, así que su existencia ya era la señal de que merecía enseñarse. Al
-- derivarlo de la curación, toda saga con miembros tiene mapa y esa señal
-- desaparece: el de una saga de dos títulos no aporta nada. Lo decide el
-- curador.
alter table public.sagas add column show_map boolean not null default false;

-- Las sagas que HOY tienen mapa lo siguen enseñando: retirarlo en silencio
-- sería una pérdida, no una migración.
update public.sagas s set show_map = true
 where exists (select 1 from public.saga_nodes n where n.saga_id = s.id);
