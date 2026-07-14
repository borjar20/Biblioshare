-- Portadas alojadas en Supabase Storage, para que un colaborador pueda corregir
-- la portada de una ficha (los datos de OpenLibrary llegan sucios y a veces sin
-- portada, o con una que no es).
--
-- Mismo patrón que el bucket de avatares (20260710_avatars_storage.sql), con UNA
-- diferencia que importa: en avatares la puerta es la CARPETA (cada usuario
-- escribe en la suya, {uid}/). Aquí la portada es del CATÁLOGO COMPARTIDO: no es
-- de nadie, así que la puerta es el ROL. Mismo criterio que crear ediciones o
-- asignar sagas (§7.35): colaborador o superior.
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

-- Como en avatares, NO se añade una política SELECT amplia: el bucket es público
-- y sirve sus objetos por URL, y una SELECT abierta permitiría LISTAR el bucket.

create policy "covers insert by collaborators" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'covers'
    and public.current_user_role() in ('collaborator', 'admin')
  );

create policy "covers update by collaborators" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'covers'
    and public.current_user_role() in ('collaborator', 'admin')
  )
  with check (
    bucket_id = 'covers'
    and public.current_user_role() in ('collaborator', 'admin')
  );

create policy "covers delete by collaborators" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'covers'
    and public.current_user_role() in ('collaborator', 'admin')
  );
