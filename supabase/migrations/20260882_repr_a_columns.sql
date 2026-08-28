-- Spec 2026-08-26 (obra/edición/representación B'). Columnas de representación
-- e identidad. Sin grants de cliente: las escriben solo RPCs SECURITY DEFINER
-- y las actions de curación de colaborador (evita la trampa #375 a propósito:
-- ninguna escritura de rol `user` pasa por aquí).

alter table public.books add column if not exists repr_meta jsonb;
alter table public.books add column if not exists google_books_volume_id text;
alter table public.books add column if not exists wikidata_id text;

-- Únicos SIN predicado, mismo criterio que books_openlibrary_work_key_key
-- (20260870): los NULL no chocan entre sí, y ON CONFLICT los necesita únicos.
create unique index if not exists books_google_books_volume_id_key
  on public.books (google_books_volume_id);
create unique index if not exists books_wikidata_id_key
  on public.books (wikidata_id);

-- Backfill: todo valor existente queda con lang 'unknown' (rango 3, mejorable
-- por cualquier candidata es/en) y source 'openlibrary'. Limitación asumida en
-- el spec §7: la curación manual previa es indistinguible y queda mejorable.
update public.books set repr_meta =
  (select jsonb_object_agg(f.k, jsonb_build_object('lang','unknown','source','openlibrary'))
   from (values ('title', title), ('cover', cover_url), ('synopsis', synopsis)) as f(k, v)
   where f.v is not null and f.v <> '')
where repr_meta is null;

comment on column public.books.repr_meta is
  'Procedencia e idioma por campo representable: {"title":{"lang":"es","source":"openlibrary"},...}. lang: es|en|other|unknown. source: openlibrary|google_books|wikidata|manual. manual = curado, intocable para automatismos. Escrito solo por RPCs de hidratación y actions de colaborador.';
