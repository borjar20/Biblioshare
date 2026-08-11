# Estado vacío de la columna personal del Inicio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la columna personal del Inicio (`TodayBlock`) nunca quede vacía: una escalera de estados (en curso → próxima lectura → sugerencias de colección → descubrimiento) que se adapta a lo que el usuario tiene.

**Architecture:** `TodayBlock` (servidor) elige rama por una escalera de prioridad de datos y pinta un componente por estado. Reutiliza el server action `updateStatus` (planned/completed → in_progress, ambos limpios sin hoja), `LaterShelf` y el estilo de card existente. Solo cruza a cliente el dato serializable mínimo + etiquetas ya traducidas (mantiene el patrón servidor del bloque).

**Tech Stack:** Next.js (App Router, RSC), next-intl (locale `es` único), Tailwind, Supabase (passes), Vitest (units puros), Playwright (e2e).

## Global Constraints

- **Este NO es el Next.js estándar** — leer `node_modules/next/dist/docs/` antes de usar APIs dudosas (AGENTS.md).
- **Estado vivo del usuario vive en `passes`**, nunca en `library_entries` (congelada) ni `diary_entries`.
- **Todo cambio de status pasa por `updateStatus` → `applyTransition` → `planTransition`.** Nadie más escribe `passes.status`.
- **Locale único `es`**: las claves i18n se añaden solo a `messages/es.json`.
- **No rediseñar** cards existentes más allá de lo necesario. Tema oscuro, serif titulares, mono rótulos, radios `rounded-[12px]`/`[14px]`, `MEDIA_ACCENT`, `shadow-card`/`shadow-cover`.
- **Estado 3 = solo `completed`** (reread inline). `dropped` cae a estado 4.
- **"Empezar" refresca en sitio** (`router.refresh()`), no navega a `/sesion`.
- **Entorno de tests**: el shell usa Node v20 y rompe Vitest — forzar v22 (`fnm use 22` o equivalente) antes de `npm run test`. e2e reutiliza el dev server en el puerto 3000; no levantar un segundo.
- **Antes de editar `TodayBlock`**: `impact({target: "TodayBlock", direction: "upstream"})` y reportar blast radius (CLAUDE.md).

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/lib/stats/dates.ts` (modificar) | + `todayDateLabel()`: "Viernes · 17 jul" reutilizable. |
| `src/lib/stats/rotate-index.ts` (crear) | `rotateIndex(current, length)` puro (wraparound de "Sugerirme otro"). |
| `src/components/stats/today-header.tsx` (crear) | Cabecera compartida: línea de fecha + `<h2>` serif con el título del estado. |
| `src/components/stats/start-button.tsx` (crear) | Botón cliente "Empezar": `updateStatus(...,"in_progress")` + `router.refresh()`. |
| `src/components/stats/empty-discovery.tsx` (crear) | Estado 4: descubrimiento (CTAs Buscar / Explorar). |
| `src/components/stats/collection-suggestions.tsx` (crear) | Estado 3: 2–3 completados con "Empezar". |
| `src/components/stats/next-up-card.tsx` (crear) | Estado 2 (cliente): card destacada, rotación, "Empezar". |
| `src/components/stats/proxima-lectura.tsx` (crear) | Estado 2 (servidor): cabecera + `NextUpCard` + `LaterShelf`. |
| `src/components/stats/today-block.tsx` (modificar) | Escalera de estados; estado 1 usa `TodayHeader`. |
| `messages/es.json` (modificar) | Claves nuevas bajo `today`. |
| `e2e/inicio-estado-vacio.spec.ts` (crear) | Un test por estado (usuario desechable aislado). |

---

### Task 1: Claves i18n

**Files:**
- Modify: `messages/es.json` (bloque `"today"`, tras `"focusMini"` en la línea ~142)

**Interfaces:**
- Produces: claves `today.nextUpTitle`, `today.nextUpSection`, `today.nextUpContext`, `today.startCta`, `today.suggestAnother`, `today.collectionTitle`, `today.emptyTitle`, `today.emptyBody`, `today.emptySearch`, `today.emptyExplore`.

- [ ] **Step 1: Añadir las claves**

En `messages/es.json`, dentro del objeto `"today"`, cambiar la última entrada `"focusMini": "Poner {title} arriba"` para que lleve coma y añadir debajo:

```json
    "focusMini": "Poner {title} arriba",
    "nextUpTitle": "¿Qué te apetece hoy?",
    "nextUpSection": "Tu próxima historia",
    "nextUpContext": "Lo tienes guardado para más tarde",
    "startCta": "Empezar",
    "suggestAnother": "Sugerirme otro",
    "collectionTitle": "¿Qué empezamos?",
    "emptyTitle": "Encuentra algo para disfrutar",
    "emptyBody": "Aún no tienes nada a medias. Busca un título o asómate a tu colección para elegir por dónde seguir.",
    "emptySearch": "Buscar",
    "emptyExplore": "Explorar la colección"
```

- [ ] **Step 2: Verificar que el JSON es válido**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8')); console.log('ok')"`
Expected: imprime `ok` (sin excepción de parseo).

- [ ] **Step 3: Commit**

```bash
git add messages/es.json
git commit -m "i18n(today): claves del estado vacío de la columna personal"
```

---

### Task 2: `todayDateLabel()` + `TodayHeader` (refactor sin cambio de comportamiento)

Extrae la cabecera del estado 1 (fecha + título) para reutilizarla en los cuatro estados. El estado 1 debe verse EXACTAMENTE igual.

**Files:**
- Modify: `src/lib/stats/dates.ts`
- Create: `src/components/stats/today-header.tsx`
- Modify: `src/components/stats/today-block.tsx` (cabecera del estado 1, líneas ~71-93)

**Interfaces:**
- Produces: `todayDateLabel(): string`; `TodayHeader({ title: string })` (async server component).
- Consumes: Task 1 (para los títulos que le pasan los estados; en este task solo `today.title`).

- [ ] **Step 1: Añadir `todayDateLabel()` a `dates.ts`**

Al final de `src/lib/stats/dates.ts`:

```ts
// "Viernes · 17 jul". El día en español va en minúscula; se capitaliza porque
// el frame lo escribe así (y el CSS lo pasa a uppercase de todas formas). La
// misma etiqueta encabeza los cuatro estados del bloque de hoy.
export function todayDateLabel(): string {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "short",
  })
    .format(new Date())
    .replace(",", " ·")
    .replace(/^./, (c) => c.toUpperCase());
}
```

- [ ] **Step 2: Crear `TodayHeader`**

`src/components/stats/today-header.tsx`:

```tsx
import { todayDateLabel } from "@/lib/stats/dates";

// La cabecera del bloque de hoy: la fecha en mono y el título en serif. El
// título cambia por estado ("¿Qué has disfrutado hoy?", "¿Qué te apetece
// hoy?", "¿Qué empezamos?", "Encuentra algo para disfrutar"), así que llega
// como prop ya traducida en vez de resolverse aquí.
export function TodayHeader({ title }: { title: string }) {
  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-muted-foreground">
        {todayDateLabel()}
      </p>
      <h2 className="mt-1.5 font-serif text-[26px] leading-[1.02] font-semibold tracking-[-0.01em]">
        {title}
      </h2>
    </div>
  );
}
```

- [ ] **Step 3: Usar `TodayHeader` en el estado 1 de `TodayBlock`**

En `src/components/stats/today-block.tsx`:

1. Añadir el import: `import { TodayHeader } from "./today-header";`
2. Borrar el cálculo local de `dateLabel` (el bloque `const dateLabel = new Intl.DateTimeFormat(...)...` completo, ~líneas 75-82).
3. Sustituir el `<div>` de cabecera dentro del `return` (el que tiene `{dateLabel}` y `{t("title")}`) por:

```tsx
      <TodayHeader title={t("title")} />
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores (no queda referencia a `dateLabel`).

- [ ] **Step 5: Verificar en el navegador que el estado 1 no cambió**

Con el dev server en :3000 y sesión de la cuenta de pruebas (que tiene ítems en curso), abrir `/`: la cabecera "Viernes · … / ¿Qué has disfrutado hoy?" se ve idéntica a antes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stats/dates.ts src/components/stats/today-header.tsx src/components/stats/today-block.tsx
git commit -m "refactor(today): extrae TodayHeader y todayDateLabel"
```

---

### Task 3: `StartButton` (cliente, compartido)

**Files:**
- Create: `src/components/stats/start-button.tsx`

**Interfaces:**
- Consumes: `updateStatus(itemType, itemId, status, resume?)` de `@/lib/library/manage-actions`.
- Produces: `StartButton({ itemType: ItemType; itemId: string; label: string; className?: string })`.

- [ ] **Step 1: Crear el componente**

`src/components/stats/start-button.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ItemType } from "@/lib/catalog/types";
import { updateStatus } from "@/lib/library/manage-actions";
import { buttonVariants } from "@/components/ui/button";

// "Empezar": marca el ítem como en curso y refresca en sitio. Para un pase
// planned o completed, planTransition devuelve siempre `done` (updateActive o
// archiveAndCreate) — nunca askResume, que solo lo dispara `dropped`, y esos
// no llegan aquí (estado 3 solo sugiere completados). Así que no hace falta
// abrir la hoja de retomar: se refresca y el bloque pasa solo a "En curso".
export function StartButton({
  itemType,
  itemId,
  label,
  className,
}: {
  itemType: ItemType;
  itemId: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await updateStatus(itemType, itemId, "in_progress");
          router.refresh();
        })
      }
      className={className ?? buttonVariants("primary")}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/stats/start-button.tsx
git commit -m "feat(today): StartButton reutilizable (empezar en sitio)"
```

---

### Task 4: `EmptyDiscovery` (estado 4)

**Files:**
- Create: `src/components/stats/empty-discovery.tsx`

**Interfaces:**
- Consumes: Task 1 (`today.emptyTitle`, `emptyBody`, `emptySearch`, `emptyExplore`), Task 2 (`TodayHeader`), `buttonVariants`.
- Produces: `EmptyDiscovery()` (async server component, sin props).

- [ ] **Step 1: Crear el componente**

`src/components/stats/empty-discovery.tsx`:

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { TodayHeader } from "./today-header";

// Estado 4 (usuario nuevo o casi sin contenido): descubrimiento, no error. Un
// solo bloque editorial con dos salidas —Buscar y Colección—; nada de stats ni
// actividad social, que pertenecen a las otras columnas.
export async function EmptyDiscovery() {
  const t = await getTranslations("today");
  return (
    <section className="flex flex-col gap-3">
      <TodayHeader title={t("emptyTitle")} />
      <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-5 shadow-card sm:flex-row sm:items-center">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t("emptyBody")}
        </p>
        <div className="flex flex-wrap gap-2 sm:ml-auto sm:shrink-0">
          <Link href="/buscar" className={buttonVariants("primary")}>
            {t("emptySearch")}
          </Link>
          <Link href="/coleccion" className={buttonVariants("secondary")}>
            {t("emptyExplore")}
          </Link>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/stats/empty-discovery.tsx
git commit -m "feat(today): estado 4 de descubrimiento (EmptyDiscovery)"
```

---

### Task 5: `CollectionSuggestions` (estado 3)

**Files:**
- Create: `src/components/stats/collection-suggestions.tsx`

**Interfaces:**
- Consumes: `LibraryItem` (`@/lib/library/types`), `MEDIA_ACCENT` (`@/lib/catalog/media-accent`), `itemHref` (`@/lib/catalog/item-href`), Task 2 (`TodayHeader`), Task 3 (`StartButton`), Task 1 (`today.collectionTitle`, `startCta`), `detail.mediaLabel`.
- Produces: `CollectionSuggestions({ items: LibraryItem[] })` (async server component).

- [ ] **Step 1: Crear el componente**

`src/components/stats/collection-suggestions.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { LibraryItem } from "@/lib/library/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { itemHref } from "@/lib/catalog/item-href";
import { buttonVariants } from "@/components/ui/button";
import { TodayHeader } from "./today-header";
import { StartButton } from "./start-button";

// Estado 3 (nada en curso ni en cola, pero hay colección): "¿Qué empezamos?".
// Sugiere 2–3 títulos ya completados para releer; "Empezar" abre un pase nuevo
// (planTransition → archiveAndCreate) sin sacar del Inicio.
export async function CollectionSuggestions({ items }: { items: LibraryItem[] }) {
  const t = await getTranslations("today");
  const tMedia = await getTranslations("detail.mediaLabel");
  return (
    <section className="flex flex-col gap-3">
      <TodayHeader title={t("collectionTitle")} />
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const accent = MEDIA_ACCENT[item.itemType];
          return (
            <article
              key={item.entryId}
              className="relative flex gap-3 overflow-hidden rounded-[12px] border border-border bg-surface p-3 shadow-card"
              style={{ ["--acc" as string]: `var(${accent.varName})` }}
            >
              <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--acc)]" />
              <Link
                href={itemHref(item.itemType, item.itemId)}
                className="relative h-[72px] w-12 shrink-0 overflow-hidden rounded-sm bg-surface-muted shadow-cover"
              >
                {item.coverUrl && (
                  <Image src={item.coverUrl} alt="" fill sizes="48px" className="object-cover" />
                )}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-[var(--acc)]">
                  {tMedia(item.itemType)}
                </p>
                <Link
                  href={itemHref(item.itemType, item.itemId)}
                  className="mt-0.5 line-clamp-2 font-serif text-[13px] leading-[1.14] font-semibold text-foreground hover:underline"
                >
                  {item.title}
                </Link>
                <StartButton
                  itemType={item.itemType}
                  itemId={item.itemId}
                  label={t("startCta")}
                  className={buttonVariants("primary", "mt-auto self-start px-3 py-1 text-[12px]")}
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/stats/collection-suggestions.tsx
git commit -m "feat(today): estado 3 sugerencias de colección"
```

---

### Task 6: `rotateIndex` + `NextUpCard` + `ProximaLectura` (estado 2)

**Files:**
- Create: `src/lib/stats/rotate-index.ts`
- Create: `src/lib/stats/rotate-index.test.ts`
- Create: `src/components/stats/next-up-card.tsx`
- Create: `src/components/stats/proxima-lectura.tsx`

**Interfaces:**
- Produces:
  - `rotateIndex(current: number, length: number): number`
  - `type NextUpItem = { itemId: string; itemType: ItemType; title: string; coverUrl: string | null }`
  - `NextUpCard({ items: NextUpItem[] })` (client)
  - `ProximaLectura({ items: NextUpItem[]; later: ReactNode })` (async server component)
- Consumes: Task 2 (`TodayHeader`), Task 3 (`StartButton`), `MEDIA_ACCENT`, `itemHref`, `buttonVariants`, `LaterShelf` (vía la prop `later`), Task 1 (`today.nextUpTitle`, `nextUpSection`, `nextUpContext`, `startCta`, `suggestAnother`), `detail.mediaLabel`.

- [ ] **Step 1: Test de `rotateIndex` (falla primero)**

`src/lib/stats/rotate-index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rotateIndex } from "./rotate-index";

describe("rotateIndex", () => {
  it("avanza al siguiente índice", () => {
    expect(rotateIndex(0, 3)).toBe(1);
    expect(rotateIndex(1, 3)).toBe(2);
  });
  it("da la vuelta al llegar al final", () => {
    expect(rotateIndex(2, 3)).toBe(0);
  });
  it("con un solo elemento se queda en 0", () => {
    expect(rotateIndex(0, 1)).toBe(0);
  });
  it("con lista vacía devuelve 0 (sin división por cero)", () => {
    expect(rotateIndex(0, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npm run test -- rotate-index` (con Node 22 activo)
Expected: FAIL — `Cannot find module './rotate-index'`.

- [ ] **Step 3: Implementar `rotateIndex`**

`src/lib/stats/rotate-index.ts`:

```ts
// Rotación circular de "Sugerirme otro": del último elemento vuelve al
// primero. Con lista vacía devuelve 0 en vez de NaN (módulo por cero).
export function rotateIndex(current: number, length: number): number {
  if (length <= 0) return 0;
  return (current + 1) % length;
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npm run test -- rotate-index`
Expected: PASS (4 tests).

- [ ] **Step 5: Crear `NextUpCard` (cliente)**

`src/components/stats/next-up-card.tsx`:

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { itemHref } from "@/lib/catalog/item-href";
import { buttonVariants } from "@/components/ui/button";
import { rotateIndex } from "@/lib/stats/rotate-index";
import { StartButton } from "./start-button";

export type NextUpItem = {
  itemId: string;
  itemType: ItemType;
  title: string;
  coverUrl: string | null;
};

// Estado 2: destaca UN pendiente para empezar. "Sugerirme otro" rota entre los
// que ya hay en la cola (sin recomendador). "Empezar" lo marca en curso y el
// bloque pasa solo a "En curso" (StartButton refresca). Es cliente porque el
// índice destacado y la rotación viven aquí; imágenes y etiquetas llegan ya
// resueltas del servidor a través de props/next-intl.
export function NextUpCard({ items }: { items: NextUpItem[] }) {
  const t = useTranslations("today");
  const tMedia = useTranslations("detail.mediaLabel");
  const [index, setIndex] = useState(0);

  const item = items[index] ?? items[0];
  if (!item) return null;
  const accent = MEDIA_ACCENT[item.itemType];

  return (
    <div
      className="relative overflow-hidden rounded-[14px] border border-border bg-surface p-4 shadow-card"
      style={{ ["--acc" as string]: `var(${accent.varName})` }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[var(--acc)]" />
      <div className="flex gap-3.5">
        <Link
          href={itemHref(item.itemType, item.itemId)}
          className="relative h-[108px] w-[72px] shrink-0 overflow-hidden rounded-md bg-surface-muted shadow-cover"
        >
          {item.coverUrl && (
            <Image src={item.coverUrl} alt={item.title} fill sizes="72px" className="object-cover" />
          )}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-[var(--acc)]">
            {tMedia(item.itemType)}
          </p>
          <Link
            href={itemHref(item.itemType, item.itemId)}
            className="mt-0.5 line-clamp-2 font-serif text-[17px] leading-tight font-semibold text-foreground hover:underline"
          >
            {item.title}
          </Link>
          <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">
            {t("nextUpContext")}
          </p>
        </div>
      </div>
      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        <StartButton
          itemType={item.itemType}
          itemId={item.itemId}
          label={t("startCta")}
          className={buttonVariants("primary", "w-full sm:w-auto")}
        />
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => setIndex((i) => rotateIndex(i, items.length))}
            className="font-mono text-[11px] tracking-[0.04em] uppercase text-accent hover:underline"
          >
            {t("suggestAnother")}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Crear `ProximaLectura` (servidor)**

`src/components/stats/proxima-lectura.tsx`:

```tsx
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { TodayHeader } from "./today-header";
import { NextUpCard, type NextUpItem } from "./next-up-card";

// Estado 2 (nada en curso, pero hay cola): la cabecera pregunta "¿Qué te
// apetece hoy?" y en vez de "En curso" se destaca la próxima lectura. El mismo
// grid de dos columnas que el estado 1: destacado a la izquierda, "Para más
// tarde" (LaterShelf, pintado en servidor y pasado como `later`) a la derecha.
export async function ProximaLectura({
  items,
  later,
}: {
  items: NextUpItem[];
  later: ReactNode;
}) {
  const t = await getTranslations("today");
  return (
    <section className="flex flex-col gap-3">
      <TodayHeader title={t("nextUpTitle")} />
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
            {t("nextUpSection")}
          </span>
          <NextUpCard items={items} />
        </div>
        {later}
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/lib/stats/rotate-index.ts src/lib/stats/rotate-index.test.ts src/components/stats/next-up-card.tsx src/components/stats/proxima-lectura.tsx
git commit -m "feat(today): estado 2 próxima lectura con rotación"
```

---

### Task 7: Escalera de estados en `TodayBlock`

**Files:**
- Modify: `src/components/stats/today-block.tsx` (líneas ~43-48, la rama de "sin featured")

**Interfaces:**
- Consumes: Tasks 4/5/6 (`EmptyDiscovery`, `CollectionSuggestions`, `ProximaLectura`, `NextUpItem`), `getLibraryItems`.

- [ ] **Step 0: Impact analysis (obligatorio antes de editar)**

Run: `impact({target: "TodayBlock", direction: "upstream"})`
Expected: reportar callers (solo `Home` en `src/app/(home)/page.tsx`) y nivel de riesgo. Si sale HIGH/CRITICAL, avisar antes de seguir.

- [ ] **Step 1: Añadir imports**

En `src/components/stats/today-block.tsx`, junto a los demás imports de componentes:

```tsx
import { ProximaLectura } from "./proxima-lectura";
import { CollectionSuggestions } from "./collection-suggestions";
import { EmptyDiscovery } from "./empty-discovery";
import type { NextUpItem } from "./next-up-card";
```

- [ ] **Step 2: Sustituir la rama "sin featured" por la escalera**

Reemplazar exactamente:

```tsx
  const later =
    planned.length > 0 ? (
      <LaterShelf items={planned.slice(0, LATER_SHOWN)} total={planned.length} />
    ) : null;

  if (!focus.featured) return later && <div className="pb-1">{later}</div>;
```

por:

```tsx
  const later =
    planned.length > 0 ? (
      <LaterShelf items={planned.slice(0, LATER_SHOWN)} total={planned.length} />
    ) : null;

  // Escalera de estados de la columna personal (nunca un hueco): en curso →
  // próxima lectura → sugerencias de colección → descubrimiento. Ver
  // docs/superpowers/specs/2026-08-11-inicio-estado-vacio-columna-personal-design.md.
  if (!focus.featured) {
    if (planned.length > 0) {
      const nextUp: NextUpItem[] = planned.map((item) => ({
        itemId: item.itemId,
        itemType: item.itemType,
        title: item.title,
        coverUrl: item.coverUrl,
      }));
      return (
        <div className="pb-1">
          <ProximaLectura items={nextUp} later={later} />
        </div>
      );
    }
    // Solo se pide la colección cuando de verdad hace falta (sin en curso y sin
    // cola): un query menos en el camino feliz. Solo completados — releer es
    // limpio; los abandonados caerían en la hoja de retomar y por eso van al
    // estado 4 (ver spec).
    const collection = await getLibraryItems(supabase, userId, {
      status: "completed",
      limit: 3,
    });
    if (collection.length > 0) {
      return (
        <div className="pb-1">
          <CollectionSuggestions items={collection} />
        </div>
      );
    }
    return (
      <div className="pb-1">
        <EmptyDiscovery />
      </div>
    );
  }
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 4: `detect_changes` (obligatorio antes de commit)**

Run: `detect_changes({scope: "compare", base_ref: "main"})`
Expected: los símbolos afectados son `TodayBlock` (+ los componentes nuevos). Nada inesperado.

- [ ] **Step 5: Commit**

```bash
git add src/components/stats/today-block.tsx
git commit -m "feat(today): escalera de estados de la columna personal"
```

---

### Task 8: e2e de los cuatro estados

Usa un usuario DESECHABLE por test para aislar la biblioteca (la cuenta de pruebas real tiene ítems en curso). Convención de datos: `docs/TESTING.md` — siembra por REST con la service key, limpia antes (dentro del try) y después (finally), prefijo de username barrible. El usuario nuevo debe tener `onboarded_at` para no caer en el asistente.

**Files:**
- Create: `e2e/inicio-estado-vacio.spec.ts`

**Interfaces:**
- Consumes: la app corriendo en :3000 (dev server o el que arranca Playwright), `TEST_USER_*`/`SUPABASE_*` del entorno.

- [ ] **Step 1: Escribir el spec**

`e2e/inicio-estado-vacio.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

// Estados vacíos de la columna personal del Inicio (TodayBlock). Cada test crea
// un usuario DESECHABLE con la biblioteca sembrada al estado exacto y entra como
// él, así la biblioteca real de la cuenta de pruebas no se toca. Se barren los
// huérfanos por prefijo antes y después.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CONFIGURED = !!SUPABASE_URL && !!SERVICE_KEY;

const USER_PREFIX = "e2ev";
const PASSWORD = "TestPassword123!";
const COVER_URL = "https://covers.openlibrary.org/b/id/12627383-M.jpg";

function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...adminHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`REST ${init?.method ?? "GET"} ${path}: ${res.status} — ${await res.text()}`);
  }
  return res;
}

async function sweepDisposableUsers() {
  const rows = (await (
    await rest(`profiles?username=like.${USER_PREFIX}*&select=user_id`)
  ).json()) as Array<{ user_id: string }>;
  for (const r of rows) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${r.user_id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
  }
}

// Usuario desechable ya onboardeado (para no caer en el asistente) y con la
// biblioteca vacía. Devuelve id + credenciales para entrar como él.
async function createOnboardedUser(username: string): Promise<{ id: string; email: string }> {
  const email = `${username}@example.com`;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`admin/users: ${res.status} — ${await res.text()}`);
  const user = (await res.json()) as { id: string };
  await rest("profiles", {
    method: "POST",
    body: JSON.stringify({
      user_id: user.id,
      username,
      display_name: username,
      is_public: false,
      onboarded_at: new Date().toISOString(),
    }),
  });
  return { id: user.id, email };
}

// Un libro desechable + un pase del usuario en el estado dado.
async function seedBookPass(userId: string, bookId: string, status: string) {
  await rest("books", {
    method: "POST",
    body: JSON.stringify({ id: bookId, title: `[E2E] ${status} ${bookId.slice(0, 8)}`, author: "[E2E]", cover_url: COVER_URL }),
  });
  await rest("passes", {
    method: "POST",
    body: JSON.stringify({
      id: bookId, // reutilizamos el uuid del libro como uuid del pase (distinto espacio, vale)
      user_id: userId,
      item_type: "book",
      item_id: bookId,
      status,
      is_active: true,
      position: {},
      started_on: status === "planned" ? null : "2026-01-01",
      finished_on: status === "completed" ? "2026-01-02" : null,
    }),
  });
}

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
  await page.context().clearCookies({ name: "bs_onb" });
}

test.describe("Inicio · estados de la columna personal", () => {
  test.skip(!CONFIGURED, "SUPABASE_* no configurado");
  test.setTimeout(120_000);

  test.beforeEach(async () => {
    await sweepDisposableUsers();
  });
  test.afterEach(async () => {
    await sweepDisposableUsers();
  });

  test("estado 4: usuario sin nada ve el descubrimiento", async ({ page }) => {
    const { email } = await createOnboardedUser(`${USER_PREFIX}e${Date.now()}`.slice(0, 20));
    await loginAs(page, email);
    await expect(page.getByRole("heading", { name: /encuentra algo para disfrutar/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^buscar$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /explorar la colección/i })).toBeVisible();
  });

  test("estado 3: solo completados ve '¿Qué empezamos?'", async ({ page }) => {
    const user = await createOnboardedUser(`${USER_PREFIX}c${Date.now()}`.slice(0, 20));
    await seedBookPass(user.id, "e2ec0001-0000-4000-8000-000000000001", "completed");
    await loginAs(page, user.email);
    await expect(page.getByRole("heading", { name: /¿qué empezamos\?/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^empezar$/i }).first()).toBeVisible();
  });

  test("estado 2: con cola ve 'próxima lectura' y 'Empezar' lo pasa a en curso", async ({ page }) => {
    const user = await createOnboardedUser(`${USER_PREFIX}p${Date.now()}`.slice(0, 20));
    await seedBookPass(user.id, "e2ep0001-0000-4000-8000-000000000001", "planned");
    await loginAs(page, user.email);

    await expect(page.getByRole("heading", { name: /¿qué te apetece hoy\?/i })).toBeVisible();
    await expect(page.getByText(/lo tienes guardado para más tarde/i)).toBeVisible();

    await page.getByRole("button", { name: /^empezar$/i }).click();

    // Tras empezar, el bloque pasa a "En curso" (estado 1).
    await expect(page.getByRole("heading", { name: /¿qué has disfrutado hoy\?/i })).toBeVisible({ timeout: 15_000 });
    // Y el efecto real: el pase queda in_progress.
    await expect
      .poll(async () => {
        const rows = (await (
          await rest(`passes?user_id=eq.${user.id}&status=eq.in_progress&select=id`)
        ).json()) as unknown[];
        return rows.length;
      }, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1);
  });

  test("estado 1: con algo en curso mantiene la UI actual", async ({ page }) => {
    const user = await createOnboardedUser(`${USER_PREFIX}i${Date.now()}`.slice(0, 20));
    await seedBookPass(user.id, "e2ei0001-0000-4000-8000-000000000001", "in_progress");
    await loginAs(page, user.email);
    await expect(page.getByRole("heading", { name: /¿qué has disfrutado hoy\?/i })).toBeVisible();
    await expect(page.getByText(/^en curso$/i).first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Ejecutar el spec**

Run: `npm run test:e2e -- inicio-estado-vacio` (reutiliza el dev server de :3000; Node 22)
Expected: 4 tests PASS.

Si un test de estado 2/3 falla porque "Empezar" tarda, subir el `timeout` del `expect.poll`; si el usuario cae en `/onboarding`, revisar que el `POST profiles` incluyó `onboarded_at` y que `loginAs` limpió la cookie `bs_onb`.

- [ ] **Step 3: Commit**

```bash
git add e2e/inicio-estado-vacio.spec.ts
git commit -m "test(today): e2e de los cuatro estados de la columna personal"
```

---

### Task 9: Verificación en navegador real + sincronización de docs

**Files:**
- Modify: `docs/requirements/backlog.md` (marcar la feature si tiene entrada)
- Modify: `docs/requirements/decisiones.md` (append: estado 3 = solo completados; "Empezar" refresca en sitio)

- [ ] **Step 1: qa-verifier**

Lanzar el agente `qa-verifier` sobre `/` en los cuatro estados (sembrando como el spec) para confirmar en navegador real: layout responsive (móvil una columna, CTA "Empezar" a ancho completo), tono editorial, sin huecos.

- [ ] **Step 2: Registrar decisiones**

Añadir al FINAL de `docs/requirements/decisiones.md` (append-only) una entrada con: la escalera de estados, estado 3 = solo `completed` (reread inline; `dropped` → estado 4), "Empezar" refresca en sitio sin ir a `/sesion`.

Marcar en `docs/requirements/backlog.md` la casilla de la feature si existe.

- [ ] **Step 3: Issues de lo pendiente**

Abrir issue(s) para lo que quede fuera de alcance y merezca recordarse: (a) `dropped` no se puede retomar inline desde el Inicio (cae a estado 4); (b) "Sugerirme otro" solo rota, sin recomendador. Regla AGENTS.md: lo pendiente vive como issue.

- [ ] **Step 4: Commit**

```bash
git add docs/requirements/decisiones.md docs/requirements/backlog.md
git commit -m "docs(today): registra decisiones del estado vacío de la columna personal"
```

---

## Self-Review

**Spec coverage:**
- Estado 1 (en curso) intacto → Task 2 (refactor sin cambio) + Task 7 (rama `focus.featured`).
- Estado 2 (próxima lectura, cabecera "¿Qué te apetece hoy?", card destacada, Empezar, Sugerirme otro, LaterShelf) → Task 6 + Task 7.
- Estado 3 (¿Qué empezamos?, 2–3 de colección, Empezar) → Task 5 + Task 7.
- Estado 4 (Encuentra algo para disfrutar, Buscar/Explorar) → Task 4 + Task 7.
- Jerarquía de datos → Task 7 (escalera).
- "Empezar" reutiliza `updateStatus` y pasa a en curso → Task 3 (StartButton).
- Responsive → clases en Tasks 4/5/6; verificación en Task 9.
- Diseño (sin rediseño general) → estilos reutilizados en cada card.
- Tests → Task 6 (unit) + Task 8 (e2e) + Task 9 (qa-verifier).
- Sincronización de docs (AGENTS.md "definición de hecho") → Task 9.

**Placeholder scan:** sin TBD/TODO; todo paso trae código o comando concreto.

**Type consistency:** `NextUpItem` definido en Task 6 (`next-up-card.tsx`), consumido en Task 7 con el mismo shape. `StartButton` firma `{itemType,itemId,label,className?}` estable entre Tasks 3/5/6. `updateStatus(itemType,itemId,"in_progress")` coincide con `manage-actions.ts`. `buttonVariants(variant, extra)` coincide con `button.tsx`.

## Notas de ejecución

- Ningún cambio de esquema (solo lectura/escritura de `passes` vía acción existente): `docs/requirements/data-model.md` NO cambia.
- No dejar `next dev` ni watchers colgados al terminar (AGENTS.md, higiene). Un solo dev server en :3000.
