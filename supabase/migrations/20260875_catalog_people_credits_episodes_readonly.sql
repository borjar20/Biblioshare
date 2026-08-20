-- #725 (S2-05) — `credits`, `people` y `series_episodes` son catálogo GLOBAL, y
-- su INSERT estaba abierto de par en par:
--
--   credits insertable          INSERT  {authenticated}  with check (true)
--   people insertable           INSERT  {authenticated}  with check (true)
--   series_episodes insertable  INSERT  {authenticated}  with check (true)
--
-- Con una sesión normal y un POST a PostgREST se podía colgar de cualquier
-- persona una filmografía inventada, crear personas que no existen, o inventar
-- episodios — y lo veía TODO el mundo, porque el catálogo es compartido. #674
-- cerró esto mismo para `movies`/`series`/`books` y **estas tres se quedaron
-- fuera**.
--
-- Esta migración es la SEGUNDA mitad del arreglo. La primera va en el código y
-- tiene que estar desplegada antes: las cinco funciones que escribían aquí con
-- el cliente de la petición pasan a escribir con **service_role**
-- (`createServiceRoleClient`), que no pasa por RLS ni por estos grants:
--
--   src/lib/library/ensure-series-episodes.ts   series_episodes · insert
--   src/lib/people/find-or-create-person.ts     people · insert (x2)
--   src/lib/people/get-person.ts                people · update (bio TMDB)
--   src/lib/people/hydrate-person-credits.ts    credits · upsert + people · update
--   src/lib/people/enrich-item.ts               credits · upsert (x2)
--
-- El argumento es el mismo que ya se aplicó a las sagas de TMDB
-- (`src/lib/sagas/persist-collection.ts`, #675): **estas filas las deriva el
-- SERVIDOR del proveedor** —TMDB, Open Library— y ni un campo viene del cliente,
-- así que el hecho lo respalda el servidor y la tabla puede quedar cerrada a la
-- sesión de quien mira.
--
-- ⚠️ **ORDEN DE DESPLIEGUE, y no es opcional.** Si esto se aplica ANTES de que el
-- código nuevo esté vivo, las cinco escrituras empiezan a fallar con 42501. No
-- rompen ninguna página —todas son best-effort— pero se rompen EN SILENCIO: la
-- rejilla de episodios se queda vacía para siempre y el reparto no se escribe
-- nunca. Es el modo de fallo exacto de #699, y no se ve con una cuenta admin.
-- Primero el deploy, después la base.
--
-- Efecto secundario BUSCADO: un visitante anónimo pasa a hidratar donde antes su
-- escritura moría con 42501 — la bio de una persona, el reparto de una ficha, los
-- episodios de una serie. Comprobado en producción: abriendo `/persona/<id>` sin
-- sesión, la fila se queda con bio y foto escritas.
--
-- Con UNA excepción, medida el 2026-08-20 y que conviene no confundir: la
-- hidratación de la FILMOGRAFÍA de una persona (`hydratePersonCredits`) sigue sin
-- funcionar para el anónimo, porque antes de llegar a `credits` pasa por
-- `register_catalog_items_bulk` para dar de alta las obras, y esa RPC exige
-- `auth.uid()`. Ahí el gate es otro y no lo toca esta migración.

-- ---------------------------------------------------------------------------
-- 1. Las policies abiertas
-- ---------------------------------------------------------------------------
drop policy if exists "credits insertable" on public.credits;
drop policy if exists "people insertable" on public.people;
drop policy if exists "series_episodes insertable" on public.series_episodes;

-- `people bio enrichable` (UPDATE ... using true) se va con ellas: la única
-- escritura que la usaba —el enriquecimiento de bio desde TMDB— ya va con
-- service_role. El trigger `enforce_people_enrich_only` (fill-only) se queda
-- donde está: es la red por si alguien vuelve a abrir una policy de UPDATE.
drop policy if exists "people bio enrichable" on public.people;

-- ---------------------------------------------------------------------------
-- 2. Y los grants, que son el otro cinturón
-- ---------------------------------------------------------------------------
-- Sin policy no se escribe, pero dejar el grant puesto es lo que hace que el
-- siguiente `create policy` descuidado vuelva a abrir el agujero entero. Se
-- quitan los tres verbos de escritura, incluidos los grants POR COLUMNA de
-- `people` (`bio`, `photo_url`, `birth_date`, `death_date`, `place_of_birth`,
-- `credits_hydrated_at`, `aliases`): un `revoke update on <tabla>` se los lleva
-- todos.
revoke insert, update, delete on public.credits from anon, authenticated;
revoke insert, update, delete on public.people from anon, authenticated;
revoke insert, update, delete on public.series_episodes from anon, authenticated;

-- El SELECT NO se toca: el catálogo se lee en público, y sus policies de lectura
-- (`… readable by all`) siguen igual.
