# EPIC-05 Bloque H2 — Tierlist de club (`tierlist`)

> Diseño validado con el usuario el 2026-07-13. Cuarto y **último** tipo de actividad de club:
> cierra el Bloque H.

## 1. Contexto y alcance

Un moderador propone un **pool de ítems** y una **escala de tiers**; **cada participante hace su
propia tierlist**, y todos pueden ver la de los demás. La gracia está en el desacuerdo, no en un
promedio: *"cada participante crea la suya con la plantilla propuesta, la comparte, y eso genera
debate"*.

Dos particularidades frente a los otros tres tipos:

- Es el **único que necesita tabla nueva** (`club_activity_placements`) — y precisamente por eso
  **no arrastra el problema de privacidad** de H3/H4. Al ser tabla propia, su RLS se acota con
  `is_activity_participant()` (patrón exacto de `club_activity_opinions`, Bloque G) y **no hace
  falta ninguna función `SECURITY DEFINER`**: no lee `diary_entries` ni `library_entries` de
  nadie, así que `can_view_profile()` nunca entra en juego.
- Es el **primer tipo con mutaciones en su capa de dominio**. H1 (checkpoints) escribía por RPC;
  H3 y H4 son de solo lectura, porque su progreso es derivado. Aquí la colocación **es** el dato.

Es además el **segundo consumidor de `config`** (los tiers viven ahí), reutilizando el
`ConfigFields` que estrenó H4 — buena validación de que esa abstracción era la correcta.

### Fuera de alcance (decisión explícita)

**La tierlist de consenso del club que pedía E5.H2b.** Promediar los tiers aplana justo lo
interesante: un ítem que unos aman y otros odian acabaría en un tier tibio que no representa a
nadie. El backlog hay que **corregirlo**, no solo marcarlo. Si al usarlo se echa de menos, se
añade después (las colocaciones ya están todas ahí, es un cálculo al vuelo).

### Lo que ya viene gratis

`tierlist` **sí** usa el pool de ítems (`usesItemPool: true`), así que `ActivityOpinions`
(Bloque G) ya ofrece una **superficie de debate por ítem** — valoración + comentario, visible
entre participantes — sin escribir una línea. No hace falta inventar un hilo de discusión nuevo.

## 2. Decisiones cerradas

1. **Dos caminos para colocar**: **drag & drop** entre tiers (escritorio) **y botones de tier**
   por ítem (táctil y teclado). Los botones no son un plan B: en móvil son la vía principal, y
   esto es una PWA. El DnD entre contenedores es notoriamente frágil en táctil.
2. **Los tiers los define quien propone**, en el composer (`S/A/B/C/D` por defecto, editables), y
   **se congelan al activar** — mismo patrón que el criterio de H4, reutilizando su RPC
   `update_activity_config` tal cual. Si los tiers cambiaran a mitad, las colocaciones ya hechas
   apuntarían a tiers inexistentes.
3. **Sin consenso**: solo tierlists individuales, con un conmutador para ver la de cualquier
   participante.
4. **Siempre visibles entre participantes**, sin estado borrador/publicada. Coherente con el
   resto del epic: las opiniones y el progreso ya son visibles entre participantes desde que
   existen.
5. **El pool lo curan creador + `moderator+`** (`itemCuration: "curators"`), no cualquier
   participante: el pool **es** el enunciado de la tierlist, y si crece a mitad, las tierlists ya
   hechas quedan incompletas.

## 3. Datos y RLS

### 3.1 `config` — los tiers

```ts
type TierlistConfig = {
  tiers: string[]; // p.ej. ["S", "A", "B", "C", "D"]
};
```

Opaco a SQL/RLS, interpretado en la capa de app (SD-8). Escrito al proponer; editable por creador
+ `moderator+` solo mientras `status = 'proposed'`, vía la RPC `update_activity_config` de H4.

### 3.2 Tabla nueva `club_activity_placements`

```sql
create table public.club_activity_placements (
  activity_id uuid not null references public.club_activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  tier text not null,          -- la ETIQUETA del tier ("S"), no un índice
  position smallint not null,  -- orden dentro de la fila del tier
  primary key (activity_id, user_id, item_type, item_id)
);
```

La PK compuesta **es** la unicidad que pedía el backlog: una colocación por ítem y persona.

**RLS — sin `SECURITY DEFINER`**, literalmente el patrón de `club_activity_opinions`:

- `SELECT`: cualquier **participante** de la actividad (`is_activity_participant`) — todos ven las
  tierlists de todos (decisión 4).
- `INSERT` / `UPDATE` / `DELETE`: solo **tu propia fila** (`user_id = (select auth.uid())`) **y**
  siendo participante. El caso de riesgo que hay que probar es colar el `user_id` de otro.

**Robustez frente a un `tier` desconocido**: `config` es opaco a SQL, así que la BD no puede
validar que `tier` sea uno de los declarados. La app valida al escribir; y **al leer, una
colocación cuyo tier no esté en `config` se trata como "sin colocar"** — así ningún dato raro
(una config editada a mano, un bug futuro) rompe el tablero.

### 3.3 El gate de curación: esto **sí** toca migración

`itemCuration: "curators"` no es solo una línea en el registro. La política RLS que escribió H3 es
**kind-scoped**:

```sql
case when ca.kind = 'list_challenge' then ca.created_by = auth.uid() or has_min_club_role(...)
     else public.is_activity_participant(ca.id) end
```

Hay que **reescribirla para incluir también `tierlist`** en la rama de curadores (y la política
`DELETE` equivalente). De ahí que la verificación incluya una **regresión de H3**: que el reto por
lista siga comportándose igual.

## 4. Dominio

Nuevo `src/lib/clubs/activities/tierlist.ts` (`"use server"`, hermano de `checkpoints.ts`,
`list-challenge.ts` y `criteria-challenge.ts`) — el **primero con mutaciones**:

```ts
export async function setPlacement(
  activityId: string,
  itemType: ItemType,
  itemId: string,
  tier: string,
  position: number,
): Promise<void>;                                   // upsert de TU fila

export async function clearPlacement(
  activityId: string,
  itemType: ItemType,
  itemId: string,
): Promise<void>;                                   // devolver el ítem a la bandeja

export async function getTierlists(activityId: string): Promise<TierlistView | null>;
```

Y los tipos en un módulo **plano** `tierlist-types.ts` (no `"use server"` — la lección de H3: un
helper síncrono exportado desde un módulo de server actions rompe el build):

```ts
export type TierlistConfig = { tiers: string[] };
export function parseTierlistConfig(raw: Json | null): TierlistConfig | null;

export type ParticipantBoard = {
  userId: string; username: string; displayName: string | null; avatarUrl: string | null;
  isViewer: boolean;
  // itemKey (`${itemType}:${itemId}`) por tier, ya ordenados por `position`.
  itemKeysByTier: Record<string, string[]>;
  unplacedItemKeys: string[]; // ítems del pool que esta persona no ha colocado
};

export type TierlistView = {
  tiers: string[];
  boards: ParticipantBoard[]; // roster COMPLETO, viewer primero
};
```

`getTierlists` cruza el pool (`activity.items`, que `getActivity` ya trae) con las colocaciones y
el roster de participantes. Sin cálculo de consenso: no hay nada que agregar.

`setPlacement`/`clearPlacement` son finas y **sin chequeo de rol en la app** — la RLS es la
autoridad (mismo criterio que el resto del epic).

## 5. UI

**`TierlistBoard`** (el `DetailExtension`), solo para participantes — coherente con la RLS y con
las opiniones (SD-8). Tres piezas:

- **Selector de participante**: fichas con avatar; tú primero, luego el resto. La tuya es
  **editable**; las de los demás, **solo lectura**. Es el "conmutador" que pedía el backlog, pero
  apuntando a personas en vez de a un consenso.
- **El tablero**: una fila por tier (etiqueta a la izquierda, portadas a la derecha) más una
  **bandeja "sin colocar"** con los ítems del pool que aún no has puesto en ningún sitio.
- **Dos caminos para colocar** (decisión 1):
  - **Drag & drop** entre filas y bandeja, con `@dnd-kit` (ya en el proyecto por 7.22). Del
    precedente de la cola (`src/app/cola/queue-list.tsx`) se reutiliza lo que ya está resuelto
    allí: `DndContext` con **id fijo** (el contador incremental por defecto rompe la hidratación),
    `PointerSensor` + `KeyboardSensor`, y **actualización optimista con rollback** si la escritura
    falla. La diferencia real: aquí es DnD **entre contenedores**, no una lista ordenable.
  - **Botones de tier** por ítem (S/A/B/C/D + "quitar"). La vía principal en táctil y el camino
    accesible por teclado.

**i18n**: claves nuevas bajo el namespace `activity` (`tierlist*`).

## 6. Verificación

**Batería de impersonación RLS**:
- Un participante **ve las colocaciones de todos** los participantes.
- Un participante **solo puede escribir las suyas**: intentar insertar/actualizar una fila con el
  `user_id` de otro → **denegado** (el caso de riesgo de este bloque).
- Miembro del club **no participante** → no ve nada y no puede escribir. No miembro → nada. Anon →
  nada.
- Borrar tu propia colocación → ok; borrar la de otro → denegado.
- **Curación**: creador y `moderator+` pueden añadir/quitar ítems del pool de una `tierlist`; un
  participante raso, **no**.
- **Regresión H3**: el reto por lista sigue comportándose igual tras reescribir la política
  kind-scoped (creador cura en `proposed`, participante raso no).
- **Regresión Q8**: unirse a una `tierlist` **sigue sin tocar la biblioteca** (la exclusión que
  decidió H3).

**Manual**: checklist en
`docs/superpowers/plans/2026-07-13-epic05-bloque-h2-tierlist-manual-test.md`, per `docs/TESTING.md`
— proponer con tiers propios, congelado al activar, colocar con **drag & drop** y con **botones**,
ver la tierlist de otro participante en solo lectura, y un paso explícito de **viewport estrecho**
(colocar con botones sin que la página se rompa).

## 7. Enganches en el backlog al terminar

- Marcar **E5.H2a/b/c**, y **corregir el texto de E5.H2b**: la tierlist de consenso queda **fuera
  de alcance** por decisión de diseño (aplana el desacuerdo, que es el punto), no pendiente.
- Anotar que `config` tiene ya **dos** consumidores (H4 y H2), y que la RPC `update_activity_config`
  se reutilizó sin cambios.
- Registrar `club_activity_placements` en la tabla §5, señalando que es la **única tabla nueva del
  Bloque H** y que **no necesita `SECURITY DEFINER`** (a diferencia de H3/H4) por no leer contenido
  de perfil.
- **Con H2 cerrado, el Bloque H está completo.** Del epic quedan los bloques **I** (listas
  colaborativas), **J** (seguridad y moderación) y **K** (extras).
