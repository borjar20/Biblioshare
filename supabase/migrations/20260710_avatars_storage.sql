-- Avatares alojados en Supabase Storage (§7.9): elimina las URLs externas
-- (mixed content / tracking-pixel) del render de perfil. Bucket público de
-- lectura; cada usuario solo puede escribir en su propia carpeta {uid}/.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars publicly readable" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

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
