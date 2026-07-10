-- Avatares alojados en Supabase Storage (§7.9): elimina las URLs externas
-- (mixed content / tracking-pixel) del render de perfil. Bucket público de
-- lectura; cada usuario solo puede escribir en su propia carpeta {uid}/.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Nota: un bucket público sirve sus objetos por URL pública SIN necesidad de
-- una política SELECT sobre storage.objects. No se añade una política SELECT
-- amplia a propósito: permitiría LISTAR el bucket (enumerar {user_id}/…), una
-- fuga menor de información. Solo se conceden escrituras a la carpeta propia.

create policy "avatars insert own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars update own folder" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars delete own folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
