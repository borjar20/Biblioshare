-- Las demás grafías conocidas del nombre de una persona.
--
-- Para qué: Open Library da un nombre canónico que puede estar en otro alfabeto
-- ("Фёдор Достоевский") y una lista de variantes. Se enseña la forma latina y
-- las demás se guardan aquí, que es lo que permite reconocer que "Dostoievski"
-- y "Fyodor Dostoyevsky" son la MISMA fila en vez de crear una por idioma.
alter table public.people
  add column aliases text[] not null default '{}';

-- ⚠️ Los grants de columna NO son opcionales: `people` tiene grants FINOS —las
-- otras 12 columnas tienen SELECT, INSERT y REFERENCES por separado para `anon`
-- y `authenticated`—, y una columna nueva sin su grant de INSERT rompe la
-- escritura ENTERA de la tabla, no solo este campo (issue #375, superficie 6 de
-- docs/DRIFT-CHECK.md).
--
-- SELECT va incluido porque el mismo razonamiento aplica en la otra dirección:
-- un `select *` sobre `people` fallaría entero por esta columna. Hoy ninguna
-- consulta la pide (todas listan columnas a mano, ver `PERSON_COLUMNS`), así
-- que omitirlo no rompía nada HOY — y esa es justo la clase de mina que estalla
-- meses después, cuando alguien añada `aliases` a esa lista para casar nombres.
grant select (aliases), insert (aliases), references (aliases)
  on public.people to anon, authenticated;

-- Sin grant de UPDATE a propósito: la app no reescribe personas (hoy
-- `authenticated` solo puede tocar bio, fechas, foto y lugar de nacimiento), y
-- el backfill que corrige nombres y alias va con service_role.

comment on column public.people.aliases is
  'Otras grafías del nombre (otros idiomas y alfabetos). El nombre visible vive en `name`.';
