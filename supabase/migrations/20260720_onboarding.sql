-- Onboarding (plan 07 §2.4, spec 2026-07-20).
--
-- interests   : respuesta del paso 1. Null = sin responder; el flujo lo trata
--               entonces como "los tres tipos", nunca como "ninguno".
-- onboarded_at: marca de completado. ES el gate de /onboarding.
alter table public.profiles
  add column interests public.item_type[],
  add column onboarded_at timestamptz;

-- Los grants de profiles son POR COLUMNA (ver 20260714_passes_grants.sql y
-- 20260717_progress_sessions_started_at.sql): una columna nueva NO entra sola.
-- Sin esto, el update del onboarding falla con "permission denied for column".
-- Solo authenticated: el flujo exige sesión y ninguna consulta anónima pide
-- estas columnas (comprobado: ningún sitio hace select("*") sobre profiles).
grant select (interests, onboarded_at) on public.profiles to authenticated;
grant update (interests, onboarded_at) on public.profiles to authenticated;

-- Backfill (D6): los perfiles que ya existen NO deben ver el flujo
-- retroactivamente. Para probarlo en dev, poner onboarded_at a null a mano.
update public.profiles
   set onboarded_at = now()
 where onboarded_at is null;

comment on column public.profiles.interests is
  'Tipos que le interesan al usuario (paso 1 del onboarding). Null = sin responder, y entonces el flujo asume los tres.';
comment on column public.profiles.onboarded_at is
  'Cuando termino el onboarding. Null = no lo ha hecho; ES el gate de /onboarding. Se escribe al llegar a la bienvenida, tanto si completo como si salto (D5).';
