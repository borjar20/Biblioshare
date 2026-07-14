# Reto por lista — modalidad sin revisionado (EPIC-05, Bloque H3b)

Fecha: 2026-07-14
Estado: diseño aprobado, pendiente de plan de implementación

## Problema

El reto por lista (`list_challenge`, Bloque H3) deriva el progreso al 100% de los pases de
diario: un ítem cuenta solo si existe un `diary_entries` tuyo con `finished_on` dentro de la
ventana del reto. La decisión era deliberada — quien ya se leyó el libro no obtiene un tick
gratis, registra una relectura — pero **obliga al revisionado**, y eso ahuyenta a quien se
uniría a un reto del que ya tiene media lista leída.

Hace falta una segunda modalidad, opcional y por reto, que acepte el historial.

## Semántica

Cada `list_challenge` declara una **modalidad de compleción**:

- **`window`** (por defecto — comportamiento actual de H3): un ítem cuenta si tienes un pase
  de diario terminado dentro de la ventana del reto.
- **`any`** (nueva): un ítem cuenta si lo tienes en tu biblioteca con `status = 'completed'`,
  sin importar cuándo lo terminaste ni si hay pase de diario.

Un reto ya existente no tiene la clave en su `config` → se comporta como `window`. No hay
migración de datos.

Dos consecuencias asumidas explícitamente:

- En modo `any` **no hay fecha de compleción** para los ítems que ya traías: no hay pase del
  que sacarla. La rejilla enseña el tick; la matriz plegada enseña la fecha solo cuando
  existe. No se inventa una fecha desde `library_entries.updated_at` — sería ruido.
- El auto-añadir a la biblioteca al unirse (Q8, H3) no cambia: crea filas `planned` y nunca
  pisa una `completed` existente (`on conflict do nothing`). Es justo lo que este modo
  necesita para leer el historial intacto.

## Quién fija el modo

- Lo elige quien **propone** el reto, en el composer.
- **Creador o `moderator+` pueden cambiarlo en cualquier estado**, incluso con el reto
  `active`. Es una decisión explícita: permite rescatar un reto que ahuyentó a la gente.
- Al cambiarlo con el reto ya `active`, el tablero de todos se recalcula al instante. Se
  trata con un `confirm` que explica el efecto, y con una línea permanente en el tablero que
  dice siempre qué modalidad rige. Sin notificación al club.

Esto **no** se implementa relajando `update_activity_config`: esa RPC solo escribe en
`proposed` a propósito, y es lo que congela el criterio de H4 y los tiers de H2 al activar.
Relajarla los descongelaría a todos.

## Base de datos

Una migración: `supabase/migrations/20260716_list_challenge_completion_mode.sql`.

Nota: existe un borrador previo sin commitear, `20260714_list_challenge_completion_mode.sql`,
en este mismo worktree. Queda **superseded** por esta migración (proponía además una columna
`in_window` para distinguir "hecho durante el reto" de "ya lo traías", descartada: un tick es
un tick). La implementación lo elimina.

### 1. `get_list_challenge_progress` reescrita

El modo se lee **dentro** de la función (`coalesce(config ->> 'completionMode', 'window')`),
nunca se pasa como parámetro: la función es `SECURITY DEFINER` y *es* la política de lectura
del tablero, así que un cliente con su token no debe poder pedirse un modo que su reto no
declara — vería un tablero que no es el suyo.

Una sola query cubre ambos modos, sin ramas duplicadas que puedan derivar:

- el `join` a `library_entries` añade `and (not open_mode or le.status = 'completed')`;
- el `join` a `diary_entries` pasa a `left join`;
- un `having` descarta las filas sin pase en ventana cuando el modo es `window` (equivale al
  `inner join` de H3).

La firma no cambia respecto a H3: `(user_id, item_type, item_id, completed_on)`, sparse (solo
celdas completadas). En modo `any`, `completed_on` es `null` para los ítems sin pase en
ventana.

### 2. RPC nueva `set_activity_completion_mode(p_activity_id uuid, p_mode text)`

`SECURITY DEFINER`. Valida:

- `p_mode in ('window', 'any')`;
- la actividad es de `kind = 'list_challenge'`;
- el llamante es el creador de la actividad **o** `has_min_club_role(club_id, 'moderator')`.

**No mira el `status`** — ese es el punto. Escribe con `jsonb_set` sobre `config` sin tocar
ninguna otra clave. `revoke` a `public`/`anon`, `grant execute` a `authenticated`.

`update_activity_config` se queda intacta.

## App

- `src/lib/clubs/activities/list-challenge-types.ts`: `type CompletionMode = "window" | "any"`,
  la constante `COMPLETION_MODES`, y `readCompletionMode(config: Json | null): CompletionMode`
  que devuelve `"window"` ante cualquier valor inesperado. Es solo para pintar — la fuente de
  verdad sigue siendo el SQL.
- `src/lib/clubs/activities/list-challenge.ts`: se añade `setCompletionMode(activityId, mode)`,
  la primera mutación de un módulo hasta ahora de solo lectura.
- `src/lib/clubs/activities/kinds/list-challenge.ts`: se enchufa
  `ConfigFields: ListChallengeFields` — el mismo carril del registro de kinds que ya usa
  `criteria_challenge`. Con eso el modo se elige al proponer, sin tocar el composer genérico.
- `src/components/clubs/list-challenge/list-challenge-fields.tsx` (nuevo): selector de dos
  opciones con su descripción, espejo de `criteria-challenge-fields.tsx`.
- `src/components/clubs/activity-detail.tsx`: en la vista "Modificar actividad" (donde ya
  viven los hitos de `buddy_read`), para `list_challenge` y si el visitante es creador o
  moderador, el mismo selector. Si el reto está `active`, `confirm` antes de aplicar; en
  `proposed` no, porque no hay progreso que mover.
- `src/components/clubs/list-challenge/list-challenge-board.tsx`: la línea de regla al pie
  (`listChallengeRule`, hoy fija) pasa a depender del modo. Es lo que hace legible la rejilla.

## i18n

Claves nuevas en `messages/es.json` bajo `activity`: `completionMode`, `completionMode_window`,
`completionMode_any`, sus descripciones para el selector, `listChallengeRuleOpen` y el texto
del `confirm`.

## Verificación

Checklist manual (`docs/TESTING.md`; el default del proyecto para UI no es E2E automático):

1. Proponer un reto en modo abierto con un ítem que ya esté `completed` en la biblioteca desde
   antes → aparece tickado nada más unirse, sin registrar nada.
2. El mismo reto en modo `window` → ese ítem aparece vacío hasta registrar un pase de diario
   dentro de la ventana.
3. Cambiar el modo como moderador con el reto `active` → sale la confirmación; al aceptar, la
   rejilla y el ranking se recalculan.
4. Un no-moderador que no sea el creador no ve el selector, y la RPC le rechaza.
5. Un reto anterior a este bloque (sin la clave en `config`) sigue comportándose como `window`.
