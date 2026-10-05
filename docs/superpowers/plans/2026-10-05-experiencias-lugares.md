# Experiencias — lugares reales autocompletados · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El campo «Lugar» de un momento autocompleta sitios, ciudades, regiones y países de OpenStreetMap (vía Photon) y guarda el lugar elegido como dato estructurado en una tabla global `places`, sin dejar de aceptar texto libre.

**Architecture:** Un proxy autenticado (`/api/places/search`) consulta Photon dentro de una función `use cache`, filtra con una lista blanca y devuelve sugerencias firmadas con HMAC. Al guardar, la server action verifica la firma y da de alta el lugar con el cliente de servicio (`place_upsert`, solo `service_role`); después la RPC de siempre (`experience_create` / `experience_save_moment`, con la sesión del usuario) enlaza `place_id` y copia el nombre oficial en `place_label`, así las lecturas no cambian.

**Tech Stack:** Next.js 16.3 (App Router, `cacheComponents`), Supabase Postgres (RPC plpgsql SECURITY DEFINER), node `crypto` (HMAC), React 19 + next-intl, Vitest + Testing Library, Playwright.

**Spec:** [`docs/superpowers/specs/2026-10-05-experiencias-lugares-design.md`](../specs/2026-10-05-experiencias-lugares-design.md)

## Global Constraints

- Proveedor único `'osm'`; `provider_ref` = `osm_type` + `osm_id` (`^[NWR][0-9]+$`).
- Capas: `poi`, `city`, `region`, `country`. Nunca direcciones, calles, edificios sin nombre.
- Búsqueda: sesión obligatoria (401), `q` recortada de 3–100 caracteres, ≤ 6 resultados, timeout Photon 3 s.
- Token: HMAC-SHA256 con `PLACES_SIGNING_SECRET` (server-only, ≥ 32 caracteres), caduca a 1 h, ≤ 2048 caracteres.
- El guardado **nunca** falla por el lugar: token inválido/caducado → se guarda como texto.
- `place_upsert` ejecutable **solo** por `service_role`. `places`: RLS, solo SELECT para clientes.
- Las firmas SQL de `experience_create(jsonb)` y `experience_save_moment(uuid,bigint,jsonb)` **no cambian** (nada de sobrecargas).
- Regla #437: lo cacheado (`use cache`) no toca Supabase, sesión, `cookies()` ni `headers()`; el token (con `exp`) **nunca** se cachea.
- Atribución visible «© OpenStreetMap» bajo la lista de sugerencias.
- Migraciones: dev primero (`biblioshare-dev`), producción solo tras verificar; verificar contra objetos reales (`pg_proc`/`pg_class`), no el ledger.
- Node 22 (ver memoria: el shell trae v20 y rompe vitest → `fnm use 22`).
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20261005100000_experience_places.sql` | Tabla `places`, columna `experience_moments.place_id`, helper de lugar, `place_upsert`, RPC ampliadas |
| `supabase/tests/experiences_places.sql` | Contrato SQL con rollback |
| `src/lib/places/types.ts` | `PlaceLayer`, `PlaceData`, `PlaceSuggestion` |
| `src/lib/places/classify.ts` | `classifyPhotonFeature`, `isPlaceData`, `placeSubtitle` (puras) |
| `src/lib/places/token.ts` | `signPlace`, `verifyPlace` (puras, sin `server-only` para que e2e las importe) |
| `src/lib/places/search.ts` | `searchPlaces(q)` con `fetchPhoton` cacheado + mock |
| `src/lib/places/register.ts` | `placesSecret()`, `resolvePlaceToken()` (server-only, cliente de servicio) |
| `src/lib/places/__fixtures__/photon.json` | Respuesta Photon real recortada |
| `src/app/api/places/search/route.ts` | Proxy autenticado que firma |
| `src/components/experiences/place-combobox.tsx` | Combobox ARIA con chip |
| Modificados | `src/lib/experiences/{types,validation,actions,queries}.ts`, `experience-form.tsx`, `moment-editor.tsx`, `database.types.ts`, `messages/es.json`, `.env.example`, `supabase/bootstrap/manifest.json`, `scripts/db/verify.mjs`, docs |

---

### Task 1: Esquema — `places`, `place_id`, `place_upsert` y RPC ampliadas

**Files:**
- Create: `supabase/migrations/20261005100000_experience_places.sql`
- Create: `supabase/tests/experiences_places.sql`
- Modify: `supabase/bootstrap/manifest.json` (añadir el nombre de la migración al final de `migrations`)
- Modify: `scripts/db/verify.mjs` (tras la línea de `experiences_reviews.sql`)
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: tabla `public.places`; columna `experience_moments.place_id uuid null`; `public.place_upsert(p_input jsonb) returns uuid` con claves camelCase `provider, providerRef, name, category, layer, lat, lng, city, region, country, countryCode, wikidataQid`; `experience_create` acepta `placeId`; `experience_save_moment` acepta `placeId` y `keepPlace`.

- [ ] **Step 1: Escribir el test SQL (falla: no existe `places`)**

`supabase/tests/experiences_places.sql`:

```sql
begin;
create temporary table xp(k text primary key,id uuid not null default gen_random_uuid());
insert into xp(k) values('owner'),('root'),('moment'),('place');
grant select,update on xp to anon,authenticated;
insert into auth.users(id) select id from xp where k='owner';
insert into public.profiles(user_id,username,is_public) select id,'plc_'||left(replace(id::text,'-',''),15),true from xp where k='owner';
-- As postgres (service path): upsert inserts, then updates in place.
update xp set id=public.place_upsert('{"provider":"osm","providerRef":"W123","name":"Museo del Prado","category":"tourism:museum","layer":"poi","lat":40.4138,"lng":-3.6921,"city":"Madrid","region":"Comunidad de Madrid","country":"España","countryCode":"ES","wikidataQid":"Q160112"}') where k='place';
do $$ begin
  if public.place_upsert('{"provider":"osm","providerRef":"W123","name":"Museo Nacional del Prado","category":"tourism:museum","layer":"poi","lat":40.4138,"lng":-3.6921,"city":"Madrid","region":null,"country":"España","countryCode":"ES","wikidataQid":null}')<>(select id from xp where k='place') then raise exception 'FAIL upsert identity'; end if;
  if (select name from public.places where id=(select id from xp where k='place'))<>'Museo Nacional del Prado' then raise exception 'FAIL upsert refresh'; end if;
  if (select wikidata_qid from public.places where id=(select id from xp where k='place'))<>'Q160112' then raise exception 'FAIL qid kept'; end if;
  begin perform public.place_upsert('{"provider":"osm","providerRef":"X1","name":"x","category":"tourism:museum","layer":"poi","lat":0,"lng":0}'); raise exception 'FAIL bad ref'; exception when check_violation then null; end;
  begin perform public.place_upsert('{"provider":"osm","providerRef":"N1","name":"x","category":"tourism:museum","layer":"street","lat":0,"lng":0}'); raise exception 'FAIL bad layer'; exception when check_violation then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xp where k='owner'),true);
do $$ begin
  -- Clients read places but never write them, directly or through place_upsert.
  if not exists(select 1 from public.places where id=(select id from xp where k='place')) then raise exception 'FAIL places readable'; end if;
  begin perform public.place_upsert('{"provider":"osm","providerRef":"N9","name":"x","category":"tourism:museum","layer":"poi","lat":0,"lng":0}'); raise exception 'FAIL client upsert'; exception when insufficient_privilege then null; end;
  begin insert into public.places(provider,provider_ref,name,category,layer,lat,lng) values('osm','N8','x','tourism:museum','poi',0,0); raise exception 'FAIL direct insert'; exception when insufficient_privilege then null; end;
end $$;
-- Create with placeId: label becomes the official name, whatever the client sent.
update xp set id=(public.experience_create(jsonb_build_object('title','[TEST] places','kind','museum','state','lived','placeLabel','lo que sea','placeId',(select id from xp where k='place')))->>'id')::uuid where k='root';
update xp set id=(select id from public.experience_moments where experience_id=(select id from xp where k='root')) where k='moment';
do $$ declare m public.experience_moments; begin
  select * into m from public.experience_moments where id=(select id from xp where k='moment');
  if m.place_id is distinct from (select id from xp where k='place') or m.place_label<>'Museo Nacional del Prado' then raise exception 'FAIL create link'; end if;
  -- Unknown place id is invalid.
  begin perform public.experience_create(jsonb_build_object('title','x','kind','museum','state','lived','placeId',gen_random_uuid())); raise exception 'FAIL unknown place'; exception when sqlstate '22023' then null; end;
  begin perform public.experience_create('{"title":"x","kind":"museum","state":"lived","placeId":"nope"}'); raise exception 'FAIL bad uuid'; exception when sqlstate '22023' then null; end;
  -- keepPlace is only for existing moments.
  begin perform public.experience_create('{"title":"x","kind":"museum","state":"lived","keepPlace":true}'); raise exception 'FAIL keepPlace on create'; exception when sqlstate '22023' then null; end;
end $$;
do $$ declare rev bigint; m public.experience_moments; begin
  select revision into rev from public.experiences where id=(select id from xp where k='root');
  -- keepPlace preserves link and label even if a different label is sent.
  perform public.experience_save_moment((select id from xp where k='root'),rev,jsonb_build_object('id',(select id from xp where k='moment'),'title','Prado','kind','museum','placeLabel','otra cosa','keepPlace',true));
  select * into m from public.experience_moments where id=(select id from xp where k='moment');
  if m.place_id is distinct from (select id from xp where k='place') or m.place_label<>'Museo Nacional del Prado' then raise exception 'FAIL keepPlace'; end if;
  begin perform public.experience_save_moment((select id from xp where k='root'),rev+1,jsonb_build_object('title','n','kind','museum','keepPlace',true)); raise exception 'FAIL keepPlace on insert'; exception when sqlstate '22023' then null; end;
  begin perform public.experience_save_moment((select id from xp where k='root'),rev+1,jsonb_build_object('id',(select id from xp where k='moment'),'title','n','kind','museum','keepPlace',true,'placeId',(select id from xp where k='place'))); raise exception 'FAIL both'; exception when sqlstate '22023' then null; end;
  -- Plain text clears the link.
  perform public.experience_save_moment((select id from xp where k='root'),rev+1,jsonb_build_object('id',(select id from xp where k='moment'),'title','Prado','kind','museum','placeLabel','Casa de mis padres'));
  select * into m from public.experience_moments where id=(select id from xp where k='moment');
  if m.place_id is not null or m.place_label<>'Casa de mis padres' then raise exception 'FAIL text clears link'; end if;
end $$;
reset role;
-- Grants: place_upsert only for service_role; no PUBLIC execute.
do $$ begin
  if has_function_privilege('authenticated','public.place_upsert(jsonb)','execute') or has_function_privilege('anon','public.place_upsert(jsonb)','execute') then raise exception 'FAIL upsert grants'; end if;
  if not has_function_privilege('service_role','public.place_upsert(jsonb)','execute') then raise exception 'FAIL service grant'; end if;
  if not (select relrowsecurity from pg_class where oid='public.places'::regclass) then raise exception 'FAIL places RLS'; end if;
end $$;
rollback;
```

- [ ] **Step 2: Registrar el test y ver que falla**

En `scripts/db/verify.mjs`, debajo de la línea de `experiences_reviews.sql`:

```js
sql(readFileSync(join(repoRoot, 'supabase/tests/experiences_places.sql'), 'utf8'));
```

Run: `npm run test:db:local` (requiere el stack local de `scripts/db`; si no está levantado, `node scripts/db/bootstrap.mjs` según `docs/TESTING.md`).
Expected: FAIL con `function public.place_upsert(unknown) does not exist`.

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/20261005100000_experience_places.sql`:

```sql
-- Global place catalog for experience moments (spec 2026-10-05-experiencias-lugares).
-- Written only through place_upsert (service_role) after the app verifies a signed
-- Photon suggestion; clients just read it.
create table public.places(
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('osm')),
  provider_ref text not null check (provider_ref ~ '^[NWR][0-9]+$'),
  name text not null check (char_length(name) between 1 and 240),
  category text not null check (char_length(category) between 3 and 120),
  layer text not null check (layer in ('poi','city','region','country')),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  city text check (char_length(city) <= 240),
  region text check (char_length(region) <= 240),
  country text check (char_length(country) <= 240),
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  wikidata_qid text check (wikidata_qid ~ '^Q[0-9]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
alter table public.places enable row level security;
revoke all on public.places from public, anon, authenticated;
grant select on public.places to anon, authenticated;
create policy places_read on public.places for select to anon, authenticated using (true);

alter table public.experience_moments add column place_id uuid references public.places(id) on delete set null;
create index experience_moments_place on public.experience_moments(place_id) where place_id is not null;

create function public.place_upsert(p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare r uuid; begin
  if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'invalid' using errcode='22023'; end if;
  insert into public.places(provider,provider_ref,name,category,layer,lat,lng,city,region,country,country_code,wikidata_qid)
  values(p_input->>'provider',p_input->>'providerRef',btrim(p_input->>'name'),p_input->>'category',p_input->>'layer',
    (p_input->>'lat')::double precision,(p_input->>'lng')::double precision,
    nullif(btrim(p_input->>'city'),''),nullif(btrim(p_input->>'region'),''),nullif(btrim(p_input->>'country'),''),
    p_input->>'countryCode',p_input->>'wikidataQid')
  on conflict (provider,provider_ref) do update set name=excluded.name,category=excluded.category,layer=excluded.layer,
    lat=excluded.lat,lng=excluded.lng,city=excluded.city,region=excluded.region,country=excluded.country,
    country_code=excluded.country_code,wikidata_qid=coalesce(excluded.wikidata_qid,places.wikidata_qid),updated_at=now()
  returning id into r;
  return r;
end $$;
revoke all on function public.place_upsert(jsonb) from public, anon, authenticated;
grant execute on function public.place_upsert(jsonb) to service_role;

-- Resolves the place of a moment input: placeId wins (label = official name); otherwise free text.
create function private.experience_input_place(p jsonb) returns table(out_id uuid, out_label text)
language plpgsql stable set search_path='' as $$
declare pid uuid; begin
  if p ? 'placeId' then
    begin pid:=(p->>'placeId')::uuid; exception when invalid_text_representation then raise exception 'invalid place' using errcode='22023'; end;
    return query select pl.id, pl.name from public.places pl where pl.id=pid;
    if not found then raise exception 'invalid place' using errcode='22023'; end if;
    return;
  end if;
  return query select null::uuid, nullif(btrim(p->>'placeLabel'),'');
end $$;
revoke all on function private.experience_input_place(jsonb) from public, anon, authenticated;

create or replace function public.experience_create(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e uuid; m uuid; member uuid; pid uuid; plabel text; begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  perform private.require_request_quota('experience_write');
  perform private.experience_validate_input(p_input,array['title','state','kind','placeLabel','placeId','startsOn','endsOn']);
  if coalesce(p_input->>'state','') not in ('planned','lived') or not private.is_experience_kind(p_input->>'kind') then raise exception 'invalid' using errcode='22023'; end if;
  select x.out_id, x.out_label into pid, plabel from private.experience_input_place(p_input) x;
  insert into public.experiences(creator_id,title,state,starts_on,ends_on)
    values(auth.uid(),btrim(p_input->>'title'),p_input->>'state',(p_input->>'startsOn')::date,(p_input->>'endsOn')::date) returning id into e;
  insert into public.experience_moments(experience_id,title,kind,place_id,place_label,starts_on,ends_on,position)
    values(e,btrim(p_input->>'title'),p_input->>'kind',pid,plabel,(p_input->>'startsOn')::date,(p_input->>'endsOn')::date,0) returning id into m;
  insert into public.experience_participants(experience_id,user_id,invitation_state) values(e,auth.uid(),'accepted') returning id into member;
  insert into public.experience_moment_participants(experience_id,moment_id,participant_id,attendance_state)
    values(e,m,member,case when p_input->>'state'='lived' then 'attended' else 'planned' end);
  return jsonb_build_object('id',e);
end $$;

create or replace function public.experience_save_moment(p_id uuid,p_revision bigint,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m uuid; n integer; keep boolean; pid uuid; plabel text; begin
  if p_revision is null or p_revision<0 then raise exception 'invalid revision' using errcode='22023'; end if;
  perform private.experience_owner_lock(p_id,p_revision);
  perform private.experience_validate_input(p_input,array['id','title','kind','placeLabel','placeId','keepPlace','startsOn','endsOn']);
  if not private.is_experience_kind(p_input->>'kind') then raise exception 'invalid kind' using errcode='22023'; end if;
  if p_input ? 'keepPlace' and jsonb_typeof(p_input->'keepPlace')<>'boolean' then raise exception 'invalid keepPlace' using errcode='22023'; end if;
  keep:=coalesce((p_input->>'keepPlace')::boolean,false);
  if keep and (p_input ? 'placeId' or not p_input ? 'id') then raise exception 'invalid keepPlace' using errcode='22023'; end if;
  if not keep then select x.out_id, x.out_label into pid, plabel from private.experience_input_place(p_input) x; end if;
  if p_input ? 'id' then
    begin m:=(p_input->>'id')::uuid; exception when invalid_text_representation then raise exception 'invalid id' using errcode='22023'; end;
    if m is null or not exists(select 1 from public.experience_moments where id=m and experience_id=p_id) then raise exception 'invalid moment' using errcode='22023'; end if;
    update public.experience_moments set title=btrim(p_input->>'title'),kind=p_input->>'kind',
      place_id=case when keep then place_id else pid end,place_label=case when keep then place_label else plabel end,
      starts_on=(p_input->>'startsOn')::date,ends_on=(p_input->>'endsOn')::date,updated_at=now() where id=m;
  else
    select count(*) into n from public.experience_moments where experience_id=p_id;
    if n>=50 then raise exception 'moment limit' using errcode='PT429'; end if;
    insert into public.experience_moments(experience_id,title,kind,place_id,place_label,starts_on,ends_on,position)
      values(p_id,btrim(p_input->>'title'),p_input->>'kind',pid,plabel,(p_input->>'startsOn')::date,(p_input->>'endsOn')::date,(select coalesce(max(position),-1)+1 from public.experience_moments where experience_id=p_id)) returning id into m;
    -- Propose attendance only; an account confirms its own attended/skipped state.
    insert into public.experience_moment_participants(experience_id,moment_id,participant_id)
      select p_id,m,id from public.experience_participants where experience_id=p_id and invitation_state='accepted';
    if n>=1 then update public.experiences set shape='trip' where id=p_id; end if;
  end if;
  update public.experiences set revision=revision+1,updated_at=now() where id=p_id;
  return jsonb_build_object('id',m,'revision',p_revision+1);
end $$;
```

Comprobar antes que `create or replace` conserva ACL: las dos RPC ya tenían `revoke … from public` + `grant … to authenticated` en `20261002092737_experiences_core.sql`; `create or replace` con la **misma firma** conserva los privilegios, no hay que repetirlos.

Añadir `"20261005100000_experience_places.sql"` al final del array `migrations` de `supabase/bootstrap/manifest.json`.

- [ ] **Step 4: Ver el test pasar**

Run: `npm run test:db:local`
Expected: termina sin `FAIL` (todas las suites, incluida `experiences_places.sql`).

- [ ] **Step 5: Tipos de base de datos**

En `src/lib/supabase/database.types.ts`:
- En `experience_moments` → `Row` añadir `place_id: string | null`; en `Insert` y `Update` añadir `place_id?: string | null`; en `Relationships` añadir `{ foreignKeyName: "experience_moments_place_id_fkey"; columns: ["place_id"]; isOneToOne: false; referencedRelation: "places"; referencedColumns: ["id"] }`.
- En `Tables` añadir (orden alfabético) `places` con `Row` = `{ category: string; city: string | null; country: string | null; country_code: string | null; created_at: string; id: string; lat: number; layer: string; lng: number; name: string; provider: string; provider_ref: string; region: string | null; updated_at: string; wikidata_qid: string | null }`, `Insert`/`Update` con todo opcional salvo en `Insert` `category, lat, layer, lng, name, provider, provider_ref`, y `Relationships: []`.
- En `Functions` añadir `place_upsert: { Args: { p_input: Json }; Returns: string }`.

Si el MCP `supabase-dev` está conectado, en su lugar regenerar con `generate_typescript_types` tras aplicar en dev (Task 8) y comparar.

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261005100000_experience_places.sql supabase/tests/experiences_places.sql supabase/bootstrap/manifest.json scripts/db/verify.mjs src/lib/supabase/database.types.ts
git commit -m "feat(db): catálogo de lugares y place_id en momentos de experiencias"
```

---

### Task 2: Clasificación de Photon y firma de sugerencias (lógica pura)

**Files:**
- Create: `src/lib/places/types.ts`, `src/lib/places/classify.ts`, `src/lib/places/token.ts`
- Create: `src/lib/places/__fixtures__/photon.json`
- Test: `src/lib/places/classify.test.ts`, `src/lib/places/token.test.ts`

**Interfaces:**
- Produces:
  - `type PlaceLayer = "poi" | "city" | "region" | "country"`
  - `interface PlaceData { provider: "osm"; providerRef: string; name: string; category: string; layer: PlaceLayer; lat: number; lng: number; city: string | null; region: string | null; country: string | null; countryCode: string | null; wikidataQid: string | null }`
  - `interface PlaceSuggestion { token: string; name: string; layer: PlaceLayer; subtitle: string | null }`
  - `classifyPhotonFeature(feature: unknown): PlaceData | null`
  - `isPlaceData(value: unknown): value is PlaceData`
  - `placeSubtitle(place: PlaceData): string | null`
  - `signPlace(place: PlaceData, secret: string, now?: number): string`
  - `verifyPlace(token: string, secret: string, now?: number): PlaceData | null`
  - `PLACE_TOKEN_TTL_MS = 3_600_000`, `PLACE_TOKEN_MAX = 2048`

- [ ] **Step 1: Fixture**

`src/lib/places/__fixtures__/photon.json` — forma real de Photon (`/api?q=…`), recortada a lo que leemos:

```json
{
  "type": "FeatureCollection",
  "features": [
    {"type":"Feature","geometry":{"type":"Point","coordinates":[-3.6921,40.4138]},"properties":{"osm_type":"W","osm_id":28118138,"osm_key":"tourism","osm_value":"museum","type":"house","name":"Museo Nacional del Prado","city":"Madrid","state":"Comunidad de Madrid","country":"España","countrycode":"ES","extra":{"wikidata":"Q160112"}}},
    {"type":"Feature","geometry":{"type":"Point","coordinates":[-9.1365,38.7077]},"properties":{"osm_type":"R","osm_id":5400890,"osm_key":"place","osm_value":"city","type":"city","name":"Lisboa","state":"Lisboa","country":"Portugal","countrycode":"PT"}},
    {"type":"Feature","geometry":{"type":"Point","coordinates":[-5.86,43.29]},"properties":{"osm_type":"R","osm_id":349033,"osm_key":"boundary","osm_value":"administrative","type":"state","name":"Asturias","country":"España","countrycode":"ES"}},
    {"type":"Feature","geometry":{"type":"Point","coordinates":[-3.7,40.4]},"properties":{"osm_type":"R","osm_id":1311341,"osm_key":"place","osm_value":"country","type":"country","name":"España","countrycode":"ES"}},
    {"type":"Feature","geometry":{"type":"Point","coordinates":[-3.69,40.41]},"properties":{"osm_type":"W","osm_id":4387126,"osm_key":"highway","osm_value":"residential","type":"street","name":"Calle del Prado","city":"Madrid","country":"España","countrycode":"ES"}},
    {"type":"Feature","geometry":{"type":"Point","coordinates":[-3.69,40.41]},"properties":{"osm_type":"N","osm_id":999,"osm_key":"place","osm_value":"house","type":"house","housenumber":"3","street":"Calle del Prado","city":"Madrid","country":"España","countrycode":"ES"}},
    {"type":"Feature","geometry":{"type":"Point","coordinates":[-3.69,40.41]},"properties":{"osm_type":"W","osm_id":1000,"osm_key":"building","osm_value":"yes","type":"house","name":"Edificio","city":"Madrid","country":"España","countrycode":"ES"}},
    {"type":"Feature","geometry":{"type":"Point","coordinates":[-3.69,40.41]},"properties":{"osm_type":"N","osm_id":1001,"osm_key":"amenity","osm_value":"bar","type":"house","city":"Madrid","country":"España","countrycode":"ES"}}
  ]
}
```

- [ ] **Step 2: Tests que fallan**

`src/lib/places/classify.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import photon from "./__fixtures__/photon.json";
import { classifyPhotonFeature, isPlaceData, placeSubtitle } from "./classify";
const [museum, lisbon, asturias, spain, street, house, building, unnamed] = photon.features;

describe("classifyPhotonFeature", () => {
  it("accepts a named POI with its wikidata id", () => {
    expect(classifyPhotonFeature(museum)).toEqual({ provider: "osm", providerRef: "W28118138", name: "Museo Nacional del Prado", category: "tourism:museum", layer: "poi", lat: 40.4138, lng: -3.6921, city: "Madrid", region: "Comunidad de Madrid", country: "España", countryCode: "ES", wikidataQid: "Q160112" });
  });
  it("maps cities, administrative regions and countries to their layer", () => {
    expect(classifyPhotonFeature(lisbon)?.layer).toBe("city");
    expect(classifyPhotonFeature(asturias)?.layer).toBe("region");
    expect(classifyPhotonFeature(spain)?.layer).toBe("country");
  });
  it.each([["street", street], ["house", house], ["building", building], ["unnamed POI", unnamed]])("rejects %s", (_label, feature) => {
    expect(classifyPhotonFeature(feature)).toBeNull();
  });
  it.each([null, "x", { properties: {} }, { ...museum, geometry: { type: "Point", coordinates: [200, 0] } }, { ...museum, properties: { ...museum.properties, osm_type: "X" } }])("rejects malformed input %#", (feature) => {
    expect(classifyPhotonFeature(feature)).toBeNull();
  });
  it("drops a malformed wikidata id instead of the place", () => {
    expect(classifyPhotonFeature({ ...museum, properties: { ...museum.properties, extra: { wikidata: "nope" } } })?.wikidataQid).toBeNull();
  });
});

describe("placeSubtitle", () => {
  it("shows city and country for a POI, region and country for a city, country for a region", () => {
    expect(placeSubtitle(classifyPhotonFeature(museum)!)).toBe("Madrid, España");
    expect(placeSubtitle(classifyPhotonFeature(lisbon)!)).toBe("Portugal");
    expect(placeSubtitle(classifyPhotonFeature(asturias)!)).toBe("España");
    expect(placeSubtitle(classifyPhotonFeature(spain)!)).toBeNull();
  });
});

describe("isPlaceData", () => {
  it("round-trips a classified place and rejects tampered shapes", () => {
    const place = classifyPhotonFeature(museum)!;
    expect(isPlaceData(place)).toBe(true);
    expect(isPlaceData({ ...place, layer: "street" })).toBe(false);
    expect(isPlaceData({ ...place, extra: 1 })).toBe(false);
  });
});
```

Nota: Lisboa tiene `state:"Lisboa"` igual al nombre; el subtítulo omite partes iguales al nombre, por eso queda `"Portugal"`.

`src/lib/places/token.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import photon from "./__fixtures__/photon.json";
import { classifyPhotonFeature } from "./classify";
import { PLACE_TOKEN_TTL_MS, signPlace, verifyPlace } from "./token";
const secret = "s".repeat(32), place = classifyPhotonFeature(photon.features[0])!, now = 1_700_000_000_000;

describe("place tokens", () => {
  it("verifies its own signature within the TTL", () => {
    expect(verifyPlace(signPlace(place, secret, now), secret, now + PLACE_TOKEN_TTL_MS - 1)).toEqual(place);
  });
  it("rejects expired, foreign-secret and tampered tokens", () => {
    const token = signPlace(place, secret, now);
    expect(verifyPlace(token, secret, now + PLACE_TOKEN_TTL_MS)).toBeNull();
    expect(verifyPlace(token, "t".repeat(32), now)).toBeNull();
    const [payload, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...place, name: "Mi casa", exp: now + 1000 })).toString("base64url");
    expect(verifyPlace(`${forged}.${mac}`, secret, now)).toBeNull();
    expect(verifyPlace(`${payload}.${mac}x`, secret, now)).toBeNull();
  });
  it.each(["", "a", "a.b.c", "x".repeat(2049)])("rejects garbage %#", (token) => {
    expect(verifyPlace(token, secret, now)).toBeNull();
  });
});
```

Run: `npx vitest run src/lib/places`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementación**

`src/lib/places/types.ts`:

```ts
export type PlaceLayer = "poi" | "city" | "region" | "country";
export const PLACE_LAYERS: readonly PlaceLayer[] = ["poi", "city", "region", "country"];
export interface PlaceData {
  provider: "osm";
  providerRef: string;
  name: string;
  category: string;
  layer: PlaceLayer;
  lat: number;
  lng: number;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  wikidataQid: string | null;
}
export interface PlaceSuggestion { token: string; name: string; layer: PlaceLayer; subtitle: string | null }
```

`src/lib/places/classify.ts`:

```ts
// Photon (OSM) → PlaceData. Whitelist, not blacklist: anything we cannot name as a
// venue, city, region or country is dropped, so private addresses never become places.
// Input is an external body: nothing is trusted, every field is narrowed by type.
import { PLACE_LAYERS, type PlaceData, type PlaceLayer } from "./types";

const POI_KEYS = new Set(["amenity", "tourism", "leisure", "historic", "sport", "natural"]);
const CITY_VALUES = new Set(["city", "town", "village", "hamlet", "island", "suburb"]);
const REGION_VALUES = new Set(["state", "province", "region", "county"]);
const MAX_TEXT = 240;

function str(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function layerOf(key: string, value: string, type: string | null): PlaceLayer | null {
  if (key === "building" || key === "highway" || (key === "place" && value === "house")) return null;
  if ((key === "place" && value === "country") || (key === "boundary" && type === "country")) return "country";
  if ((key === "place" && REGION_VALUES.has(value)) || (key === "boundary" && value === "administrative" && (type === "state" || type === "county"))) return "region";
  if (key === "place" && CITY_VALUES.has(value)) return "city";
  if (POI_KEYS.has(key)) return "poi";
  return null;
}

export function classifyPhotonFeature(feature: unknown): PlaceData | null {
  const f = record(feature), p = record(f?.properties), g = record(f?.geometry);
  if (!p || !g || !Array.isArray(g.coordinates)) return null;
  const [lng, lat] = g.coordinates;
  const name = str(p.name), key = str(p.osm_key, 60), value = str(p.osm_value, 60);
  const osmType = p.osm_type, osmId = p.osm_id;
  if (!name || !key || !value || typeof lng !== "number" || typeof lat !== "number") return null;
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null;
  if ((osmType !== "N" && osmType !== "W" && osmType !== "R") || typeof osmId !== "number" || !Number.isSafeInteger(osmId) || osmId <= 0) return null;
  const layer = layerOf(key, value, str(p.type, 30));
  if (!layer) return null;
  const code = str(p.countrycode, 2)?.toUpperCase() ?? null;
  const qid = str(record(p.extra)?.wikidata, 20);
  return {
    provider: "osm", providerRef: `${osmType}${osmId}`, name, category: `${key}:${value}`, layer, lat, lng,
    city: str(p.city), region: str(p.state), country: str(p.country),
    countryCode: code && /^[A-Z]{2}$/.test(code) ? code : null,
    wikidataQid: qid && /^Q[0-9]+$/.test(qid) ? qid : null,
  };
}

const KEYS = ["provider", "providerRef", "name", "category", "layer", "lat", "lng", "city", "region", "country", "countryCode", "wikidataQid"];
const nullableText = (v: unknown) => v === null || (typeof v === "string" && v.length > 0 && v.length <= MAX_TEXT);
export function isPlaceData(value: unknown): value is PlaceData {
  const v = record(value);
  if (!v || Object.keys(v).length !== KEYS.length || !KEYS.every((k) => k in v)) return false;
  return v.provider === "osm" && typeof v.providerRef === "string" && /^[NWR][0-9]+$/.test(v.providerRef)
    && typeof v.name === "string" && v.name.length > 0 && v.name.length <= MAX_TEXT
    && typeof v.category === "string" && v.category.length >= 3 && v.category.length <= 120
    && PLACE_LAYERS.includes(v.layer as PlaceLayer)
    && typeof v.lat === "number" && v.lat >= -90 && v.lat <= 90 && typeof v.lng === "number" && v.lng >= -180 && v.lng <= 180
    && nullableText(v.city) && nullableText(v.region) && nullableText(v.country)
    && (v.countryCode === null || (typeof v.countryCode === "string" && /^[A-Z]{2}$/.test(v.countryCode)))
    && (v.wikidataQid === null || (typeof v.wikidataQid === "string" && /^Q[0-9]+$/.test(v.wikidataQid)));
}

export function placeSubtitle(place: PlaceData): string | null {
  const parts = place.layer === "poi" ? [place.city ?? place.region, place.country]
    : place.layer === "city" ? [place.region, place.country]
    : place.layer === "region" ? [place.country] : [];
  const shown = parts.filter((part): part is string => Boolean(part) && part !== place.name);
  return shown.length ? [...new Set(shown)].join(", ") : null;
}
```

`src/lib/places/token.ts`:

```ts
// Signed place suggestions (spec §3). No "server-only" import on purpose: the e2e
// suite signs fixtures with the same code. The secret only ever lives on the server.
import { createHmac, timingSafeEqual } from "node:crypto";
import { isPlaceData } from "./classify";
import type { PlaceData } from "./types";

export const PLACE_TOKEN_TTL_MS = 60 * 60 * 1000;
export const PLACE_TOKEN_MAX = 2048;
const mac = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function signPlace(place: PlaceData, secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...place, exp: now + PLACE_TOKEN_TTL_MS })).toString("base64url");
  return `${payload}.${mac(payload, secret)}`;
}

export function verifyPlace(token: string, secret: string, now = Date.now()): PlaceData | null {
  if (typeof token !== "string" || token.length > PLACE_TOKEN_MAX) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = Buffer.from(mac(parts[0], secret)), given = Buffer.from(parts[1]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { exp, ...place } = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof exp !== "number" || exp <= now || !isPlaceData(place)) return null;
    return place;
  } catch { return null; }
}
```

- [ ] **Step 4: Tests en verde**

Run: `npx vitest run src/lib/places`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/places
git commit -m "feat(lugares): clasificar resultados de Photon y firmar sugerencias"
```

---

### Task 3: Búsqueda — `searchPlaces` cacheado y ruta `/api/places/search`

**Files:**
- Create: `src/lib/places/search.ts`, `src/lib/places/register.ts` (solo `placesSecret` en esta tarea)
- Create: `src/app/api/places/search/route.ts`
- Modify: `.env.example`
- Test: `src/lib/places/search.test.ts`, `src/app/api/places/search/route.test.ts`

**Interfaces:**
- Consumes: `classifyPhotonFeature`, `placeSubtitle`, `signPlace`, `PlaceData`, `PlaceSuggestion` (Task 2).
- Produces:
  - `normalizePlaceQuery(q: string | null): string | null` (null si fuera de 3–100)
  - `searchPlaces(q: string): Promise<PlaceData[]>` (nunca lanza; ≤ 6)
  - `placesSecret(): string | null` (null si falta o < 32)
  - `GET /api/places/search?q=` → `{ items: PlaceSuggestion[] }`, 401 sin sesión.

- [ ] **Step 1: Tests que fallan**

`src/lib/places/search.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
import photon from "./__fixtures__/photon.json";
import { normalizePlaceQuery, searchPlaces } from "./search";

beforeEach(() => { vi.stubEnv("MOCK_EXTERNAL_APIS", "false"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("normalizePlaceQuery", () => {
  it.each([[null, null], ["  pr ", null], ["  Museo   del  PRADO ", "museo del prado"], ["x".repeat(101), null]])("%s → %s", (input, output) => {
    expect(normalizePlaceQuery(input)).toBe(output);
  });
});

describe("searchPlaces", () => {
  it("asks Photon and keeps only whitelisted places", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(photon)));
    vi.stubGlobal("fetch", fetchMock);
    const places = await searchPlaces("prado");
    expect(places.map((p) => p.name)).toEqual(["Museo Nacional del Prado", "Lisboa", "Asturias", "España"]);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://photon.komoot.io/api/?q=prado&limit=15&lang=default");
  });
  it("returns no places when Photon fails or answers garbage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await searchPlaces("prado")).toEqual([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));
    expect(await searchPlaces("prado")).toEqual([]);
  });
  it("serves fixtures without network under MOCK_EXTERNAL_APIS", async () => {
    vi.stubEnv("MOCK_EXTERNAL_APIS", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await searchPlaces("prado"))[0]?.name).toBe("Museo Nacional del Prado");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

`src/app/api/places/search/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ getUser: vi.fn(), searchPlaces: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: h.getUser } }) }));
vi.mock("@/lib/places/search", async (original) => ({ ...(await original<typeof import("@/lib/places/search")>()), searchPlaces: h.searchPlaces }));
import photon from "@/lib/places/__fixtures__/photon.json";
import { classifyPhotonFeature } from "@/lib/places/classify";
import { verifyPlace } from "@/lib/places/token";
import { GET } from "./route";
const secret = "s".repeat(32), museum = classifyPhotonFeature(photon.features[0])!;
const call = (q: string) => GET(new Request(`http://localhost/api/places/search?q=${encodeURIComponent(q)}`));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PLACES_SIGNING_SECRET", secret);
  h.getUser.mockResolvedValue({ data: { user: { id: "u" } } });
  h.searchPlaces.mockResolvedValue([museum]);
});

describe("GET /api/places/search", () => {
  it("rejects anonymous callers before searching", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    expect((await call("prado")).status).toBe(401);
    expect(h.searchPlaces).not.toHaveBeenCalled();
  });
  it("returns signed suggestions that verify back to the place", async () => {
    const res = await call("Prado");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const { items } = await res.json();
    expect(items).toEqual([{ token: expect.any(String), name: "Museo Nacional del Prado", layer: "poi", subtitle: "Madrid, España" }]);
    expect(verifyPlace(items[0].token, secret)).toEqual(museum);
    expect(h.searchPlaces).toHaveBeenCalledWith("prado");
  });
  it("answers empty for short queries or a missing secret", async () => {
    expect((await (await call("pr")).json()).items).toEqual([]);
    vi.stubEnv("PLACES_SIGNING_SECRET", "");
    expect((await (await call("prado")).json()).items).toEqual([]);
    expect(h.searchPlaces).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run src/lib/places/search.test.ts src/app/api/places`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 2: Implementación**

`src/lib/places/search.ts`:

```ts
import "server-only";
import { cacheLife } from "next/cache";
import photonFixture from "./__fixtures__/photon.json";
import { classifyPhotonFeature } from "./classify";
import type { PlaceData } from "./types";

const PHOTON = "https://photon.komoot.io/api/";
const TIMEOUT_MS = 3000;
const MAX_RESULTS = 6;

export function normalizePlaceQuery(q: string | null): string | null {
  const value = (q ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return value.length >= 3 && value.length <= 100 ? value : null;
}

// Same answer for an anonymous visitor, the owner and a third party: no Supabase, no
// session, no request APIs (#437). Failures THROW so they are never cached as "no results".
async function fetchPhoton(q: string): Promise<PlaceData[]> {
  "use cache";
  cacheLife("days");
  const res = await fetch(`${PHOTON}?q=${encodeURIComponent(q)}&limit=15&lang=default`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": "Biblioshare/1.0 (+https://github.com/borjar20/Biblioshare)" },
  });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const body = await res.json() as { features?: unknown };
  if (!Array.isArray(body.features)) throw new Error("photon body");
  return body.features.map(classifyPhotonFeature).filter((p): p is PlaceData => p !== null);
}

/** Never throws: Photon down or slow means no suggestions, free text still works. */
export async function searchPlaces(q: string): Promise<PlaceData[]> {
  try {
    const places = process.env.MOCK_EXTERNAL_APIS === "true"
      ? photonFixture.features.map(classifyPhotonFeature).filter((p): p is PlaceData => p !== null)
      : await fetchPhoton(q);
    const seen = new Set<string>();
    return places.filter((p) => !seen.has(p.providerRef) && seen.add(p.providerRef)).slice(0, MAX_RESULTS);
  } catch { return []; }
}
```

`src/lib/places/register.ts` (primera parte):

```ts
import "server-only";

const MIN_SECRET = 32;
/** null disables suggestions (soft dependency, like GOOGLE_BOOKS_API_KEY). */
export function placesSecret(): string | null {
  const secret = process.env.PLACES_SIGNING_SECRET;
  return secret && secret.length >= MIN_SECRET ? secret : null;
}
```

`src/app/api/places/search/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { placeSubtitle } from "@/lib/places/classify";
import { placesSecret } from "@/lib/places/register";
import { normalizePlaceQuery, searchPlaces } from "@/lib/places/search";
import { signPlace } from "@/lib/places/token";
import type { PlaceSuggestion } from "@/lib/places/types";

const headers = { "Cache-Control": "private, no-store" };

// Session is required for QUOTA, not privacy: every call may hit Photon from our IP.
// The cached part (searchPlaces) is session-free; tokens carry `exp` and are signed per call.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const q = normalizePlaceQuery(new URL(request.url).searchParams.get("q"));
  const secret = placesSecret();
  if (!q || !secret) return NextResponse.json({ items: [] }, { headers });
  const items: PlaceSuggestion[] = (await searchPlaces(q)).map((place) => ({
    token: signPlace(place, secret), name: place.name, layer: place.layer, subtitle: placeSubtitle(place),
  }));
  return NextResponse.json({ items }, { headers });
}
```

`.env.example`, tras `GOOGLE_BOOKS_API_KEY=`:

```
# HMAC secret for signed place suggestions (experiences → place autocomplete).
# Server-only, at least 32 characters (e.g. `openssl rand -base64 48`). Without it
# the place field still works as free text, just without suggestions.
PLACES_SIGNING_SECRET=
```

- [ ] **Step 3: Tests en verde + typecheck**

Run: `npx vitest run src/lib/places src/app/api/places && npx tsc --noEmit`
Expected: PASS, sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/places src/app/api/places .env.example
git commit -m "feat(lugares): proxy autenticado de búsqueda con sugerencias firmadas"
```

---

### Task 4: Guardado — server actions, validación y lectura de `placeId`

**Files:**
- Modify: `src/lib/places/register.ts` (añadir `resolvePlaceToken`)
- Modify: `src/lib/experiences/types.ts:11-34,46-54`
- Modify: `src/lib/experiences/validation.ts:32-52`
- Modify: `src/lib/experiences/actions.ts:6-17`
- Modify: `src/lib/experiences/queries.ts:74`
- Modify (fixtures, `placeId: null`): `src/components/experiences/experience-album-controls.test.tsx:26`, `experience-form.test.tsx:23`, `experience-photo-upload.test.tsx:18`, `moment-editor.test.tsx:18`, `test-helpers.tsx:34` y cualquier otro que marque `tsc`
- Test: `src/lib/places/register.test.ts`, `src/lib/experiences/validation.test.ts`, `src/lib/experiences/actions.test.ts`

**Interfaces:**
- Consumes: `verifyPlace`, `placesSecret`, `PlaceData` (Tasks 2–3); `place_upsert`, claves `placeId`/`keepPlace` (Task 1).
- Produces:
  - `resolvePlaceToken(token: string | null | undefined): Promise<string | null>`
  - `CreateExperienceInput.placeToken?: string | null`
  - `SaveMomentInput.placeToken?: string | null; keepPlace?: boolean`
  - `ExperienceMoment.placeId: string | null`

- [ ] **Step 1: Tests que fallan**

`src/lib/places/register.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({ rpc: h.rpc }) }));
import photon from "./__fixtures__/photon.json";
import { classifyPhotonFeature } from "./classify";
import { signPlace } from "./token";
import { resolvePlaceToken } from "./register";
const secret = "s".repeat(32), place = classifyPhotonFeature(photon.features[0])!;
const placeId = "11111111-2222-4333-8444-555555555555";

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("PLACES_SIGNING_SECRET", secret); h.rpc.mockResolvedValue({ data: placeId, error: null }); });

describe("resolvePlaceToken", () => {
  it("upserts the verified place with the service client", async () => {
    expect(await resolvePlaceToken(signPlace(place, secret))).toBe(placeId);
    expect(h.rpc).toHaveBeenCalledWith("place_upsert", { p_input: place });
  });
  it.each([[undefined], [null], [""], ["forged.token"]])("ignores %s without touching the database", async (token) => {
    expect(await resolvePlaceToken(token)).toBeNull();
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("degrades to null on a missing secret or an RPC error", async () => {
    const token = signPlace(place, secret);
    h.rpc.mockResolvedValue({ data: null, error: { code: "23514" } });
    expect(await resolvePlaceToken(token)).toBeNull();
    vi.stubEnv("PLACES_SIGNING_SECRET", "");
    expect(await resolvePlaceToken(token)).toBeNull();
  });
});
```

Añadir a `src/lib/experiences/validation.test.ts`:

```ts
describe("place fields", () => {
  it("passes a token through and omits absent place fields", () => {
    expect(validateCreateExperience({ ...minimum, placeToken: "a.b" })).toMatchObject({ placeToken: "a.b" });
    expect(validateCreateExperience(minimum)).not.toHaveProperty("placeToken");
    expect(validateMoment({ id: "78f7377a-73c6-40c4-8c86-a395518d4bb0", title: "Paseo", kind: "walk", keepPlace: true })).toMatchObject({ keepPlace: true });
  });
  it.each([
    { placeToken: 7 }, { placeToken: "x".repeat(2049) }, { keepPlace: "yes" },
    { keepPlace: true }, // new moment cannot keep a place
    { id: "78f7377a-73c6-40c4-8c86-a395518d4bb0", keepPlace: true, placeToken: "a.b" },
  ])("rejects %o on moments", (extra) => {
    expect(validateMoment({ title: "Paseo", kind: "walk", ...extra })).toBeNull();
  });
  it("rejects keepPlace on creation", () => {
    expect(validateCreateExperience({ ...minimum, keepPlace: true })).toBeNull();
  });
});
```

Añadir a `src/lib/experiences/actions.test.ts` (en el `vi.hoisted` añadir `resolvePlaceToken:vi.fn()`, y el mock `vi.mock("@/lib/places/register",()=>({resolvePlaceToken:mocks.resolvePlaceToken}));`; en `beforeEach` `mocks.resolvePlaceToken.mockResolvedValue(null);`):

```ts
describe("place links",()=>{
  const placeId="11111111-2222-4333-8444-555555555555";
  it("swaps a valid token for placeId and never sends the token to SQL",async()=>{
    mocks.resolvePlaceToken.mockResolvedValue(placeId);
    await createExperience({...capture,placeLabel:"Museo",placeToken:"a.b"});
    expect(mocks.resolvePlaceToken).toHaveBeenCalledWith("a.b");
    expect(mocks.rpc).toHaveBeenCalledWith("experience_create",{p_input:{title:"Plan",state:"planned",kind:"walk",placeLabel:"Museo",startsOn:null,endsOn:null,placeId}});
  });
  it("keeps the text when the token does not verify",async()=>{
    await saveMoment(id,4,{title:"Museo",kind:"museum",placeLabel:"Museo",placeToken:"bad.token"});
    expect(mocks.rpc).toHaveBeenLastCalledWith("experience_save_moment",{p_id:id,p_revision:4,p_input:{title:"Museo",kind:"museum",placeLabel:"Museo",startsOn:null,endsOn:null}});
  });
  it("forwards keepPlace without resolving anything",async()=>{
    await saveMoment(id,4,{id:second,title:"Museo",kind:"museum",keepPlace:true});
    expect(mocks.resolvePlaceToken).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenLastCalledWith("experience_save_moment",{p_id:id,p_revision:4,p_input:{id:second,title:"Museo",kind:"museum",placeLabel:null,startsOn:null,endsOn:null,keepPlace:true}});
  });
  it("does not resolve tokens for anonymous callers",async()=>{
    mocks.getUser.mockResolvedValue({data:{user:null},error:null});
    await createExperience({...capture,placeToken:"a.b"});
    expect(mocks.resolvePlaceToken).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run src/lib/places/register.test.ts src/lib/experiences`
Expected: FAIL.

- [ ] **Step 2: Implementación**

`src/lib/places/register.ts` — añadir:

```ts
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/database.types";
import { verifyPlace } from "./token";

/**
 * Signed suggestion → places.id. The service client is the ONLY writer of `places`
 * (place_upsert is service_role-only): an authenticated RPC could be called straight
 * against Supabase and skip the signature. Never throws; null means "save as text".
 */
export async function resolvePlaceToken(token: string | null | undefined): Promise<string | null> {
  const secret = placesSecret();
  if (!token || !secret) return null;
  const place = verifyPlace(token, secret);
  if (!place) return null;
  try {
    const { data, error } = await createServiceRoleClient().rpc("place_upsert", { p_input: place as unknown as Json });
    return !error && typeof data === "string" ? data : null;
  } catch { return null; }
}
```

`src/lib/experiences/types.ts`:
- En `CreateExperienceInput` añadir `placeToken?: string | null;`
- En `SaveMomentInput` añadir `placeToken?: string | null;` y `keepPlace?: boolean;`
- En `ExperienceMoment` añadir `placeId: string | null;` tras `placeLabel`.
- En `EXPERIENCE_LIMITS` añadir `placeToken: 2048`.

`src/lib/experiences/validation.ts` — sustituir `validateCreateExperience` y `validateMoment`:

```ts
function placeFields(value: RecordInput, allowKeep: boolean): { placeToken?: string; keepPlace?: true } | null {
  const token = value.placeToken, keep = value.keepPlace;
  if (token !== undefined && token !== null && (typeof token !== "string" || token.length > EXPERIENCE_LIMITS.placeToken)) return null;
  if (keep !== undefined && typeof keep !== "boolean") return null;
  if (keep && (!allowKeep || token)) return null;
  return { ...(token ? { placeToken: token as string } : {}), ...(keep ? { keepPlace: true as const } : {}) };
}
export type ValidCreateExperience = Required<Omit<CreateExperienceInput, "placeToken">> & { placeToken?: string };
export function validateCreateExperience(input: unknown): ValidCreateExperience | null {
  const value = record(input);
  if (!value || !allowed(value, ["title", "state", "kind", "placeLabel", "placeToken", "startsOn", "endsOn"])) return null;
  const fields = common(value), placeLabel = text(value.placeLabel, EXPERIENCE_LIMITS.place), place = placeFields(value, false);
  if (!fields || !place || placeLabel === undefined || !MOMENT_KINDS.includes(value.kind as never) || !["planned", "lived"].includes(value.state as string)) return null;
  return { ...fields, placeLabel, kind: value.kind as CreateExperienceInput["kind"], state: value.state as CreateExperienceInput["state"], ...place };
}
```

```ts
export function validateMoment(input: unknown): SaveMomentInput | null {
  const value = record(input);
  if (!value || !allowed(value, ["id", "title", "kind", "placeLabel", "placeToken", "keepPlace", "startsOn", "endsOn"])) return null;
  const fields = common(value), placeLabel = text(value.placeLabel, EXPERIENCE_LIMITS.place);
  const place = placeFields(value, value.id !== undefined);
  if (!fields || !place || placeLabel === undefined || !MOMENT_KINDS.includes(value.kind as never) || (value.id !== undefined && !isExperienceId(value.id))) return null;
  return { ...fields, placeLabel, kind: value.kind as SaveMomentInput["kind"], ...(value.id ? { id: value.id as string } : {}), ...place };
}
```

Nota: `rejects keepPlace on creation` falla por `allowed` (la clave no está en la lista de creación); está bien.

`src/lib/experiences/actions.ts` — import y helper, y cambiar las dos funciones:

```ts
import { resolvePlaceToken } from "@/lib/places/register";

// The token never reaches SQL: a verified one becomes placeId; anything else saves as text.
async function withPlace<T extends {placeToken?:string|null}>(value:T) {
  const {placeToken,...rest}=value;
  const placeId=placeToken ? await resolvePlaceToken(placeToken) : null;
  return placeId ? {...rest,placeId} : rest;
}
export async function createExperience(input:CreateExperienceInput):Promise<ExperienceResult<{id:string}>> {
  const value=validateCreateExperience(input);
  return experienceMutation(Boolean(value),async(client)=>client.rpc("experience_create",{p_input:await withPlace(value!)}));
}
export async function saveMoment(id:string,revision:number,input:SaveMomentInput):Promise<ExperienceResult<{id:string;revision:number}>> {
  const value=validateMoment(input);
  return experienceMutation(isExperienceId(id)&&validRevision(revision)&&Boolean(value),async(client)=>client.rpc("experience_save_moment",{p_id:id,p_revision:revision,p_input:await withPlace(value!)}),id);
}
```

`experienceMutation` ya comprueba sesión y validez **antes** de llamar a `work`, así que no se resuelven tokens para anónimos. Si TS se queja de que `Promise<PostgrestSingleResponse<Json>>` no encaja con `Query`, es compatible (`PromiseLike`); en caso de error de inferencia, anotar `async(client):Promise<{data:Json|null;error:{code?:string}|null}>=>…`.

`src/lib/experiences/queries.ts:74` — en el `map` del momento añadir `placeId:m.place_id` tras `placeLabel:m.place_label`.

Fixtures: añadir `placeId:null` a cada objeto momento que marque `npx tsc --noEmit` (lista conocida en **Files**).

- [ ] **Step 3: Tests en verde + typecheck**

Run: `npx vitest run src/lib/places src/lib/experiences src/components/experiences && npx tsc --noEmit`
Expected: PASS, sin errores (los tests previos de actions siguen esperando el `p_input` sin claves de lugar: `withPlace` no añade nada cuando no hay token).

- [ ] **Step 4: Commit**

```bash
git add src/lib/places src/lib/experiences src/components/experiences
git commit -m "feat(experiencias): enlazar el lugar firmado al guardar momentos"
```

---

### Task 5: `PlaceCombobox` + integración en formulario y editor

**Files:**
- Create: `src/components/experiences/place-combobox.tsx`
- Test: `src/components/experiences/place-combobox.test.tsx`
- Modify: `src/components/experiences/experience-form.tsx:41,67`
- Modify: `src/components/experiences/moment-editor.tsx:25,35`
- Modify: `messages/es.json` (namespace `experiences`, junto a `"place"`)
- Modify: `docs/superpowers/specs/2026-10-05-experiencias-lugares-design.md` §5 («icono por capa» → «etiqueta de capa»)

**Interfaces:**
- Consumes: `PlaceSuggestion`, `PlaceLayer` (Task 2); `GET /api/places/search` (Task 3); `placeToken`/`keepPlace` en las actions (Task 4); `ExperienceMoment.placeId`.
- Produces: `<PlaceCombobox id: string; defaultLabel?: string | null; linked?: boolean />`, que emite en el `<form>` los campos `placeLabel`, `placeToken` (si eligió) y `keepPlace="true"` (si conserva el chip inicial).

- [ ] **Step 1: Textos**

En `messages/es.json`, dentro de `experiences`, tras `"place": "Lugar",`:

```json
"places": {
  "hint": "Busca un sitio o una ciudad, o escribe lo que quieras.",
  "remove": "Quitar {name}",
  "attribution": "© OpenStreetMap",
  "layers": { "poi": "Sitio", "city": "Ciudad", "region": "Región", "country": "País" }
},
```

- [ ] **Step 2: Tests que fallan**

`src/components/experiences/place-combobox.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import { PlaceCombobox } from "./place-combobox";

const items = [
  { token: "tok-prado", name: "Museo Nacional del Prado", layer: "poi", subtitle: "Madrid, España" },
  { token: "tok-lisboa", name: "Lisboa", layer: "city", subtitle: "Portugal" },
];
let form: HTMLFormElement;
function show(props: Partial<Parameters<typeof PlaceCombobox>[0]> = {}) {
  render(<NextIntlClientProvider locale="es" messages={messages}><form data-testid="f"><label htmlFor="p">Lugar</label><PlaceCombobox id="p" {...props}/></form></NextIntlClientProvider>);
  form = screen.getByTestId("f") as HTMLFormElement;
}
const fields = () => Object.fromEntries(new FormData(form).entries());
async function type(value: string) {
  fireEvent.change(screen.getByRole("combobox", { name: "Lugar" }), { target: { value } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ items }))));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("PlaceCombobox", () => {
  it("submits free text when nothing is chosen", async () => {
    show();
    await type("Casa de mis padres");
    expect(fields()).toEqual({ placeLabel: "Casa de mis padres" });
  });
  it("does not search below three characters", async () => {
    show();
    await type("ca");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("searches after the debounce and shows attribution", async () => {
    show();
    await type("prado");
    expect(fetch).toHaveBeenCalledWith("/api/places/search?q=prado", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.getByRole("option", { name: /Museo Nacional del Prado/ })).toBeTruthy();
    expect(screen.getByText("© OpenStreetMap")).toBeTruthy();
  });
  it("chooses with the keyboard and submits the token with the official name", async () => {
    show();
    await type("prado");
    const input = screen.getByRole("combobox", { name: "Lugar" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(fields()).toEqual({ placeLabel: "Museo Nacional del Prado", placeToken: "tok-prado" });
    expect(screen.getByRole("button", { name: "Quitar Museo Nacional del Prado" })).toBeTruthy();
  });
  it("Escape closes the list and keeps the typed text", async () => {
    show();
    await type("prado");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Lugar" }), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(fields()).toEqual({ placeLabel: "prado" });
  });
  it("starts linked as a chip that keeps the place, and ✕ returns to empty text", async () => {
    show({ defaultLabel: "Lisboa", linked: true });
    expect(fields()).toEqual({ placeLabel: "Lisboa", keepPlace: "true" });
    fireEvent.click(screen.getByRole("button", { name: "Quitar Lisboa" }));
    expect(fields()).toEqual({ placeLabel: "" });
    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Lugar" }));
  });
  it("hides suggestions silently when the search fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    show();
    await type("prado");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
```

Run: `npx vitest run src/components/experiences/place-combobox.test.tsx`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementación**

`src/components/experiences/place-combobox.tsx`:

```tsx
"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import type { PlaceSuggestion } from "@/lib/places/types";

type Chosen = { name: string; token: string | null }; // token null = linked place kept as-is
type Props = { id: string; defaultLabel?: string | null; linked?: boolean };

// ARIA 1.2 combobox (list autocomplete). Free text is the default; a suggestion turns
// the field into a chip whose name is the official one (spec §5).
export function PlaceCombobox({ id, defaultLabel, linked = false }: Props) {
  const t = useTranslations("experiences.places"), listId = useId();
  const [text, setText] = useState(linked ? "" : defaultLabel ?? "");
  const [chosen, setChosen] = useState<Chosen | null>(linked && defaultLabel ? { name: defaultLabel, token: null } : null);
  const [items, setItems] = useState<PlaceSuggestion[]>([]), [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null), refocus = useRef(false);

  useEffect(() => {
    if (chosen) return;
    const q = text.trim();
    if (q.length < 3) { setItems([]); setOpen(false); return; }
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(q)}`, { signal: abort.signal });
        const body = res.ok ? await res.json() as { items?: PlaceSuggestion[] } : { items: [] };
        const next = Array.isArray(body.items) ? body.items : [];
        setItems(next); setOpen(next.length > 0); setActive(-1);
      } catch { if (!abort.signal.aborted) { setItems([]); setOpen(false); } }
    }, 300);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [text, chosen]);

  useEffect(() => { if (!chosen && refocus.current) { refocus.current = false; input.current?.focus(); } }, [chosen]);

  const choose = (item: PlaceSuggestion) => { setChosen({ name: item.name, token: item.token }); setOpen(false); setItems([]); };
  const clear = () => { refocus.current = true; setChosen(null); setText(""); };

  if (chosen) return <div className="flex min-h-11 items-center">
    <input type="hidden" name="placeLabel" value={chosen.name}/>
    {chosen.token ? <input type="hidden" name="placeToken" value={chosen.token}/> : <input type="hidden" name="keepPlace" value="true"/>}
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-surface-muted py-1 pl-3 pr-1 text-sm">
      <span className="truncate">{chosen.name}</span>
      <button type="button" onClick={clear} aria-label={t("remove", { name: chosen.name })} className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent">✕</button>
    </span>
  </div>;

  const optionId = (index: number) => `${listId}-${index}`;
  return <div className="relative">
    <Input ref={input} id={id} name="placeLabel" value={text} maxLength={240} autoComplete="off" className="min-h-11 w-full"
      role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-describedby={`${listId}-hint`}
      aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => setTimeout(() => setOpen(false), 150)}
      onKeyDown={(event) => {
        if (!open) return;
        if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => (i + 1) % items.length); }
        else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => (i <= 0 ? items.length - 1 : i - 1)); }
        else if (event.key === "Enter" && active >= 0) { event.preventDefault(); choose(items[active]); }
        else if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      }}/>
    <p id={`${listId}-hint`} className="mt-1 text-xs text-muted-foreground">{t("hint")}</p>
    {open && <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-cover">
      <ul id={listId} role="listbox" className="max-h-72 overflow-y-auto py-1">
        {items.map((item, index) => <li key={item.token} id={optionId(index)} role="option" aria-selected={index === active}
          onMouseDown={(event) => { event.preventDefault(); choose(item); }}
          className={`flex min-h-11 cursor-pointer flex-col justify-center px-3 py-2 text-sm ${index === active ? "bg-surface-muted" : ""}`}>
          <span className="font-medium">{item.name}</span>
          <span className="text-xs text-muted-foreground">{[t(`layers.${item.layer}`), item.subtitle].filter(Boolean).join(" · ")}</span>
        </li>)}
      </ul>
      <p className="border-t border-border px-3 py-1 text-right text-[11px] text-muted-foreground">{t("attribution")}</p>
    </div>}
  </div>;
}
```

Nota sobre el test «Escape conserva el texto»: el campo sigue siendo el `<input name="placeLabel">` visible, así que `FormData` recoge `placeLabel:"prado"`.

`experience-form.tsx`:
- Línea 67: sustituir el `<Field label={t("place")} …><Input … name="placeLabel" …/></Field>` por `<Field label={t("place")} htmlFor={field("place")}><PlaceCombobox id={field("place")}/></Field>` e importar `import { PlaceCombobox } from "./place-combobox";`.
- Línea 41: `await createExperience({ ...fields, kind, placeLabel: value("placeLabel") || null, ...(value("placeToken") ? { placeToken: value("placeToken") } : {}) } as CreateExperienceInput);`

`moment-editor.tsx`:
- Línea 35: `<Field label={t("place")} htmlFor={`${prefix}-place`}><PlaceCombobox id={`${prefix}-place`} defaultLabel={moment?.placeLabel} linked={Boolean(moment?.placeId)}/></Field>` + import.
- Línea 25: dentro del objeto pasado a `saveMoment`, tras `placeLabel: …`, añadir `...(value("placeToken") ? { placeToken: value("placeToken") } : {}), ...(moment && value("keepPlace") === "true" ? { keepPlace: true } : {})`.

Spec §5: cambiar «lista de ≤ 6 con icono por capa, nombre y subtítulo» por «lista de ≤ 6 con nombre y una línea "capa · subtítulo"».

- [ ] **Step 4: Tests en verde (nuevos y previos del formulario/editor)**

Run: `npx vitest run src/components/experiences && npx tsc --noEmit && npm run lint`
Expected: PASS. El test previo de `experience-form.test.tsx:77` (rellena «Madrid» por la etiqueta «Lugar») sigue pasando porque el combobox conserva `id`/label; si ese test no usa timers falsos, no dispara búsqueda (no llega a 300 ms) — si dispara un `fetch` real en jsdom, añadir en ese archivo `vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"items":[]}')))` en `beforeEach`.

- [ ] **Step 5: Commit**

```bash
git add src/components/experiences messages/es.json docs/superpowers/specs/2026-10-05-experiencias-lugares-design.md
git commit -m "feat(experiencias): autocompletar el lugar con chip y texto libre"
```

---

### Task 6: e2e contra build de producción

**Files:**
- Create: `e2e/experiencias-lugares.spec.ts`

**Interfaces:**
- Consumes: `signPlace` (Task 2), fixtures de `e2e/support/experience-fixtures.ts`, migración aplicada en dev (Task 7 Step 1 debe ir **antes** de ejecutar este e2e), `PLACES_SIGNING_SECRET` en `.env.local`.

- [ ] **Step 1: Escribir el e2e**

La ruta de búsqueda se intercepta en el navegador para no depender de Photon; el token se firma con el mismo secreto que lee el servidor, así que el guardado recorre el camino real (verificar → `place_upsert` → RPC).

```ts
import { test, expect } from "@playwright/test";
import { clearExperienceFixtures, EXPERIENCE_QA_PREFIX, experienceActor, deleteExperienceActor, experienceRest, loginExperienceUser } from "./support/experience-fixtures";
import { signPlace } from "../src/lib/places/token";

const prado = { provider: "osm" as const, providerRef: "W28118138", name: "Museo Nacional del Prado", category: "tourism:museum", layer: "poi" as const, lat: 40.4138, lng: -3.6921, city: "Madrid", region: "Comunidad de Madrid", country: "España", countryCode: "ES", wikidataQid: "Q160112" };

test("choosing a suggested place links the moment and shows the official name", async ({ page }) => {
  const secret = process.env.PLACES_SIGNING_SECRET;
  test.skip(!secret, "PLACES_SIGNING_SECRET missing in .env.local");
  const actor = await experienceActor("Lugares");
  try {
    await clearExperienceFixtures(actor.id);
    await loginExperienceUser(page, actor);
    await page.route("**/api/places/search?*", (route) => route.fulfill({ json: { items: [{ token: signPlace(prado, secret!), name: prado.name, layer: "poi", subtitle: "Madrid, España" }] } }));
    await page.goto("/experiencias/nueva?kind=museum");
    await page.getByRole("textbox", { name: "Nombre *", exact: true }).fill(`${EXPERIENCE_QA_PREFIX}Mañana en el Prado`);
    await page.getByText("Añadir fecha o lugar").click();
    await page.getByRole("combobox", { name: "Lugar" }).fill("prado");
    await page.getByRole("option", { name: /Museo Nacional del Prado/ }).click();
    await expect(page.getByRole("button", { name: "Quitar Museo Nacional del Prado" })).toBeVisible();
    await page.getByRole("button", { name: "Guardar experiencia" }).click();
    await expect(page).toHaveURL(/\/experiencia\/[0-9a-f-]+$/);
    const id = page.url().split("/").at(-1)!;
    const [moment] = await (await experienceRest(`experience_moments?experience_id=eq.${id}&select=place_id,place_label`)).json() as { place_id: string | null; place_label: string }[];
    expect(moment.place_label).toBe(prado.name);
    expect(moment.place_id).not.toBeNull();
    const [place] = await (await experienceRest(`places?id=eq.${moment.place_id}&select=provider_ref,wikidata_qid`)).json();
    expect(place).toEqual({ provider_ref: "W28118138", wikidata_qid: "Q160112" });
    await expect(page.getByText(prado.name).first()).toBeVisible();
  } finally {
    await clearExperienceFixtures(actor.id);
    await deleteExperienceActor(actor);
  }
});
```

Comprobar antes de ejecutar: los nombres exactos `experienceActor`, `deleteExperienceActor` y `loginExperienceUser` se usan así en `e2e/experiencias-captura.spec.ts:2`; el texto «Añadir fecha o lugar» y «Guardar experiencia» vienen de `messages/es.json` (`album.dateAndPlace`, `save`).

- [ ] **Step 2: Ejecutar contra build de producción (#437)**

Prerrequisitos: migración en dev (Task 7 Step 1) y `PLACES_SIGNING_SECRET` en `.env.local`. Puerto 3000 libre (`Get-NetTCPConnection -LocalPort 3000`).

Run (PowerShell, dos pasos): `npm run build; npx next start -p 3000` en una terminal aparte; luego `npx playwright test e2e/experiencias-lugares.spec.ts`
Expected: 1 passed. Parar `next start` al acabar.

- [ ] **Step 3: Commit**

```bash
git add e2e/experiencias-lugares.spec.ts
git commit -m "test(e2e): enlazar un lugar sugerido al crear una experiencia"
```

---

### Task 7: Aplicar en dev, documentación y cierre

**Files:**
- Modify: `docs/requirements/data-model.md` (nuevo §8ter.2 + delta en cabecera)
- Modify: `docs/requirements/decisiones.md` (entrada al final)
- Modify: `docs/requirements/backlog.md` (marcar la casilla de lugares en Experiencias si existe; si no, añadirla marcada)
- Modify: `supabase/schema-baseline.sql` (regenerar como en el commit `8174eb68`)

- [ ] **Step 1: Aplicar en dev y verificar contra objetos reales**

Con el MCP `supabase-dev` (o el conector de claude.ai con `project_id` explícito, ver memoria `supabase-mcp-fallback`): `apply_migration` con el contenido de `20261005100000_experience_places.sql`, nombre `experience_places`. Después:

```sql
select relname, relrowsecurity from pg_class where oid in ('public.places'::regclass);
select attname from pg_attribute where attrelid='public.experience_moments'::regclass and attname='place_id';
select proname, prosecdef, proacl from pg_proc where proname in ('place_upsert','experience_create','experience_save_moment','experience_input_place');
```

Expected: `places` con RLS `t`; columna presente; `place_upsert` con ACL solo `service_role` (+ dueño); `experience_create`/`experience_save_moment` conservan `authenticated=X`.

Ejecutar `supabase/tests/experiences_places.sql` en dev (termina en `rollback`). Expected: sin `FAIL`.

Superficie 6 de `docs/DRIFT-CHECK.md`: ejecutar su consulta en dev. Expected: `experience_moments` **no** aparece (no tiene grants por columna; se escribe solo por RPC) y el resto coincide con la referencia.

- [ ] **Step 2: Añadir el secreto**

`PLACES_SIGNING_SECRET` en `.env.local` (dev) y en Vercel (Production y Preview) — **pedir al usuario** que lo cree él (es un secreto); generar con `openssl rand -base64 48`.

- [ ] **Step 3: Documentación**

`data-model.md`: §8ter.2 «Lugares (2026-10-05)» con la tabla `places` (columnas, CHECK, RLS, grants), `experience_moments.place_id` (`on delete set null`, índice parcial), `place_upsert` (solo `service_role`), `private.experience_input_place`, claves `placeId`/`keepPlace` de las dos RPC, y estado por entorno (dev verificado; prod pendiente). Actualizar la fecha de verificación de la cabecera.

`decisiones.md`, al final:

```markdown
## 2026-10-05 — Experiencias: lugares de OSM vía Photon con sugerencias firmadas

Contexto: el lugar de un momento era texto libre; se quiere autocompletar y guardar el dato
para fichas/contadores futuros. Decisión: Photon (OSM, gratis, autocompletado permitido) a
través de un proxy autenticado; lista blanca de sitios/ciudades/regiones/países (nunca
direcciones); sugerencias firmadas con HMAC; alta en `places` solo con el cliente de servicio
(`place_upsert` de `service_role`) porque una RPC `authenticated` se saltaría la firma. El
nombre oficial se copia en `place_label`, así ninguna lectura cambia. Descartados: Google
Places (coste y ToS de almacenamiento), Nominatim público (prohíbe autocompletar), cliente
directo a Photon (expone IP/tecleo y deja la tabla abierta a datos inventados).
Spec: `docs/superpowers/specs/2026-10-05-experiencias-lugares-design.md`.
```

`schema-baseline.sql`: regenerar con el mismo procedimiento del commit `8174eb68` (ver su mensaje/diff).

- [ ] **Step 4: Issues de lo pendiente**

```bash
gh issue create --repo borjar20/Biblioshare --label "area:social,tipo:feature,P3" --title "Experiencias: fichas de lugar y contador de experiencias vividas" --body-file <fichero con: alcance (página /lugar/[id], contador), decisiones de privacidad abiertas (solo lived+profile, umbral k-anonimato, qué se cuenta), regla #437 para el agregado, link a la spec 2026-10-05>
gh issue create --repo borjar20/Biblioshare --label "area:infra,tipo:deuda,P3" --title "Lugares: ids de OSM que cambian y dependencia de la instancia pública de Photon" --body-file <fichero con: provider_ref puede cambiar al editar OSM; reconciliar por QID/coordenadas; plan B instancia propia de Photon si komoot limita>
```

Si la migración no se aplica a producción en esta rama, añadir una tercera issue `area:infra,tipo:deuda,P1` «Aplicar 20261005100000_experience_places en producción».

- [ ] **Step 5: Verificación final y commit**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: todo en verde.

```bash
git add docs supabase/schema-baseline.sql
git commit -m "docs(experiencias): lugares en data-model, decisiones y backlog"
```
