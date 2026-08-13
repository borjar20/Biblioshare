-- Las demás grafías conocidas del nombre de una persona.
--
-- Para qué: Open Library da un nombre canónico que puede estar en otro alfabeto
-- ("Фёдор Достоевский") y una lista de variantes. Se enseña la forma latina y
-- las demás se guardan aquí, que es lo que permite reconocer que "Dostoievski"
-- y "Fyodor Dostoyevsky" son la MISMA fila en vez de crear una por idioma.
alter table public.people
  add column aliases text[] not null default '{}';

-- ⚠️ El grant de columna NO es opcional: `people` tiene grants finos, y una
-- columna nueva sin su grant de INSERT rompe la escritura ENTERA de la tabla,
-- no solo este campo (issue #375, superficie 6 de docs/DRIFT-CHECK.md).
grant insert (aliases), references (aliases) on public.people to anon, authenticated;

-- Sin grant de UPDATE a propósito: la app no reescribe personas (hoy
-- `authenticated` solo puede tocar bio, fechas, foto y lugar de nacimiento), y
-- el backfill que corrige nombres y alias va con service_role.

comment on column public.people.aliases is
  'Otras grafías del nombre (otros idiomas y alfabetos). El nombre visible vive en `name`.';
