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

-- Actividad borrada tras recoger: una bellota ya ingresada en el ledger no se
-- revierte por borrar la fila que la generó (no hay FK de pet_acorn_ledger a
-- pet_daily_missions, a propósito: el ledger es el hecho consumado, la misión
-- es solo la fuente que lo detectó).
with borrada as (
 delete from public.pet_daily_missions
 where user_id = '20260911-5000-4000-8000-00000000000a' and slot = 0
 returning id
)
select pg_temp.assert_true((select count(*) from borrada) = 1, 'se borra la mision ya recogida');
select pg_temp.assert_true(
 exists (select 1 from public.pet_acorn_ledger
         where user_id = '20260911-5000-4000-8000-00000000000a' and source_key like 'mission:%'),
 'el movimiento de la mision sigue en el ledger tras borrar la actividad');
select pg_temp.assert_true(
 (select public.pet_acorn_state('20260911-5000-4000-8000-00000000000a', current_date - 1) ->> 'balance')::int = 55,
 'borrar la actividad no revierte lo ya cobrado');
select pg_temp.assert_true(
 not exists (
  select 1 from jsonb_array_elements(
   public.pet_acorn_state('20260911-5000-4000-8000-00000000000a', current_date - 1) -> 'pending'
  ) p where p ->> 'kind' = 'mission'
 ),
 'sin fila de mision no hay pendiente de mision (ni la ya cobrada ni una nueva)');

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
