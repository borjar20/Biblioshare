-- #727 — 49 tablas de `public` concedían TRUNCATE a `anon`/`authenticated`.
-- Residuo de los default privileges viejos: #691 arregló el FUTURO (las
-- relaciones nuevas ya no nacen con ALL), no el pasado.
--
-- Por qué TRUNCATE es la que importa de las tres:
--
--   - PostgREST no expone TRUNCATE: no hay verbo REST que lo dispare.
--   - Pero **TRUNCATE no lo mira la RLS**. Cualquier camino que acabe ejecutando
--     SQL con el rol `anon`/`authenticated` —una función SECURITY INVOKER mal
--     escrita, una extensión, un proxy futuro— vacía la tabla entera sin que
--     ninguna policy tenga nada que decir. DELETE, en cambio, sí pasa por RLS.
--
-- TRIGGER y REFERENCES se van con ella porque el cliente no hace DDL: ninguno de
-- los dos tiene un uso legítimo desde `anon`/`authenticated`.
--
-- **DELETE NO se toca, y es deliberado.** Hay tablas donde borrar por RLS es el
-- camino legítimo (contenido propio del usuario: notas, pases, posts); ahí el
-- grant es correcto y el cinturón es la policy. Un `revoke delete on all tables`
-- de golpe rompería justo eso.
--
-- Medido antes (dev, 2026-08-20): TRUNCATE anon=49 authenticated=47,
-- TRIGGER 49/47, REFERENCES 49/47.

revoke truncate, trigger, references on all tables in schema public from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;

-- Y que las tablas NUEVAS tampoco nazcan con ellas. Esto cubre lo que cree el
-- rol que ejecuta las migraciones; lo que crea `supabase_admin` sigue naciendo
-- con ALL y no se puede endurecer desde `postgres` — eso es #710, que sigue
-- abierta.
alter default privileges in schema public
  revoke truncate, trigger, references on tables from anon;
alter default privileges in schema public
  revoke truncate, trigger, references on tables from authenticated;
