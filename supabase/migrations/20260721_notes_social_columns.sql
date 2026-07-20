-- Notas y citas · Plan A. Cuatro columnas para cerrar el modelo de una vez.
-- `is_public` y `parent_note_id` se crean SIN UI en este ciclo (ver la spec
-- 2026-07-21-notas-captura-design.md, D2/D3).
--
-- RLS NO SE TOCA. Las cuatro políticas de dueño siguen siendo las únicas: abrir
-- la lectura pública antes de que exista el filtro spoiler-safe sería justo la
-- fuga que `is_public` viene a evitar. La columna registra intención; F2 la
-- honra cuando haya muro.

alter table public.notes
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists is_spoiler boolean not null default false,
  add column if not exists is_public boolean not null default false,
  add column if not exists parent_note_id uuid null
    references public.notes(id) on delete set null;

-- ON DELETE SET NULL, coherente con pass_id/session_id: borrar la cita padre no
-- debe llevarse por delante la nota hija.
create index if not exists idx_notes_parent
  on public.notes (parent_note_id) where parent_note_id is not null;

-- El único índice que había (idx_notes_user, sobre (user_id, created_at desc))
-- sirve al cuaderno por recientes, pero no a la lista de la ficha, que filtra
-- por obra.
create index if not exists idx_notes_item
  on public.notes (user_id, item_type, item_id);
