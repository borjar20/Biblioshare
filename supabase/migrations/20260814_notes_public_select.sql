-- El feed de tarjetas por tipo (2026-07-29) muestra la nota de un avance SOLO si
-- su fila en `notes` es pública. Hoy `notes` solo tiene `own notes select`
-- (auth.uid() = user_id), así que el viewer no puede leer notas públicas ajenas.
-- Política SELECT ADITIVA (las políticas se combinan con OR): una nota pública es
-- legible por quien puede ver el perfil de su autor — misma puerta de visibilidad
-- (`can_view_profile`) que ya usa el feed para las sesiones y reseñas. La nota
-- privada sigue oculta a todos menos su dueño.
create policy "public notes select"
  on public.notes
  for select
  to authenticated
  using (is_public = true and public.can_view_profile(user_id));
