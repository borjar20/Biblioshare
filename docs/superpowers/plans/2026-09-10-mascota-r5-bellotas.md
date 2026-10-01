# Mascota R5 — Bellotas y fondos del campamento · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que usar Biblioshare dé bellotas, que se recojan a mano en el campamento y que se gasten en fondos alternativos para la escena del campamento.

**Architecture:** Ledger propio (`pet_acorn_ledger`) con una fila por hecho e **idempotencia por restricción única**, no por comprobación en código. Las tres fuentes son hechos que ya se guardan hoy —día vivido, misión sellada, logro— y una función `private` los convierte en «pendientes». Recoger y comprar son funciones `public` de solo `service_role` bajo bloqueo consultivo. El precio y las tarifas viven en TypeScript y viajan como parámetros: la base no guarda una segunda copia del contenido.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Supabase/PostgreSQL, Vitest, Playwright, next-intl, CSS Modules, PixelLab (MCP) para el arte.

**Spec:** `docs/superpowers/specs/2026-09-10-mascota-r5-bellotas-design.md`. Base: `main` en `b2a12f05`.

## Global Constraints

- **Node 22.** En PowerShell: `$env:PATH = "C:\Users\borja\AppData\Roaming\fnm\node-versions\v22.23.1\installation;$env:PATH"` antes de cualquier `npx`.
- **`.env.local` copiado al worktree** o los e2e con login se auto-saltan y la suite sale verde sin probar nada.
- **Un solo `next dev`, en el puerto 3000.** Playwright reutiliza el que haya.
- **Migraciones: dev primero (`supabase-dev`), prod después.** Nunca al revés.
- **Nada de `use cache`** en este trabajo: todo depende de la sesión (regla #437).
- **Idioma:** todo el texto de cara al usuario en español, en `messages/es.json`. Es el único locale.
- **Comentarios en el código:** en español y solo donde expliquen un *porqué* que el código no dice.
- **Sin `Math.random` ni `Date.now()` dentro de componentes de servidor** (avisos de prerender, #895).
- **Bloqueo consultivo: la clave `20260910` queda reservada para bellotas.** `20260908` es de aventuras y equipo; no reutilizarla.
- **Valores de calibración** (spec §3), en un solo sitio (`src/lib/pet/shop/catalog.ts`): día 10, misión 5, logro 20, bienvenida 50; precios 0 / 100 / 150 / 150 / 150.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/lib/pet/shop/catalog.ts` | Contenido puro: escenas, precios, tarifas, época. Sin E/S. |
| `src/lib/pet/shop/types.ts` | Tipos y contrato del repositorio. |
| `src/lib/pet/shop/service.ts` | Reglas: validar ids, mapear errores, aplicar tarifas. Sin Supabase. |
| `src/lib/pet/shop/repository.ts` | Las cuatro llamadas a Supabase. `server-only`. |
| `src/lib/pet/shop/actions.ts` | Server actions: autenticar, delegar, revalidar. |
| `src/lib/pet/shop/get-state.ts` | Lectura para la página. |
| `src/components/pet/shop/shop-panel.tsx` | El puesto: saldo, recoger con desglose, catálogo, estrenar. |
| `supabase/migrations/20260911_pet_acorns.sql` | Dos tablas, una columna, cinco funciones. |
| `supabase/tests/pet_acorns.sql` | Matriz: doble recogida, compra concurrente, saldo justo, permisos. |
| `e2e/mascota-tienda.spec.ts` | Recorrido real con cuenta desechable. |

---

### Task 1: Catálogo, tarifas y época

**Files:**
- Create: `src/lib/pet/shop/catalog.ts`
- Create: `src/lib/pet/shop/catalog.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `CAMP_SCENES`, `DEFAULT_SCENE_ID`, `ACORN_RATES`, `ACORN_EPOCH`, `scenePrice(id)`, `isCampSceneId(x)`, tipos `CampScene` y `AcornKind`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/pet/shop/catalog.test.ts
import { describe, expect, it } from "vitest";
import { ACORN_EPOCH, ACORN_RATES, CAMP_SCENES, DEFAULT_SCENE_ID, isCampSceneId, scenePrice } from "./catalog";

describe("catálogo de la tienda", () => {
  it("tiene la escena de siempre gratis y cuatro de pago", () => {
    expect(CAMP_SCENES[0].id).toBe(DEFAULT_SCENE_ID);
    expect(scenePrice(DEFAULT_SCENE_ID)).toBe(0);
    expect(CAMP_SCENES.filter(scene => scene.price > 0)).toHaveLength(4);
  });
  it("cuesta una semana de uso normal llegar al primero", () => {
    // ~95 bellotas/semana con la calibración de la spec §3.
    const semana = ACORN_RATES.day * 4 + ACORN_RATES.mission * 6 + ACORN_RATES.achievement;
    expect(semana).toBeGreaterThanOrEqual(90);
    expect(scenePrice("creek")).toBeLessThanOrEqual(semana + ACORN_RATES.welcome);
  });
  it("no acepta ids inventados", () => {
    expect(isCampSceneId("creek")).toBe(true);
    expect(isCampSceneId("../../etc/passwd")).toBe(false);
    expect(() => scenePrice("no-existe")).toThrow();
  });
  it("fija la época en una fecha ISO", () => {
    expect(ACORN_EPOCH).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pet/shop/catalog.test.ts`
Expected: FAIL — `Failed to resolve import "./catalog"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/pet/shop/catalog.ts
/** Contenido de la tienda. Vive en código, como `LOOT_ITEMS`: la base de datos no
 * guarda precios ni tarifas, los recibe resueltos (spec §4.3). */

/** Solo cuentan los hechos con fecha igual o posterior a esta (spec §3.1). Sin
 * ella, la primera recogida barrería el historial entero de una cuenta veterana.
 * Vale la fecha del día en que la migración llega a producción; si el despliegue
 * se retrasa un día, el único efecto es un día más de gracia. */
export const ACORN_EPOCH = "2026-09-11";

export const ACORN_RATES = { day: 10, mission: 5, achievement: 20, welcome: 50 } as const;
export type AcornKind = keyof typeof ACORN_RATES;

export interface CampScene {
  id: string;
  price: number;
  /** Fichero en `public/pet/scenes/`. */
  file: string;
  /** Tamaño NATIVO del WebP. Cada escena trae el suyo: el generador devuelve
   * relleno que se recorta, así que fingir un alto común rompe la escala entera. */
  width: number;
  height: number;
}

export const DEFAULT_SCENE_ID = "camp";

// Hasta que la Task 2 genere el arte, las cuatro de pago apuntan al fichero de
// siempre: el catálogo se ve y se compra, y nadie mira un hueco roto.
export const CAMP_SCENES = [
  { id: "camp", price: 0, file: "camp-portrait.webp", width: 288, height: 384 },
  { id: "creek", price: 100, file: "camp-portrait.webp", width: 288, height: 384 },
  { id: "autumn", price: 150, file: "camp-portrait.webp", width: 288, height: 384 },
  { id: "night", price: 150, file: "camp-portrait.webp", width: 288, height: 384 },
  { id: "snow", price: 150, file: "camp-portrait.webp", width: 288, height: 384 },
] as const satisfies readonly CampScene[];

export type CampSceneId = (typeof CAMP_SCENES)[number]["id"];

export function isCampSceneId(value: unknown): value is CampSceneId {
  return typeof value === "string" && CAMP_SCENES.some(scene => scene.id === value);
}

export function campScene(id: string): CampScene {
  const scene = CAMP_SCENES.find(entry => entry.id === id);
  if (!scene) throw new Error(`escena desconocida: ${id}`);
  return scene;
}

export function scenePrice(id: string): number {
  return campScene(id).price;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pet/shop/catalog.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pet/shop/catalog.ts src/lib/pet/shop/catalog.test.ts
git commit -m "feat(pet): catalogo, tarifas y epoca de las bellotas"
```

---

### Task 2: Migración y matriz SQL

**Files:**
- Create: `supabase/migrations/20260911_pet_acorns.sql`
- Create: `supabase/tests/pet_acorns.sql`

**Interfaces:**
- Consumes: `private.pet_lived_activity_days(uuid)` (de `20260906_pet_nudges.sql`), `public.pet_daily_missions`, `public.user_celebrations`, `public.pet_state`.
- Produces: `public.pet_acorn_state(uuid,date) → jsonb`, `public.claim_pet_acorns(uuid,date,jsonb) → setof pet_acorn_ledger`, `public.buy_pet_cosmetic(uuid,text,integer) → jsonb`, `public.set_pet_camp_scene(uuid,text) → text`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260911_pet_acorns.sql
-- R5: bellotas, desbloqueos cosméticos y la escena elegida del campamento.
-- Reserva el espacio de bloqueo consultivo 20260910 para recogidas y compras.
-- 20260908 es de aventuras y equipo: no se reutiliza.

create table public.pet_acorn_ledger (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 -- Clave del HECHO que generó el movimiento: 'day:2026-09-11', 'mission:<uuid>',
 -- 'achv:pet_achievement:finished:1', 'welcome', 'buy:creek'.
 source_key text not null,
 amount integer not null,
 created_at timestamptz not null default now(),
 -- Aquí vive la idempotencia: recoger dos veces no puede duplicar.
 unique (user_id, source_key)
);
alter table public.pet_acorn_ledger enable row level security;
revoke all on public.pet_acorn_ledger from public, anon, authenticated;
grant select on public.pet_acorn_ledger to authenticated;
grant all on public.pet_acorn_ledger to service_role;
create policy pet_acorn_ledger_read_own on public.pet_acorn_ledger for select to authenticated
 using ((select auth.uid()) = user_id);

create table public.pet_cosmetics (
 user_id uuid not null references auth.users(id) on delete cascade,
 cosmetic_id text not null,
 acquired_at timestamptz not null default now(),
 primary key (user_id, cosmetic_id)
);
alter table public.pet_cosmetics enable row level security;
revoke all on public.pet_cosmetics from public, anon, authenticated;
grant select on public.pet_cosmetics to authenticated;
grant all on public.pet_cosmetics to service_role;
create policy pet_cosmetics_read_own on public.pet_cosmetics for select to authenticated
 using ((select auth.uid()) = user_id);

-- La escena elegida es una DECISIÓN, así que va en pet_state. Solo la escribe
-- service_role a través de set_pet_camp_scene: sin grant de UPDATE para
-- authenticated, nadie puede ponerse una escena que no ha comprado.
alter table public.pet_state add column camp_scene text;
grant select (camp_scene) on public.pet_state to authenticated;

-- Una sola definición de «qué está pendiente», que usan la lectura y la recogida.
create function private.pet_acorn_pending(p_user uuid, p_epoch date)
returns table (kind text, key text) language sql stable security definer set search_path = '' as $$
 select 'welcome'::text, 'welcome'::text
 where not exists (select 1 from public.pet_acorn_ledger l
                   where l.user_id = p_user and l.source_key = 'welcome')
 union all
 select 'day', 'day:' || d.day::text
 from private.pet_lived_activity_days(p_user) d
 where d.day >= p_epoch
   and not exists (select 1 from public.pet_acorn_ledger l
                   where l.user_id = p_user and l.source_key = 'day:' || d.day::text)
 union all
 select 'mission', 'mission:' || m.id::text
 from public.pet_daily_missions m
 where m.user_id = p_user and m.completed_at is not null and m.day >= p_epoch
   and not exists (select 1 from public.pet_acorn_ledger l
                   where l.user_id = p_user and l.source_key = 'mission:' || m.id::text)
 union all
 select 'achievement', 'achv:' || c.event_key
 from public.user_celebrations c
 where c.user_id = p_user and c.event_type = 'pet_achievement'
   and (timezone('Europe/Madrid', c.first_triggered_at))::date >= p_epoch
   and not exists (select 1 from public.pet_acorn_ledger l
                   where l.user_id = p_user and l.source_key = 'achv:' || c.event_key);
$$;
alter function private.pet_acorn_pending(uuid, date) set datestyle = 'ISO, YMD';
revoke all on function private.pet_acorn_pending(uuid, date) from public, anon, authenticated;

create function public.pet_acorn_state(p_user uuid, p_epoch date)
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
  'balance', coalesce((select sum(amount) from public.pet_acorn_ledger where user_id = p_user), 0),
  'pending', coalesce((select jsonb_agg(jsonb_build_object('kind', p.kind, 'key', p.key) order by p.key)
                       from private.pet_acorn_pending(p_user, p_epoch) p), '[]'::jsonb),
  'owned', coalesce((select jsonb_agg(cosmetic_id order by cosmetic_id)
                     from public.pet_cosmetics where user_id = p_user), '[]'::jsonb),
  'scene', (select camp_scene from public.pet_state where user_id = p_user));
$$;
revoke all on function public.pet_acorn_state(uuid, date) from public, anon, authenticated;
grant execute on function public.pet_acorn_state(uuid, date) to service_role;

-- Las tarifas llegan resueltas desde el código: {"day":10,"mission":5,...}.
create function public.claim_pet_acorns(p_user uuid, p_epoch date, p_rates jsonb)
returns setof public.pet_acorn_ledger language plpgsql security definer set search_path = '' as $$
begin
 perform pg_advisory_xact_lock(20260910, hashtext(p_user::text));
 return query
 insert into public.pet_acorn_ledger (user_id, source_key, amount)
 select p_user, f.key, (p_rates ->> f.kind)::integer
 from private.pet_acorn_pending(p_user, p_epoch) f
 where (p_rates ->> f.kind) is not null and (p_rates ->> f.kind)::integer > 0
 on conflict (user_id, source_key) do nothing
 returning *;
end $$;
revoke all on function public.claim_pet_acorns(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.claim_pet_acorns(uuid, date, jsonb) to service_role;

create function public.buy_pet_cosmetic(p_user uuid, p_cosmetic text, p_price integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_balance integer;
begin
 if p_cosmetic is null or p_price is null or p_price < 0 then raise exception 'INVALID_COSMETIC'; end if;
 -- El bloqueo es lo que impide que dos toques simultáneos compren dos cosas con
 -- el saldo de una: sin él, ambos leen el mismo saldo antes de que nadie gaste.
 perform pg_advisory_xact_lock(20260910, hashtext(p_user::text));
 if exists (select 1 from public.pet_cosmetics
            where user_id = p_user and cosmetic_id = p_cosmetic) then
  return jsonb_build_object('bought', false, 'owned', true);
 end if;
 select coalesce(sum(amount), 0) into v_balance
 from public.pet_acorn_ledger where user_id = p_user;
 if v_balance < p_price then raise exception 'NOT_ENOUGH'; end if;
 insert into public.pet_cosmetics (user_id, cosmetic_id) values (p_user, p_cosmetic);
 insert into public.pet_acorn_ledger (user_id, source_key, amount)
 values (p_user, 'buy:' || p_cosmetic, -p_price);
 return jsonb_build_object('bought', true, 'owned', true);
end $$;
revoke all on function public.buy_pet_cosmetic(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.buy_pet_cosmetic(uuid, text, integer) to service_role;

-- null = la escena de siempre, que es gratis y no tiene fila en pet_cosmetics.
create function public.set_pet_camp_scene(p_user uuid, p_scene text)
returns text language plpgsql security definer set search_path = '' as $$
begin
 if p_scene is not null and not exists (select 1 from public.pet_cosmetics
                                        where user_id = p_user and cosmetic_id = p_scene) then
  raise exception 'NOT_OWNED';
 end if;
 update public.pet_state set camp_scene = p_scene, updated_at = now() where user_id = p_user;
 if not found then raise exception 'NO_PET'; end if;
 return p_scene;
end $$;
revoke all on function public.set_pet_camp_scene(uuid, text) from public, anon, authenticated;
grant execute on function public.set_pet_camp_scene(uuid, text) to service_role;
```

- [ ] **Step 2: Write the SQL matrix**

```sql
-- supabase/tests/pet_acorns.sql
-- R5: fixtures aisladas, siempre con rollback. No toca ninguna cuenta real.
begin;
create function pg_temp.assert_true(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'assertion_failed: %', msg; end if; end $$;

insert into auth.users(id,aud,role,email,created_at,updated_at) values
('20260911-5000-4000-8000-00000000000a','authenticated','authenticated','r5-a@example.test',now(),now());
insert into public.profiles(user_id,username,is_public,role) values
('20260911-5000-4000-8000-00000000000a','r5_sql_a',true,'user');
insert into public.pet_state(user_id,name,class) values
('20260911-5000-4000-8000-00000000000a','Nuez','wizard');
insert into public.pet_daily_missions(user_id,day,slot,template,target,xp,completed_at) values
('20260911-5000-4000-8000-00000000000a',current_date,0,'read_minutes',20,5,now()),
('20260911-5000-4000-8000-00000000000a',current_date,1,'rate_one',1,5,null);

-- Recoger una vez: la bienvenida y la misión sellada. La sin sellar no cuenta.
select pg_temp.assert_true(
 (select count(*) from public.claim_pet_acorns('20260911-5000-4000-8000-00000000000a', current_date - 1,
   '{"day":10,"mission":5,"achievement":20,"welcome":50}'::jsonb)) = 2, 'primera recogida: bienvenida + mision');
select pg_temp.assert_true(
 (select public.pet_acorn_state('20260911-5000-4000-8000-00000000000a', current_date - 1) ->> 'balance')::int = 55,
 'saldo 50 + 5');

-- Recoger otra vez no duplica: es una recogida vacía, no un error.
select pg_temp.assert_true(
 (select count(*) from public.claim_pet_acorns('20260911-5000-4000-8000-00000000000a', current_date - 1,
   '{"day":10,"mission":5,"achievement":20,"welcome":50}'::jsonb)) = 0, 'segunda recogida vacia');
select pg_temp.assert_true(
 (select public.pet_acorn_state('20260911-5000-4000-8000-00000000000a', current_date - 1) ->> 'balance')::int = 55,
 'saldo intacto');

-- La época excluye lo anterior: con la época en el futuro no hay nada pendiente.
select pg_temp.assert_true(
 jsonb_array_length(public.pet_acorn_state('20260911-5000-4000-8000-00000000000a', current_date + 1) -> 'pending') = 0,
 'epoca futura no concede nada');

-- Sin saldo no se compra.
do $$ begin
 perform public.buy_pet_cosmetic('20260911-5000-4000-8000-00000000000a','creek',100);
 raise exception 'compro sin saldo';
exception when others then if sqlerrm <> 'NOT_ENOUGH' then raise; end if; end $$;

-- Con saldo sí, y el gasto queda como fila negativa.
insert into public.pet_acorn_ledger(user_id,source_key,amount) values
('20260911-5000-4000-8000-00000000000a','test:top-up',100);
select pg_temp.assert_true(
 (public.buy_pet_cosmetic('20260911-5000-4000-8000-00000000000a','creek',100) ->> 'bought')::boolean,
 'compra con saldo');
select pg_temp.assert_true(
 (select public.pet_acorn_state('20260911-5000-4000-8000-00000000000a', current_date - 1) ->> 'balance')::int = 55,
 'saldo 155 - 100');
-- Comprar lo ya comprado no vuelve a cobrar.
select pg_temp.assert_true(
 not (public.buy_pet_cosmetic('20260911-5000-4000-8000-00000000000a','creek',100) ->> 'bought')::boolean,
 'compra repetida no cobra');
select pg_temp.assert_true(
 (select public.pet_acorn_state('20260911-5000-4000-8000-00000000000a', current_date - 1) ->> 'balance')::int = 55,
 'saldo tras compra repetida');

-- La escena: solo lo comprado.
select pg_temp.assert_true(
 public.set_pet_camp_scene('20260911-5000-4000-8000-00000000000a','creek') = 'creek', 'estrena lo comprado');
do $$ begin
 perform public.set_pet_camp_scene('20260911-5000-4000-8000-00000000000a','snow');
 raise exception 'acepto escena no comprada';
exception when others then if sqlerrm <> 'NOT_OWNED' then raise; end if; end $$;
select pg_temp.assert_true(
 public.set_pet_camp_scene('20260911-5000-4000-8000-00000000000a', null) is null, 'volver a la de siempre es gratis');

-- Permisos: nada de esto lo toca el cliente.
select pg_temp.assert_true(not has_table_privilege('authenticated','public.pet_acorn_ledger','INSERT'),'ledger sin insert directo');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.pet_acorn_ledger','UPDATE'),'ledger sin update directo');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.pet_cosmetics','INSERT'),'cosmeticos sin insert directo');
select pg_temp.assert_true(not has_column_privilege('authenticated','public.pet_state','camp_scene','UPDATE'),'camp_scene no lo escribe el cliente');
select pg_temp.assert_true(has_column_privilege('authenticated','public.pet_state','camp_scene','SELECT'),'camp_scene si se lee');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.claim_pet_acorns(uuid,date,jsonb)','EXECUTE'),'recoger solo servidor');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.buy_pet_cosmetic(uuid,text,integer)','EXECUTE'),'comprar solo servidor');
select pg_temp.assert_true(not has_function_privilege('anon','public.pet_acorn_state(uuid,date)','EXECUTE'),'anon denegado');
rollback;
```

- [ ] **Step 3: Run the matrix against the local disposable database**

Run:
```bash
npm run db:local:prepare && npm run test:db:local
```
Expected: sin `assertion_failed`; la matriz termina y hace rollback.

- [ ] **Step 4: Apply to dev and verify against the real objects**

Aplicar la migración con el MCP `supabase-dev` (o `supabase db push` apuntando a dev) y comprobar contra los objetos, **no contra el ledger de migraciones**:

```sql
select to_regclass('public.pet_acorn_ledger') is not null as ledger,
       to_regclass('public.pet_cosmetics') is not null as cosmetics,
       (select count(*) from information_schema.columns
        where table_name='pet_state' and table_schema='public') as pet_state_cols,
       (select count(*) from information_schema.column_privileges
        where table_name='pet_state' and privilege_type='INSERT' and grantee='authenticated') as ins,
       (select count(*) from information_schema.column_privileges
        where table_name='pet_state' and privilege_type='UPDATE' and grantee='authenticated') as upd;
```
Expected: `ledger` y `cosmetics` en `true`; `pet_state_cols` = 10 (eran 9); `ins` = 7 y `upd` = 6, **iguales que antes de la migración**. Si `ins` o `upd` cambian, parar: es la superficie 6 de `DRIFT-CHECK` y una columna sin su grant rompe la escritura entera de la tabla (#375).

- [ ] **Step 5: Regenerate the database types**

Run: `npx supabase gen types typescript --project-id <dev> > src/lib/supabase/database.types.ts`
(o `generate_typescript_types` del MCP). Comprobar que aparecen `pet_acorn_ledger`, `pet_cosmetics` y las cuatro funciones.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260911_pet_acorns.sql supabase/tests/pet_acorns.sql src/lib/supabase/database.types.ts
git commit -m "feat(pet): ledger de bellotas, cosmeticos y escena del campamento"
```

---

### Task 3: Servicio, repositorio y acciones

**Files:**
- Create: `src/lib/pet/shop/types.ts`
- Create: `src/lib/pet/shop/service.ts`
- Create: `src/lib/pet/shop/service.test.ts`
- Create: `src/lib/pet/shop/repository.ts`
- Create: `src/lib/pet/shop/actions.ts`
- Create: `src/lib/pet/shop/get-state.ts`

**Interfaces:**
- Consumes: `CAMP_SCENES`, `ACORN_RATES`, `ACORN_EPOCH`, `isCampSceneId`, `scenePrice` (Task 1); las cuatro funciones SQL (Task 2).
- Produces: `createShopService(repo)` con `state()`, `claim()`, `buy(id)`, `setScene(id)`; `shopRepository(admin, userId)`; acciones `claimAcorns()`, `buyCosmetic(id)`, `setCampScene(id)`; `getShopStateFor(userId)`; tipos `ShopState`, `ClaimResponse`, `BuyResponse`, `SceneResponse`.

- [ ] **Step 1: Write the types**

```ts
// src/lib/pet/shop/types.ts
import type { AcornKind } from "./catalog";

export interface AcornFact { kind: AcornKind; key: string }
export interface ShopState {
  balance: number;
  pending: AcornFact[];
  owned: string[];
  /** `null` = la escena de siempre. */
  scene: string | null;
}
export interface ClaimedEntry { key: string; kind: AcornKind; amount: number }
export type ShopErrorCode =
  | "UNAUTHENTICATED" | "UNKNOWN_COSMETIC" | "NOT_ENOUGH" | "NOT_OWNED" | "NO_PET" | "UNAVAILABLE";
export type ClaimResponse =
  | { ok: true; entries: ClaimedEntry[]; state: ShopState }
  | { ok: false; code: ShopErrorCode };
export type BuyResponse = { ok: true; state: ShopState } | { ok: false; code: ShopErrorCode };
export type SceneResponse = { ok: true; state: ShopState } | { ok: false; code: ShopErrorCode };

/** Construir solo tras autenticar: el repositorio está atado a ese usuario. */
export interface ShopRepository {
  state(): Promise<ShopState>;
  claim(): Promise<ClaimedEntry[]>;
  buy(cosmeticId: string, price: number): Promise<void>;
  setScene(cosmeticId: string | null): Promise<void>;
}
```

- [ ] **Step 2: Write the failing service test**

```ts
// src/lib/pet/shop/service.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createShopService } from "./service";
import type { ClaimedEntry, ShopRepository, ShopState } from "./types";

function fakeRepo(initial: Partial<ShopState> = {}) {
  const state: ShopState = { balance: 0, pending: [], owned: [], scene: null, ...initial };
  const claimed: ClaimedEntry[] = [];
  const repo: ShopRepository = {
    state: async () => ({ ...state, pending: [...state.pending], owned: [...state.owned] }),
    claim: async () => {
      const entries = state.pending.map(fact => ({ ...fact, amount: fact.kind === "day" ? 10 : 5 }));
      state.balance += entries.reduce((sum, entry) => sum + entry.amount, 0);
      state.pending = [];
      claimed.push(...entries);
      return entries;
    },
    buy: async (id, price) => {
      if (state.balance < price) throw new Error("NOT_ENOUGH");
      state.balance -= price; state.owned.push(id);
    },
    setScene: async id => {
      if (id !== null && !state.owned.includes(id)) throw new Error("NOT_OWNED");
      state.scene = id;
    },
  };
  return { repo, state, claimed };
}

describe("servicio de la tienda", () => {
  it("devuelve lo recogido y el estado nuevo", async () => {
    const { repo } = fakeRepo({ pending: [{ kind: "day", key: "day:2026-09-11" }] });
    const response = await createShopService(repo).claim();
    expect(response).toMatchObject({ ok: true, entries: [{ key: "day:2026-09-11", amount: 10 }] });
    if (response.ok) expect(response.state.balance).toBe(10);
  });
  it("rechaza un cosmético inventado sin llamar al repositorio", async () => {
    const { repo } = fakeRepo({ balance: 1000 });
    const buy = vi.spyOn(repo, "buy");
    expect(await createShopService(repo).buy("../../secret")).toEqual({ ok: false, code: "UNKNOWN_COSMETIC" });
    expect(buy).not.toHaveBeenCalled();
  });
  it("traduce la falta de saldo a su código", async () => {
    const { repo } = fakeRepo({ balance: 10 });
    expect(await createShopService(repo).buy("creek")).toEqual({ ok: false, code: "NOT_ENOUGH" });
  });
  it("cobra el precio del catálogo, no el que le pasen", async () => {
    const { repo } = fakeRepo({ balance: 100 });
    const buy = vi.spyOn(repo, "buy");
    await createShopService(repo).buy("creek");
    expect(buy).toHaveBeenCalledWith("creek", 100);
  });
  it("volver a la escena de siempre es gratis y no exige tenerla", async () => {
    const { repo } = fakeRepo({ owned: ["creek"], scene: "creek" });
    const response = await createShopService(repo).setScene("camp");
    expect(response).toMatchObject({ ok: true });
    if (response.ok) expect(response.state.scene).toBeNull();
  });
  it("no deja estrenar lo que no se ha comprado", async () => {
    const { repo } = fakeRepo();
    expect(await createShopService(repo).setScene("snow")).toEqual({ ok: false, code: "NOT_OWNED" });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/pet/shop/service.test.ts`
Expected: FAIL — `Failed to resolve import "./service"`.

- [ ] **Step 4: Write the service**

```ts
// src/lib/pet/shop/service.ts
import { DEFAULT_SCENE_ID, isCampSceneId, scenePrice } from "./catalog";
import type { BuyResponse, ClaimResponse, SceneResponse, ShopErrorCode, ShopRepository } from "./types";

function codeFrom(error: unknown): ShopErrorCode {
  const message = typeof error === "object" && error !== null && "message" in error ? error.message : null;
  return message === "NOT_ENOUGH" || message === "NOT_OWNED" || message === "NO_PET" ? message : "UNAVAILABLE";
}

export function createShopService(repo: ShopRepository) {
  return {
    state: () => repo.state(),
    async claim(): Promise<ClaimResponse> {
      try {
        const entries = await repo.claim();
        return { ok: true, entries, state: await repo.state() };
      } catch (error) { return { ok: false, code: codeFrom(error) }; }
    },
    async buy(cosmeticId: unknown): Promise<BuyResponse> {
      if (!isCampSceneId(cosmeticId)) return { ok: false, code: "UNKNOWN_COSMETIC" };
      // El precio sale del catálogo, nunca del cliente.
      const price = scenePrice(cosmeticId);
      if (price <= 0) return { ok: false, code: "UNKNOWN_COSMETIC" };
      try {
        await repo.buy(cosmeticId, price);
        return { ok: true, state: await repo.state() };
      } catch (error) { return { ok: false, code: codeFrom(error) }; }
    },
    async setScene(cosmeticId: unknown): Promise<SceneResponse> {
      if (!isCampSceneId(cosmeticId)) return { ok: false, code: "UNKNOWN_COSMETIC" };
      // La escena de siempre es gratis y no tiene desbloqueo: se guarda como null.
      const value = cosmeticId === DEFAULT_SCENE_ID ? null : cosmeticId;
      try {
        await repo.setScene(value);
        return { ok: true, state: await repo.state() };
      } catch (error) { return { ok: false, code: codeFrom(error) }; }
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/pet/shop/service.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Write the repository**

```ts
// src/lib/pet/shop/repository.ts
import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ACORN_EPOCH, ACORN_RATES, type AcornKind } from "./catalog";
import type { ClaimedEntry, ShopRepository, ShopState } from "./types";

type Admin = ReturnType<typeof createServiceRoleClient>;

function kindOf(key: string): AcornKind {
  if (key === "welcome") return "welcome";
  if (key.startsWith("day:")) return "day";
  if (key.startsWith("mission:")) return "mission";
  return "achievement";
}

/** Sin cliente de sesión, al contrario que los demás repositorios de mascota:
 * TODO el estado sale de una sola función `definer`, porque los pendientes
 * necesitan `private.pet_lived_activity_days` y PostgREST no sabe sumar el saldo.
 * Un parámetro que no se usa es una mentira sobre lo que esto lee. */
export function shopRepository(admin: Admin, userId: string): ShopRepository {
  async function state(): Promise<ShopState> {
    const { data, error } = await admin.rpc("pet_acorn_state", { p_user: userId, p_epoch: ACORN_EPOCH });
    if (error) throw error;
    const value = (data ?? {}) as { balance?: number; pending?: { kind: AcornKind; key: string }[]; owned?: string[]; scene?: string | null };
    return {
      balance: value.balance ?? 0,
      pending: value.pending ?? [],
      owned: value.owned ?? [],
      scene: value.scene ?? null,
    };
  }
  return {
    state,
    async claim(): Promise<ClaimedEntry[]> {
      const { data, error } = await admin.rpc("claim_pet_acorns", { p_user: userId, p_epoch: ACORN_EPOCH, p_rates: ACORN_RATES });
      if (error) throw error;
      return (data ?? []).map(row => ({ key: row.source_key, kind: kindOf(row.source_key), amount: row.amount }));
    },
    async buy(cosmeticId, price) {
      const { error } = await admin.rpc("buy_pet_cosmetic", { p_user: userId, p_cosmetic: cosmeticId, p_price: price });
      if (error) throw new Error(error.message.includes("NOT_ENOUGH") ? "NOT_ENOUGH" : error.message);
    },
    async setScene(cosmeticId) {
      const { error } = await admin.rpc("set_pet_camp_scene", { p_user: userId, p_scene: cosmeticId });
      if (error) throw new Error(error.message.includes("NOT_OWNED") ? "NOT_OWNED" : error.message.includes("NO_PET") ? "NO_PET" : error.message);
    },
  };
}
```

- [ ] **Step 7: Write the actions and the page reader**

```ts
// src/lib/pet/shop/actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { revalidatePetPage } from "@/lib/reactivity/revalidate";
import { shopRepository } from "./repository";
import { createShopService } from "./service";
import type { BuyResponse, ClaimResponse, SceneResponse } from "./types";

async function serviceForCaller() {
  const session = await createClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return null;
  return createShopService(shopRepository(createServiceRoleClient(), user.id));
}

export async function claimAcorns(): Promise<ClaimResponse> {
  try {
    const service = await serviceForCaller();
    if (!service) return { ok: false, code: "UNAUTHENTICATED" };
    const response = await service.claim();
    if (response.ok) revalidatePetPage();
    return response;
  } catch { return { ok: false, code: "UNAVAILABLE" }; }
}

export async function buyCosmetic(cosmeticId: unknown): Promise<BuyResponse> {
  try {
    const service = await serviceForCaller();
    if (!service) return { ok: false, code: "UNAUTHENTICATED" };
    const response = await service.buy(cosmeticId);
    if (response.ok) revalidatePetPage();
    return response;
  } catch { return { ok: false, code: "UNAVAILABLE" }; }
}

export async function setCampScene(cosmeticId: unknown): Promise<SceneResponse> {
  try {
    const service = await serviceForCaller();
    if (!service) return { ok: false, code: "UNAUTHENTICATED" };
    const response = await service.setScene(cosmeticId);
    if (response.ok) revalidatePetPage();
    return response;
  } catch { return { ok: false, code: "UNAVAILABLE" }; }
}
```

```ts
// src/lib/pet/shop/get-state.ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { shopRepository } from "./repository";
import type { ShopState } from "./types";

/** Sin cliente de sesión: la autorización la hace la página, que ya resolvió
 * quién es el usuario, y la lectura entera vive en una función `definer`. */
export async function getShopStateFor(userId: string): Promise<ShopState> {
  return shopRepository(createServiceRoleClient(), userId).state();
}
```

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: sin salida.

```bash
git add src/lib/pet/shop
git commit -m "feat(pet): servicio, repositorio y acciones de la tienda"
```

---

### Task 4: El puesto en el campamento

**Files:**
- Create: `src/components/pet/shop/shop-panel.tsx`
- Create: `src/components/pet/shop/shop-panel.module.css`
- Create: `src/components/pet/shop/shop-panel.test.tsx`
- Modify: `messages/es.json` (bloque `pet.shop`)

**Interfaces:**
- Consumes: `ShopState`, `claimAcorns`, `buyCosmetic`, `setCampScene`, `CAMP_SCENES`, `DEFAULT_SCENE_ID`.
- Produces: `<ShopPanel state onClose onChanged? actions? />`, donde `actions` permite inyectar dobles en los tests, igual que `EquipmentPanel` acepta `onEquip`.

- [ ] **Step 1: Add the messages**

En `messages/es.json`, dentro de `pet`, junto a `adventure`:

```json
"shop": {
  "title": "Puesto del claro",
  "open": "Ir al puesto",
  "close": "Cerrar el puesto",
  "balance": "{count, plural, one {# bellota} other {# bellotas}}",
  "claim": "Recoger {count, plural, one {# bellota} other {# bellotas}}",
  "claimEmpty": "Nada que recoger por ahora",
  "claimed": "Recogidas {total, plural, one {# bellota} other {# bellotas}}",
  "claimHelp": "Las bellotas no caducan. Recoger hoy o dentro de diez días da lo mismo.",
  "sources": { "day": "por el día {day}", "mission": "por una misión", "achievement": "por un logro", "welcome": "de bienvenida" },
  "buy": "Comprar por {price}",
  "missing": "Te faltan {count, plural, one {# bellota} other {# bellotas}}",
  "use": "Poner este fondo",
  "active": "Puesto ahora",
  "owned": "Ya es tuyo",
  "free": "El de siempre",
  "scenes": {
    "camp": "El claro de siempre",
    "creek": "El arroyo",
    "autumn": "El robledal en otoño",
    "night": "La noche de luciérnagas",
    "snow": "La primera nevada"
  },
  "error": "No se pudo completar. Vuelve a intentarlo."
}
```

- [ ] **Step 2: Write the failing component test**

```tsx
// src/components/pet/shop/shop-panel.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import { ShopPanel } from "./shop-panel";
import type { ShopState } from "@/lib/pet/shop/types";

afterEach(cleanup);
const base: ShopState = { balance: 120, pending: [], owned: [], scene: null };
function view(state: Partial<ShopState>, actions: Parameters<typeof ShopPanel>[0]["actions"]) {
  return <NextIntlClientProvider locale="es" timeZone="Europe/Madrid" messages={messages}>
    <ShopPanel state={{ ...base, ...state }} onClose={() => {}} actions={actions} />
  </NextIntlClientProvider>;
}

it("recoge y enseña el desglose de lo ingresado", async () => {
  const claim = vi.fn().mockResolvedValue({
    ok: true,
    entries: [{ key: "day:2026-09-11", kind: "day", amount: 10 }, { key: "welcome", kind: "welcome", amount: 50 }],
    state: { ...base, balance: 180, pending: [] },
  });
  render(view({ balance: 120, pending: [{ kind: "day", key: "day:2026-09-11" }, { kind: "welcome", key: "welcome" }] },
    { claim, buy: vi.fn(), setScene: vi.fn() }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /Recoger/ })));
  expect(claim).toHaveBeenCalledTimes(1);
  const status = screen.getByRole("status");
  expect(status.textContent).toContain("60");
  expect(status.textContent).toContain("de bienvenida");
  expect(screen.getByTestId("acorn-balance").textContent).toContain("180");
});

it("no ofrece comprar lo que no se puede pagar, y dice cuánto falta", () => {
  render(view({ balance: 10 }, { claim: vi.fn(), buy: vi.fn(), setScene: vi.fn() }));
  const card = screen.getByTestId("scene-creek");
  expect(within(card).getByText("Te faltan 90 bellotas")).toBeTruthy();
  expect(within(card).queryByRole("button", { name: /Comprar/ })).toBeNull();
});

it("compra y deja estrenar lo comprado", async () => {
  const buy = vi.fn().mockResolvedValue({ ok: true, state: { ...base, balance: 20, owned: ["creek"] } });
  const setScene = vi.fn().mockResolvedValue({ ok: true, state: { ...base, balance: 20, owned: ["creek"], scene: "creek" } });
  render(view({ balance: 120 }, { claim: vi.fn(), buy, setScene }));
  await act(async () => fireEvent.click(within(screen.getByTestId("scene-creek")).getByRole("button", { name: /Comprar/ })));
  expect(buy).toHaveBeenCalledWith("creek");
  await act(async () => fireEvent.click(within(screen.getByTestId("scene-creek")).getByRole("button", { name: "Poner este fondo" })));
  expect(setScene).toHaveBeenCalledWith("creek");
  expect(within(screen.getByTestId("scene-creek")).getByText("Puesto ahora")).toBeTruthy();
});

it("el fondo de siempre siempre se puede poner", () => {
  render(view({ owned: ["creek"], scene: "creek" }, { claim: vi.fn(), buy: vi.fn(), setScene: vi.fn() }));
  expect(within(screen.getByTestId("scene-camp")).getByRole("button", { name: "Poner este fondo" })).toBeTruthy();
});

it("un fallo deja el saldo como estaba y lo dice", async () => {
  const buy = vi.fn().mockResolvedValue({ ok: false, code: "UNAVAILABLE" });
  render(view({ balance: 120 }, { claim: vi.fn(), buy, setScene: vi.fn() }));
  await act(async () => fireEvent.click(within(screen.getByTestId("scene-creek")).getByRole("button", { name: /Comprar/ })));
  expect(screen.getByRole("status").textContent).toContain("Vuelve a intentarlo");
  expect(screen.getByTestId("acorn-balance").textContent).toContain("120");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/pet/shop/shop-panel.test.tsx`
Expected: FAIL — no existe `./shop-panel`.

- [ ] **Step 4: Write the component**

```tsx
// src/components/pet/shop/shop-panel.tsx
"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CAMP_SCENES, DEFAULT_SCENE_ID, scenePrice } from "@/lib/pet/shop/catalog";
import { buyCosmetic, claimAcorns, setCampScene } from "@/lib/pet/shop/actions";
import type { ShopState } from "@/lib/pet/shop/types";
import styles from "./shop-panel.module.css";

const defaultActions = { claim: claimAcorns, buy: buyCosmetic, setScene: setCampScene };

export function ShopPanel({ state: initial, onClose, actions = defaultActions }: {
  state: ShopState;
  onClose: () => void;
  actions?: { claim: typeof claimAcorns; buy: typeof buyCosmetic; setScene: typeof setCampScene };
}) {
  const t = useTranslations("pet.shop");
  const [state, setState] = useState(initial);
  const [claimed, setClaimed] = useState<{ total: number; parts: string[] } | null>(null);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  async function run(work: () => Promise<{ ok: true; state: ShopState } | { ok: false; code: string }>) {
    if (busy.current) return null;
    busy.current = true; setPending(true); setError(false);
    try {
      const response = await work();
      if (response.ok) { setState(response.state); return response; }
      setError(true); return null;
    } catch { setError(true); return null; }
    finally { busy.current = false; setPending(false); }
  }

  async function claim() {
    setClaimed(null);
    const response = await run(async () => {
      const result = await actions.claim();
      return result.ok ? { ok: true as const, state: result.state, entries: result.entries } : result;
    }) as { ok: true; state: ShopState; entries: { kind: string; key: string; amount: number }[] } | null;
    if (!response) return;
    setClaimed({
      total: response.entries.reduce((sum, entry) => sum + entry.amount, 0),
      parts: response.entries.map(entry => `+${entry.amount} ${t(`sources.${entry.kind}`, { day: entry.key.slice(4) })}`),
    });
  }

  return <section className={styles.panel} aria-labelledby="pet-shop-title" data-testid="pet-shop" aria-busy={pending}>
    <header>
      <h3 id="pet-shop-title">{t("title")}</h3>
      <button type="button" className={styles.close} onClick={onClose}>{t("close")}</button>
    </header>
    <p className={styles.balance} data-testid="acorn-balance">{t("balance", { count: state.balance })}</p>
    <button type="button" className={styles.claim} disabled={pending || !state.pending.length} onClick={claim}>
      {state.pending.length ? t("claim", { count: state.pending.length }) : t("claimEmpty")}
    </button>
    <p className={styles.help}>{t("claimHelp")}</p>
    <p role="status" aria-live="polite" className={styles.status} data-error={error || undefined}>
      {error ? t("error") : claimed ? `${t("claimed", { total: claimed.total })} · ${claimed.parts.join(" · ")}` : ""}
    </p>
    <ul className={styles.grid}>
      {CAMP_SCENES.map(scene => {
        const owned = scene.id === DEFAULT_SCENE_ID || state.owned.includes(scene.id);
        const active = (state.scene ?? DEFAULT_SCENE_ID) === scene.id;
        const price = scenePrice(scene.id);
        const missing = price - state.balance;
        return <li key={scene.id} data-testid={`scene-${scene.id}`} className={styles.card} data-owned={owned} data-active={active}>
          {/* eslint-disable-next-line @next/next/no-img-element -- escena de píxel servida a escala entera */}
          <img src={`/pet/scenes/${scene.file}`} width={scene.width} height={scene.height} alt="" className={styles.thumb} />
          <strong>{t(`scenes.${scene.id}`)}</strong>
          {active ? <span className={styles.active}>{t("active")}</span>
            : owned ? <button type="button" disabled={pending} onClick={() => run(() => actions.setScene(scene.id))}>{t("use")}</button>
            : missing > 0 ? <span className={styles.missing}>{t("missing", { count: missing })}</span>
            : <button type="button" disabled={pending} onClick={() => run(() => actions.buy(scene.id))}>{t("buy", { price })}</button>}
        </li>;
      })}
    </ul>
  </section>;
}
```

```css
/* src/components/pet/shop/shop-panel.module.css
   Los tokens los pone `.game` (pet-game.module.css): aquí no nace ningún color. */
.panel { color: var(--cream, #f4f0d8); background: var(--forest-800, #0c2d24); border: 1px solid var(--moss, #355b48); border-radius: var(--r-2, 8px); padding: clamp(.8rem, 2.5vw, 1.2rem); display: grid; gap: .7rem; min-width: 0; }
.panel header { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
.panel h3 { font-size: 18px; font-weight: 700; }
.close { min-height: 44px; color: var(--cream-muted); text-decoration: underline; text-underline-offset: 4px; font-size: 13px; }
.balance { color: var(--gold); font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.claim { min-height: 48px; padding: .7rem; background: linear-gradient(0deg, var(--wood-dark), var(--wood)); border: 1px solid var(--wood-edge); border-radius: var(--r-2); box-shadow: inset 0 2px #dcb6714d, 0 3px #04170f; color: var(--cream); font-weight: 650; font-size: 16px; }
.claim:disabled { filter: saturate(.35); cursor: default; }
.help, .missing { color: var(--cream-muted); font-size: 13px; line-height: 1.5; }
.status { font-size: 13px; color: #c6ec9e; }
.status:empty { display: none; }
.status[data-error] { color: var(--danger); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: .6rem; list-style: none; padding: 0; margin: 0; }
.card { display: grid; gap: .4rem; padding: .6rem; border: 1px solid var(--moss); border-radius: var(--r-2); background: var(--forest-700); min-width: 0; }
.card[data-active="true"] { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }
.card strong { font-size: 14px; overflow-wrap: anywhere; }
.card button { min-height: 44px; border: 1px solid var(--wood-edge); border-radius: var(--r-2); background: var(--wood); color: var(--cream); font-size: 13px; font-weight: 600; }
.thumb { width: 100%; height: auto; aspect-ratio: 3 / 4; object-fit: cover; image-rendering: pixelated; border-radius: var(--r-1); }
.active { color: var(--gold); font-size: 13px; font-weight: 600; }
.panel button:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/pet/shop/shop-panel.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/pet/shop messages/es.json
git commit -m "feat(pet): el puesto del claro, con recogida y catalogo de fondos"
```

---

### Task 5: Enchufar el puesto y estrenar el fondo

**Files:**
- Modify: `src/app/mascota/page.tsx`
- Modify: `src/components/pet/game/pet-game.tsx`
- Modify: `src/components/pet/game/pet-hud.tsx`
- Modify: `src/components/pet/game/pet-game.module.css`
- Modify: `src/components/pet/game/pet-game.test.tsx`

**Interfaces:**
- Consumes: `getShopStateFor` (Task 3), `<ShopPanel>` (Task 4), `campScene` (Task 1).
- Produces: `<PetGame shop={ShopState | null} />`; `<PetScene scene={CampScene | null}>`.

- [ ] **Step 1: Write the failing test**

En `src/components/pet/game/pet-game.test.tsx`, añadir:

El fichero ya tiene un helper `game(userId, snapshot)`; añádele un tercer parámetro:

```tsx
function game(userId = "alice", snapshot = pet, shop: ShopState | null = null) {
  return <NextIntlClientProvider locale="es" messages={messages}><PetGame userId={userId} pet={snapshot} adventure={adventure} shop={shop} burrow={<div>Burrow</div>} /></NextIntlClientProvider>;
}
```

Y el test nuevo:

```tsx
it("abre el puesto sin salir del campamento y pinta el fondo comprado", () => {
  render(game("alice", pet, { balance: 0, pending: [], owned: ["creek"], scene: "creek" }));
  // La escena elegida manda sobre la de siempre.
  expect(screen.getByTestId("pet-scene").style.getPropertyValue("--scene-src")).toContain("camp-portrait.webp");
  fireEvent.click(screen.getByRole("button", { name: "Ir al puesto" }));
  expect(screen.getByTestId("pet-shop")).toBeTruthy();
  // El puesto no es un destino: la barra sigue con cuatro botones.
  expect(within(screen.getByRole("navigation", { name: "Navegación de la mascota" })).getAllByRole("button")).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "Cerrar el puesto" }));
  expect(screen.queryByTestId("pet-shop")).toBeNull();
});
```

> Nota: mientras la Task 6 no genere el arte, las cinco entradas del catálogo apuntan a `camp-portrait.webp`; por eso la aserción del `--scene-src` busca ese fichero. Al cambiar los ficheros en la Task 6, esta aserción pasa a `camp-creek.webp`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/pet/game/pet-game.test.tsx`
Expected: FAIL — no existe el botón «Ir al puesto».

- [ ] **Step 3: Load the state in the page**

En `src/app/mascota/page.tsx`, junto a la lectura de aventuras:

```tsx
  let shop: ShopState | null = null;
  try { shop = await getShopStateFor(user.id); }
  catch (error) { console.error("pet game shop", error); }
  return <PetGame key={user.id} userId={user.id} pet={pet} adventure={adventure} shop={shop} burrow={burrow} />;
```

Con los imports `import { getShopStateFor } from "@/lib/pet/shop/get-state";` y `import type { ShopState } from "@/lib/pet/shop/types";`.

**Por qué en `try`/`catch` como aventuras:** un fallo de la tienda no puede tumbar la ficha, la madriguera ni el entrenamiento.

- [ ] **Step 4: Wire the stall into the camp**

En `src/components/pet/game/pet-game.tsx`:

1. Añadir `shop` a las props: `{ userId, pet, adventure, shop, burrow, hatch }` con tipo `shop: ShopState | null`.
2. Estado local: `const [stall, setStall] = useState(false);`
3. En `.campActions`, tras el botón de entrenar:

```tsx
{shop && <button className={styles.secondary} onClick={() => setStall(true)}><AcornIcon />{t("shop.open")}</button>}
```

4. En la columna de la derecha (`.campMissions`), el puesto sustituye al tablero mientras está abierto — la escena sigue visible arriba, que es la razón de que la tienda viva aquí:

```tsx
<aside className={styles.campMissions}>
  {stall && shop
    ? <ShopPanel state={shop} onClose={() => setStall(false)} />
    : <>{/* … el contenido de misiones que ya había … */}</>}
</aside>
```

5. Pasar la escena elegida a la escena del campamento:

```tsx
<PetScene pet={pet} reaction={reaction} scene={shop?.scene ? campScene(shop.scene) : null} />
```

Imports nuevos: `ShopPanel`, `campScene`, `type ShopState`, y `AcornIcon` de `@/components/ui/icons` (existe ya, en `icons.tsx:466`; es el glifo de la bellota que usa la etapa `acorn`).

- [ ] **Step 5: Let the scene take the chosen background**

En `src/components/pet/game/pet-hud.tsx`:

```tsx
export function PetScene({ pet, reaction, compact = false, scene = null }: {
  pet: PetSnapshot; reaction?: PetReaction; compact?: boolean; scene?: CampScene | null;
}) {
  // …
  return <div className={styles.scene} data-compact={compact} data-testid="pet-scene"
    style={scene ? {
      "--scene-src": `url('/pet/scenes/${scene.file}')`,
      "--scene-w": String(scene.width),
      "--scene-h": String(scene.height),
    } as React.CSSProperties : undefined}>
```

**Por qué en línea y no con una clase por escena:** cada WebP trae su tamaño nativo y la escala entera depende de él; una clase por fondo obligaría a tocar el CSS cada vez que se añade uno.

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run src/components/pet/ && npx tsc --noEmit`
Expected: PASS y sin salida de `tsc`.

- [ ] **Step 7: Verify in the browser**

Arrancar `npm run dev` (uno solo, puerto 3000) y con una cuenta de dev: abrir `/mascota`, pulsar «Ir al puesto», comprobar que la escena sigue visible arriba, que la barra sigue con cuatro destinos y que a 320 px de ancho no aparece scroll horizontal.

- [ ] **Step 8: Commit**

```bash
git add src/app/mascota/page.tsx src/components/pet/game
git commit -m "feat(pet): el puesto vive en el campamento y estrena el fondo"
```

---

### Task 6: Arte de los cuatro fondos

> **Gate:** la Parte I §14 dice que el arte de un hito se genera después de que el anterior pase sus criterios, y la aceptación jugable de R4b sigue abierta (#1123). Si el dueño prefiere esperar, esta tarea se aplaza y todo lo demás funciona con `camp-portrait.webp` como marcador.

**Files:**
- Create: `public/pet/scenes/camp-creek.webp`, `camp-autumn.webp`, `camp-night.webp`, `camp-snow.webp`
- Modify: `public/pet/scenes/provenance.json`
- Modify: `src/lib/pet/shop/catalog.ts`
- Modify: `src/lib/pet/shop/catalog.test.ts`

- [ ] **Step 1: Generate the candidates with the `pet-artist` agent**

Encargo: cuatro variantes de la lámina vertical del campamento, **mismo encuadre y misma altura de horizonte que `camp-portrait.webp`**, tercio inferior despejado (ahí va el sprite y el bocadillo de humor), paleta del bosque del RPG. Candidatos a `.superpowers/brainstorm/<fecha>/`; a `public/pet/scenes/` solo lo elegido.

- [ ] **Step 2: Crop, never rescale**

Los generadores devuelven relleno abajo. **Recortar** al contenido real y anotar el tamaño exacto; reescalar rompe la escala de píxel entera, que es la regla que impuso el rediseño.

- [ ] **Step 3: Check the text on top stays legible**

Con cada fondo puesto, comprobar el contraste de `.sceneStatus` y `.sceneMood` sobre él. **Un fondo que deje ilegible el texto del campamento no entra al catálogo**, por bonito que sea (criterio de salida de la spec §7).

- [ ] **Step 4: Update the catalog with the real files and sizes**

Sustituir `file`, `width` y `height` de las cuatro entradas de pago por los valores reales, y añadir al test:

```ts
it("cada escena del catálogo existe en disco con su tamaño", async () => {
  const { existsSync } = await import("node:fs");
  for (const scene of CAMP_SCENES) {
    expect(existsSync(`public/pet/scenes/${scene.file}`), scene.file).toBe(true);
    expect(scene.width).toBeGreaterThan(0);
    expect(scene.height).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/pet/shop/ src/components/pet/`
Expected: PASS. Actualizar la aserción de `--scene-src` de la Task 5 al fichero real.

- [ ] **Step 6: Commit**

```bash
git add public/pet/scenes src/lib/pet/shop
git commit -m "feat(pet): cuatro fondos de campamento para la tienda"
```

---

### Task 7: Recorrido end-to-end

**Files:**
- Create: `e2e/mascota-tienda.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect, type APIRequestContext } from "@playwright/test";
import { withBattleUsers } from "./support/battle-users";
import { hideNextDevOverlay } from "./support/dev-overlay";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

test("tienda: recoger con desglose, comprar, estrenar y sobrevivir a una recarga", async ({ page, request }) => {
  test.setTimeout(180_000);
  await withBattleUsers(url, key, async (createUser) => {
    const user = await createUser("r5tiendaa");
    expect((await request.post(`${url}/rest/v1/pet_state`, { headers, data: { user_id: user.id, name: "Nuez", class: "wizard" } })).ok()).toBe(true);
    // Saldo sembrado directamente: esta prueba mira la tienda, no la concesión.
    expect((await request.post(`${url}/rest/v1/pet_acorn_ledger`, { headers, data: { user_id: user.id, source_key: "test:seed", amount: 200 } })).ok()).toBe(true);

    await hideNextDevOverlay(page);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/login?next=/mascota");
    await page.locator('input[name="email"]').fill(user.email);
    await page.locator('input[name="password"]').fill(user.password);
    await page.locator('button[type="submit"]').click();
    // Esperar al destino REAL: /login?next=/mascota también acaba en "/mascota" (#1174).
    await page.waitForURL((u) => u.pathname === "/mascota" && !u.search, { timeout: 30_000 });

    await page.getByRole("button", { name: "Ir al puesto", exact: true }).click();
    const shop = page.getByTestId("pet-shop");
    await expect(shop).toBeVisible();
    await expect(shop.getByTestId("acorn-balance")).toContainText("200");
    // La bienvenida está pendiente: recoger la ingresa y lo dice.
    await shop.getByRole("button", { name: /Recoger/ }).click();
    await expect(shop.getByRole("status")).toContainText("bienvenida");
    await expect(shop.getByTestId("acorn-balance")).toContainText("250");

    await shop.getByTestId("scene-creek").getByRole("button", { name: /Comprar/ }).click();
    await expect(shop.getByTestId("acorn-balance")).toContainText("150");
    await shop.getByTestId("scene-creek").getByRole("button", { name: "Poner este fondo" }).click();
    await expect(shop.getByTestId("scene-creek")).toContainText("Puesto ahora");
    await shop.screenshot({ path: ".superpowers/r5-tienda-mobile.png" });

    await page.reload();
    await page.getByRole("button", { name: "Ir al puesto", exact: true }).click();
    await expect(page.getByTestId("scene-creek")).toContainText("Puesto ahora");
    await expect(page.getByTestId("acorn-balance")).toContainText("150");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test e2e/mascota-tienda.spec.ts --retries=0 --reporter=list`
Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add e2e/mascota-tienda.spec.ts
git commit -m "test(pet): e2e de la tienda de bellotas"
```

---

### Task 8: Sincronizar la documentación y publicar

**Files:**
- Modify: `docs/requirements/data-model.md` (nueva §8bis.9)
- Modify: `docs/requirements/backlog.md`
- Modify: `docs/design/2026-09-06-mascota-rpg-evolucion-por-fases.md` (Parte I §12 y §15; Parte II R5)
- Modify: `docs/requirements/decisiones.md` (entrada al final)
- Create: `docs/testing/<fecha de ejecución>-r5-verificacion.md`

- [ ] **Step 1: Modelo de datos**

Añadir §8bis.9 con las dos tablas, la columna nueva, las cuatro funciones, sus grants y el resultado de la superficie 6 comparado con dev **y** prod. Actualizar la cabecera de frescura del documento.

- [ ] **Step 2: Backlog y hoja de ruta**

Marcar la casilla de R5 con lo que quedó fuera y lo que no se ha aceptado todavía. En la hoja de ruta: corregir §12 y §15 de la Parte I (el sumidero ya no es equipo) y reescribir la entrada R5 de la Parte II con lo entregado y sus criterios.

- [ ] **Step 3: Decisiones**

Añadir **al final** (append-only) la entrada «<fecha de ejecución> — Las bellotas se gastan en apariencia, no en poder», con: qué se decidió, que contradice la Parte I, las tres consecuencias (R5 necesita arte para existir, R10 se queda sin su primer sumidero, el equipo comprable queda sin hito), y las dos reglas del repaso (época y bienvenida).

- [ ] **Step 4: Evidencia**

Escribir `docs/testing/<fecha de ejecución>-r5-verificacion.md` con: matriz SQL ejecutada, unitarios, e2e, comprobación de la superficie 6 en dev y prod, y **qué NO acredita** (la aceptación de producto del ritmo real, que necesita una semana de uso).

- [ ] **Step 5: Aplicar la migración a producción**

Dev primero (ya hecho en la Task 2), prod después. Verificar contra `pg_class`/`pg_proc`, no contra `list_migrations`. La migración es **aditiva** (tablas nuevas, columna nullable, funciones nuevas): se puede aplicar antes del código sin ventana de error.

- [ ] **Step 6: Verificación final y PR**

Run:
```bash
npx tsc --noEmit && npx vitest run && node docs/architecture/sync.mjs --check
```
Expected: TypeScript sin salida, suite en verde, `graph.json OK`.

```bash
git add docs
git commit -m "docs(pet): R5 publicada, con lo que su publicacion NO cierra"
```

Abrir la PR con lo entregado, la evidencia y lo que queda abierto.

---

## Repaso del plan contra la spec

| Sección de la spec | Tarea |
|---|---|
| §2 experiencia (puesto, recoger, comprar, estrenar, cambiar) | 4, 5 |
| §2 las bellotas no caducan | 2 (sin ventana en `pet_acorn_pending`), 4 (`claimHelp`) |
| §3 tres fuentes y calibración | 1, 2 |
| §3.1 época y bienvenida | 1, 2 |
| §4.1 ledger e idempotencia por restricción | 2 |
| §4.2 desbloqueos y `camp_scene` + superficie 6 | 2 |
| §4.3 funciones `service_role`, bloqueo, precio desde código | 2, 3 |
| §4.4 actividad editada después | 2 (solo se sella lo pendiente; lo sellado no se revierte) |
| §5 interfaz y accesibilidad | 4, 5 |
| §6 arte | 6 |
| §7 verificación y criterios | 2, 4, 7, 8 |
| §9 cambio de contrato | 8 |
