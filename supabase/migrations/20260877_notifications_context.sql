-- Notificaciones con contexto (spec 2026-08-25-notificaciones-con-contexto).
-- La notificación guarda una FOTO de lo ocurrido, para que la copia pueda decir
-- con qué emoji se reaccionó, qué obra se terminó y qué se comentó, en vez de
-- una frase fija por tipo.
--
-- jsonb y no tres columnas sueltas: los campos son opcionales y distintos según
-- el tipo (una notificación de seguidor no trae ninguno; una reacción no trae
-- extracto), y así solo hay UN grant que revisar cuando el contexto crezca.
-- La forma la valida TypeScript en el único sitio que la escribe (notify()).
--
--   { "emoji": "🔥", "subject": "Dune", "excerpt": "Lo terminé…", "spoiler": false }
--
-- Nullable y SIN backfill a propósito: las filas anteriores se quedan a null y
-- caen a la copia genérica de siempre. Inventar el contexto de una notificación
-- de hace tres meses sería fabricar datos.
alter table public.notifications add column if not exists context jsonb;

-- LOS GRANTS NO SON OPCIONALES. Esta tabla tiene permisos POR COLUMNA: una
-- columna nueva sin ellos no rompe solo ese campo, rompe la escritura ENTERA de
-- la tabla — es decir, deja de emitirse CUALQUIER notificación. Compila, pasa
-- el typecheck y pasa los unitarios, y revienta en producción (issue #375, que
-- ya ha ocurrido dos veces).
grant select (context), update (context) on public.notifications to anon;
grant select (context), update (context) on public.notifications to authenticated;
grant insert (context), select (context), update (context), references (context)
  on public.notifications to postgres;
grant insert (context), select (context), update (context), references (context)
  on public.notifications to service_role;

comment on column public.notifications.context is
  'Foto de lo ocurrido al notificar: {emoji, subject, excerpt, spoiler}. Todos opcionales. El extracto NO se guarda si el comentario es spoiler. Ver src/lib/social/notification-context.ts.';
