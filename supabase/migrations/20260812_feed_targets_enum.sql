-- target_kind (feed agrupado 2026-07-29) gana dos valores: las altas (passes) y
-- las sesiones de progreso (progress_sessions) se vuelven targets reales de
-- reactions/comments, para poder reaccionar/comentar la actividad del feed que
-- hoy no lo permite (added/progressed). En su PROPIA migración: can_view_target
-- referencia estos literales y no pueden usarse en la misma transacción que los
-- crea (mismo idiom que club_post/comment en el baseline).
alter type public.target_kind add value if not exists 'pass';
alter type public.target_kind add value if not exists 'progress_session';
