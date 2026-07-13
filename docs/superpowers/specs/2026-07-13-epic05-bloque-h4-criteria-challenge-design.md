# EPIC-05 Bloque H4 — Reto por criterio comparativo (`criteria_challenge`)

> Diseño validado con el usuario el 2026-07-13. Cuarto y último tipo de actividad de club
> junto a H2 (tierlist), que queda pendiente.

## 1. Contexto y alcance

Un reto de club definido por **criterio**, no por lista fija: *"5 películas de terror este
verano"*, *"20 libros de cualquier tipo"*, *"termínate Cosmere entre todos"*. Cada participante
avanza con su propio consumo, y el club ve una **clasificación** (modo competitivo) o una
**meta colectiva sumada** (modo cooperativo).

Es el **"reto comparativo" original** que dio nombre al epic, y el **primer consumidor real de
`config jsonb`** — el campo que SD-8 reservó y que ni H1 ni H3 llegaron a tocar.

**Cero tablas nuevas**, igual que H3: no hay lista de ítems ni tabla de progreso. El progreso
es 100% derivado de `diary_entries`.

**Fuera de alcance**: notificaciones (ver §6), H2 (tierlist).

## 2. Decisiones cerradas

1. **Los dos modos entran en este bloque.** `config.mode ∈ {competitive, cooperative}`. El
   coste marginal es bajo — el conteo por participante es idéntico, solo cambia cómo se agrega
   y se pinta (clasificación vs. suma). Diferir el cooperativo obligaría a retocar config,
   dominio y UI otra vez.
2. **El criterio lo define quien propone, en el composer.** El criterio *es* el enunciado del
   reto: sin él la propuesta no significa nada (a diferencia de una lectura conjunta, que ya se
   entiende con el título y el libro). Editable por creador + `moderator+` mientras siga en
   `proposed`; **congelado al activar** — si la meta cambiara a mitad de reto, el progreso de
   todos se movería bajo sus pies.
3. **Filtros expuestos: tipo + meta + género + saga.** El motor de `challenges` (§7.10) ya
   soporta género y saga; su formulario personal solo expone género. H4 expone ambos, lo que
   obliga a construir un **selector de sagas** (hoy no existe ninguno: el único formulario que
   las toca, `saga-assign-form`, usa texto libre y crea la saga por nombre).
4. **Sin notificaciones en este MVP** (ver §6 — hay una razón estructural, no solo de alcance).
5. **Un solo motor de conteo**: la RPC `SECURITY DEFINER` solo **lee**; el conteo se queda en
   `countForChallenge` (TS), sin duplicarse en SQL.

## 3. Datos y privacidad

### 3.1 `config jsonb` — el criterio

Misma forma que `challenges` (§7.10) más el modo:

```ts
type CriteriaChallengeConfig = {
  mode: "competitive" | "cooperative";
  itemType: ItemType | null;   // null = cualquier tipo cuenta
  targetCount: number;
  genre?: string;
  sagaId?: string;
};
```

Opaco a SQL y a la RLS: se interpreta en la capa de app, exactamente como `challenges.criteria`
(SD-8). Se escribe al proponer; editable solo mientras `status = 'proposed'`.

### 3.2 La ventana del reto

Se reutiliza la función que ya construyó H3: `coalesce(starts_on, created_at::date)` …
`coalesce(ends_on, current_date)`. Como ya no es específica de un kind, **se renombra
`list_challenge_window` → `activity_window`** y H3 pasa a usar el nombre nuevo. La regla del
`coalesce` sigue existiendo **una sola vez**, sin deriva entre SQL y TS.

### 3.3 La RPC lectora (y por qué tiene que existir)

La RLS de `diary_entries`/`library_entries` pasa por `can_view_profile()`. Si el leaderboard se
consultara con el cliente normal, un participante con **perfil privado** sería invisible para
sus compañeros y saldría con 0 sin avisar — un falso negativo silencioso. Es exactamente el
mismo problema que resolvió H3, y el patrón se repite:

```sql
create or replace function public.get_activity_diary_passes(p_activity_id uuid)
returns table (user_id uuid, item_type public.item_type, item_id uuid, finished_on date)
language sql stable security definer set search_path = public
as $$
  -- SECURITY DEFINER a propósito: ES la política de lectura del tablero. Materializa Q5
  -- (unirse a una actividad = consentir compartir tu progreso DENTRO de ella, aunque tu
  -- perfil sea privado fuera).
  --
  -- DELIBERADAMENTE TONTA: solo lee, no cuenta. El filtrado por tipo/género/saga y el conteo
  -- viven en TS (countForChallenge), sin duplicarse aquí -- ver §4.
  with act as (
    select ca.id, w.window_start, w.window_end
      from public.club_activities ca
      cross join lateral public.activity_window(ca.id) w
     where ca.id = p_activity_id
       and ca.kind = 'criteria_challenge'
       and public.is_activity_participant(ca.id)
  )
  select p.user_id, le.item_type, le.item_id, d.finished_on
    from act a
    join public.club_activity_participants p on p.activity_id = a.id
    join public.library_entries le on le.user_id = p.user_id
    join public.diary_entries d
      on d.library_entry_id = le.id
     and d.user_id = p.user_id
     and d.finished_on between a.window_start and a.window_end;
$$;
revoke execute on function public.get_activity_diary_passes(uuid) from public, anon;
grant execute on function public.get_activity_diary_passes(uuid) to authenticated;
```

No participante / no miembro → 0 filas. Anon → permiso denegado.

**Nota de escala**: devuelve *todos* los pases de los participantes en la ventana, no solo los
que casan el criterio. A escala de club (decenas de participantes × decenas de pases) es
trivial, y es el precio de no duplicar el matcher en SQL. Si algún día se volviera caro, el
camino de escalada es mover el filtrado por `item_type` (el más barato y el que no necesita
joins de catálogo) al SQL — no reescribir el matcher entero.

## 4. Dominio: un solo motor de conteo

Un `criteria_challenge` es, literalmente, un `challenge` de §7.10 evaluado sobre varias
personas. **`src/lib/challenges/match.ts` no se toca ni se duplica.**

Nuevo `src/lib/clubs/activities/criteria-challenge.ts` (`"use server"`, hermano de
`checkpoints.ts` y `list-challenge.ts`), de **solo lectura** — como en H3, no hay nada que
escribir: el progreso es derivado.

```ts
export type CriteriaParticipantProgress = {
  userId: string; username: string; displayName: string | null; avatarUrl: string | null;
  isViewer: boolean;
  completed: number;      // capado a targetCount (para la barra)
  rawCompleted: number;   // conteo real (puede superar la meta)
};

export type CriteriaChallengeView = {
  config: CriteriaChallengeConfig;
  windowStart: string; windowEnd: string;
  participants: CriteriaParticipantProgress[];  // roster COMPLETO, ordenado
  clubTotal: number;      // Σ rawCompleted -- la cifra del modo cooperativo
};

export async function getCriteriaChallengeProgress(activityId: string): Promise<CriteriaChallengeView | null>;
```

Flujo:

1. `rpc("get_activity_diary_passes")` → pases crudos de todos los participantes.
2. Enriquecer con géneros / sagas **solo si el criterio los pide** — misma optimización que
   `get-challenge-progress.ts` ya hace (`loadGenres` / `loadSagaIds` son reutilizables; si hace
   falta, se extraen de ese fichero a uno compartido en vez de duplicarse).
3. Construir un `Challenge` sintético a partir de `config` + la ventana de la actividad.
4. `countForChallenge(itemsDelParticipante, challenge)` por cada participante.
5. Roster completo desde `club_activity_participants` + `profile_identities` (quien va 0/N
   también aparece), ordenado: **competitivo** → por `rawCompleted` desc (desempate por
   username); **cooperativo** → misma lista, pero la cifra que manda es `clubTotal`.

`core.ts` **sí cambia** en este bloque (a diferencia de H1 y H3): `proposeActivity` gana un
parámetro `config` opcional, y aparece `updateActivityConfig`.

**Ojo con el camino de escritura del config**: Bloque G **no dejó ninguna política UPDATE de
cliente** sobre `club_activities` — todos los cambios de estado pasan por RPCs `SECURITY
DEFINER` (`activate_club_activity`, etc.). Así que `updateActivityConfig` **no puede ser un
UPDATE de cliente gateado por RLS**: debe ser una RPC `SECURITY DEFINER` nueva
(`update_activity_config(p_activity_id, p_config)`) que revalide en servidor las dos
condiciones de la decisión 2: llamante = creador **o** `moderator+`, **y** `status = 'proposed'`
(el congelado al activar). Mismo patrón que las RPCs de ciclo de vida de G.

`proposeActivity`, en cambio, sí escribe `config` en el propio INSERT — la política INSERT de
`club_activities` ya existe y ya gatea (miembro del club, `status` forzado a `proposed`).

## 5. UI y las dos extensiones que le faltan al registro

El registro de kinds (H1) tiene hoy `allowedItemTypes`, `maxItems`, `itemCuration` (H3) y
`DetailExtension`. H4 destapa dos huecos:

- **`ConfigFields?: ComponentType<...>`** — el composer solo pide título/descripción/fechas, y
  `proposeActivity()` ni siquiera acepta `config`. H4 obliga a abrir ese hueco: cada kind puede
  aportar sus campos de configuración al composer. Es la extensión que SD-8 anticipaba.
- **`usesItemPool: boolean`** — `ActivityDetailView` siempre pinta la sección "Ítems"; H4 no
  tiene pool, y pintaría una sección vacía sin sentido. Con `usesItemPool: false` se ocultan el
  pool **y las opiniones por ítem** (que sin ítems no aplican). Los otros tres kinds lo
  declaran `true`.

**Componentes nuevos** (`src/components/clubs/criteria-challenge/`):

- **`SagaPicker`** — buscador con autocompletado sobre `sagas` (búsqueda con debounce + lista de
  resultados, mismo patrón que `LibraryItemPicker`), que resuelve a un `sagaId`. Nuevo y
  **reutilizable**: el reto personal podrá usarlo cuando quiera exponer el filtro de saga que su
  motor ya soporta. Vive en `src/components/` (no bajo `clubs/`) precisamente por eso.
- **`CriteriaChallengeFields`** — los campos del criterio en el composer: modo, tipo de ítem,
  meta, género, saga. Serializa a `CriteriaChallengeConfig`.
- **`CriteriaChallengeBoard`** — el `DetailExtension`:
  - **Competitivo**: tabla ordenada — posición, avatar, nombre, barra de progreso, `X/N`, `%`.
    La fila del viewer, destacada. Reutiliza `ui/progress-bar.tsx`.
  - **Cooperativo**: una sola barra colectiva (`clubTotal` / `targetCount`) más el desglose de
    quién aporta cuánto (misma lista, sin posiciones ni ranking).
  - En ambos, un pie que explica la regla: el progreso es derivado, cuenta lo que termines
    dentro de la ventana.
  - Como en H3: **sin botón de "marcar"** (no hay nada que marcar) y solo visible para
    participantes (coherente con la RPC y con las opiniones de SD-8).

**i18n**: claves nuevas bajo el namespace `activity` (`criteriaChallenge*`), más las del
`SagaPicker`.

## 6. Notificaciones: por qué no

E5.H4b pedía *"te han adelantado"* y *"reto por terminar"*. **"Te han adelantado" no tiene un
momento en el que dispararse**: el progreso es derivado (se recalcula al leer), así que no
existe ningún evento de escritura que diga "X superó a Y". Implementarlo exigiría persistir un
snapshot del ranking o un cron que recalcule y compare — infraestructura nueva que contradice
frontalmente el principio de progreso 100% derivado sobre el que se apoyan H3 y H4.

Se difieren **todas** las notificaciones de este bloque, en coherencia con H1 (chat de
checkpoint) y H3 (completar ítem), que también las difirieron. Ningún valor nuevo en
`notification_type`. El leaderboard ya se ve al entrar en la actividad.

## 7. Verificación

**Batería de impersonación RLS** (mismo formato que H1/H3):
- Un participante llama `get_activity_diary_passes` → ve los pases de **todos** los
  participantes, **incluido uno con perfil privado** (el caso que una query con RLS normal
  perdería en silencio).
- Miembro del club **no participante** → 0 filas. No miembro → 0 filas. Anon → permiso denegado.
- Guarda de `kind`: llamar la RPC con el id de un `buddy_read`/`list_challenge` → 0 filas.
- Un pase **fuera de la ventana** no aparece.
- `config` no editable una vez `active` (creador y moderador rechazados); editable en
  `proposed` por creador + `moderator+`; un participante raso nunca.
- Regresión: H3 sigue funcionando tras el renombre `list_challenge_window` → `activity_window`.

**Conteo**: el matcher (`countForChallenge`) ya está testeado en `src/lib/challenges/`. Si el
plan de implementación ve valor, un test de la agregación por participante (competitivo vs
cooperativo) sobre datos sintéticos.

**Manual**: checklist en `docs/superpowers/plans/2026-07-13-epic05-bloque-h4-criteria-challenge-manual-test.md`,
per convención `docs/TESTING.md` — proponer un reto con criterio, editarlo en `proposed`,
comprobar que se congela al activar, unirse, registrar pases dentro y fuera de la ventana,
verificar el leaderboard y el modo cooperativo, y que un participante con perfil privado se ve.

## 8. Enganches en el backlog al terminar

- Marcar **E5.H4a/b/c**; anotar que las notificaciones de E5.H4b quedan **diferidas** con la
  razón estructural de §6.
- Anotar que **`config jsonb` tiene por fin su primer consumidor** (cierra el hueco que dejó
  Bloque G).
- Registrar el renombre `list_challenge_window` → `activity_window` en la tabla §5.
- Con H4 cerrado, del Bloque H solo queda **H2 (tierlist)**.
