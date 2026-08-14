# Motivo de abandono + estado "Abandonada" en películas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar un motivo (categoría cerrada + "otro" con texto) al abandonar un pase, siempre privado, y permitir marcar películas como "Abandonada" (sin reabrir "En curso"/sesiones para ellas).

**Architecture:** Dos columnas nuevas en `passes` (enum + texto), enmascaradas por dueño en la vista `pass_reviews` (nunca un `grant select` de tabla — la RLS de `passes` es de visibilidad de PERFIL, no de dueño). Escritura por las mismas dos server actions que ya existen (`closePass`/`updatePass`). UI: un componente compartido `DroppedReasonFields` montado en la hoja de cierre y en el diario; para películas, solo se añade la pastilla "Abandonada" a los dos sitios que hoy la excluyen a propósito.

**Tech Stack:** Next.js (App Router), Supabase/Postgres (RLS + vistas), next-intl (`messages/es.json`), Vitest.

## Global Constraints

- **El motivo es SIEMPRE privado**, con independencia de `is_public` del pase. No sale en reseña pública, feed ni perfil.
- **`dropped_reason`/`dropped_reason_note` NO llevan `grant select`** en `public.passes`, ni de tabla ni por columna, para nadie. La RLS de SELECT de `passes` ("diary entries select visible") es `can_view_profile(user_id)` — visibilidad de perfil, no de dueño — así que cualquier grant de SELECT ahí se filtraría a cualquiera que pueda ver el perfil. Solo llevan `grant update` (necesario para `closePass`/`updatePass`). Se leen exclusivamente por `pass_reviews`, enmascaradas con `case when d.user_id = (select auth.uid())`.
- **Categorías fijas, iguales para book/movie/series**: `no_enganchado | aburrido | no_es_momento | no_esperado | otro`. `otro` es la única que admite `dropped_reason_note`; el servidor descarta la nota si la categoría no es `otro`, aunque el cliente la mande.
- **Migraciones: dev primero** (`mcp__supabase-dev__*`), nunca directo a prod (`AGENTS.md`). Este plan NO toca prod.
- **Columna nueva → grant explícito en la MISMA migración** (DRIFT-CHECK superficie 6, issue #375): sin él, el `UPDATE` que la nombra falla ENTERO, no solo el campo nuevo.
- **Películas NO ganan "En curso" ni sesiones.** Solo se desbloquea la pastilla "Abandonada"; `planTransition` no cambia (ya soporta `planned→dropped` y `completed↔dropped` para cualquier tipo).
- **`messages/es.json` es el único locale** — no hay `en.json` que tocar.
- **Al terminar, sincronizar `data-model.md` §3 y `decisiones.md`** (append-only), regla "definición de hecho" de `AGENTS.md`.

---

### Task 1: Esquema — enum, columnas, grant, vista enmascarada

**Files:**
- Create: `supabase/migrations/20260858_pass_dropped_reason.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerado, no a mano)

**Interfaces:**
- Produces: enum Postgres `public.pass_dropped_reason` (`no_enganchado | aburrido | no_es_momento | no_esperado | otro`); columnas `public.passes.dropped_reason` (nullable) y `public.passes.dropped_reason_note` (`text`, nullable); vista `public.pass_reviews` con dos columnas nuevas al final, enmascaradas por dueño.

- [ ] **Step 1: Escribir la migración**

```sql
-- Motivo de abandono (siempre privado, ver docs/superpowers/specs/2026-08-14-motivo-abandono-y-dropped-en-pelis-design.md).
--
-- Categorías cerradas + "otro" con texto libre. dropped_reason_note solo
-- tiene sentido junto a dropped_reason = 'otro'; el servidor (savePassFields,
-- src/lib/passes/actions.ts) descarta la nota si la categoría no es 'otro'.
--
-- SIN backfill: los pases `dropped` ya existentes quedan con dropped_reason
-- NULL, indistinguible de "no contestó" — no hay forma de inferir un motivo
-- retroactivo.
create type public.pass_dropped_reason as enum (
  'no_enganchado',
  'aburrido',
  'no_es_momento',
  'no_esperado',
  'otro'
);

alter table public.passes
  add column dropped_reason public.pass_dropped_reason,
  add column dropped_reason_note text;

-- SOLO update, a propósito. La RLS de SELECT de passes ("diary entries
-- select visible") es can_view_profile(user_id) -- visibilidad de PERFIL,
-- no de dueño -- así que un grant select aquí (de tabla o por columna) se
-- filtraría a cualquiera que pueda ver el perfil, público o no, saltándose
-- is_public (que solo aplica la vista pass_reviews). Mismo motivo por el que
-- `review` se sacó del grant de tabla en 20260714_passes_review_privacy.sql.
-- Grant por columna (DRIFT-CHECK superficie 6, issue #375): sin esto el
-- UPDATE de savePassFields falla ENTERO en cuanto nombra dropped_reason, no
-- solo el campo nuevo.
grant update (dropped_reason, dropped_reason_note) on public.passes to authenticated;

-- pass_reviews: única vía de lectura (getPasses, src/lib/passes/get-passes.ts).
-- La vista corre con los permisos de su dueño (no es security_invoker), así
-- que puede leer las columnas aunque no tengan grant de tabla. Enmascaradas
-- por dueño DENTRO de la vista -- no por un grant -- para que sigan ocultas
-- si algún día se reutiliza getPasses para el perfil de otro usuario (hoy
-- solo se llama con el propio id, ver los tres page.tsx de libro/pelicula/serie).
-- Columnas nuevas al final (create or replace view no admite reordenar las
-- existentes), mismo patrón que 20260833_pass_reviews_updated_at.sql.
create or replace view public.pass_reviews as
select
  d.id, d.user_id, d.item_type, d.item_id,
  d.status, d.is_active, d.position, d.pinned_order,
  d.started_on, d.finished_on, d.rating, d.review, d.is_public,
  d.edition_id, d.created_at, d.updated_at,
  case when d.user_id = (select auth.uid()) then d.dropped_reason else null end as dropped_reason,
  case when d.user_id = (select auth.uid()) then d.dropped_reason_note else null end as dropped_reason_note
from public.passes d
where
  d.user_id = (select auth.uid())
  or (
    d.is_public
    and (
      public.can_view_profile(d.user_id)
      or public.is_visible_via_club_share('diary_entries', d.id, d.user_id)
    )
  );

grant select on public.pass_reviews to anon, authenticated;
```

- [ ] **Step 2: Aplicar en dev**

Usa `mcp__supabase-dev__apply_migration` con `name: "pass_dropped_reason"` y el SQL de arriba (o `mcp__supabase-dev__execute_sql` si el MCP de migraciones no está disponible en el entorno de ejecución — pero `apply_migration` es el camino normal, deja registro en `list_migrations`).

- [ ] **Step 3: Verificar contra objetos reales, no contra el ledger**

Con `mcp__supabase-dev__execute_sql`:

```sql
select column_name, is_nullable, udt_name
from information_schema.columns
where table_schema = 'public' and table_name = 'passes'
  and column_name in ('dropped_reason', 'dropped_reason_note');

select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'passes'
  and column_name in ('dropped_reason', 'dropped_reason_note');
-- Esperado: SOLO una fila (authenticated, UPDATE) por columna. Ninguna con
-- SELECT ni INSERT ni con grantee anon.

select pg_get_viewdef('public.pass_reviews'::regclass, true);
-- Esperado: las dos columnas nuevas envueltas en el CASE por auth.uid().
```

- [ ] **Step 4: Regenerar tipos**

Ejecuta `mcp__supabase-dev__generate_typescript_types` y sobrescribe
`src/lib/supabase/database.types.ts` con el resultado completo (es un
fichero generado — no lo edites a mano; solo confirma que aparecen
`pass_dropped_reason` en `Enums` y las dos columnas en la tabla `passes` y en
la vista `pass_reviews`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260858_pass_dropped_reason.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): añade motivo de abandono a passes, enmascarado por dueño en pass_reviews"
```

---

### Task 2: Tipos y lectura — `Pass`, `get-passes.ts`

**Files:**
- Modify: `src/lib/passes/types.ts`
- Modify: `src/lib/passes/get-passes.ts`

**Interfaces:**
- Consumes: vista `pass_reviews` con columnas `dropped_reason`, `dropped_reason_note` (Task 1).
- Produces: `export type DroppedReason = "no_enganchado" | "aburrido" | "no_es_momento" | "no_esperado" | "otro"`; `export const DROPPED_REASONS: readonly DroppedReason[]`; `Pass.droppedReason: DroppedReason | null`; `Pass.droppedReasonNote: string | null`. `getPasses`/`getActivePass` sin cambio de firma.

- [ ] **Step 1: Ampliar `src/lib/passes/types.ts`**

```ts
import type { MediaStatus } from "@/lib/library/types";
import type { Json } from "@/lib/supabase/database.types";

// Motivo de abandono: SIEMPRE privado (nunca se sirve a nadie más que el
// dueño, ver la máscara de pass_reviews en la migración 20260858). Solo
// dropped_reason === "otro" admite dropped_reason_note.
export const DROPPED_REASONS = [
  "no_enganchado",
  "aburrido",
  "no_es_momento",
  "no_esperado",
  "otro",
] as const;
export type DroppedReason = (typeof DROPPED_REASONS)[number];

// Un "pase" es una lectura o un visionado, y desde la migración hub es el
// dueño de TODO el registro personal: estado, cursor, cola, fijado, nota y
// reseña. "Activo" = el que representa la obra en tu biblioteca (puede estar
// cerrado). Abierto = planned | in_progress.
export type Pass = {
  id: string;
  status: MediaStatus;
  isActive: boolean;
  position: Json;
  startedOn: string | null;
  finishedOn: string | null;
  // Nota SIEMPRE entera 1-10; la escala de estrellas es solo presentación.
  rating: number | null;
  review: string | null;
  isPublic: boolean;
  editionId: string | null;
  // Solo significativo en el pase activo; lo hereda el pase nuevo al archivar.
  pinnedOrder: number | null;
  // Solo tiene valor si status === "dropped". Siempre privado.
  droppedReason: DroppedReason | null;
  droppedReasonNote: string | null;
};
```

- [ ] **Step 2: Ampliar `src/lib/passes/get-passes.ts`**

```ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { Pass } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Pases del usuario para una obra: el abierto primero, luego cerrados de más
// reciente a más antiguo (orden que espera el diario para el delta). review
// y dropped_reason/dropped_reason_note se leen SIEMPRE por la vista
// pass_reviews (privacidad aplicada); como la vista enmascara estas dos
// últimas por dueño y esta función solo se llama con el propio userId (ver
// libro|pelicula|serie/[id]/page.tsx), siempre llegan con valor real.
export async function getPasses(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  itemId: string,
  userId: string
): Promise<Pass[]> {
  const { data } = await supabase
    .from("pass_reviews")
    .select(
      "id, status, is_active, position, started_on, finished_on, rating, review, is_public, edition_id, pinned_order, dropped_reason, dropped_reason_note"
    )
    .eq("user_id", userId)
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .order("finished_on", { ascending: false, nullsFirst: true });

  return (data ?? []).map((r) => ({
    id: r.id as string,
    status: r.status as Pass["status"],
    isActive: r.is_active as boolean,
    position: r.position as Pass["position"],
    startedOn: r.started_on,
    finishedOn: r.finished_on,
    rating: r.rating,
    review: r.review,
    isPublic: r.is_public as boolean,
    editionId: r.edition_id,
    pinnedOrder: r.pinned_order,
    droppedReason: r.dropped_reason as Pass["droppedReason"],
    droppedReasonNote: r.dropped_reason_note,
  }));
}

export async function getActivePass(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  itemId: string,
  userId: string
): Promise<Pass | null> {
  const passes = await getPasses(supabase, itemType, itemId, userId);
  return passes.find((p) => p.isActive) ?? null;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` (no hay script `typecheck` en `package.json` — este es el comando directo).
Expected: sin errores nuevos. Habrá un error esperado en `src/components/detail/close-pass-sheet.tsx` y `src/components/detail/pass-diary.tsx` si ya empezaste a usar `pass.droppedReason` antes de la Task 4/7 — si no los has tocado todavía, no debería haber ninguno.

- [ ] **Step 4: Commit**

```bash
git add src/lib/passes/types.ts src/lib/passes/get-passes.ts
git commit -m "feat(passes): Pass gana droppedReason/droppedReasonNote"
```

---

### Task 3: Componente compartido `DroppedReasonFields` + i18n

**Files:**
- Create: `src/components/detail/dropped-reason-fields.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `DroppedReason`, `DROPPED_REASONS` de `src/lib/passes/types.ts` (Task 2).
- Produces: `export function DroppedReasonFields(props): JSX.Element` con props `{ reason: DroppedReason | ""; onReasonChange: (next: DroppedReason) => void; note: string; onNoteChange: (next: string) => void; size?: "default" | "sm" }`. Inputs nativos `name="droppedReason"` (radios) y `name="droppedReasonNote"` (textarea, solo montado si `reason === "otro"`) — legibles por `formData.get(...)` sin inputs ocultos adicionales.

- [ ] **Step 1: Añadir las claves a `messages/es.json`**

Dentro del namespace `"passes"` (junto a `"isPublic"`, sobre la línea 237 actual — `"isPublic": "Visible para la comunidad",`), añade:

```json
    "droppedReason": {
      "label": "Motivo (opcional)",
      "options": {
        "no_enganchado": "No enganchó",
        "aburrido": "Me aburrió",
        "no_es_momento": "No es el momento (lo retomaré)",
        "no_esperado": "No era lo que esperaba",
        "otro": "Otro"
      },
      "notePlaceholder": "Cuéntanos más…"
    },
```

Y en `"passes.errors"` (la de la línea 247), añade `"invalidReason"` junto a las otras:

```json
    "errors": {
      "invalidDate": "La fecha no es válida.",
      "invalidRating": "La nota va de media estrella a cinco.",
      "invalidReason": "Motivo no válido.",
      "generic": "No se pudo guardar."
    },
```

- [ ] **Step 2: Crear `src/components/detail/dropped-reason-fields.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { DROPPED_REASONS, type DroppedReason } from "@/lib/passes/types";

const SIZES = {
  default: { pill: "px-2.5 py-1 text-xs", textarea: "px-3 py-2 text-sm", rows: 2 },
  sm: { pill: "px-2 py-0.5 text-[11px]", textarea: "px-2 py-1.5 text-xs", rows: 2 },
} as const;

// Motivo de abandono: SIEMPRE privado (ver la máscara de pass_reviews,
// migración 20260858). Compartido por ClosePassSheet (al marcar "dropped") y
// PassDiary (al editar un pase ya cerrado como "dropped"). Radios nativos —
// name="droppedReason" — para que closePass/updatePass los lean con
// formData.get("droppedReason") sin inputs ocultos; el textarea de "otro"
// solo se monta cuando esa es la categoría elegida, así que un pase que NO
// eligió "otro" ni siquiera manda droppedReasonNote en el submit.
export function DroppedReasonFields({
  reason,
  onReasonChange,
  note,
  onNoteChange,
  size = "default",
}: {
  reason: DroppedReason | "";
  onReasonChange: (next: DroppedReason) => void;
  note: string;
  onNoteChange: (next: string) => void;
  size?: "default" | "sm";
}) {
  const t = useTranslations("passes.droppedReason");
  const s = SIZES[size];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-section">{t("label")}</span>
      <div className="flex flex-wrap gap-1.5">
        {DROPPED_REASONS.map((value) => (
          <label
            key={value}
            className={`cursor-pointer rounded-full border font-medium transition-colors ${s.pill} ${
              reason === value
                ? "border-accent bg-accent/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <input
              type="radio"
              name="droppedReason"
              value={value}
              checked={reason === value}
              onChange={() => onReasonChange(value)}
              className="sr-only"
            />
            {t(`options.${value}`)}
          </label>
        ))}
      </div>

      {reason === "otro" && (
        <textarea
          name="droppedReasonNote"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder={t("notePlaceholder")}
          rows={s.rows}
          className={`w-full resize-none rounded-md border border-border bg-surface-muted text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${s.textarea}`}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores (el componente no tiene consumidores todavía, pero debe compilar solo).

- [ ] **Step 4: Commit**

```bash
git add src/components/detail/dropped-reason-fields.tsx messages/es.json
git commit -m "feat(passes): componente DroppedReasonFields + i18n del motivo de abandono"
```

---

### Task 4: Escritura — `savePassFields` valida y guarda el motivo

**Files:**
- Modify: `src/lib/passes/actions.ts`
- Test: `src/lib/passes/actions.test.ts` (crear si no existe)

**Interfaces:**
- Consumes: `DROPPED_REASONS`, `DroppedReason` de `src/lib/passes/types.ts` (Task 2).
- Produces: `ClosePassState.error` gana `"invalidReason"` en su unión. `savePassFields` escribe `dropped_reason`/`dropped_reason_note` en cada guardado (cierre o edición), sin cambiar su firma pública.

- [ ] **Step 1: Comprobar si existe test previo de `actions.ts`**

Run: `ls src/lib/passes/*.test.ts`
Si no existe `actions.test.ts`, créalo en el Step 2. `parseDroppedReason` no está exportado hoy — para probarlo sin tocar la superficie pública, el test importa la función completa `savePassFields`... pero esa función es privada (`async function`, no exportada) y necesita un cliente Supabase real. Para esta feature, la validación se prueba exportando `parseDroppedReason` (mismo patrón que si `parseRating` estuviera exportado — no lo está, así que exporta SOLO `parseDroppedReason`, que es la pieza nueva y pura).

- [ ] **Step 2: Escribir el test que falla — `src/lib/passes/actions.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { parseDroppedReason } from "./actions";

describe("parseDroppedReason", () => {
  it("vacío → null (motivo opcional)", () => {
    expect(parseDroppedReason(null)).toBeNull();
    expect(parseDroppedReason("")).toBeNull();
  });

  it("categoría válida → se conserva", () => {
    expect(parseDroppedReason("aburrido")).toBe("aburrido");
  });

  it("valor fuera de la lista → undefined (inválido)", () => {
    expect(parseDroppedReason("no_existe")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Ejecutar y confirmar que falla**

Run: `npx vitest run src/lib/passes/actions.test.ts`
Expected: FAIL — `parseDroppedReason` no existe / no está exportado.

- [ ] **Step 4: Implementar en `src/lib/passes/actions.ts`**

Añade el import y la función junto a `parseRating` (tras su definición, línea 27 actual):

```ts
import { DROPPED_REASONS, type DroppedReason } from "./types";
```

```ts
// Vacío = sin motivo (opcional incluso cerrando como dropped). Fuera de la
// lista cerrada = inválido, mismo patrón que parseRating: `undefined`
// distingue "no vino nada" (válido) de "vino algo que no reconocemos".
// Exportada (a diferencia de parseRating) solo para poder probarla sin
// levantar un cliente Supabase real — ver actions.test.ts.
export function parseDroppedReason(raw: FormDataEntryValue | null): DroppedReason | null | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return (DROPPED_REASONS as readonly string[]).includes(value)
    ? (value as DroppedReason)
    : undefined;
}
```

Amplía `ClosePassState`:

```ts
export type ClosePassState = {
  error?: "invalidDate" | "invalidRating" | "invalidReason" | "generic";
};
```

Amplía `savePassFields` (añade la validación tras la de `rating`, y el campo al `update`):

```ts
async function savePassFields(
  supabase: SupabaseServerClient,
  passId: string,
  userId: string,
  formData: FormData
): Promise<ClosePassState & { review?: string | null; isPublic?: boolean }> {
  const finishedOn = parseFinishedOn(formData.get("finishedOn"));
  if (finishedOn === undefined) return { error: "invalidDate" };

  const rating = parseRating(formData.get("rating"));
  if (rating === undefined) return { error: "invalidRating" };

  const droppedReason = parseDroppedReason(formData.get("droppedReason"));
  if (droppedReason === undefined) return { error: "invalidReason" };
  // La nota solo tiene sentido junto a "otro" — se descarta server-side
  // aunque el cliente la mande, no nos fiamos del formulario.
  const droppedReasonNote =
    droppedReason === "otro"
      ? String(formData.get("droppedReasonNote") ?? "").trim() || null
      : null;

  const review = String(formData.get("review") ?? "").trim();
  // is_public tiene default false en la columna: hay que escribirlo siempre
  // explícitamente, nunca confiar en el default.
  const isPublic = formData.get("isPublic") === "on";

  const { error } = await supabase
    .from("passes")
    .update({
      finished_on: finishedOn,
      rating,
      review: review || null,
      is_public: isPublic,
      dropped_reason: droppedReason,
      dropped_reason_note: droppedReasonNote,
    })
    .eq("id", passId)
    .eq("user_id", userId);

  // review/isPublic se devuelven también en éxito: closePass los necesita
  // para decidir si notifica menciones (solo alta, nunca en updatePass — ver
  // llamadas más abajo) sin tener que releer la fila recién escrita.
  return error ? { error: "generic" } : { review: review || null, isPublic };
}
```

- [ ] **Step 5: Ejecutar y confirmar que pasa**

Run: `npx vitest run src/lib/passes/actions.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 6: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/lib/passes/actions.ts src/lib/passes/actions.test.ts
git commit -m "feat(passes): closePass/updatePass validan y guardan el motivo de abandono"
```

---

### Task 5: `ClosePassSheet` — pedir motivo al cerrar como abandonado

**Files:**
- Modify: `src/components/detail/close-pass-sheet.tsx`

**Interfaces:**
- Consumes: `DroppedReasonFields` (Task 3), `DroppedReason` (Task 2), `MediaStatus` de `@/lib/library/types`.
- Produces: `ClosePassSheet` gana la prop requerida `status: MediaStatus`.

- [ ] **Step 1: Añadir la prop y el estado local**

En `src/components/detail/close-pass-sheet.tsx`, añade los imports:

```ts
import type { MediaStatus } from "@/lib/library/types";
import type { DroppedReason } from "@/lib/passes/types";
import { DroppedReasonFields } from "@/components/detail/dropped-reason-fields";
```

Amplía la firma de `ClosePassSheet`:

```tsx
export function ClosePassSheet({
  passId,
  itemType,
  itemId,
  status,
  open,
  onClose,
}: {
  passId: string;
  itemType: ItemType;
  itemId: string;
  status: MediaStatus;
  open: boolean;
  onClose: () => void;
}) {
```

Añade el estado, junto a `rating`/`review`:

```ts
  const [reason, setReason] = useState<DroppedReason | "">("");
  const [reasonNote, setReasonNote] = useState("");
```

- [ ] **Step 2: Resetear al reabrir**

El bloque que ya limpia `rating` al reabrir (busca `if (open !== prevOpen)`) pasa a limpiar también el motivo:

```ts
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setRating(null);
      setReason("");
      setReasonNote("");
    }
  }
```

- [ ] **Step 3: Renderizar el bloque condicional**

Entre el `<label>` de `review` y el de `isPublic` (busca el `</label>` que cierra `review` y el `<label` que abre `isPublic`), inserta:

```tsx
          {status === "dropped" && (
            <DroppedReasonFields
              reason={reason}
              onReasonChange={setReason}
              note={reasonNote}
              onNoteChange={setReasonNote}
            />
          )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: error en `src/components/detail/log-panel.tsx` (`<ClosePassSheet>` sin `status` — se corrige en la Task 6). Si no aparece ese error, revisa que la prop quedó como requerida (sin `?`).

- [ ] **Step 5: Commit**

```bash
git add src/components/detail/close-pass-sheet.tsx
git commit -m "feat(passes): ClosePassSheet pide motivo al cerrar como abandonado"
```

---

### Task 6: `log-panel.tsx` — pasar el estado de cierre a `ClosePassSheet`

**Files:**
- Modify: `src/components/detail/log-panel.tsx:210-218` (estado), `:263-280` (`handleStatusChange`), `:234-261` (`handleNewPass`), `:492-500` (render de `ClosePassSheet`)

**Interfaces:**
- Consumes: `ClosePassSheet` con prop `status: MediaStatus` requerida (Task 5).

- [ ] **Step 1: Añadir el estado `closingStatus`**

Junto al `useState` de `closingPassId` (línea ~210-212):

```ts
  const [closingPassId, setClosingPassId] = useState<string | null>(
    initialClosingPassId,
  );
  // El auto-cierre por sesión (initialClosingPassId) solo dispara al
  // terminar un libro: siempre "completed". handleStatusChange lo pisa con
  // el `next` real cuando el cierre lo dispara marcar un estado a mano.
  const [closingStatus, setClosingStatus] = useState<MediaStatus>("completed");
```

- [ ] **Step 2: Fijarlo en `handleStatusChange`**

```ts
  function handleStatusChange(next: MediaStatus) {
    setStatus(next);
    startTransition(async () => {
      const outcome = await updateStatus(itemType, itemId, next);
      if (outcome.kind === "askResume") {
        setStatus(entry.status);
        setResumeOpen(true);
        return;
      }
      router.refresh();
      // Hallazgo de la revisión de la Task 5: en una carrera de doble-submit
      // sin pase activo previo, closed puede llegar true con passId vacío.
      // No abrir la hoja de cierre contra un pase inexistente.
      if (outcome.closed && outcome.passId) {
        setClosingStatus(next);
        setClosingPassId(outcome.passId);
      }
    });
  }
```

- [ ] **Step 3: Fijarlo en `handleNewPass` (revisionado de película)**

El branch de `itemType === "movie"` ya marca `completed` explícitamente — hazlo explícito también en `closingStatus` para no depender del valor por defecto:

```ts
    if (itemType === "movie") {
      setStatus("completed");
      startTransition(async () => {
        await updateStatus(itemType, itemId, "in_progress", "restart");
        const outcome = await updateStatus(itemType, itemId, "completed");
        router.refresh();
        if (outcome.kind === "done" && outcome.closed && outcome.passId) {
          setClosingStatus("completed");
          setClosingPassId(outcome.passId);
        }
      });
      return;
    }
```

- [ ] **Step 4: Pasar la prop al render**

```tsx
      {closingPassId && (
        <ClosePassSheet
          passId={closingPassId}
          itemType={itemType}
          itemId={itemId}
          status={closingStatus}
          open
          onClose={() => setClosingPassId(null)}
        />
      )}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/detail/log-panel.tsx
git commit -m "feat(passes): log-panel pasa el status de cierre a ClosePassSheet"
```

---

### Task 7: Diario — editar el motivo de un pase ya cerrado como abandonado

**Files:**
- Modify: `src/components/detail/pass-diary.tsx`

**Interfaces:**
- Consumes: `DroppedReasonFields` (Task 3), `Pass.droppedReason`/`Pass.droppedReasonNote` (Task 2).

- [ ] **Step 1: Estado local en `PassCard`**

Junto a `rating`/`review` (busca `const [review, setReview] = useState(pass.review ?? "");`):

```ts
  const [reason, setReason] = useState<DroppedReason | "">(pass.droppedReason ?? "");
  const [reasonNote, setReasonNote] = useState(pass.droppedReasonNote ?? "");
```

Añade el import junto a los de tipos existentes:

```ts
import type { DroppedReason } from "@/lib/passes/types";
import { DroppedReasonFields } from "@/components/detail/dropped-reason-fields";
```

- [ ] **Step 2: Renderizar en el formulario de edición**

Solo tiene sentido en un pase abandonado — `pass.status === "dropped"`. Insértalo dentro del `<form>` de edición, entre el `<label>` de `review` y el de `isPublic` (mismo lugar relativo que en `ClosePassSheet`):

```tsx
          {pass.status === "dropped" && (
            <DroppedReasonFields
              reason={reason}
              onReasonChange={setReason}
              note={reasonNote}
              onNoteChange={setReasonNote}
              size="sm"
            />
          )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/detail/pass-diary.tsx
git commit -m "feat(passes): el diario permite editar el motivo de un pase abandonado"
```

---

### Task 8: Películas — desbloquear la pastilla "Abandonada"

**Files:**
- Modify: `src/components/detail/status-segments.tsx:14-17`
- Modify: `src/components/library/library-filters.tsx:18-20`

**Interfaces:** Ninguna nueva — solo amplía las listas `MOVIE_STATUS_ORDER`/`MOVIE_STATUSES` que ya existen.

- [ ] **Step 1: `status-segments.tsx`**

```ts
// Las películas se registran de un gesto: o están pendientes, vistas o
// abandonadas a medias — no hay "en curso" (una peli se ve de una sentada,
// ver §7.14 y decisiones.md 2026-07-30/2026-08-14). Tres pastillas, no
// cuatro: sin "En curso".
const MOVIE_STATUS_ORDER: MediaStatus[] = ["planned", "completed", "dropped"];
```

- [ ] **Step 2: `library-filters.tsx`**

```ts
// Las películas no tienen "en curso" (ver StatusSegments / decisiones.md
// 2026-08-14): al filtrar por tipo "movie" ofrecemos las otras tres.
const MOVIE_STATUSES: MediaStatus[] = ["planned", "completed", "dropped"];
```

El `.map` que renderiza las pastillas de filtro (líneas 156-168) tiene una
rama `itemType === "movie" && s === "completed" ? t("detail.statusSegments.completed.movie") : t(\`library.status.${s}\`)` — solo "completed" varía por
tipo (en película es "Vista"). `dropped` no necesita rama equivalente: cae
directo a `t("library.status.dropped")` ("Abandonado"), que ya es genérico
por tipo. No toques ese bloque.

- [ ] **Step 3: Verificación manual (qa-verifier o navegador)**

Con el dev server arriba (`npm run dev`, puerto 3000 libre — ver higiene del entorno):
1. Abre una película en estado "Pendiente" → marca "Abandonada" → confirma que se abre `ClosePassSheet` con el bloque de motivo → guarda con categoría "Me aburrió" → confirma que la pastilla queda en "Abandonado" y el diario muestra el motivo al editar.
2. Marca una película "Vista" como "Abandonada" (transición `completed → dropped`) → mismo flujo.
3. Filtro de biblioteca con tipo "Película" → confirma que aparece la opción "Abandonado" y filtra correctamente.
4. Confirma que NO aparece ninguna pastilla "En curso" para películas en ningún sitio.

- [ ] **Step 4: Commit**

```bash
git add src/components/detail/status-segments.tsx src/components/library/library-filters.tsx
git commit -m "feat(library): las películas pueden marcarse como abandonadas"
```

---

### Task 9: Cobertura de `planTransition` para el nuevo camino de películas

**Files:**
- Modify: `src/lib/passes/transitions.test.ts`

**Interfaces:** Ninguna — `planTransition` no cambia (es agnóstica de `itemType`); esto solo documenta con un test los dos caminos que las películas usarán por primera vez.

- [ ] **Step 1: Añadir los dos casos que faltan**

Junto a los tests existentes de `dropped` (tras el de `"in_progress → dropped congela el cursor y cierra"`, línea ~50):

```ts
  it("sin activo, a dropped → crea activo ya cerrado (abandono directo)", () => {
    expect(planTransition(null, "dropped", HOY)).toEqual({
      kind: "createActive", status: "dropped", startedOn: HOY, finishedOn: HOY, plannedOn: null,
    });
  });
  it("planned → dropped cierra de golpe (película abandonada desde pendiente)", () => {
    expect(planTransition({ id: "p1", status: "planned" }, "dropped", HOY)).toEqual({
      kind: "updateActive", set: { status: "dropped", finished_on: HOY },
    });
  });
```

- [ ] **Step 2: Ejecutar**

Run: `npx vitest run src/lib/passes/transitions.test.ts`
Expected: PASS, todos los tests (los nuevos incluidos).

- [ ] **Step 3: Commit**

```bash
git add src/lib/passes/transitions.test.ts
git commit -m "test(passes): cubre planned→dropped y sin-activo→dropped (camino nuevo de películas)"
```

---

### Task 10: Documentación — `data-model.md` y `decisiones.md`

**Files:**
- Modify: `docs/requirements/data-model.md` (§3, "El pase: el hub del estado")
- Modify: `docs/requirements/decisiones.md` (entrada nueva, append-only)

**Interfaces:** Ninguna — solo documentación.

- [ ] **Step 1: `data-model.md` §3**

En la lista de columnas que importan (busca `Columnas que importan: `user_id`, `item_type`/`item_id`, `status`...`), añade `dropped_reason`/`dropped_reason_note` a la lista, y un párrafo nuevo justo debajo del bloque existente sobre `is_active`:

```markdown
- **`dropped_reason`/`dropped_reason_note`** (migración `20260858_pass_dropped_reason.sql`,
  **aplicada y verificada SOLO EN DEV** el 2026-08-14 contra
  `information_schema.columns`/`column_privileges`): motivo de abandono,
  enum cerrado (`no_enganchado|aburrido|no_es_momento|no_esperado|otro`) +
  nota libre solo con `otro`. **Siempre privado**, con independencia de
  `is_public` — sin `grant select` en `passes` (la RLS de SELECT de la tabla
  es de visibilidad de PERFIL, `can_view_profile`, no de dueño; un grant ahí
  se filtraría a cualquiera que vea el perfil). Se lee solo por
  `pass_reviews`, enmascarado por `d.user_id = auth.uid()` dentro de la
  vista. Solo `grant update`, necesario para `closePass`/`updatePass`. Sin
  backfill: pases `dropped` previos quedan con motivo `NULL`.
```

Actualiza también la cabecera de frescura del documento (línea 3, el bloque `[Canónico · verificado…]`) añadiendo al final, antes del cierre `]`:

```markdown
; **motivo de abandono (§3), 2026-08-14 — SOLO EN DEV**: `passes.dropped_reason`/`dropped_reason_note`, enmascarados por dueño en `pass_reviews`, sin `grant select` en la tabla; prod pendiente del merge
```

- [ ] **Step 2: `decisiones.md` — nueva entrada al final**

```markdown
| 2026-08-14 | **Motivo de abandono siempre privado, enmascarado en la vista en vez de con un grant; películas ganan "Abandonada" sin reabrir "En curso"** | Dos decisiones de la misma feature. **(1)** `dropped_reason`/`dropped_reason_note` no llevan `grant select` en `passes` porque su RLS de SELECT ("diary entries select visible") es `can_view_profile(user_id)` — visibilidad de PERFIL, no de dueño — así que cualquier grant ahí se filtraría a cualquiera que pueda ver el perfil, saltándose `is_public` (que solo aplica `pass_reviews`). Se enmascara dentro de la vista con `case when d.user_id = auth.uid()`, mismo problema que ya resolvió `review` en `20260714_passes_review_privacy.sql` pero con una solución distinta (columna enmascarada, no columna fuera del grant de tabla + vista aparte) porque aquí SÍ hace falta que el propio dueño la vea siempre, público o no. **(2)** Se retoma la decisión del 2026-07-30 ("Las películas se registran con solo dos estados") y se amplía, no se revierte: las películas ganan la pastilla "Abandonada" (`MOVIE_STATUS_ORDER`/`MOVIE_STATUSES` pasan a `[planned, completed, dropped]`) porque dejar una película a medias es un caso real que la decisión original no cubría, pero "En curso" y las sesiones siguen fuera a propósito — una película se sigue viendo de una sentada, solo que a veces no se termina. `planTransition` no cambió: ya resolvía `planned→dropped` y `completed↔dropped` para cualquier tipo, el hueco era solo la UI. Spec: `docs/superpowers/specs/2026-08-14-motivo-abandono-y-dropped-en-pelis-design.md`. **Estado: aplicado y verificado SOLO EN DEV**; prod pendiente del merge. |
```

- [ ] **Step 3: Commit**

```bash
git add docs/requirements/data-model.md docs/requirements/decisiones.md
git commit -m "docs: sincroniza data-model.md y decisiones.md con el motivo de abandono"
```

---

### Task 11: Verificación final

**Files:** Ninguno nuevo — solo comandos.

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: todos los tests en verde, incluidos los nuevos de `actions.test.ts` y `transitions.test.ts`.

- [ ] **Step 2: Typecheck y build**

Run: `npx tsc --noEmit`
Run: `npm run build`
Expected: ambos sin errores (el build detecta cualquier `use cache` mal puesto o import roto que el typecheck no vea).

- [ ] **Step 3: qa-verifier o navegador manual**

Repite el checklist del Step 3 de la Task 8, esta vez también para libro/serie: cerrar un pase como abandonado, guardar motivo, editarlo después desde el diario, confirmar que nunca aparece en una reseña pública ni en el feed (mira una cuenta secundaria o el modo incógnito contra un pase público propio).

- [ ] **Step 4: DRIFT-CHECK superficie 6**

Corre `/drift-check` o revisa a mano `docs/DRIFT-CHECK.md` §6: `dropped_reason`/`dropped_reason_note` deben aparecer en la referencia de columnas con hueco de grant intencionado (aquí, intencionadamente SIN select).
