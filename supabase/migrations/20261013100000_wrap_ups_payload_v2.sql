-- Wrap-ups: el payload pasa a admitir v2 (spec 2026-10-13, revisión visual del
-- wrap-up mensual). v2 es una ampliación compatible de v1 (campos opcionales en
-- in_progress, rhythm y together); las filas v1 ya guardadas siguen siendo válidas.
-- Debe llegar a producción ANTES que el código que escribe v2: con el CHECK
-- antiguo, el cron fallaría al guardar cada crónica.
alter table public.wrap_ups drop constraint if exists wrap_ups_payload_check;
alter table public.wrap_ups add constraint wrap_ups_payload_check
  check (payload->>'v' in ('1', '2'));
