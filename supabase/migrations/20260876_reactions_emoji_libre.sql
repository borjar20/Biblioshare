-- Reacciones con cualquier emoji (spec 2026-08-24-reacciones-emoji-libre).
-- `reactions.kind` deja de ser una paleta cerrada de cuatro slugs y pasa a
-- guardar el emoji literal. El único (interaction_target_id, user_id, kind) NO
-- se toca: se sigue pudiendo poner varias reacciones distintas por persona.

-- 1) Tirar el CHECK viejo LO PRIMERO. `reactions_kind_valid` solo admite los
--    cuatro slugs, así que si sigue vivo, el UPDATE del paso 3 se viola a sí
--    mismo: `ERROR 23514: violates check constraint "reactions_kind_valid"`.
--    El CHECK nuevo se añade DESPUÉS de convertir los datos, por lo mismo al
--    revés: puesto antes, rechazaría las filas que aún son slugs.
alter table public.reactions drop constraint if exists reactions_kind_valid;
alter table public.reactions drop constraint if exists reactions_kind_like;

-- 2) Dedup ANTES del update. Si alguien ya tiene 'fire' y '🔥' sobre el mismo
--    target, el UPDATE reventaría el único. Gana la fila que ya es emoji.
delete from public.reactions r
using public.reactions keep
where r.kind in ('like', 'read', 'shock', 'fire')
  and keep.interaction_target_id = r.interaction_target_id
  and keep.user_id = r.user_id
  and keep.kind = case r.kind
    when 'like' then '❤️'
    when 'read' then '📖'
    when 'shock' then '😱'
    when 'fire' then '🔥'
  end;

-- 3) Slugs -> emoji.
update public.reactions
set kind = case kind
  when 'like' then '❤️'
  when 'read' then '📖'
  when 'shock' then '😱'
  when 'fire' then '🔥'
end
where kind in ('like', 'read', 'shock', 'fire');

-- 4) CHECK de FORMA, no lista blanca: la lista blanca real es el catálogo, en
--    la acción de servidor. Esto es la red de debajo. Va AQUÍ, con los datos ya
--    convertidos: antes del UPDATE rechazaría las filas que aún son slugs.
--
--    Ojo con la formulación ingenua `kind !~ '[[:alnum:][:space:][:punct:]]'`:
--    parece equivalente y tumba los keycap ('1️⃣' es el dígito ASCII 1 + VS16 +
--    U+20E3), que son emojis legítimos. Por eso la condición es "contiene algo
--    NO ASCII", no "no contiene nada alfanumérico".
alter table public.reactions add constraint reactions_kind_emoji check (
  char_length(kind) between 1 and 16   -- 👩‍❤️‍💋‍👨 y 🏴󠁧󠁢󠁥󠁮󠁧󠁿 gastan 7-8; 16 deja aire
  and kind ~ '[^[:ascii:]]'
  and kind !~ '[[:space:]]'
);

-- 5) Tope de 6 emojis distintos por persona y target. Sin esto, emoji libre +
--    varias reacciones por persona deja que una sola cuelgue 40 píldoras de un
--    mensaje. La acción de servidor valida también, pero el trigger es el que
--    no se puede saltar.
create or replace function public.enforce_reaction_cap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.reactions
    where interaction_target_id = new.interaction_target_id
      and user_id = new.user_id
  ) >= 6 then
    raise exception 'reaction_cap_reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists reactions_cap_before_insert on public.reactions;
create trigger reactions_cap_before_insert
  before insert on public.reactions
  for each row execute function public.enforce_reaction_cap();

comment on constraint reactions_kind_emoji on public.reactions is
  'kind guarda el emoji literal. Lista blanca real: el catálogo de src/lib/social/emoji-catalog.data.ts, validado en la acción de servidor.';
