# Rediseño de la gestión de itinerarios — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescribir `/saga/[id]/rutas` según el mockup Paper (frames M1-M4 y D1): la elección de orden de lectura pasa a la fila, crear deja de ser un formulario permanente, el borrado y el renombrado se van a una hoja, y la pantalla gana escritorio a dos columnas y salida a la ficha.

**Architecture:** Carpeta nueva `src/components/saga/routes/` con dos cáscaras (`shell-mobile`, `shell-desktop`) montadas a la vez y ocultas por breakpoint, un `routes-manager` cliente que es el único dueño del estado de pantalla, y una fila (`route-row`) y un formulario (`route-form`) compartidos por las dos. Las hojas modales (`route-sheet`) las monta el manager FUERA de las cáscaras. `page.tsx` sigue siendo servidor. Cero cambios de esquema y cero acciones de servidor nuevas: `createRoute`, `renameRoute`, `moveRoute`, `setReadingOrder` y `deleteRoute` ya existen.

**Tech Stack:** Next.js (App Router, server actions), React 19 (`useActionState`, `useTransition`), TypeScript, Tailwind, next-intl, Vitest (solo lógica pura — el repo no tiene React Testing Library), Playwright.

## Global Constraints

- **Cero migraciones.** Ninguna tarea toca `supabase/migrations/` ni el esquema.
- **Cero acciones de servidor nuevas.** Se reutilizan las de `src/lib/sagas/route-actions.ts` tal cual.
- **El único locale es `messages/es.json`.** Toda cadena visible sale de `useTranslations("sagaEditor")`; ninguna literal en JSX.
- **Regla de los dos árboles:** las dos cáscaras se montan a la vez y se ocultan con `hidden lg:block` / `lg:hidden`. Consecuencia obligatoria: **todo locator de Playwright sobre esta pantalla lleva `:visible`**, o encontrará el doble de elementos.
- **Las hojas van fuera de las cáscaras.** Un `<dialog>` dentro de un contenedor con `display:none` no se pinta. Se montan en `routes-manager`, como hace `sequence-editor.tsx:134-149` con `RowSheet`.
- **Las hojas son `<dialog>` nativo con `showModal()`**, nunca un div superpuesto: trae Escape, trampa de foco e `inert` del fondo. Patrón exacto en `src/components/saga/sequence/row-sheet.tsx:34-57`.
- **La designación se aplica al pulsar.** No hay botón de guardar en esta pantalla.
- **Un itinerario con 0 pasos no puede ser orden de lectura.** Lo rechaza `setReadingOrder` con `error: "emptyRoute"` (`route-actions.ts:209-220`); la UI además deshabilita el control.
- **Nota vacía o de solo espacios no cuenta como nota** en los contadores: `note.trim() !== ""`.
- **Entorno:** el shell arranca con Node v20 y vitest se rompe. Antes de cualquier `npx vitest` / `npx tsc`, en PowerShell:
  `$env:PATH = "$(fnm env --json | ConvertFrom-Json | Select-Object -ExpandProperty FNM_MULTISHELL_PATH)\;$env:PATH"`
- **Los e2e necesitan `.env.local` en el worktree.** Sin él la suite sale verde sin probar nada.
- **Un solo `next dev`, en el puerto 3000.** `npm run test:e2e` reutiliza el que haya.

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/lib/sagas/count-route-entries.ts` | **Crear.** Puro: filas de `saga_route_entries` → recuento de pasos y notas por ruta. |
| `src/lib/sagas/count-route-entries.test.ts` | **Crear.** Sus tests. |
| `src/components/saga/routes/route-form.tsx` | **Crear.** Nombre + resumen con contadores y error en el campo. Lo comparten crear y renombrar. |
| `src/components/saga/routes/route-row.tsx` | **Crear.** `RouteRow` (fila de itinerario) y `GeneratedMapRow` (fila sintética). |
| `src/components/saga/routes/route-sheet.tsx` | **Crear.** `RouteSheet` (menú de fila + zona de peligro) y `RouteFormSheet` (formulario en hoja). |
| `src/components/saga/routes/shell-mobile.tsx` | **Crear.** Cáscara estrecha. |
| `src/components/saga/routes/shell-desktop.tsx` | **Crear.** Cáscara ancha a dos columnas. |
| `src/components/saga/routes/routes-manager.tsx` | **Crear.** Estado de pantalla; monta cáscaras y hojas. |
| `src/app/saga/[id]/rutas/page.tsx` | **Modificar.** Añade `show_map` y la consulta de recuentos; monta `RoutesManager`. |
| `messages/es.json` | **Modificar.** Claves nuevas; se retiran las del selector de radios. |
| `src/components/saga/route-list.tsx` | **Borrar.** |
| `src/components/saga/create-route-form.tsx` | **Borrar.** |
| `src/components/saga/reading-order-picker.tsx` | **Borrar.** |
| `e2e/sagas-orden-designado.spec.ts` | **Modificar.** El radio y «Guardar elección» dejan de existir. |

---

### Task 1: Recuento de pasos y notas

**Files:**
- Create: `src/lib/sagas/count-route-entries.ts`
- Test: `src/lib/sagas/count-route-entries.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `type RouteCounts = { steps: number; notes: number }`, `type RawRouteEntryCountRow = { route_id: string; note: string | null }`, `function countRouteEntries(rows: RawRouteEntryCountRow[]): Record<string, RouteCounts>`.

- [ ] **Step 1: Escribe el test que falla**

Crea `src/lib/sagas/count-route-entries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countRouteEntries } from "./count-route-entries";

describe("countRouteEntries", () => {
  it("sin filas devuelve un mapa vacío", () => {
    expect(countRouteEntries([])).toEqual({});
  });

  it("cuenta pasos y notas de una ruta", () => {
    expect(
      countRouteEntries([
        { route_id: "r1", note: "empieza aquí" },
        { route_id: "r1", note: null },
        { route_id: "r1", note: "no lo leas antes" },
      ]),
    ).toEqual({ r1: { steps: 3, notes: 2 } });
  });

  // La BD acepta '' aunque el editor guarde null en ese caso. Un contador que
  // dijera «3 notas» con tres cadenas vacías mentiría al curador.
  it("no cuenta como nota la cadena vacía ni la de solo espacios", () => {
    expect(
      countRouteEntries([
        { route_id: "r1", note: "" },
        { route_id: "r1", note: "   " },
        { route_id: "r1", note: "\n\t" },
        { route_id: "r1", note: "esta sí" },
      ]),
    ).toEqual({ r1: { steps: 4, notes: 1 } });
  });

  it("separa las rutas aunque sus filas vengan entremezcladas", () => {
    expect(
      countRouteEntries([
        { route_id: "r1", note: "a" },
        { route_id: "r2", note: null },
        { route_id: "r1", note: null },
        { route_id: "r2", note: "b" },
        { route_id: "r2", note: "c" },
      ]),
    ).toEqual({ r1: { steps: 2, notes: 1 }, r2: { steps: 3, notes: 2 } });
  });

  // Una ruta SIN pasos no aparece en el mapa: el llamador la resuelve con
  // `?? { steps: 0, notes: 0 }`. Inventar aquí una entrada a cero exigiría
  // conocer la lista de rutas, que esta función no recibe.
  it("una ruta sin filas queda ausente del mapa, no a cero", () => {
    const result = countRouteEntries([{ route_id: "r1", note: null }]);
    expect(result.r2).toBeUndefined();
    expect(Object.keys(result)).toEqual(["r1"]);
  });
});
```

- [ ] **Step 2: Corre el test y comprueba que falla**

```powershell
$env:PATH = "$(fnm env --json | ConvertFrom-Json | Select-Object -ExpandProperty FNM_MULTISHELL_PATH)\;$env:PATH"
npx vitest run src/lib/sagas/count-route-entries.test.ts
```

Esperado: FAIL — `Failed to resolve import "./count-route-entries"`.

- [ ] **Step 3: Implementa**

Crea `src/lib/sagas/count-route-entries.ts`:

```ts
export type RouteCounts = { steps: number; notes: number };

/** Fila mínima de `saga_route_entries` que hace falta para contar. Se nombran
 *  las columnas en snake_case porque llegan crudas de Supabase: mapearlas a
 *  camelCase solo para contarlas sería una vuelta de más. */
export type RawRouteEntryCountRow = { route_id: string; note: string | null };

/**
 * Pasos y notas por itinerario, en una pasada.
 *
 * Una ruta sin ninguna fila NO aparece en el resultado (el llamador resuelve
 * con `?? { steps: 0, notes: 0 }`): esta función no recibe la lista de rutas,
 * así que no puede distinguir «existe y está vacía» de «no existe».
 *
 * Una nota en blanco no cuenta. La columna admite '' aunque el editor guarde
 * null al vaciarla, y un «3 notas» con tres cadenas vacías sería mentira.
 */
export function countRouteEntries(rows: RawRouteEntryCountRow[]): Record<string, RouteCounts> {
  const out: Record<string, RouteCounts> = {};
  for (const row of rows) {
    const counts = (out[row.route_id] ??= { steps: 0, notes: 0 });
    counts.steps += 1;
    if (row.note !== null && row.note.trim() !== "") counts.notes += 1;
  }
  return out;
}
```

- [ ] **Step 4: Corre el test y comprueba que pasa**

```powershell
npx vitest run src/lib/sagas/count-route-entries.test.ts
```

Esperado: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/count-route-entries.ts src/lib/sagas/count-route-entries.test.ts
git commit -m "feat(itinerarios): recuento puro de pasos y notas por itinerario"
```

---

### Task 2: Textos y formulario compartido

**Files:**
- Modify: `messages/es.json` (bloque `sagaEditor`, líneas 1129-1170)
- Create: `src/components/saga/routes/route-form.tsx`

**Interfaces:**
- Consumes: `createRoute`, `renameRoute`, `RouteFormState` de `@/lib/sagas/route-actions`.
- Produces: `function RouteForm(props: { sagaId: string; route: { id: string; name: string; summary: string | null } | null; idPrefix: string; onDone: () => void; onCancel?: () => void }): JSX.Element`. `route === null` significa crear.

- [ ] **Step 1: Añade las claves nuevas**

En `messages/es.json`, dentro del objeto `sagaEditor`, justo **después** de `"routesTitle": "Itinerarios de lectura",` (línea 1129), inserta:

```json
    "routesCrumb": "Itinerarios · curación",
    "routesSubtitle": "Rutas alternativas para entrar a la saga. El lector las ve en la pestaña Mapa y puede adoptar una.",
    "routesCount": "{count, plural, =1 {1 curado} other {# curados}}",
    "routesBack": "Ver ficha",
    "routesEmptyTitle": "Esta saga no tiene itinerarios",
    "routesEmptyBody": "Un itinerario es un orden alternativo con nombre: «empezar por Glokta», «solo la trilogía». Los lectores lo eligen en la pestaña Mapa.",
    "routeNew": "Nuevo itinerario",
    "routeNewTitle": "Nuevo itinerario",
    "routeRenameTitle": "Renombrar y resumen",
    "routeNamePlaceholder": "Empezar por Glokta",
    "routeSummaryPlaceholder": "Una línea que ayude al lector a saber si esta ruta es para él.",
    "routeSummaryOptional": "opcional",
    "routeSlugUnchanged": "La dirección no cambia: los enlaces compartidos y quien ya lo sigue se mantienen.",
    "routeStepsCount": "{count, plural, =0 {Sin pasos} =1 {1 paso} other {# pasos}}",
    "routeNotesCount": "{count, plural, =0 {Sin notas} =1 {1 nota} other {# notas}}",
    "routeUseAsReadingOrder": "Usar como orden de lectura",
    "routeIsReadingOrder": "Es el orden de lectura",
    "routeNeedsStepsHint": "Añádele pasos antes de que pueda ser el orden de lectura.",
    "routeMenuLabel": "Acciones de {name}",
    "routeGeneratedName": "Mapa generado",
    "routeGeneratedBadge": "Automático",
    "routeGeneratedDesc": "El orden que deduce la app del grafo de la saga. No editable.",
    "routeGeneratedNoMapDesc": "Esta saga no tiene mapa: sin itinerario designado, el lector verá el orden de publicación.",
    "routeDeleteTitle": "¿Borrar «{name}»?",
    "routeDeleteBody": "Se borran también sus pasos y sus notas. Quien lo siguiera volverá al orden por defecto. Esto no se puede deshacer.",
```

Y **borra** estas cinco claves, que solo usaban los componentes que esta rama retira:

```json
    "readingOrderTitle": "Cuál es el orden de lectura",
    "readingOrderHint": "El que elijas ocupa el puesto de «Orden de lectura» en la ficha, y el mapa generado deja de ofrecerse como ruta aparte. Los demás itinerarios siguen ahí.",
    "readingOrderNone": "Ninguno — que la ficha use el mapa generado",
    "readingOrderSave": "Guardar elección",
    "routesEmpty": "Esta saga no tiene itinerarios curados.",
    "routeDeleteWarning": "Se borran también todos sus pasos. Esto no se puede deshacer.",
```

**No toques** `readingOrderBadge`, que sigue en uso.

- [ ] **Step 2: Comprueba que el JSON sigue siendo válido**

```powershell
node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('json ok')"
```

Esperado: `json ok`.

- [ ] **Step 3: Escribe el formulario**

Crea `src/components/saga/routes/route-form.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { createRoute, renameRoute, type RouteFormState } from "@/lib/sagas/route-actions";

// Los mismos topes que aceptan las acciones de servidor. Se repiten aquí para
// que el curador vea el contador llenarse en vez de descubrir el corte al
// guardar.
const NAME_MAX = 80;
const SUMMARY_MAX = 280;

const initialState: RouteFormState = {};

/** Alta y renombrado de un itinerario: los mismos dos campos, distinta acción.
 *  `route === null` es crear.
 *
 *  El error del servidor se pinta EN EL CAMPO que lo causa (`nameRequired` y
 *  `slugTaken` son los dos del nombre) en vez del párrafo rojo suelto al pie
 *  que tenía la pantalla anterior: con dos campos, un mensaje al pie obliga a
 *  adivinar cuál de los dos hay que tocar.
 *
 *  `idPrefix` existe porque este formulario se monta hasta tres veces a la vez
 *  —el raíl de escritorio, la hoja de móvil y el hueco de lista vacía— y dos
 *  `<label for>` con el mismo id apuntarían al campo equivocado. */
export function RouteForm({
  sagaId,
  route,
  idPrefix,
  onDone,
  onCancel,
}: {
  sagaId: string;
  route: { id: string; name: string; summary: string | null } | null;
  idPrefix: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("sagaEditor");
  const [name, setName] = useState(route?.name ?? "");
  const [summary, setSummary] = useState(route?.summary ?? "");

  // Se envuelve la acción para cerrar en cuanto el submit termina sin error,
  // sin depender de un efecto que compare estado anterior y nuevo — mismo
  // patrón que usaba el renombrado de `route-list.tsx`.
  const [state, formAction, pending] = useActionState(
    async (prev: RouteFormState, formData: FormData) => {
      const result = route
        ? await renameRoute(route.id, sagaId, prev, formData)
        : await createRoute(sagaId, prev, formData);
      if (!result.error) {
        if (!route) {
          setName("");
          setSummary("");
        }
        onDone();
      }
      return result;
    },
    initialState,
  );

  const nameError = state.error === "nameRequired" || state.error === "slugTaken" ? state.error : null;
  const otherError = state.error && !nameError ? state.error : null;

  return (
    <form action={formAction} className="grid gap-3">
      <div className="grid gap-1.5">
        <label
          htmlFor={`${idPrefix}-name`}
          className="flex font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground"
        >
          {t("routeNameLabel")}
          <b className="ml-auto font-normal tracking-[0.06em] text-foreground-faint">
            {name.length}/{NAME_MAX}
          </b>
        </label>
        <input
          id={`${idPrefix}-name`}
          name="name"
          required
          maxLength={NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("routeNamePlaceholder")}
          aria-invalid={nameError !== null}
          aria-describedby={nameError ? `${idPrefix}-name-error` : undefined}
          className={`rounded-lg border bg-surface-muted px-2.5 py-2 text-[13px] text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-1 focus:ring-accent ${
            nameError ? "border-status-dropped" : "border-border"
          }`}
        />
        {nameError && (
          <p id={`${idPrefix}-name-error`} className="text-[11.5px] leading-snug text-status-dropped">
            {t(`routeErrors.${nameError}`)}
          </p>
        )}
        {route && <p className="text-[11px] leading-snug text-muted-foreground">{t("routeSlugUnchanged")}</p>}
      </div>

      <div className="grid gap-1.5">
        <label
          htmlFor={`${idPrefix}-summary`}
          className="flex font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground"
        >
          {t("routeSummaryLabel")}
          <b className="ml-auto font-normal tracking-[0.06em] text-foreground-faint">
            {t("routeSummaryOptional")} · {summary.length}/{SUMMARY_MAX}
          </b>
        </label>
        <textarea
          id={`${idPrefix}-summary`}
          name="summary"
          rows={2}
          maxLength={SUMMARY_MAX}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={t("routeSummaryPlaceholder")}
          className="resize-none rounded-lg border border-border bg-surface-muted px-2.5 py-2 text-[13px] text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {otherError && <p className="text-[11.5px] text-status-dropped">{t(`routeErrors.${otherError}`)}</p>}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-muted-foreground disabled:opacity-40"
          >
            {t("routeCancel")}
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-3 py-1.5 text-[11.5px] font-semibold text-accent-foreground disabled:opacity-50"
        >
          {route ? (pending ? t("routeSaving") : t("routeSave")) : pending ? t("routeCreating") : t("routeCreate")}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Comprueba tipos y lint**

```powershell
npx tsc --noEmit
npx eslint src/components/saga/routes/route-form.tsx
```

Esperado: `tsc` sin salida (los tres componentes viejos siguen compilando; aún no se han borrado). `eslint` sin errores.

- [ ] **Step 5: Commit**

```bash
git add messages/es.json src/components/saga/routes/route-form.tsx
git commit -m "feat(itinerarios): formulario compartido de crear y renombrar"
```

---

### Task 3: La fila y la fila del mapa generado

**Files:**
- Create: `src/components/saga/routes/route-row.tsx`

**Interfaces:**
- Consumes: `CuratedRouteRow` de `@/lib/sagas/get-saga-routes`, `sagaHref` de `@/lib/catalog/item-href`.
- Produces:
  - `type RouteRowData = CuratedRouteRow & { steps: number; notes: number }`
  - `function RouteRow(props: { row: RouteRowData; sagaId: string; isFirst: boolean; isLast: boolean; busy: boolean; onMove: (direction: "up" | "down") => void; onDesignate: () => void; onMenu: () => void }): JSX.Element`
  - `function GeneratedMapRow(props: { hasMap: boolean; isActive: boolean; busy: boolean; onDesignate: () => void }): JSX.Element`

- [ ] **Step 1: Escribe el componente**

Crea `src/components/saga/routes/route-row.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CuratedRouteRow } from "@/lib/sagas/get-saga-routes";
import { sagaHref } from "@/lib/catalog/item-href";

export type RouteRowData = CuratedRouteRow & { steps: number; notes: number };

/** Punto del control de designación: encendido cuando esta fila ocupa el
 *  puesto. Es decorativo (`aria-hidden`); quien lee la pantalla con un lector
 *  recibe el estado por `aria-pressed` del botón. */
function Dot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px] ${
        on ? "border-accent bg-accent" : "border-foreground/30"
      }`}
    >
      {on && <span className="h-1.5 w-1.5 rounded-full bg-accent-foreground" />}
    </span>
  );
}

export function RouteRow({
  row,
  sagaId,
  isFirst,
  isLast,
  busy,
  onMove,
  onDesignate,
  onMenu,
}: {
  row: RouteRowData;
  sagaId: string;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onMove: (direction: "up" | "down") => void;
  onDesignate: () => void;
  onMenu: () => void;
}) {
  const t = useTranslations("sagaEditor");
  // Un itinerario sin pasos no puede ocupar el puesto: lo rechaza
  // `setReadingOrder` con `emptyRoute`. Se deshabilita aquí para que el
  // curador no descubra la regla con un error rojo.
  const canDesignate = !row.isReadingOrder && row.steps > 0;

  return (
    <li
      className={`grid gap-2.5 rounded-xl border bg-surface px-2.5 py-2.5 ${
        row.isReadingOrder ? "border-l-[3px] border-border border-l-accent" : "border-border"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* El designado NO lleva flechas: está fijado arriba por su
            designación, no por su `position`, así que moverlo cambiaría un
            número sin ningún efecto visible. Misma regla que aplicaba
            `route-list.tsx`. */}
        {!row.isReadingOrder && (
          <div className="grid shrink-0 gap-0.5 pt-0.5">
            <button
              type="button"
              disabled={busy || isFirst}
              onClick={() => onMove("up")}
              aria-label={t("routeMoveUp")}
              className="grid h-5 w-6 place-items-center rounded-md border border-border text-[9px] text-muted-foreground disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={busy || isLast}
              onClick={() => onMove("down")}
              aria-label={t("routeMoveDown")}
              className="grid h-5 w-6 place-items-center rounded-md border border-border text-[9px] text-muted-foreground disabled:opacity-30"
            >
              ↓
            </button>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <b className="font-serif text-[15px] font-semibold leading-tight">{row.name}</b>
            {row.isReadingOrder && (
              <span className="rounded-md bg-accent/12 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.09em] text-accent">
                {t("readingOrderBadge")}
              </span>
            )}
          </div>
          {row.summary && <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{row.summary}</p>}
          <p className="mt-1.5 flex flex-wrap gap-2.5 font-mono text-[9px] uppercase tracking-[0.08em] text-foreground-faint">
            <span>{t("routeStepsCount", { count: row.steps })}</span>
            <span>{t("routeNotesCount", { count: row.notes })}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onMenu}
          disabled={busy}
          aria-label={t("routeMenuLabel", { name: row.name })}
          className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg text-[16px] text-foreground-faint hover:bg-surface-muted disabled:opacity-40"
        >
          ⋯
        </button>
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-2">
        <button
          type="button"
          onClick={onDesignate}
          disabled={busy || !canDesignate}
          aria-pressed={row.isReadingOrder}
          className={`inline-flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 text-[11.5px] font-semibold disabled:opacity-40 ${
            row.isReadingOrder ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          <Dot on={row.isReadingOrder} />
          {row.isReadingOrder ? t("routeIsReadingOrder") : t("routeUseAsReadingOrder")}
        </button>
        <span className="flex-1" />
        <Link
          href={`${sagaHref(sagaId)}/rutas/${row.slug}/editar`}
          className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold ${
            row.isReadingOrder
              ? "bg-accent text-accent-foreground"
              : "border border-border bg-surface text-foreground"
          }`}
        >
          {t("routeEditSteps")}
        </Link>
      </div>

      {row.steps === 0 && (
        <p className="text-[11px] leading-snug text-muted-foreground">{t("routeNeedsStepsHint")}</p>
      )}
    </li>
  );
}

/** El antiguo radio «Ninguno» con cara de fila: primera, atenuada, no editable.
 *
 *  Se pinta SIEMPRE, también con `show_map = false`. Si se ocultara, una saga
 *  sin mapa que ya tuviera un itinerario designado se quedaría sin ninguna
 *  forma de dejar de designarlo. Lo que cambia con el mapa es el texto: sin él,
 *  el lector cae en el orden de publicación (`buildRouteList` no ofrece la
 *  sintética «lectura» cuando `hasGraph` es falso). */
export function GeneratedMapRow({
  hasMap,
  isActive,
  busy,
  onDesignate,
}: {
  hasMap: boolean;
  isActive: boolean;
  busy: boolean;
  onDesignate: () => void;
}) {
  const t = useTranslations("sagaEditor");

  return (
    <li
      className={`grid gap-2.5 rounded-xl border bg-surface/55 px-2.5 py-2.5 ${
        isActive ? "border-l-[3px] border-border border-l-accent" : "border-border"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <b className="font-serif text-[15px] font-semibold leading-tight">{t("routeGeneratedName")}</b>
          <span className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.09em] text-muted-foreground">
            {t("routeGeneratedBadge")}
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
          {hasMap ? t("routeGeneratedDesc") : t("routeGeneratedNoMapDesc")}
        </p>
      </div>
      <div className="flex items-center border-t border-border pt-2">
        <button
          type="button"
          onClick={onDesignate}
          disabled={busy || isActive}
          aria-pressed={isActive}
          className={`inline-flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 text-[11.5px] font-semibold disabled:opacity-40 ${
            isActive ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          <Dot on={isActive} />
          {isActive ? t("routeIsReadingOrder") : t("routeUseAsReadingOrder")}
        </button>
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Comprueba tipos y lint**

```powershell
npx tsc --noEmit
npx eslint src/components/saga/routes/route-row.tsx
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/saga/routes/route-row.tsx
git commit -m "feat(itinerarios): fila de itinerario y fila del mapa generado"
```

---

### Task 4: Las hojas

**Files:**
- Create: `src/components/saga/routes/route-sheet.tsx`

**Interfaces:**
- Consumes: `RouteForm` de `./route-form`, `RouteRowData` de `./route-row`.
- Produces:
  - `function RouteSheet(props: { row: RouteRowData; sagaId: string; busy: boolean; onRename: () => void; onDesignate: () => void; onDelete: () => void; deleting: boolean; deleteError: boolean; onClose: () => void }): JSX.Element`
  - `function RouteFormSheet(props: { title: string; sagaId: string; route: { id: string; name: string; summary: string | null } | null; onClose: () => void }): JSX.Element`

- [ ] **Step 1: Escribe las hojas**

Crea `src/components/saga/routes/route-sheet.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { sagaHref } from "@/lib/catalog/item-href";
import { RouteForm } from "./route-form";
import type { RouteRowData } from "./route-row";

/** Chasis común de las dos hojas. `<dialog>` nativo con `showModal()`, como el
 *  resto de hojas del repo (`sequence/row-sheet.tsx`, `item-connect-sheet.tsx`):
 *  trae gratis el cierre con Escape, la trampa de foco y el `inert` del fondo.
 *  Reimplementarlo con un div superpuesto sería perder las tres cosas.
 *
 *  Pegada abajo en móvil y modal centrado en `lg`, el mismo breakpoint en que
 *  se cambian las cáscaras: en escritorio no hay pulgar al que acercarla. */
function SheetShell({
  title,
  caption,
  onClose,
  children,
}: {
  title: string;
  caption?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("sagaEditor");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto mb-0 mt-auto w-full max-w-lg rounded-t-[18px] border border-border bg-surface p-0 text-foreground backdrop:bg-scrim lg:mb-auto lg:rounded-2xl"
    >
      <div className="px-4 pb-5 pt-3.5">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-surface-3 lg:hidden" aria-hidden />
        <div className="mb-3.5 flex items-baseline gap-2.5">
          <b className="min-w-0 flex-1 truncate font-serif text-[16px] font-semibold">{title}</b>
          {caption && (
            <span className="font-mono text-[9px] uppercase tracking-wide text-foreground-faint">{caption}</span>
          )}
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label={t("close")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Menú de una fila y, dentro, la zona de peligro del borrado — la misma
 *  confirmación en dos pasos de `saga-meta-editor.tsx`, porque es el mismo tipo
 *  de borrado en cascada: `saga_route_entries` cuelga de `route_id` con
 *  `on delete cascade`, así que se lleva por delante todos los pasos. */
export function RouteSheet({
  row,
  sagaId,
  busy,
  onRename,
  onDesignate,
  onDelete,
  deleting,
  deleteError,
  onClose,
}: {
  row: RouteRowData;
  sagaId: string;
  busy: boolean;
  onRename: () => void;
  onDesignate: () => void;
  onDelete: () => void;
  deleting: boolean;
  deleteError: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("sagaEditor");
  const [confirming, setConfirming] = useState(false);
  const item =
    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-[13.5px] font-medium hover:bg-surface-muted disabled:opacity-40";

  return (
    <SheetShell title={row.name} caption={t("routeStepsCount", { count: row.steps })} onClose={onClose}>
      <div className="grid gap-0.5">
        <Link href={`${sagaHref(sagaId)}/rutas/${row.slug}/editar`} className={item}>
          {t("routeEditSteps")}
        </Link>
        <button type="button" onClick={onRename} disabled={busy} className={item}>
          {t("routeRename")}
        </button>
        <button
          type="button"
          onClick={onDesignate}
          disabled={busy || row.isReadingOrder || row.steps === 0}
          className={item}
        >
          {t("routeUseAsReadingOrder")}
        </button>
        <hr className="my-1.5 border-border" />
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy || confirming}
          className={`${item} text-status-dropped`}
        >
          {t("routeDelete")}
        </button>
      </div>

      {confirming && (
        <div className="mt-3 rounded-xl border border-status-dropped/50 bg-status-dropped/[0.07] p-3">
          <b className="mb-1.5 block font-serif text-[14px]">{t("routeDeleteTitle", { name: row.name })}</b>
          <p className="mb-2.5 text-[12px] leading-snug text-muted-foreground">{t("routeDeleteBody")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] font-semibold disabled:opacity-40"
            >
              {t("routeCancel")}
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="rounded-lg border border-status-dropped/40 px-2.5 py-1.5 text-[11.5px] font-semibold text-status-dropped disabled:opacity-40"
            >
              {deleting ? t("routeDeleting") : t("routeDeleteConfirm")}
            </button>
          </div>
          {deleteError && <p className="mt-2 text-[11.5px] text-status-dropped">{t("routeErrors.generic")}</p>}
        </div>
      )}
    </SheetShell>
  );
}

/** El formulario en hoja: crear desde móvil y renombrar desde cualquier
 *  tamaño. El raíl de escritorio monta `RouteForm` directamente, sin hoja. */
export function RouteFormSheet({
  title,
  sagaId,
  route,
  onClose,
}: {
  title: string;
  sagaId: string;
  route: { id: string; name: string; summary: string | null } | null;
  onClose: () => void;
}) {
  return (
    <SheetShell title={title} onClose={onClose}>
      <RouteForm sagaId={sagaId} route={route} idPrefix="sheet" onDone={onClose} onCancel={onClose} />
    </SheetShell>
  );
}
```

- [ ] **Step 2: Comprueba tipos y lint**

```powershell
npx tsc --noEmit
npx eslint src/components/saga/routes/route-sheet.tsx
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/saga/routes/route-sheet.tsx
git commit -m "feat(itinerarios): hojas de menú de fila y de formulario"
```

---

### Task 5: Las dos cáscaras y el manager

**Files:**
- Create: `src/components/saga/routes/shell-mobile.tsx`
- Create: `src/components/saga/routes/shell-desktop.tsx`
- Create: `src/components/saga/routes/routes-manager.tsx`

**Interfaces:**
- Consumes: `RouteRow`, `GeneratedMapRow`, `RouteRowData` de `./route-row`; `RouteForm` de `./route-form`; `RouteSheet`, `RouteFormSheet` de `./route-sheet`; `moveRoute`, `setReadingOrder`, `deleteRoute` de `@/lib/sagas/route-actions`; `sortCuratedRoutes` de `@/lib/sagas/get-saga-routes`; `sagaHref` de `@/lib/catalog/item-href`.
- Produces:
  - `type ShellProps` (exportado desde `shell-mobile.tsx`) con la forma común de las dos cáscaras.
  - `function RoutesManager(props: { sagaId: string; sagaName: string; hasMap: boolean; rows: RouteRowData[] }): JSX.Element` — lo monta `page.tsx`.

- [ ] **Step 1: Escribe la cáscara móvil**

Crea `src/components/saga/routes/shell-mobile.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { sagaHref } from "@/lib/catalog/item-href";
import { GeneratedMapRow, RouteRow, type RouteRowData } from "./route-row";
import { RouteForm } from "./route-form";

/** Forma común de las dos cáscaras: mismas filas, mismos gestos, distinta
 *  disposición. El estado vive entero en `RoutesManager`; aquí solo se pinta. */
export type ShellProps = {
  sagaId: string;
  sagaName: string;
  hasMap: boolean;
  rows: RouteRowData[];
  /** Ids de las filas movibles, en orden, para calcular extremos. */
  movableIds: string[];
  busyId: string | null;
  error: string | null;
  onMove: (routeId: string, direction: "up" | "down") => void;
  onDesignate: (routeId: string | null) => void;
  onMenu: (routeId: string) => void;
  onCreate: () => void;
};

export function ShellMobile({
  sagaId,
  sagaName,
  hasMap,
  rows,
  movableIds,
  busyId,
  error,
  onMove,
  onDesignate,
  onMenu,
  onCreate,
}: ShellProps) {
  const t = useTranslations("sagaEditor");
  const empty = rows.length === 0;

  return (
    <div className="pb-10">
      <header className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5">
        <Link
          href={sagaHref(sagaId)}
          aria-label={t("routesBack")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-surface text-[15px]"
        >
          ‹
        </Link>
        <div className="min-w-0 flex-1">
          <b className="block truncate font-serif text-[15px] font-semibold">{sagaName}</b>
          <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.09em] text-foreground-faint">
            {t("routesCrumb")}
          </span>
        </div>
        <Link
          href={sagaHref(sagaId)}
          className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold"
        >
          {t("routesBack")}
        </Link>
      </header>

      <div className="px-3.5 pt-4">
        <div className="mb-2.5 flex items-center gap-2.5">
          <h1 className="font-serif text-[17px] font-semibold">{t("routesTitle")}</h1>
          {!empty && (
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              {t("routesCount", { count: rows.length })}
            </span>
          )}
        </div>

        {empty ? (
          <>
            <div className="rounded-xl border border-dashed border-foreground/25 bg-surface/45 px-4 py-4.5 text-center">
              <b className="mb-1.5 block font-serif text-[15px] font-semibold">{t("routesEmptyTitle")}</b>
              <p className="mx-auto max-w-[290px] text-[12px] leading-snug text-muted-foreground">
                {t("routesEmptyBody")}
              </p>
            </div>
            {/* Con la lista vacía el formulario SÍ se pinta abierto: crear es
                lo único que se puede hacer aquí. */}
            <section className="mt-3.5 rounded-xl border border-border bg-surface p-3.5">
              <h2 className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
                {t("routeNewTitle")}
              </h2>
              <RouteForm sagaId={sagaId} route={null} idPrefix="empty" onDone={() => {}} />
            </section>
          </>
        ) : (
          <>
            <p className="mb-3 text-[12px] leading-snug text-muted-foreground">{t("routesSubtitle")}</p>
            {error && (
              <p role="alert" className="mb-2.5 text-[11.5px] text-status-dropped">
                {t(`routeErrors.${error}`)}
              </p>
            )}
            <ul className="grid gap-2">
              <GeneratedMapRow
                hasMap={hasMap}
                isActive={!rows.some((r) => r.isReadingOrder)}
                busy={busyId !== null}
                onDesignate={() => onDesignate(null)}
              />
              {rows.map((row) => (
                <RouteRow
                  key={row.id}
                  row={row}
                  sagaId={sagaId}
                  isFirst={movableIds[0] === row.id}
                  isLast={movableIds[movableIds.length - 1] === row.id}
                  busy={busyId === row.id || busyId === "*"}
                  onMove={(direction) => onMove(row.id, direction)}
                  onDesignate={() => onDesignate(row.id)}
                  onMenu={() => onMenu(row.id)}
                />
              ))}
            </ul>
            <button
              type="button"
              onClick={onCreate}
              className="mt-2.5 w-full rounded-lg border border-dashed border-border py-2 text-center text-[11.5px] font-semibold text-muted-foreground"
            >
              + {t("routeNew")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Escribe la cáscara de escritorio**

Crea `src/components/saga/routes/shell-desktop.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { sagaHref } from "@/lib/catalog/item-href";
import { GeneratedMapRow, RouteRow } from "./route-row";
import { RouteForm } from "./route-form";
import type { ShellProps } from "./shell-mobile";

/** Dos columnas: lista a la izquierda, raíl con el formulario de crear a la
 *  derecha. En escritorio crear no necesita hoja — hay sitio de sobra y el
 *  formulario abierto es la invitación. `onCreate` no se usa aquí: es el gesto
 *  de móvil. */
export function ShellDesktop({
  sagaId,
  sagaName,
  hasMap,
  rows,
  movableIds,
  busyId,
  error,
  onMove,
  onDesignate,
  onMenu,
}: ShellProps) {
  const t = useTranslations("sagaEditor");

  return (
    <div className="pb-12">
      <header className="flex items-center gap-4 border-b border-border bg-surface px-6 py-4">
        <Link
          href={sagaHref(sagaId)}
          aria-label={t("routesBack")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-[15px]"
        >
          ‹
        </Link>
        <div className="min-w-0 flex-1">
          <p className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-foreground-faint">
            {sagaName} · {t("routesCrumb")}
          </p>
          <h1 className="font-serif text-[23px] font-semibold leading-tight">{t("routesTitle")}</h1>
        </div>
        <Link
          href={sagaHref(sagaId)}
          className="shrink-0 rounded-lg border border-border px-3 py-2 text-[12.5px] font-semibold"
        >
          {t("routesBack")}
        </Link>
      </header>

      <div className="grid grid-cols-[1fr_350px] gap-6 px-6 py-5">
        <div>
          <p className="mb-3 text-[12px] leading-snug text-muted-foreground">{t("routesSubtitle")}</p>
          {error && (
            <p role="alert" className="mb-2.5 text-[11.5px] text-status-dropped">
              {t(`routeErrors.${error}`)}
            </p>
          )}
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/25 bg-surface/45 px-4 py-6 text-center">
              <b className="mb-1.5 block font-serif text-[15px] font-semibold">{t("routesEmptyTitle")}</b>
              <p className="mx-auto max-w-[320px] text-[12px] leading-snug text-muted-foreground">
                {t("routesEmptyBody")}
              </p>
            </div>
          ) : (
            <ul className="grid content-start gap-2">
              <GeneratedMapRow
                hasMap={hasMap}
                isActive={!rows.some((r) => r.isReadingOrder)}
                busy={busyId !== null}
                onDesignate={() => onDesignate(null)}
              />
              {rows.map((row) => (
                <RouteRow
                  key={row.id}
                  row={row}
                  sagaId={sagaId}
                  isFirst={movableIds[0] === row.id}
                  isLast={movableIds[movableIds.length - 1] === row.id}
                  busy={busyId === row.id || busyId === "*"}
                  onMove={(direction) => onMove(row.id, direction)}
                  onDesignate={() => onDesignate(row.id)}
                  onMenu={() => onMenu(row.id)}
                />
              ))}
            </ul>
          )}
        </div>

        <aside className="grid content-start gap-3.5">
          <section className="rounded-xl border border-border bg-surface p-3.5">
            <h2 className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
              {t("routeNewTitle")}
            </h2>
            <RouteForm sagaId={sagaId} route={null} idPrefix="rail" onDone={() => {}} />
          </section>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Escribe el manager**

Crea `src/components/saga/routes/routes-manager.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteRoute, moveRoute, setReadingOrder } from "@/lib/sagas/route-actions";
import { ShellDesktop } from "./shell-desktop";
import { ShellMobile } from "./shell-mobile";
import { RouteFormSheet, RouteSheet } from "./route-sheet";
import type { RouteRowData } from "./route-row";

type SheetState =
  | { kind: "menu"; routeId: string }
  | { kind: "create" }
  | { kind: "rename"; routeId: string }
  | null;

/** Único dueño del estado de esta pantalla. Las dos cáscaras se montan a la vez
 *  y se ocultan por breakpoint (regla de los dos árboles): son dos árboles de
 *  PRESENTACIÓN con un solo estado, como `sequence-editor.tsx`. Duplicar el
 *  estado por cáscara es el fallo que esa regla avisa que el patrón no cubre.
 *
 *  Las hojas se montan AQUÍ, fuera de las cáscaras: un `<dialog>` dentro de un
 *  contenedor con `display:none` no se pinta, así que una hoja dentro de la
 *  cáscara móvil no aparecería nunca en escritorio. */
export function RoutesManager({
  sagaId,
  sagaName,
  hasMap,
  rows,
}: {
  sagaId: string;
  sagaName: string;
  hasMap: boolean;
  rows: RouteRowData[];
}) {
  const t = useTranslations("sagaEditor");
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetState>(null);
  // `busyId` es el id de la fila con una acción en vuelo, o "*" cuando la
  // acción no es de ninguna fila concreta (designar el mapa generado toca a
  // todas). Deshabilitar solo lo afectado evita el spinner global.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const [, startTransition] = useTransition();

  // El designado está fijado arriba por su designación, no por su `position`:
  // queda fuera de la lista movible y sus vecinas calculan los extremos sobre
  // esa sublista.
  const movableIds = rows.filter((r) => !r.isReadingOrder).map((r) => r.id);

  function run(id: string, fn: () => Promise<string | null>) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const err = await fn();
      setBusyId(null);
      if (err) setError(err);
      else router.refresh();
    });
  }

  const onMove = (routeId: string, direction: "up" | "down") =>
    run(routeId, async () => {
      await moveRoute(routeId, sagaId, direction);
      return null;
    });

  const onDesignate = (routeId: string | null) =>
    run(routeId ?? "*", async () => {
      const result = await setReadingOrder(sagaId, routeId);
      if (!result.error) setSheet(null);
      return result.error ?? null;
    });

  const active = sheet && sheet.kind !== "create" ? rows.find((r) => r.id === sheet.routeId) ?? null : null;

  function onDelete(routeId: string) {
    setDeleteError(false);
    setBusyId(routeId);
    startTransition(async () => {
      const result = await deleteRoute(routeId, sagaId);
      setBusyId(null);
      if (result.error) {
        setDeleteError(true);
        return;
      }
      setSheet(null);
      router.refresh();
    });
  }

  const shellProps = {
    sagaId,
    sagaName,
    hasMap,
    rows,
    movableIds,
    busyId,
    error,
    onMove,
    onDesignate,
    onMenu: (routeId: string) => {
      setDeleteError(false);
      setSheet({ kind: "menu", routeId });
    },
    onCreate: () => setSheet({ kind: "create" }),
  };

  return (
    <>
      <div className="hidden lg:block">
        <ShellDesktop {...shellProps} />
      </div>
      <div className="lg:hidden">
        <ShellMobile {...shellProps} />
      </div>

      {sheet?.kind === "menu" && active && (
        <RouteSheet
          row={active}
          sagaId={sagaId}
          busy={busyId !== null}
          onRename={() => setSheet({ kind: "rename", routeId: active.id })}
          onDesignate={() => onDesignate(active.id)}
          onDelete={() => onDelete(active.id)}
          deleting={busyId === active.id}
          deleteError={deleteError}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === "rename" && active && (
        <RouteFormSheet
          title={t("routeRenameTitle")}
          sagaId={sagaId}
          route={{ id: active.id, name: active.name, summary: active.summary }}
          onClose={() => {
            setSheet(null);
            router.refresh();
          }}
        />
      )}

      {sheet?.kind === "create" && (
        <RouteFormSheet
          title={t("routeNewTitle")}
          sagaId={sagaId}
          route={null}
          onClose={() => {
            setSheet(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Comprueba tipos y lint**

```powershell
npx tsc --noEmit
npx eslint src/components/saga/routes/
```

Esperado: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/saga/routes/shell-mobile.tsx src/components/saga/routes/shell-desktop.tsx src/components/saga/routes/routes-manager.tsx
git commit -m "feat(itinerarios): cáscaras móvil y escritorio con su manager"
```

---

### Task 6: Conectar la página y retirar lo viejo

**Files:**
- Modify: `src/app/saga/[id]/rutas/page.tsx` (fichero entero)
- Delete: `src/components/saga/route-list.tsx`
- Delete: `src/components/saga/create-route-form.tsx`
- Delete: `src/components/saga/reading-order-picker.tsx`

**Interfaces:**
- Consumes: `countRouteEntries` (Task 1), `RoutesManager` (Task 5), `RouteRowData` (Task 3), `getSagaRoutes` y `sortCuratedRoutes` de `@/lib/sagas/get-saga-routes`.
- Produces: nada que consuman tareas posteriores.

- [ ] **Step 1: Reescribe la página**

Sustituye **todo** el contenido de `src/app/saga/[id]/rutas/page.tsx` por:

```tsx
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getSagaRoutes, sortCuratedRoutes } from "@/lib/sagas/get-saga-routes";
import { countRouteEntries, type RawRouteEntryCountRow } from "@/lib/sagas/count-route-entries";
import { sagaHref } from "@/lib/catalog/item-href";
import { RoutesManager } from "@/components/saga/routes/routes-manager";
import type { RouteRowData } from "@/components/saga/routes/route-row";

// Curación de itinerarios. Gate DURO collaborator+, igual que
// /saga/[id]/editar: gestionar rutas SÍ es curación (a diferencia de
// adoptar una, que es preferencia personal).
export default async function SagaRoutesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) redirect(sagaHref(id));

  // `show_map` decide el TEXTO de la fila del mapa generado, no si se pinta:
  // una saga sin mapa con un itinerario ya designado necesita esa fila para
  // poder dejar de designarlo.
  const { data: saga } = await supabase.from("sagas").select("id, name, show_map").eq("id", id).maybeSingle();
  if (!saga) notFound();

  const routes = sortCuratedRoutes(await getSagaRoutes(supabase, id));

  // Una consulta agregada, NO una por fila. Con cero itinerarios ni se lanza:
  // un `.in()` con lista vacía es una ida y vuelta a BD para no traer nada.
  let counts: Record<string, { steps: number; notes: number }> = {};
  if (routes.length > 0) {
    const { data } = await supabase
      .from("saga_route_entries")
      .select("route_id, note")
      .in(
        "route_id",
        routes.map((r) => r.id),
      );
    counts = countRouteEntries((data ?? []) as RawRouteEntryCountRow[]);
  }

  const rows: RouteRowData[] = routes.map((r) => ({
    ...r,
    ...(counts[r.id] ?? { steps: 0, notes: 0 }),
  }));

  return (
    <RoutesManager
      sagaId={id}
      sagaName={(saga as { name: string }).name}
      hasMap={Boolean((saga as { show_map: boolean | null }).show_map)}
      rows={rows}
    />
  );
}
```

- [ ] **Step 2: Borra los tres componentes retirados**

```bash
git rm src/components/saga/route-list.tsx src/components/saga/create-route-form.tsx src/components/saga/reading-order-picker.tsx
```

- [ ] **Step 3: Comprueba que no queda ninguna referencia**

```powershell
npx tsc --noEmit
```

Esperado: sin salida. Si `tsc` se queja de un import de `RouteList`, `CreateRouteForm` o `ReadingOrderPicker`, ese fichero también hay que arreglarlo — la búsqueda previa dio como único consumidor `page.tsx`.

- [ ] **Step 4: Corre la suite entera**

```powershell
npx vitest run
npx eslint src/
```

Esperado: vitest en verde (los tests existentes no tocan estos componentes; el fichero nuevo de la Task 1 suma 5). `eslint` sin errores nuevos — `generate-route-button.tsx` arrastra 3 warnings previos que no son de esta rama.

- [ ] **Step 5: Commit**

```bash
git add src/app/saga/[id]/rutas/page.tsx
git commit -m "feat(itinerarios): la pantalla de gestión pasa al diseño nuevo"
```

---

### Task 7: Reescribir el e2e de la designación

**Files:**
- Modify: `e2e/sagas-orden-designado.spec.ts:101-152` (los helpers `routeChips`, `NINGUNO`, `badge` y `designar`)

**Interfaces:**
- Consumes: la UI de las tareas 3-6.
- Produces: nada.

- [ ] **Step 1: Sustituye los helpers**

En `e2e/sagas-orden-designado.spec.ts`, reemplaza el bloque que va desde el comentario de `routeChips` (línea 101) hasta el cierre de `designar` (línea 152) por:

```ts
/** Chips del selector de rutas de la ficha. `RouteSelector` no lleva testid
 *  propio y pinta dos variantes según cuántas rutas haya (toggle con ≤2, tira
 *  de chips con 3+), pero las dos son `<Link>` al mismo `?tab=mapa&ruta=<slug>`:
 *  ese href es el único selector estable que vale para las dos, sin inventar un
 *  testid nuevo en el componente.
 *
 *  `:visible` porque las dos cáscaras se montan a la vez y se ocultan por
 *  breakpoint (regla de los dos árboles): sin él, cada locator encontraría el
 *  doble de elementos. */
function routeChips(page: Page) {
  return page.locator('a[href*="ruta="]:visible');
}

/** La fila de gestión de un itinerario, en la cáscara VISIBLE. La pantalla
 *  monta las dos cáscaras a la vez, así que sin `:visible` cada fila aparece
 *  dos veces y el locator es ambiguo. */
function row(page: Page, name: string) {
  return page.locator("li:visible").filter({ hasText: name });
}

/** La fila sintética del mapa generado: es el antiguo radio «Ninguno». */
const MAPA_GENERADO = "Mapa generado";

/** La chapa «Orden de lectura» de la fila. Solo la pinta la fila designada, y
 *  su dato viene del SERVIDOR, así que aparecer/desaparecer es la única señal
 *  que no puede ser cierta sin que la escritura haya llegado a BD. */
function badge(page: Page) {
  return row(page, ROUTE_NAME).getByText("Orden de lectura");
}

async function designar(page: Page, target: string) {
  await page.goto(`/saga/${UNIVERSO_ID}/rutas`);
  const boton = row(page, target).getByRole("button", { name: "Usar como orden de lectura" });

  // IDEMPOTENTE a propósito: los dos tests comparten la fila sembrada en
  // `beforeAll` y el primero deja el itinerario designado, así que el segundo
  // puede llegar aquí con el objetivo YA designado. En ese caso el botón no
  // existe —la fila designada pinta «Es el orden de lectura», deshabilitado—,
  // y no hay nada que pulsar.
  if ((await boton.count()) > 0) {
    // Esperar a que se HABILITE antes de pulsar: es la señal de que el
    // componente está hidratado. Un clic anterior a la hidratación se pierde.
    await expect(boton).toBeEnabled();
    await boton.click();
  }

  // La designación se aplica al pulsar y la confirma el `router.refresh()` del
  // manager. Se espera a la chapa, no al botón: el botón también está
  // deshabilitado mientras la transición está en vuelo.
  if (target === MAPA_GENERADO) await expect(badge(page)).toHaveCount(0);
  else await expect(badge(page)).toBeVisible();
}
```

- [ ] **Step 2: Cambia las dos llamadas con `NINGUNO`**

En el segundo test (`desdesignar devuelve la ruta sintética y el nombre propio del itinerario`), sustituye:

```ts
  await designar(page, NINGUNO);
```

por:

```ts
  await designar(page, MAPA_GENERADO);
```

`NINGUNO` ya no existe: la constante se ha reemplazado por `MAPA_GENERADO` en el Step 1.

- [ ] **Step 3: Levanta el servidor si no hay uno**

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
```

Si no devuelve nada, arranca uno **y solo uno**: `npm run dev`. Si devuelve un PID, ya hay servidor: reutilízalo, no levantes otro.

- [ ] **Step 4: Corre el spec**

```powershell
npx playwright test e2e/sagas-orden-designado.spec.ts
```

Esperado: 2 passed. Si sale `0 tests` o todo verde en menos de un segundo, falta `.env.local` en el worktree — cópialo de la raíz del repo y repite.

- [ ] **Step 5: Corre los cinco specs de sagas**

```powershell
npx playwright test e2e/sagas-orden-designado.spec.ts e2e/sagas-itinerarios.spec.ts e2e/sagas-ventanas.spec.ts e2e/sagas-v2-mapa.spec.ts e2e/sagas-mapa-derivado.spec.ts
```

Esperado: todo en verde, 0 skipped.

- [ ] **Step 6: Commit**

```bash
git add e2e/sagas-orden-designado.spec.ts
git commit -m "test(itinerarios): el e2e de designación usa el control de la fila"
```

---

### Task 8: Documentación e issues

**Files:**
- Modify: `docs/requirements/decisiones.md` (añadir al final)
- Modify: `docs/requirements/backlog.md`
- Modify: `docs/architecture/graph.json`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada.

- [ ] **Step 1: Añade la decisión**

Al **final** de la tabla de `docs/requirements/decisiones.md` (append-only: no reescribas filas anteriores), añade:

```markdown
| 2026-07-29 | La elección de «Orden de lectura» vive en la FILA del itinerario y se aplica al pulsar; el mapa generado es una fila más | La pantalla de gestión pintaba la lista dos veces: una como filas y otra como radios dentro de `ReadingOrderPicker`, con su propio botón de guardar. Eran la misma pregunta hecha de dos maneras, y la segunda obligaba a leer la lista entera para responder algo que es propiedad de una fila. Ahora el control vive en la fila, llama al mismo `setReadingOrder` que llamaba el selector, y «Ninguno» pasa a ser la fila sintética «Mapa generado». Tres consecuencias asumidas: no hay barra de guardado en esta pantalla porque no hay nada pendiente de guardar (el mockup dibujaba una que solo decía «Todo aplicado»); la fila del mapa generado se pinta también con `show_map = false`, porque si no una saga sin mapa con designado se quedaría sin forma de desdesignarlo; y la designación deja de tener confirmación, aunque cambie lo que ven todos los lectores de la saga — es reversible con otro clic. Spec: `docs/superpowers/specs/2026-07-29-itinerarios-gestion-rediseno-design.md` |
```

- [ ] **Step 2: Marca el estado en el backlog**

En `docs/requirements/backlog.md`, dentro de la sección de sagas, añade una línea:

```markdown
- [x] Rediseño Paper de la gestión de itinerarios (`/saga/[id]/rutas`): orden de lectura en la fila, crear/renombrar en hoja o raíl, escritorio a dos columnas. El editor de PASOS sigue con el diseño viejo.
```

- [ ] **Step 3: Actualiza el mapa de arquitectura**

En `docs/architecture/graph.json`, localiza el nodo `m-sagas` y añade a su lista `files` las rutas nuevas:

```
"src/lib/sagas/count-route-entries.ts",
"src/components/saga/routes/routes-manager.tsx"
```

Añade además esta trampa a sus `gotchas`:

```
"La pantalla /saga/[id]/rutas monta las dos cáscaras a la vez (hidden lg:block / lg:hidden): todo locator de Playwright sobre ella necesita :visible, y las hojas <dialog> se montan en routes-manager, fuera de las cáscaras, porque un dialog dentro de un contenedor display:none no se pinta."
```

**Edita con ediciones quirúrgicas, nunca reescribiendo el fichero con un volcado JSON:** un `json.dump` reindenta las 2400 líneas y hace irrevisable el diff.

- [ ] **Step 4: Valida el JSON**

```powershell
node -e "JSON.parse(require('fs').readFileSync('docs/architecture/graph.json','utf8')); console.log('graph ok')"
git diff --stat docs/architecture/graph.json
```

Esperado: `graph ok`, y el diff de 3-4 líneas. Si son cientos, revierte con `git checkout -- docs/architecture/graph.json` y repite a mano.

- [ ] **Step 5: Abre las cuatro issues de lo que queda fuera**

```bash
gh issue create --title "Itinerarios: duplicar un itinerario desde el menú de la fila" --body "El mockup del rediseño (Paper - Itinerarios (rediseño) (1).html, frame M2) incluye «⧉ Duplicar» en el menú ⋯ de cada fila. Quedó fuera de la fase de gestión porque no es repintado: hace falta una acción de servidor nueva que copie la fila (nombre «X (copia)», slug libre — ojo al CHECK saga_routes_slug_not_reserved) y todos sus saga_route_entries con sus notas. Sin ella, partir de un itinerario existente obliga a recrearlo paso a paso. Spec de la fase: docs/superpowers/specs/2026-07-29-itinerarios-gestion-rediseno-design.md"

gh issue create --title "Itinerarios: contador de lectores por itinerario (necesita función SQL agregada)" --body "El mockup pinta «41 lectores» en cada fila de /saga/[id]/rutas. No se implementó porque la RLS de saga_route_choices es solo-dueño (\"saga route choices own\": user_id = auth.uid()), así que contar desde la página con la sesión del curador devuelve 0 o 1, nunca el total. Cómo reproducirlo: añade un .select(..., { count: 'exact' }) sobre saga_route_choices en la página y compáralo con el count real vía service key — no coinciden. Salida propuesta: migración con una función security definer que reciba saga_id, compruebe has_min_role('collaborator') dentro y devuelva solo route_slug + recuento, sin exponer ningún user_id. Descartada la alternativa de abrir la RLS a colaboradores: expone qué usuario concreto adoptó qué ruta."

gh issue create --title "Itinerarios: panel «Qué ve el lector» en la pantalla de gestión" --body "Frames M1 (al pie) y D1 (en el raíl) del mockup: un panel que previsualiza cómo queda el selector de la pestaña Mapa con las rutas actuales, explicando que con 3+ rutas pasa de segmentado a tira de chips y que el mapa generado no se ofrece aparte cuando hay un designado. No necesita datos nuevos: se deriva de las rutas que la página ya tiene. Quedó fuera por acotar la fase."

gh issue create --title "Itinerarios: rediseño Paper del editor de PASOS (/rutas/[slug]/editar)" --body "Segunda mitad del mockup Paper - Itinerarios (rediseño) (1).html: frames M5, M6, M7 y D2. Qué cambia respecto a lo que hay hoy en src/components/saga/editor/route-editor.tsx: (1) la nota deja de ser un input siempre visible bajo cada paso y pasa a un «+ Nota» que se abre al pulsar, con la nota existente en cursiva y contador n/200; (2) la sopa de chips de añadir se sustituye por un buscador con secciones (subsagas primero, obras después) y ✓ en lo que ya está dentro, en hoja en móvil y en el raíl en PC; (3) cada paso muestra portada, tipo y rol, lo que exige que la paleta de la página lleve coverUrl e itemType, hoy solo lleva label; (4) barra de guardado con recuento de cambios sin guardar y el aviso de validación dentro, en vez del texto rojo suelto. Necesita su propia spec."
```

- [ ] **Step 6: Commit**

```bash
git add docs/requirements/decisiones.md docs/requirements/backlog.md docs/architecture/graph.json
git commit -m "docs(itinerarios): decisión, backlog y mapa de arquitectura del rediseño"
```

- [ ] **Step 7: Cierra la rama**

**REQUIRED SUB-SKILL:** usa `superpowers:finishing-a-development-branch`.

Antes de presentar opciones, verifica: `npx vitest run` (toda la suite), `npx tsc --noEmit`, `npx eslint src/` y los cinco specs de Playwright de sagas.

**Verificación visual pendiente, que NO puedes hacer tú:** esta rama reescribe una pantalla entera y el proyecto no tiene React Testing Library, así que `tsc` y los e2e no ven el aspecto. Levanta el servidor y pide al responsable que mire `/saga/<id>/rutas` en móvil y en ancho ≥1024 px: filas, hoja del ⋯, borrado, crear desde el raíl, estado vacío y modo oscuro. No des la tarea por cerrada con una captura propia si no puedes autenticarte.

---

## Autorrevisión

**Cobertura de la spec:**

| Sección de la spec | Tarea |
|---|---|
| §3 arquitectura (7 ficheros nuevos, 3 borrados) | 1-6 |
| §4 datos (`show_map`, consulta agregada, `countRouteEntries`) | 1, 6 |
| §5 la fila (flechas, chapa, meta, aplicar al pulsar, fila del mapa) | 3, 5 |
| §6 crear/renombrar/borrar | 2, 4, 5 |
| §7 cabecera sin barra de guardado | 5 |
| §8 estados (vacío, sin designar, en vuelo, nombre repetido, fallo de borrado) | 2, 3, 5 |
| §9 tests | 1, 7 |
| §10 riesgos | recogidos en Global Constraints |

**Desvío detectado y ya corregido en la spec:** el borrador de la spec §6 decía que en escritorio el renombrado reutilizaría el panel del raíl cambiándolo de modo. Se implementa como hoja/modal en los dos tamaños (`RouteFormSheet`), igual que en móvil, porque el mockup no dibuja el renombrado en escritorio (D1 solo tiene «Nuevo itinerario» en el raíl) y un raíl con dos modos añade una máquina de estados —y el riesgo de que el curador pierda lo que estaba escribiendo en «crear» al pulsar «renombrar»— a cambio de nada visible. La spec §6 ya dice esto: no queda nada que corregir en la Task 8.

**Consistencia de tipos:** `RouteRowData` se define en `route-row.tsx` (Task 3) y lo consumen `route-sheet.tsx` (Task 4), las cáscaras y el manager (Task 5) y `page.tsx` (Task 6). `ShellProps` se define en `shell-mobile.tsx` (Task 5) y lo importa `shell-desktop.tsx`. `countRouteEntries`/`RawRouteEntryCountRow` se definen en la Task 1 y se consumen en la Task 6. `busyId` es `string | null` en las tres, con `"*"` como comodín para la fila sintética.
