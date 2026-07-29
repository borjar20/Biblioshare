# Itinerarios: editor de pasos (rediseño Paper) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar `/saga/[id]/rutas/[slug]/editar` (editor de PASOS de un itinerario) al estilo Paper de los mockups M5-M7 (móvil) y D2 (escritorio): portada+tipo+rol por paso, nota colapsable, buscador de añadir con subsagas/obras agrupadas, y una barra de guardado con recuento de cambios por categoría en vez del `<p>` rojo suelto.

**Architecture:** `route-editor.tsx` sigue siendo el único dueño del estado (draft + snapshot inicial + qué hoja está abierta), monta dos cáscaras de presentación pura (`shell-mobile.tsx`/`shell-desktop.tsx`) ocultas por breakpoint — mismo patrón que `routes/routes-manager.tsx` de #263 —, y delega la fila (`step-row.tsx`), el buscador de añadir (`add-steps-list.tsx`, compartido entre hoja móvil y raíl de escritorio) y la barra de guardado (`route-savebar.tsx`) a componentes de presentación. Un cálculo de diff puro (`compute-route-diff.ts`) alimenta el recuento de la savebar.

**Tech Stack:** Next.js App Router (Server Component en `page.tsx`, Client Components debajo), next-intl, Tailwind, vitest (unit), Playwright (e2e). Sin migraciones ni cambios de RPC.

## Global Constraints

- El guardado sigue siendo full-replace vía `saveRoute`/`save_saga_route`, renumerando posiciones 1..n justo antes de enviar — ningún task toca esa RPC ni `validateRouteDraft`.
- Nota: tope de 200 caracteres (`char_length(note) <= 200`, CHECK de BD) — se respeta con `maxLength` en el textarea, igual que hoy.
- `hydrateRouteDraft` conserva la `note` de la entrada REAL guardada, nunca la de la paleta (hallazgo ya documentado en el fichero — perdería notas reales en el full-replace si se rompiera).
- Buscador de añadir: filtro 100% en cliente sobre la paleta ya cargada, sin ruta ni RPC nueva.
- Botón «+» de la hoja de añadir: añade al borrador AL INSTANTE (no hay selección-luego-confirmar); la hoja no se cierra sola.
- Todo texto nuevo va en `messages/es.json` bajo el namespace `sagaEditor`, con `useTranslations("sagaEditor")` — reutilizar `itemType.*` y `role.*` ya existentes para tipo y rol, no duplicarlos.
- Reutilizar el chasis de hoja (`<dialog>` + `showModal()`) ya existente en el repo en vez de reimplementar cierre/foco/backdrop.
- Sin drag & drop real: el asa `⠿` de D2 es decorativa sobre el mismo mecanismo `↑↓`.
- TDD para toda función pura nueva (`compute-route-diff.ts`); los componentes de presentación se verifican con `qa-verifier` en navegador, no con tests unitarios (mismo criterio que el resto de `routes/*.tsx`, que no tienen test unitario propio).

---

## Task 1: Extraer `SheetShell` a un sitio compartido

El chasis de hoja (`<dialog>` + `showModal()`, cierre con click fuera, asa táctil) vive hoy como función local no exportada dentro de `src/components/saga/routes/route-sheet.tsx`. La hoja de añadir pasos (Task 7) lo necesita también, así que se extrae ANTES de escribir nada que dependa de él — sin esto, Task 7 duplicaría el `<dialog>` entero.

**Files:**
- Create: `src/components/saga/sheet-shell.tsx`
- Modify: `src/components/saga/routes/route-sheet.tsx`

**Interfaces:**
- Produces: `SheetShell({ title: string, caption?: string, onClose: () => void, children: ReactNode })` — componente cliente, export nombrado desde `src/components/saga/sheet-shell.tsx`.

- [ ] **Step 1: Crear el fichero compartido con el contenido íntegro de la función actual**

```tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/** Chasis común de toda hoja del editor de sagas. `<dialog>` nativo con
 *  `showModal()`, como el resto de hojas del repo (`sequence/row-sheet.tsx`,
 *  `item-connect-sheet.tsx`): trae gratis el cierre con Escape, la trampa de
 *  foco y el `inert` del fondo. Reimplementarlo con un div superpuesto sería
 *  perder las tres cosas.
 *
 *  Pegada abajo en móvil y modal centrado en `lg`, el mismo breakpoint en que
 *  se cambian las cáscaras: en escritorio no hay pulgar al que acercarla. */
export function SheetShell({
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
```

- [ ] **Step 2: Quitar la definición local de `route-sheet.tsx` y usar la importada**

Reemplazar las líneas 1-64 de `src/components/saga/routes/route-sheet.tsx` (desde `"use client";` hasta el cierre de la función `SheetShell`, justo antes del comentario de `RouteSheet`) por:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { sagaHref } from "@/lib/catalog/item-href";
import { SheetShell } from "../sheet-shell";
import { RouteForm } from "./route-form";
import type { RouteRowData } from "./route-row";
```

El resto del fichero (`RouteSheet`, `RouteFormSheet`) no cambia — ya usan `<SheetShell ...>`, que ahora resuelve a la importación.

- [ ] **Step 3: Verificar que compila y que la pantalla de gestión no se rompió**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `route-sheet.tsx` ni en `sheet-shell.tsx`.

Run: `npm run lint`
Expected: sin warnings nuevos en los dos ficheros.

- [ ] **Step 4: Commit**

```bash
git add src/components/saga/sheet-shell.tsx src/components/saga/routes/route-sheet.tsx
git commit -m "refactor(itinerarios): extrae el chasis de hoja a un sitio compartido"
```

---

## Task 2: `computeRouteDiff` — recuento de cambios sin guardar (TDD)

Función pura que compara el borrador contra el estado inicial y devuelve cuántos pasos se añadieron, quitaron, movieron o cambiaron de nota — lo que pinta la savebar (Task 8). `moved` usa la distancia mínima de reordenación (supervivientes menos la subsecuencia creciente más larga de sus posiciones originales), no el índice absoluto: borrar un paso del principio desplaza a todos los siguientes sin que el curador haya movido nada, y contarlo así daría un número que no cuadra con lo que el curador hizo.

**Files:**
- Create: `src/lib/sagas/compute-route-diff.ts`
- Test: `src/lib/sagas/compute-route-diff.test.ts`

**Interfaces:**
- Produces: `type RouteDiffEntry = { key: string; note: string | null }`, `type RouteDiff = { added: number; removed: number; moved: number; noted: number; total: number }`, `computeRouteDiff(initial: RouteDiffEntry[], draft: RouteDiffEntry[]): RouteDiff` — Task 8 (`route-savebar.tsx`) y Task 11 (`route-editor.tsx`) lo consumen con este nombre y firma exactos.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { computeRouteDiff } from "./compute-route-diff";

const e = (key: string, note: string | null = null) => ({ key, note });

describe("computeRouteDiff", () => {
  it("sin cambios: todo a cero", () => {
    const initial = [e("i:book:a"), e("i:book:b")];
    const diff = computeRouteDiff(initial, initial.map((x) => ({ ...x })));
    expect(diff).toEqual({ added: 0, removed: 0, moved: 0, noted: 0, total: 0 });
  });

  it("un paso añadido", () => {
    const initial = [e("i:book:a")];
    const draft = [e("i:book:a"), e("i:book:b")];
    expect(computeRouteDiff(initial, draft)).toEqual({ added: 1, removed: 0, moved: 0, noted: 0, total: 1 });
  });

  it("un paso quitado", () => {
    const initial = [e("i:book:a"), e("i:book:b")];
    const draft = [e("i:book:a")];
    expect(computeRouteDiff(initial, draft)).toEqual({ added: 0, removed: 1, moved: 0, noted: 0, total: 1 });
  });

  it("un intercambio adyacente cuenta como 1 movido, no 2", () => {
    const initial = [e("i:book:a"), e("i:book:b"), e("i:book:c")];
    const draft = [e("i:book:b"), e("i:book:a"), e("i:book:c")];
    expect(computeRouteDiff(initial, draft)).toEqual({ added: 0, removed: 0, moved: 1, noted: 0, total: 1 });
  });

  it("mover el primero al final cuenta como 1 movido", () => {
    const initial = [e("i:book:a"), e("i:book:b"), e("i:book:c"), e("i:book:d")];
    const draft = [e("i:book:b"), e("i:book:c"), e("i:book:d"), e("i:book:a")];
    expect(computeRouteDiff(initial, draft)).toEqual({ added: 0, removed: 0, moved: 1, noted: 0, total: 1 });
  });

  it("borrar un paso NO cuenta como movidos a los que le seguían", () => {
    const initial = [e("i:book:a"), e("i:book:b"), e("i:book:c")];
    const draft = [e("i:book:b"), e("i:book:c")];
    expect(computeRouteDiff(initial, draft)).toEqual({ added: 0, removed: 1, moved: 0, noted: 0, total: 1 });
  });

  it("nota creada, editada y borrada cuentan como 'noted'", () => {
    const initial = [e("i:book:a", null), e("i:book:b", "vieja"), e("i:book:c", "igual")];
    const draft = [e("i:book:a", "nueva"), e("i:book:b", "editada"), e("i:book:c", "igual")];
    expect(computeRouteDiff(initial, draft)).toEqual({ added: 0, removed: 0, moved: 0, noted: 2, total: 2 });
  });

  it("combinación: 1 movido + 1 nota nueva + 1 quitado, como en el mockup", () => {
    const initial = [e("i:book:a"), e("i:book:b"), e("i:book:c")];
    const draft = [e("i:book:b", "nota nueva"), e("i:book:a")];
    expect(computeRouteDiff(initial, draft)).toEqual({ added: 0, removed: 1, moved: 1, noted: 1, total: 3 });
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npx vitest run src/lib/sagas/compute-route-diff.test.ts`
Expected: FAIL — `Cannot find module './compute-route-diff'`.

- [ ] **Step 3: Implementación mínima**

```ts
export type RouteDiffEntry = { key: string; note: string | null };
export type RouteDiff = { added: number; removed: number; moved: number; noted: number; total: number };

/** Diferencia entre el borrador y el estado inicial (recién hidratado), para
 *  la barra de guardado (mockup M5: "3 cambios sin guardar · 1 paso movido
 *  · 1 nota nueva · 1 quitado"). Pura, sin efectos — mismo patrón que
 *  `validate-route-draft.ts`.
 *
 *  `moved` NO cuenta índices absolutos: borrar un paso desplaza a todos los
 *  que le seguían sin que nadie los haya movido. Se cuenta con la distancia
 *  mínima de reordenación de los SUPERVIVIENTES (presentes en los dos lados):
 *  cuántos hay que sacar y volver a meter para pasar de un orden al otro,
 *  es decir supervivientes.length menos la subsecuencia creciente más larga
 *  de sus posiciones originales. */
export function computeRouteDiff(initial: RouteDiffEntry[], draft: RouteDiffEntry[]): RouteDiff {
  const initialNotes = new Map(initial.map((d) => [d.key, d.note]));
  const initialKeys = initial.map((d) => d.key);
  const draftKeys = draft.map((d) => d.key);
  const draftSet = new Set(draftKeys);

  const added = draft.filter((d) => !initialNotes.has(d.key)).length;
  const removed = initialKeys.filter((k) => !draftSet.has(k)).length;
  const noted = draft.filter((d) => initialNotes.has(d.key) && initialNotes.get(d.key) !== d.note).length;

  const survivorsInitialOrder = initialKeys.filter((k) => draftSet.has(k));
  const survivorsDraftOrder = draftKeys.filter((k) => initialNotes.has(k));
  const indexInInitial = new Map(survivorsInitialOrder.map((k, i) => [k, i]));
  const sequence = survivorsDraftOrder.map((k) => indexInInitial.get(k)!);
  const moved = sequence.length - longestIncreasingRun(sequence);

  return { added, removed, moved, noted, total: added + removed + moved + noted };
}

/** Longitud de la subsecuencia creciente más larga, O(n log n) — patrón
 *  estándar "patience sorting". `n` aquí es el nº de pasos de un itinerario
 *  (decenas como mucho), así que la complejidad no es la razón de esta
 *  implementación: es simplemente la forma correcta de escribirla. */
function longestIncreasingRun(seq: number[]): number {
  const tails: number[] = [];
  for (const n of seq) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < n) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = n;
  }
  return tails.length;
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npx vitest run src/lib/sagas/compute-route-diff.test.ts`
Expected: PASS — 8 tests verdes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/compute-route-diff.ts src/lib/sagas/compute-route-diff.test.ts
git commit -m "feat(itinerarios): computeRouteDiff para el recuento de la savebar"
```

---

## Task 3: `RouteEditorItem` gana portada, tipo, rol, acento y recuento

`RouteEditorItem` hoy es `{ key, label, entry }`. Los pasos-ítem necesitan `coverUrl`/`itemType`/`role`; los pasos-bloque (subsaga) necesitan `accent`/`memberCount`. Los dos conjuntos son mutuamente excluyentes según `entry.childSagaId`, pero se declaran en un único tipo plano (no discriminado) para no romper el resto de sitios que ya desestructuran `RouteEditorItem`, igual que `RawRouteEntry` ya usa campos nulos en vez de una unión.

**Files:**
- Modify: `src/lib/sagas/hydrate-route-draft.ts`
- Modify: `src/lib/sagas/hydrate-route-draft.test.ts`

**Interfaces:**
- Consumes: `RawRouteEntry` de `./route-types` (sin cambios), `SagaAccentToken` de `./accents`, `SagaItemRole` de `./types`, `ItemType` de `@/lib/catalog/types`.
- Produces: `RouteEditorItem = { key: string; label: string; coverUrl: string | null; itemType: ItemType | null; role: SagaItemRole | null; accent: SagaAccentToken | null; memberCount: number | null; entry: Omit<RawRouteEntry, "position"> }`, `hydrateRouteDraft(entries, palette): RouteEditorItem[]`, `keyOfRouteEntry` (sin cambios) — Task 5 (`page.tsx`), Task 6 (`step-row.tsx`), Task 7 (`add-steps-list.tsx`) y Task 11 (`route-editor.tsx`) importan este tipo tal cual.

- [ ] **Step 1: Actualizar el test existente a la forma nueva (test primero: hoy no compilaría con los campos nuevos si fueran obligatorios)**

Reemplazar el contenido íntegro de `src/lib/sagas/hydrate-route-draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hydrateRouteDraft, type RouteEditorItem } from "./hydrate-route-draft";
import type { RawRouteEntry } from "./route-types";

const entry = (over: Partial<RawRouteEntry> & { position: number }): RawRouteEntry => ({
  itemType: null,
  itemId: null,
  childSagaId: null,
  note: null,
  ...over,
});

const itemPaletteEntry = (key: string, label: string, itemType: RawRouteEntry["itemType"], itemId: string): RouteEditorItem => ({
  key,
  label,
  coverUrl: null,
  itemType,
  role: null,
  accent: null,
  memberCount: null,
  entry: { itemType, itemId, childSagaId: null, note: null },
});

const blockPaletteEntry = (key: string, label: string, childSagaId: string): RouteEditorItem => ({
  key,
  label,
  coverUrl: null,
  itemType: null,
  role: null,
  accent: "beige",
  memberCount: 3,
  entry: { itemType: null, itemId: null, childSagaId, note: null },
});

describe("hydrateRouteDraft", () => {
  // Hallazgo Important de la revisión final de rama: la paleta se construye
  // en page.tsx SIEMPRE con note: null (es un placeholder para pasos que aún
  // no están en el borrador, no una nota "por defecto"). Si al casar una
  // entrada guardada con su ítem de paleta se devuelve el objeto de la
  // paleta tal cual, la nota real de BD se pierde en cuanto el curador pulsa
  // Guardar sin tocar nada — pérdida de datos silenciosa.
  it("conserva la note real de la entrada guardada aunque case con la paleta", () => {
    const palette = [itemPaletteEntry("i:book:a", "Libro A", "book", "a")];
    const entries: RawRouteEntry[] = [
      entry({ position: 1, itemType: "book", itemId: "a", note: "aquí puedes parar" }),
    ];

    const draft = hydrateRouteDraft(entries, palette);

    expect(draft).toHaveLength(1);
    expect(draft[0].entry.note).toBe("aquí puedes parar");
    // El resto de la entrada (label, itemType/itemId, coverUrl…) sigue
    // viniendo de la paleta: solo la nota se sobreescribe con el valor real.
    expect(draft[0].label).toBe("Libro A");
  });

  it("conserva la note de un bloque-subsaga que casa con la paleta, y sus metadatos de bloque", () => {
    const palette = [blockPaletteEntry("s:guardia", "La Guardia", "guardia")];
    const entries: RawRouteEntry[] = [entry({ position: 1, childSagaId: "guardia", note: "empieza aquí" })];

    const draft = hydrateRouteDraft(entries, palette);

    expect(draft[0].entry.note).toBe("empieza aquí");
    expect(draft[0].accent).toBe("beige");
    expect(draft[0].memberCount).toBe(3);
  });

  it("una entrada sin nota se hidrata con note: null aunque la paleta también lo traiga null", () => {
    const palette = [itemPaletteEntry("i:book:a", "Libro A", "book", "a")];
    const entries: RawRouteEntry[] = [entry({ position: 1, itemType: "book", itemId: "a", note: null })];

    const draft = hydrateRouteDraft(entries, palette);

    expect(draft[0].entry.note).toBeNull();
  });

  it("una entrada huérfana (ya no está en la paleta) conserva su note vía fallback", () => {
    const entries: RawRouteEntry[] = [
      entry({ position: 1, itemType: "book", itemId: "borrado", note: "nota huérfana" }),
    ];

    const draft = hydrateRouteDraft(entries, []);

    expect(draft).toHaveLength(1);
    expect(draft[0].key).toBe("i:book:borrado");
    expect(draft[0].entry.note).toBe("nota huérfana");
    expect(draft[0].coverUrl).toBeNull();
    expect(draft[0].memberCount).toBeNull();
  });

  it("un bloque huérfano (subsaga ya no está en la paleta) usa memberCount 0, no null", () => {
    const entries: RawRouteEntry[] = [entry({ position: 1, childSagaId: "borrada", note: null })];

    const draft = hydrateRouteDraft(entries, []);

    expect(draft[0].key).toBe("s:borrada");
    expect(draft[0].memberCount).toBe(0);
  });

  it("ordena por position independientemente del orden de entrada", () => {
    const entries: RawRouteEntry[] = [
      entry({ position: 2, itemType: "book", itemId: "b" }),
      entry({ position: 1, itemType: "book", itemId: "a" }),
    ];

    const draft = hydrateRouteDraft(entries, []);

    expect(draft.map((d) => d.key)).toEqual(["i:book:a", "i:book:b"]);
  });
});
```

- [ ] **Step 2: Ejecutar y comprobar que falla (el tipo aún no tiene los campos nuevos)**

Run: `npx vitest run src/lib/sagas/hydrate-route-draft.test.ts`
Expected: FAIL — errores de tipo (`accent`/`memberCount`/`coverUrl` no existen en `RouteEditorItem`) o, si TS no bloquea vitest, aserciones `undefined` donde se esperaba `null`/`"beige"`/`3`.

- [ ] **Step 3: Actualizar el tipo y la función**

Reemplazar el contenido íntegro de `src/lib/sagas/hydrate-route-draft.ts`:

```ts
import type { ItemType } from "@/lib/catalog/types";
import type { SagaAccentToken } from "./accents";
import type { SagaItemRole } from "./types";
import type { RawRouteEntry } from "./route-types";

/** Un ítem del borrador del editor: la key estable, la entrada cruda que se
 *  envía al guardar, y los metadatos a pintar. Un paso es ítem O bloque
 *  (nunca los dos, lo decide `entry.childSagaId`), pero se declara plano en
 *  vez de como unión discriminada: `RawRouteEntry` ya usa este mismo
 *  criterio (campos nulos según el caso) y el resto del editor desestructura
 *  `RouteEditorItem` dando por hecho un único tipo. */
export type RouteEditorItem = {
  key: string;
  label: string;
  /** Solo en un paso-ítem (`entry.childSagaId === null`). */
  coverUrl: string | null;
  itemType: ItemType | null;
  role: SagaItemRole | null;
  /** Solo en un paso-bloque (`entry.childSagaId !== null`). */
  accent: SagaAccentToken | null;
  memberCount: number | null;
  entry: Omit<RawRouteEntry, "position">;
};

export const keyOfRouteEntry = (e: Omit<RawRouteEntry, "position">) =>
  e.childSagaId ? `s:${e.childSagaId}` : `i:${e.itemType}:${e.itemId}`;

/**
 * Hidrata el borrador del editor a partir de las entradas guardadas y la
 * paleta disponible (obras + subsagas del subárbol).
 *
 * Para cada entrada guardada se busca su ítem de paleta por key (misma obra o
 * subsaga) para heredar sus metadatos — pero la `note` SIEMPRE tiene que venir
 * de la entrada real (`e.note`), nunca de la paleta: `page.tsx` construye la
 * paleta con `note: null` a propósito (no es una nota "por defecto", es un
 * placeholder para pasos que aún no están en el borrador). Si aquí se
 * devolviera el objeto de la paleta tal cual, `save()` reenviaría `note: null`
 * en el full-replace y borraría la nota real de cada paso ya guardado
 * (hallazgo Important de la revisión final de rama).
 *
 * Una entrada huérfana (su obra/subsaga ya no está en la paleta — se quitó de
 * la saga) conserva su `note` vía un fallback mínimo, sin portada ni acento:
 * mejor una fila fea que perder la nota del curador.
 */
export function hydrateRouteDraft(entries: RawRouteEntry[], palette: RouteEditorItem[]): RouteEditorItem[] {
  return entries
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((e) => {
      const k = keyOfRouteEntry(e);
      const p = palette.find((x) => x.key === k);
      if (p) return { ...p, entry: { ...p.entry, note: e.note } };
      return {
        key: k,
        label: k,
        coverUrl: null,
        itemType: e.itemType,
        role: null,
        accent: null,
        memberCount: e.childSagaId ? 0 : null,
        entry: e,
      };
    });
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npx vitest run src/lib/sagas/hydrate-route-draft.test.ts`
Expected: PASS — 6 tests verdes.

- [ ] **Step 5: Typecheck del repo entero (page.tsx aún no se ha actualizado, así que fallará ahí — es esperado hasta el Task 5)**

Run: `npx tsc --noEmit`
Expected: errores SOLO en `src/app/saga/[id]/rutas/[slug]/editar/page.tsx` (la paleta que construye ya no tiene la forma nueva) y en `src/components/saga/editor/route-editor.tsx` (usa el `RouteEditorItem` viejo). Ningún otro fichero debería fallar. Si aparece algo más, investigar antes de continuar.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/hydrate-route-draft.ts src/lib/sagas/hydrate-route-draft.test.ts
git commit -m "feat(itinerarios): RouteEditorItem lleva portada, tipo, rol, acento y recuento"
```

---

## Task 4: Claves de traducción nuevas

Se añaden ahora, antes de escribir los componentes que las usan (Tasks 6-10), para que ningún componente quede momentáneamente con texto vacío durante el desarrollo.

**Files:**
- Modify: `messages/es.json`

**Interfaces:**
- Produces: claves nuevas bajo `sagaEditor`, consumidas por `useTranslations("sagaEditor")` en Tasks 6-10.

- [ ] **Step 1: Insertar las claves nuevas**

En `messages/es.json`, dentro del objeto `sagaEditor` (el mismo namespace de `routeStepNoteLabel` etc., visible en torno a la línea 1176), justo después de la línea `"routeStepsSaving": "Guardando…",` e inmediatamente ANTES de `"routeErrors": {`, insertar:

```json
    "routeStepBlockMeta": "Bloque · {count, plural, =1 {1 obra} other {# obras}} · se despliega al leerlo",
    "routeStepAddNote": "Nota",
    "routeStepNoteWriting": "Escribiendo",
    "routeStepNoteSaved": "Nota del curador",
    "routeStepAddSteps": "Añadir pasos",
    "routeStepsEmptyTitle": "Este itinerario aún no tiene pasos",
    "routeStepsEmptyBody": "Añade obras o subsagas en el orden en que quieres que se lean. Hasta que tenga un paso no se le ofrece a ningún lector.",
    "routeStepsTitle": "Pasos",
    "routeAddSheetTitle": "Añadir pasos",
    "routeAddSheetCaption": "De {sagaName}",
    "routeAddSearchPlaceholder": "Buscar en la saga…",
    "routeAddGroupSubsagas": "Subsagas",
    "routeAddGroupItems": "Obras",
    "routeAddAlreadyIn": "Ya en el itinerario",
    "routeAddNoResults": "Nada con ese nombre en esta saga.",
    "routeDiffNone": "Sin cambios",
    "routeDiffTotal": "{count, plural, =1 {1 cambio sin guardar} other {# cambios sin guardar}}",
    "routeDiffAdded": "{count, plural, =1 {1 añadido} other {# añadidos}}",
    "routeDiffRemoved": "{count, plural, =1 {1 quitado} other {# quitados}}",
    "routeDiffMoved": "{count, plural, =1 {1 movido} other {# movidos}}",
    "routeDiffNoted": "{count, plural, =1 {1 nota} other {# notas}}",
    "routePreviewTitle": "Cómo se leerá",
    "routePreviewEmpty": "Añade pasos para ver aquí el orden.",
```

El resto de claves ya existentes (`routeStepUp`, `routeStepDown`, `routeStepRemove`, `routeStepNoteLabel`, `routeStepNotePlaceholder`, `routeStepsSave`, `routeStepsSaving`, `routeErrors.*`, `itemType.*`, `role.*`, `routesTitle`, `routesBack`, `close`) se reutilizan tal cual — no se tocan.

- [ ] **Step 2: Verificar que el JSON sigue siendo válido**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json', 'utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add messages/es.json
git commit -m "i18n(itinerarios): claves del editor de pasos rediseñado"
```

---

## Task 5: `page.tsx` construye la paleta enriquecida

`page.tsx` construye hoy la paleta con solo `key`/`label`/`entry`. Pasa a incluir `coverUrl`/`itemType`/`role` para los ítems (ya vienen en `DetailMember`, cero query nueva) y `accent`/`memberCount` para los bloques-subsaga (de `detail.childRefs` + `detail.groups`, mismo criterio de resolución de acento que usa `route-view.tsx`).

**Files:**
- Modify: `src/app/saga/[id]/rutas/[slug]/editar/page.tsx`

**Interfaces:**
- Consumes: `RouteEditorItem` de `@/lib/sagas/hydrate-route-draft` (Task 3), `isSagaAccentToken`/`SagaAccentToken` de `@/lib/sagas/accents`, `detail.childRefs: SagaChildRef[]`, `detail.groups: MemberGroup[]` (ya existentes en `getSagaDetail`).
- Produces: prop `palette: RouteEditorItem[]` completa que Task 11 (`route-editor.tsx`) recibe sin cambios de contrato, y las props nuevas `routeName`/`sagaName` que Task 11 exige.

- [ ] **Step 1: Reemplazar el bloque de construcción de la paleta y la llamada a `RouteEditor`**

En `src/app/saga/[id]/rutas/[slug]/editar/page.tsx`, añadir el import de acentos junto a los existentes:

```tsx
import { isSagaAccentToken } from "@/lib/sagas/accents";
```

Reemplazar desde el comentario `// Paleta y "¿es descendiente de esta saga?" salen de detail.childRefs —` hasta el `return (...)` final por:

```tsx
  // Paleta y "¿es descendiente de esta saga?" salen de detail.childRefs —
  // TODOS los descendientes, tengan o no miembros—, no de detail.groups.
  // groupMembers solo crea grupo para una hija con al menos un miembro
  // (comentario en get-saga-detail.ts / hallazgo 2 de la Task 6): si la
  // paleta o descendantIds salieran de `groups`, una subsaga vacía sería
  // indistinguible de una borrada, desaparecería como opción de bloque, y
  // validateRouteDraft rechazaría como "foreignBlock" un bloque legítimo a
  // esa subsaga si ya estuviera guardado en un itinerario existente.
  const descendantIds = detail.childRefs.map((c) => c.id);

  // Acento y recuento de cada bloque-subsaga: mismo criterio de resolución
  // que route-view.tsx (si la subsaga tiene grupo en la ficha, ese acento
  // manda; si no tiene grupo — sin miembros, la rotación de groupMembers no
  // la cubre —, su accent_color persistido si es válido, o beige).
  const groupAccentBySagaId = new Map(
    detail.groups.flatMap((g) => (g.sagaId ? [[g.sagaId, g.accent] as const] : [])),
  );
  const groupMemberCountBySagaId = new Map(
    detail.groups.flatMap((g) => (g.sagaId ? [[g.sagaId, g.members.length] as const] : [])),
  );

  const palette: RouteEditorItem[] = [
    ...detail.childRefs.map((c) => ({
      key: `s:${c.id}`,
      label: c.name,
      coverUrl: null,
      itemType: null,
      role: null,
      accent: groupAccentBySagaId.get(c.id) ?? (isSagaAccentToken(c.accentColor) ? c.accentColor : "beige"),
      memberCount: groupMemberCountBySagaId.get(c.id) ?? 0,
      entry: { itemType: null, itemId: null, childSagaId: c.id, note: null },
    })),
    ...detail.groups.flatMap((g) =>
      g.members.map((m) => ({
        key: `i:${m.itemType}:${m.itemId}`,
        label: m.title,
        coverUrl: m.coverUrl,
        itemType: m.itemType,
        role: m.role,
        accent: null,
        memberCount: null,
        entry: { itemType: m.itemType, itemId: m.itemId, childSagaId: null, note: null },
      })),
    ),
  ];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:max-w-none lg:p-0">
      <RouteEditor
        routeId={route.id}
        routeName={route.name}
        sagaId={id}
        sagaName={detail.saga.name}
        descendantIds={descendantIds}
        initialEntries={entries}
        palette={palette}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores en `page.tsx`. `route-editor.tsx` seguirá fallando (props `routeName`/`sagaName` que aún no acepta) hasta el Task 11 — esperado.

- [ ] **Step 3: Commit**

```bash
git add src/app/saga/\[id\]/rutas/\[slug\]/editar/page.tsx
git commit -m "feat(itinerarios): la paleta del editor lleva portada, tipo, rol, acento y recuento"
```

---

## Task 6: `step-row.tsx` — la fila de un paso

Número, portada (o barra de acento + recuento si es bloque), título, chip de tipo, chip de rol, `↑↓✕`, y el «+ Nota» que solo ocupa sitio cuando existe o se está escribiendo.

**Files:**
- Create: `src/components/saga/editor/step-row.tsx`

**Interfaces:**
- Consumes: `RouteEditorItem` de `@/lib/sagas/hydrate-route-draft` (Task 3), `SAGA_ACCENT` de `@/lib/sagas/accents`.
- Produces: `StepRow({ item, index, isFirst, isLast, onMove, onRemove, onNoteChange })` — Task 9 y Task 10 lo montan por cada elemento de `draft`.

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { RouteEditorItem } from "@/lib/sagas/hydrate-route-draft";

// CHECK de BD (20260723_saga_routes.sql): char_length(note) <= 200. Se
// respeta aquí con maxLength para que el curador vea el límite en el input
// en vez de descubrirlo con un error de guardado.
const NOTE_MAX_LENGTH = 200;

/** Una fila del editor de pasos: ítem (portada, tipo, rol) o bloque-subsaga
 *  (barra de acento, recuento). La nota es un «+ Nota» que solo ocupa sitio
 *  cuando existe o se está escribiendo — el diseño anterior mostraba un
 *  input vacío bajo CADA paso, casi siempre sin usar. */
export function StepRow({
  item,
  index,
  isFirst,
  isLast,
  onMove,
  onRemove,
  onNoteChange,
}: {
  item: RouteEditorItem;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onNoteChange: (note: string | null) => void;
}) {
  const t = useTranslations("sagaEditor");
  const [noteOpen, setNoteOpen] = useState(item.entry.note !== null);
  const isBlock = item.entry.childSagaId !== null;
  const accent = item.accent ? SAGA_ACCENT[item.accent] : null;

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span className="w-6 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
          {String(index + 1).padStart(2, "0")}
        </span>

        {isBlock ? (
          <span className={`h-8 w-1 shrink-0 rounded-full ${accent?.tick ?? "bg-surface-muted"}`} aria-hidden />
        ) : item.coverUrl ? (
          <Image
            src={item.coverUrl}
            alt=""
            width={26}
            height={38}
            className="h-[38px] w-[26px] shrink-0 rounded object-cover"
          />
        ) : (
          <span className="h-[38px] w-[26px] shrink-0 rounded bg-surface-muted" aria-hidden />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight">{item.label}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {isBlock ? (
              <span className="font-mono text-[9px] uppercase tracking-wide text-foreground-faint">
                {t("routeStepBlockMeta", { count: item.memberCount ?? 0 })}
              </span>
            ) : (
              <>
                {item.itemType && (
                  <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                    {t(`itemType.${item.itemType}`)}
                  </span>
                )}
                {item.role && (
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-muted-foreground">
                    {t(`role.${item.role}`)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            aria-label={t("routeStepUp")}
            className="px-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast}
            aria-label={t("routeStepDown")}
            className="px-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            ↓
          </button>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("routeStepRemove")}
          className="shrink-0 px-1.5 text-xs text-status-dropped"
        >
          ✕
        </button>
      </div>

      {noteOpen ? (
        <div className="ml-8 rounded-lg border border-border bg-surface-muted px-2.5 py-2">
          <textarea
            value={item.entry.note ?? ""}
            onChange={(e) => onNoteChange(e.target.value === "" ? null : e.target.value)}
            onBlur={() => {
              if (item.entry.note === null) setNoteOpen(false);
            }}
            maxLength={NOTE_MAX_LENGTH}
            placeholder={t("routeStepNotePlaceholder")}
            aria-label={t("routeStepNoteLabel")}
            rows={2}
            autoFocus
            className="w-full resize-none bg-transparent text-[12px] italic leading-snug text-foreground placeholder:not-italic placeholder:text-foreground-faint focus:outline-none"
          />
          <div className="mt-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-wide text-foreground-faint">
            <span>{item.entry.note ? t("routeStepNoteSaved") : t("routeStepNoteWriting")}</span>
            <b>
              {(item.entry.note ?? "").length}/{NOTE_MAX_LENGTH}
            </b>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="ml-8 self-start text-[11px] font-semibold text-muted-foreground"
        >
          + {t("routeStepAddNote")}
        </button>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `step-row.tsx` (el resto del árbol de `editor/` aún no existe, así que nada lo importa todavía — normal).

- [ ] **Step 3: Commit**

```bash
git add src/components/saga/editor/step-row.tsx
git commit -m "feat(itinerarios): fila de paso con portada, tipo, rol y nota colapsable"
```

---

## Task 7: `add-steps-list.tsx` + `add-steps-sheet.tsx` — buscador de añadir

Buscador con filtro en cliente, subsagas primero y obras después, ✓ en lo ya añadido, «+» que añade al instante. `AddStepsList` es la lista en sí (se monta en la hoja móvil Y en el raíl de escritorio); `AddStepsSheet` es solo el envoltorio de hoja para móvil.

**Files:**
- Create: `src/components/saga/editor/add-steps-list.tsx`
- Create: `src/components/saga/editor/add-steps-sheet.tsx`

**Interfaces:**
- Consumes: `RouteEditorItem` de `@/lib/sagas/hydrate-route-draft` (Task 3), `SAGA_ACCENT` de `@/lib/sagas/accents`, `SheetShell` de `../sheet-shell` (Task 1).
- Produces: `AddStepsList({ palette, inDraftKeys, onAdd })`, `AddStepsSheet({ sagaName, palette, inDraftKeys, onAdd, onClose })` — Task 9 (móvil) monta `AddStepsSheet`; Task 10 (escritorio) monta `AddStepsList` directo.

- [ ] **Step 1: Crear `add-steps-list.tsx`**

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { RouteEditorItem } from "@/lib/sagas/hydrate-route-draft";

/** Normaliza para comparar sin acentos/mayúsculas — mismo criterio de fondo
 *  que `slugify` en `route-actions.ts`, pero sin colapsar a guiones: aquí
 *  solo hace falta comparar texto, no generar una URL. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function Hit({
  item,
  done,
  onAdd,
  t,
}: {
  item: RouteEditorItem;
  done: boolean;
  onAdd: (item: RouteEditorItem) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const isBlock = item.entry.childSagaId !== null;
  const accent = item.accent ? SAGA_ACCENT[item.accent] : null;

  return (
    <button
      type="button"
      onClick={() => !done && onAdd(item)}
      disabled={done}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface-muted disabled:cursor-default"
    >
      {isBlock ? (
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded ${accent?.bg ?? "bg-surface-muted"}`}
          aria-hidden
        />
      ) : item.coverUrl ? (
        <Image src={item.coverUrl} alt="" width={24} height={35} className="h-[35px] w-6 shrink-0 rounded object-cover" />
      ) : (
        <span className="h-[35px] w-6 shrink-0 rounded bg-surface-muted" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{item.label}</span>
        <span className="block font-mono text-[9px] uppercase tracking-wide text-foreground-faint">
          {done
            ? t("routeAddAlreadyIn")
            : isBlock
              ? t("routeStepBlockMeta", { count: item.memberCount ?? 0 })
              : item.itemType && t(`itemType.${item.itemType}`)}
        </span>
      </span>
      <span className={`shrink-0 text-[13px] ${done ? "text-success" : "text-muted-foreground"}`} aria-hidden>
        {done ? "✓" : "+"}
      </span>
    </button>
  );
}

/** Buscador + subsagas primero, obras después, con ✓ en lo ya añadido.
 *  Filtro en cliente: la paleta (obras + subsagas del subárbol) ya viaja
 *  entera desde `page.tsx`, sin ida y vuelta al servidor. Se monta dos veces
 *  (hoja móvil, raíl de escritorio) — presentación pura, sin estado del
 *  borrador: quien lo tiene es `route-editor.tsx`. El «+» añade AL INSTANTE
 *  (no hay selección-luego-confirmar); la hoja no se cierra sola para poder
 *  seguir añadiendo. */
export function AddStepsList({
  palette,
  inDraftKeys,
  onAdd,
}: {
  palette: RouteEditorItem[];
  inDraftKeys: Set<string>;
  onAdd: (item: RouteEditorItem) => void;
}) {
  const t = useTranslations("sagaEditor");
  const [query, setQuery] = useState("");

  const q = normalize(query.trim());
  const subsagas = palette.filter(
    (p) => p.entry.childSagaId !== null && (q === "" || normalize(p.label).includes(q)),
  );
  const items = palette.filter(
    (p) => p.entry.childSagaId === null && (q === "" || normalize(p.label).includes(q)),
  );

  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-2.5 py-2">
        <span aria-hidden className="text-muted-foreground">
          ⌕
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("routeAddSearchPlaceholder")}
          aria-label={t("routeAddSearchPlaceholder")}
          className="w-full bg-transparent text-[13px] text-foreground placeholder:text-foreground-faint focus:outline-none"
        />
      </label>

      {subsagas.length > 0 && (
        <div>
          <h4 className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
            {t("routeAddGroupSubsagas")} <span className="text-foreground-faint">{subsagas.length}</span>
          </h4>
          <div className="grid gap-0.5">
            {subsagas.map((p) => (
              <Hit key={p.key} item={p} done={inDraftKeys.has(p.key)} onAdd={onAdd} t={t} />
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div>
          <h4 className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
            {t("routeAddGroupItems")} <span className="text-foreground-faint">{items.length}</span>
          </h4>
          <div className="grid gap-0.5">
            {items.map((p) => (
              <Hit key={p.key} item={p} done={inDraftKeys.has(p.key)} onAdd={onAdd} t={t} />
            ))}
          </div>
        </div>
      )}

      {subsagas.length === 0 && items.length === 0 && (
        <p className="py-4 text-center text-[12px] text-muted-foreground">{t("routeAddNoResults")}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Crear `add-steps-sheet.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { SheetShell } from "../sheet-shell";
import { AddStepsList } from "./add-steps-list";
import type { RouteEditorItem } from "@/lib/sagas/hydrate-route-draft";

/** Hoja móvil del buscador de pasos (mockup M6). En escritorio el mismo
 *  contenido (`AddStepsList`) vive directo en el raíl, sin esta hoja
 *  (`shell-desktop.tsx`, mockup D2). */
export function AddStepsSheet({
  sagaName,
  palette,
  inDraftKeys,
  onAdd,
  onClose,
}: {
  sagaName: string;
  palette: RouteEditorItem[];
  inDraftKeys: Set<string>;
  onAdd: (item: RouteEditorItem) => void;
  onClose: () => void;
}) {
  const t = useTranslations("sagaEditor");
  return (
    <SheetShell title={t("routeAddSheetTitle")} caption={t("routeAddSheetCaption", { sagaName })} onClose={onClose}>
      <AddStepsList palette={palette} inDraftKeys={inDraftKeys} onAdd={onAdd} />
    </SheetShell>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en los dos ficheros.

- [ ] **Step 4: Commit**

```bash
git add src/components/saga/editor/add-steps-list.tsx src/components/saga/editor/add-steps-sheet.tsx
git commit -m "feat(itinerarios): buscador de anadir pasos, compartido entre hoja y rail"
```

---

## Task 8: `route-savebar.tsx` — recuento de cambios + validación

Sustituye el `<p>` rojo suelto. Muestra el total de cambios sin guardar por categoría (usa `computeRouteDiff`, Task 2) y, si lo hay, el error de validación devuelto por `saveRoute`.

**Files:**
- Create: `src/components/saga/editor/route-savebar.tsx`

**Interfaces:**
- Consumes: `RouteDiff` de `@/lib/sagas/compute-route-diff` (Task 2).
- Produces: `RouteSavebar({ diff, error, pending, onSave })` — Task 9 y Task 10 lo montan una vez cada uno.

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import { useTranslations } from "next-intl";
import type { RouteDiff } from "@/lib/sagas/compute-route-diff";

/** Barra de guardado: recuento de cambios por categoría + el error de
 *  validación integrado (mockup M7) — sustituye el `<p>` rojo suelto del
 *  editor anterior. Con `diff.total === 0` el botón se deshabilita: no hay
 *  nada que enviar. */
export function RouteSavebar({
  diff,
  error,
  pending,
  onSave,
}: {
  diff: RouteDiff;
  error: string | null;
  pending: boolean;
  onSave: () => void;
}) {
  const t = useTranslations("sagaEditor");
  const parts = [
    diff.added > 0 && t("routeDiffAdded", { count: diff.added }),
    diff.removed > 0 && t("routeDiffRemoved", { count: diff.removed }),
    diff.moved > 0 && t("routeDiffMoved", { count: diff.moved }),
    diff.noted > 0 && t("routeDiffNoted", { count: diff.noted }),
  ].filter((p): p is string => Boolean(p));

  const canSave = diff.total > 0 && !pending;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
      {error && (
        <p role="alert" className="text-[11.5px] text-status-dropped">
          {t(`routeErrors.${error}`)}
        </p>
      )}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <b className="block text-[12.5px] font-semibold">
            {diff.total === 0 ? t("routeDiffNone") : t("routeDiffTotal", { count: diff.total })}
          </b>
          {parts.length > 0 && (
            <span className="mt-0.5 block truncate font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
              {parts.join(" · ")}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="shrink-0 rounded-lg bg-foreground px-3 py-1.5 text-[11.5px] font-semibold text-background disabled:opacity-50"
        >
          {pending ? t("routeStepsSaving") : t("routeStepsSave")}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `route-savebar.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/saga/editor/route-savebar.tsx
git commit -m "feat(itinerarios): savebar con recuento de cambios y aviso de validacion"
```

---

## Task 9: `shell-mobile.tsx` (mockups M5-M7)

Cáscara de una columna: cabecera, lista de pasos (o estado vacío), botón de añadir, savebar, y la hoja de añadir montada condicionalmente.

**Files:**
- Create: `src/components/saga/editor/shell-mobile.tsx`

**Interfaces:**
- Consumes: `StepRow` (Task 6), `RouteSavebar` (Task 8), `AddStepsSheet` (Task 7), `RouteEditorItem` de `@/lib/sagas/hydrate-route-draft`, `RouteDiff` de `@/lib/sagas/compute-route-diff`.
- Produces: `EditorShellMobile({ routeName, sagaName, stepsLabel, draft, palette, diff, error, pending, addOpen, onMove, onRemove, onNoteChange, onOpenAdd, onCloseAdd, onAdd, onSave })` — Task 11 lo monta dentro de `<div className="lg:hidden">`.

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { StepRow } from "./step-row";
import { RouteSavebar } from "./route-savebar";
import { AddStepsSheet } from "./add-steps-sheet";
import type { RouteEditorItem } from "@/lib/sagas/hydrate-route-draft";
import type { RouteDiff } from "@/lib/sagas/compute-route-diff";

export function EditorShellMobile({
  routeName,
  sagaName,
  stepsLabel,
  draft,
  palette,
  diff,
  error,
  pending,
  addOpen,
  onMove,
  onRemove,
  onNoteChange,
  onOpenAdd,
  onCloseAdd,
  onAdd,
  onSave,
}: {
  routeName: string;
  sagaName: string;
  stepsLabel: string;
  draft: RouteEditorItem[];
  palette: RouteEditorItem[];
  diff: RouteDiff;
  error: string | null;
  pending: boolean;
  addOpen: boolean;
  onMove: (index: number, delta: number) => void;
  onRemove: (key: string) => void;
  onNoteChange: (key: string, note: string | null) => void;
  onOpenAdd: () => void;
  onCloseAdd: () => void;
  onAdd: (item: RouteEditorItem) => void;
  onSave: () => void;
}) {
  const t = useTranslations("sagaEditor");
  const inDraftKeys = new Set(draft.map((d) => d.key));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">{routeName}</h1>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {sagaName} · {stepsLabel}
        </p>
      </div>

      {draft.length === 0 ? (
        <div className="rounded-xl border border-dashed border-foreground/25 bg-surface/45 px-4 py-6 text-center">
          <b className="mb-1.5 block font-serif text-[15px] font-semibold">{t("routeStepsEmptyTitle")}</b>
          <p className="mx-auto mb-3 max-w-[320px] text-[12px] leading-snug text-muted-foreground">
            {t("routeStepsEmptyBody")}
          </p>
          <button
            type="button"
            onClick={onOpenAdd}
            className="rounded-lg bg-accent px-3 py-1.5 text-[11.5px] font-semibold text-accent-foreground"
          >
            + {t("routeStepAddSteps")}
          </button>
        </div>
      ) : (
        <>
          <ol className="flex flex-col gap-1.5">
            {draft.map((d, i) => (
              <StepRow
                key={d.key}
                item={d}
                index={i}
                isFirst={i === 0}
                isLast={i === draft.length - 1}
                onMove={(delta) => onMove(i, delta)}
                onRemove={() => onRemove(d.key)}
                onNoteChange={(note) => onNoteChange(d.key, note)}
              />
            ))}
          </ol>
          <button
            type="button"
            onClick={onOpenAdd}
            className="w-full rounded-lg border border-dashed border-border py-2 text-center text-[11.5px] font-semibold text-muted-foreground"
          >
            + {t("routeStepAddSteps")}
          </button>
        </>
      )}

      <RouteSavebar diff={diff} error={error} pending={pending} onSave={onSave} />

      {addOpen && (
        <AddStepsSheet
          sagaName={sagaName}
          palette={palette}
          inDraftKeys={inDraftKeys}
          onAdd={onAdd}
          onClose={onCloseAdd}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `shell-mobile.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/saga/editor/shell-mobile.tsx
git commit -m "feat(itinerarios): cascara movil del editor de pasos (M5-M7)"
```

---

## Task 10: `shell-desktop.tsx` (mockup D2)

Dos columnas: lista de pasos a la izquierda, raíl a la derecha con el buscador de añadir (directo, sin hoja) y la vista previa «Cómo se leerá».

**Files:**
- Create: `src/components/saga/editor/shell-desktop.tsx`

**Interfaces:**
- Consumes: `StepRow` (Task 6), `RouteSavebar` (Task 8), `AddStepsList` (Task 7), `sagaHref` de `@/lib/catalog/item-href`, `RouteEditorItem`/`RouteDiff` como en Task 9.
- Produces: `EditorShellDesktop({ sagaId, sagaName, routeName, stepsLabel, draft, palette, diff, error, pending, onMove, onRemove, onNoteChange, onAdd, onSave })` — Task 11 lo monta dentro de `<div className="hidden lg:block">`.

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { sagaHref } from "@/lib/catalog/item-href";
import { StepRow } from "./step-row";
import { RouteSavebar } from "./route-savebar";
import { AddStepsList } from "./add-steps-list";
import type { RouteEditorItem } from "@/lib/sagas/hydrate-route-draft";
import type { RouteDiff } from "@/lib/sagas/compute-route-diff";

export function EditorShellDesktop({
  sagaId,
  sagaName,
  routeName,
  stepsLabel,
  draft,
  palette,
  diff,
  error,
  pending,
  onMove,
  onRemove,
  onNoteChange,
  onAdd,
  onSave,
}: {
  sagaId: string;
  sagaName: string;
  routeName: string;
  stepsLabel: string;
  draft: RouteEditorItem[];
  palette: RouteEditorItem[];
  diff: RouteDiff;
  error: string | null;
  pending: boolean;
  onMove: (index: number, delta: number) => void;
  onRemove: (key: string) => void;
  onNoteChange: (key: string, note: string | null) => void;
  onAdd: (item: RouteEditorItem) => void;
  onSave: () => void;
}) {
  const t = useTranslations("sagaEditor");
  const inDraftKeys = new Set(draft.map((d) => d.key));

  return (
    <div className="pb-6">
      <header className="flex items-center gap-4 border-b border-border bg-surface px-6 py-4">
        <Link
          href={`${sagaHref(sagaId)}/rutas`}
          aria-label={t("routesBack")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-[15px]"
        >
          ‹
        </Link>
        <div className="min-w-0 flex-1">
          <p className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-foreground-faint">
            {sagaName} · {t("routesTitle")}
          </p>
          <h1 className="font-serif text-[23px] font-semibold leading-tight">{routeName}</h1>
        </div>
      </header>

      <div className="grid grid-cols-[1fr_350px] gap-6 px-6 py-5">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
              {t("routeStepsTitle")}
            </h2>
            <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">{stepsLabel}</span>
          </div>

          {draft.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/25 bg-surface/45 px-4 py-6 text-center">
              <b className="mb-1.5 block font-serif text-[15px] font-semibold">{t("routeStepsEmptyTitle")}</b>
              <p className="mx-auto max-w-[320px] text-[12px] leading-snug text-muted-foreground">
                {t("routeStepsEmptyBody")}
              </p>
            </div>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {draft.map((d, i) => (
                <StepRow
                  key={d.key}
                  item={d}
                  index={i}
                  isFirst={i === 0}
                  isLast={i === draft.length - 1}
                  onMove={(delta) => onMove(i, delta)}
                  onRemove={() => onRemove(d.key)}
                  onNoteChange={(note) => onNoteChange(d.key, note)}
                />
              ))}
            </ol>
          )}

          <div className="mt-3">
            <RouteSavebar diff={diff} error={error} pending={pending} onSave={onSave} />
          </div>
        </div>

        <aside className="grid content-start gap-3.5">
          <section className="rounded-xl border border-border bg-surface p-3.5">
            <h3 className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
              {t("routeAddSheetTitle")}
            </h3>
            <AddStepsList palette={palette} inDraftKeys={inDraftKeys} onAdd={onAdd} />
          </section>

          <section className="rounded-xl border border-border bg-surface p-3.5">
            <h3 className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
              {t("routePreviewTitle")}
            </h3>
            <ol className="grid gap-1.5">
              {draft.map((d, i) => (
                <li key={d.key} className="flex items-center gap-2 text-[12px]">
                  <span className="w-5 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{d.label}</span>
                </li>
              ))}
              {draft.length === 0 && <li className="text-[11.5px] text-muted-foreground">{t("routePreviewEmpty")}</li>}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `shell-desktop.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/saga/editor/shell-desktop.tsx
git commit -m "feat(itinerarios): cascara de escritorio del editor de pasos (D2)"
```

---

## Task 11: `route-editor.tsx` — el orquestador (integración final)

Reescribe el fichero existente. Único dueño del estado (`draft`, snapshot `initial`, `addOpen`), monta las dos cáscaras a la vez ocultas por breakpoint, calcula el diff y guarda.

**Files:**
- Modify: `src/components/saga/editor/route-editor.tsx`

**Interfaces:**
- Consumes: `hydrateRouteDraft`/`RouteEditorItem` (Task 3), `computeRouteDiff` (Task 2), `EditorShellMobile` (Task 9), `EditorShellDesktop` (Task 10), `saveRoute` de `@/lib/sagas/route-actions` (sin cambios).
- Produces: `RouteEditor({ routeId, routeName, sagaId, sagaName, descendantIds, initialEntries, palette })` — Task 5 (`page.tsx`) ya lo llama con esta firma.

- [ ] **Step 1: Reemplazar el contenido íntegro del fichero**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveRoute } from "@/lib/sagas/route-actions";
import type { RawRouteEntry } from "@/lib/sagas/route-types";
import { hydrateRouteDraft, type RouteEditorItem } from "@/lib/sagas/hydrate-route-draft";
import { computeRouteDiff } from "@/lib/sagas/compute-route-diff";
import { EditorShellMobile } from "./shell-mobile";
import { EditorShellDesktop } from "./shell-desktop";

export type { RouteEditorItem };

/** Editor de los PASOS de un itinerario (issue #261, rediseño Paper de
 *  M5-M7 + D2 sobre #263). Único dueño del estado: `draft`, el snapshot
 *  `initial` (para el diff de la savebar) y si la hoja de añadir está
 *  abierta. Monta las dos cáscaras a la vez y las oculta por breakpoint —
 *  regla de los dos árboles, mismo patrón que `routes/routes-manager.tsx`.
 *  La hoja de añadir es exclusiva de la cáscara móvil (el escritorio usa el
 *  raíl en su lugar), así que se monta dentro de `EditorShellMobile` sin
 *  romper esa regla: nunca hace falta que se vea mientras la cáscara activa
 *  es la de escritorio. */
export function RouteEditor({
  routeId,
  routeName,
  sagaId,
  sagaName,
  descendantIds,
  initialEntries,
  palette,
}: {
  routeId: string;
  routeName: string;
  sagaId: string;
  sagaName: string;
  descendantIds: string[];
  initialEntries: RawRouteEntry[];
  /** Obras del subárbol + subsagas, para añadir pasos. */
  palette: RouteEditorItem[];
}) {
  const t = useTranslations("sagaEditor");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Snapshot inicial fijo: el diff de la savebar compara SIEMPRE contra lo
  // que había al abrir el editor, no contra el último guardado dentro de la
  // misma sesión. Guardar dispara `revalidateSagaPage`, que remonta este
  // componente con datos frescos — un snapshot nuevo llega solo.
  const [initial] = useState<RouteEditorItem[]>(() => hydrateRouteDraft(initialEntries, palette));
  const [draft, setDraft] = useState<RouteEditorItem[]>(initial);

  const diff = computeRouteDiff(
    initial.map((d) => ({ key: d.key, note: d.entry.note })),
    draft.map((d) => ({ key: d.key, note: d.entry.note })),
  );

  const move = (i: number, delta: number) =>
    setDraft((d) => {
      const j = i + delta;
      if (j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const remove = (key: string) => setDraft((d) => d.filter((x) => x.key !== key));

  // String vacía se guarda como null, no como "": así una nota borrada por
  // completo vuelve a ser "sin nota" en vez de una cadena vacía persistida.
  const setNote = (key: string, note: string | null) =>
    setDraft((d) => d.map((x) => (x.key === key ? { ...x, entry: { ...x.entry, note } } : x)));

  const add = (item: RouteEditorItem) =>
    setDraft((d) => (d.some((x) => x.key === item.key) ? d : [...d, item]));

  const save = () =>
    startTransition(async () => {
      // Renumerar 1..n SIEMPRE antes de enviar: así el reordenado no puede
      // dejar huecos y la validación de posiciones consecutivas nunca falla
      // por un motivo que el curador no puede ver ni corregir.
      const entries: RawRouteEntry[] = draft.map((d, i) => ({ ...d.entry, position: i + 1 }));
      const res = await saveRoute(routeId, sagaId, entries, descendantIds);
      setError(res.error ?? null);
    });

  const stepsLabel = t("routeStepsCount", { count: draft.length });

  const shared = {
    sagaName,
    routeName,
    stepsLabel,
    draft,
    palette,
    diff,
    error,
    pending,
    onMove: move,
    onRemove: remove,
    onNoteChange: setNote,
    onAdd: add,
    onSave: save,
  };

  return (
    <>
      <div className="hidden lg:block">
        <EditorShellDesktop sagaId={sagaId} {...shared} />
      </div>
      <div className="lg:hidden">
        <EditorShellMobile
          addOpen={addOpen}
          onOpenAdd={() => setAddOpen(true)}
          onCloseAdd={() => setAddOpen(false)}
          {...shared}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Typecheck del repo entero — ahora debe estar limpio**

Run: `npx tsc --noEmit`
Expected: sin errores en ningún fichero del árbol `saga/editor` ni en `page.tsx`.

- [ ] **Step 3: Lint del repo entero**

Run: `npm run lint`
Expected: sin warnings nuevos.

- [ ] **Step 4: Suite de vitest completa**

Run: `npm run test`
Expected: PASS — incluye `compute-route-diff.test.ts` (Task 2), `hydrate-route-draft.test.ts` (Task 3) y el resto de la suite existente sin regresiones.

- [ ] **Step 5: Commit**

```bash
git add src/components/saga/editor/route-editor.tsx
git commit -m "feat(itinerarios): editor de pasos rediseñado (M5-M7+D2) — orquestador"
```

---

## Task 12: Verificación manual y e2e

**Files:**
- Modify: `e2e/sagas-itinerarios.spec.ts`

**Interfaces:**
- Consumes: la pantalla completa (Tasks 1-11) ya integrada; el seed QA `[QA Itinerarios]` ya sembrado en dev (ver cabecera del fichero: `UNIVERSO_ID`, saga `[QA Itinerarios] La Guardia` con 2 obras).

- [ ] **Step 1: Verificación manual en navegador (qa-verifier)**

Antes de tocar el e2e, correr el flujo completo a mano en `npm run dev` contra `/saga/33d7bb93-da3d-4453-a6da-1722beff134d/rutas/la-guardia/editar` logueado como el colaborador de pruebas (credenciales en la cabecera del spec):

- Móvil (viewport estrecho): la fila muestra portada/tipo/rol; «+ Nota» abre el textarea con contador; el buscador de añadir abre en hoja, agrupa subsagas/obras, marca ✓ lo ya añadido y añade al pulsar «+» sin cerrar la hoja; la savebar cuenta añadidos/quitados/movidos/notas y el botón se deshabilita con «Sin cambios»; guardar con 0 pasos en un itinerario designado muestra el error `readingOrderEmpty` en la savebar.
- Escritorio (`lg:` o más ancho): dos columnas, raíl con buscador directo (sin hoja) y panel «Cómo se leerá» que refleja el borrador en vivo.

Si algo no coincide con lo descrito, volver a la task correspondiente antes de continuar — no avanzar al e2e con un fallo manual sin resolver.

- [ ] **Step 2: Añadir un test e2e del flujo de añadir/quitar/guardar**

Añadir al final de `e2e/sagas-itinerarios.spec.ts`, dentro de `test.describe("itinerarios de lectura", ...)`, antes de su cierre:

```ts
  // Editor de PASOS (issue #261, rediseño M5-M7+D2). Usa el mismo seed que el
  // resto del fichero: la subsaga "[QA Itinerarios] La Guardia" (2 obras) NO
  // está en el itinerario "la-guardia" (que hoy solo tiene su propio bloque);
  // añadirla y quitarla dentro del mismo test deja el seed intacto para la
  // próxima pasada.
  test("anadir un paso desde el buscador y quitarlo deja el borrador limpio", async ({ page }) => {
    await loginAsCollaborator(page);
    await page.goto(`/saga/${UNIVERSO_ID}/rutas/la-guardia/editar`);

    await expect(page.getByRole("heading", { name: "La Guardia" })).toBeVisible();

    await page.getByRole("button", { name: /Añadir pasos/ }).first().click();
    await page.getByPlaceholder("Buscar en la saga…").fill("Ronda de noche");
    await page.getByRole("button", { name: /Ronda de noche/ }).click();

    await expect(page.getByText("1 añadido")).toBeVisible();

    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Quitar" })
      .last()
      .click();

    await expect(page.getByText("Sin cambios")).toBeVisible();
  });
```

- [ ] **Step 3: Ejecutar el e2e (reutiliza el dev server ya levantado — no arrancar uno nuevo)**

Run: `npx playwright test e2e/sagas-itinerarios.spec.ts`
Expected: PASS — todos los tests del fichero, incluido el nuevo.

- [ ] **Step 4: Commit**

```bash
git add e2e/sagas-itinerarios.spec.ts
git commit -m "test(itinerarios): e2e de anadir y quitar un paso en el editor rediseñado"
```

---

## Cierre (fuera de las tasks, según AGENTS.md)

Al terminar la Task 12: actualizar `docs/requirements/backlog.md` (marcar la entrada de este rediseño si existe una), y si la revisión descubre algo pendiente o dudoso, abrirlo como issue — no dejarlo en un comentario de PR. `docs/architecture/graph.json` no necesita tocarse: esta feature no añade ni mueve ficheros de flujo end-to-end fuera del árbol que ya describe (mismo criterio que #263).
