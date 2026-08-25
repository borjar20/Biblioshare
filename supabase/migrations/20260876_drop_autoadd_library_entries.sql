-- Acta: el auto-añadir a la biblioteca al unirse a una actividad de club se
-- ELIMINA. No se reimplementa. (issue #782 / hallazgo F1-003 de la auditoría
-- 2026-08.)
--
-- Qué había: dos triggers de EPIC-05 Bloque H3 (20260713_list_challenge.sql)
-- que, al unirse alguien a una actividad o al añadirse un ítem a su pool,
-- insertaban filas `planned` en `library_entries`.
--
-- Por qué se van: `library_entries` está CONGELADA desde el hub de pases
-- (§Tarea 9). El estado vivo del usuario vive en `passes`, y la app no lee
-- `library_entries` en ningún sitio -- las 31 menciones que quedan en `src/`
-- son comentarios explicando justamente eso. O sea que estos triggers llevaban
-- desde entonces escribiendo en una tabla que nadie mira: la feature no hacía
-- nada visible, y el único efecto real era dejar filas huérfanas.
--
-- Se elige eliminar en vez de reimplementar contra `passes` a propósito:
-- `passes` tiene máquina de estados e invariantes propias (estado <-> fechas,
-- un solo pase abierto por obra), así que "crear el pase planned" obliga a
-- decidir qué pasa cuando el usuario ya tiene un pase de esa obra, abierto o
-- cerrado. Nadie ha echado de menos la feature en 153 filas y 3 usuarios, así
-- que no se paga ese precio. Si algún día se quiere, se construye de cero por
-- la vía canónica de `passes`; NO se rescata esto.
--
-- Y sobre todo: dejar vivo un escritor de la tabla muerta es el cebo del
-- siguiente bug. Van cuatro episodios de lo mismo (PR #96, #470, #674, #782):
-- cada vez, algo seguía apuntando a `library_entries`.
--
-- Las 153 filas de producción se DAN POR PERDIDAS y no se migran a `passes`:
-- son estados `planned` que ningún usuario llegó a ver nunca, así que
-- "recuperarlas" sería inventarle a la gente una biblioteca que no eligió. Se
-- quedan donde están, como registro histórico de la tabla congelada.
--
-- NO se toca `validate_club_post_ref`: menciona 'library_entries' como
-- sourceTable aceptada pero NO escribe en la tabla. Es otro diagnóstico.

begin;

drop trigger if exists trg_autoadd_library_on_activity_join on public.club_activity_participants;
drop trigger if exists trg_autoadd_library_on_activity_item on public.club_activity_items;

drop function if exists public.autoadd_library_on_activity_join();
drop function if exists public.autoadd_library_on_activity_item();

-- Segundo cebo, encontrado al verificar este: `anon` tenía INSERT/UPDATE/DELETE
-- sobre la tabla congelada mientras que `authenticated` solo tenía SELECT (al
-- revés de lo que uno esperaría). NO es una fuga hoy -- la RLS está activa y no
-- hay ni una policy de escritura para `anon`, así que el grant no llega a nada.
-- Pero con los triggers fuera no queda ningún escritor legítimo, y un grant sin
-- policy es una mina: basta que alguien añada una policy permisiva en el futuro
-- para convertirlo en escritura anónima. Se revoca ahora que cuesta cero.
-- SELECT se queda: la policy `library entries select visible` sí incluye `anon`.
revoke insert, update, delete on public.library_entries from anon;

comment on table public.library_entries is
  'CONGELADA (hub de pases, Tarea 9). El estado vivo del usuario vive en `passes`. '
  'Nadie lee ni escribe esta tabla: desde 20260876 no queda ningun trigger ni '
  'funcion que la toque, y `anon` ya no tiene grants de escritura. Las 153 filas '
  'que hay son historia, no estado. No construyas nada nuevo contra ella.';

commit;
