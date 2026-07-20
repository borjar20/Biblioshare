# Importar desde el onboarding — Implementation Plan

> **[Histórico · congelado el 2026-07-20]** Plan de una feature: describe cómo se construyó, no el estado de hoy.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que quien se registre viniendo de Goodreads o Letterboxd pueda importar su biblioteca sin salir del asistente, en el paso 2.

**Architecture:** El bucle de lotes que hoy vive dentro de `import-form.tsx` se extrae a un módulo **puro** (`runImportBatches`) con un envoltorio de estado (`useImportRun`), que consumen tanto `/importar` como el asistente. Puro y no dentro del hook porque vitest corre en entorno `node` y probar hooks exigiría cambiar el entorno de los 38 ficheros de test existentes. El paso 2 gana un subidor opt-in que sustituye a la rejilla dentro de la misma tarjeta; al terminar, las filas sin match se guardan **todas de golpe** en la cola de revisión y solo se reporta el recuento.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase, next-intl, Tailwind v4, Vitest, Playwright.

## Global Constraints

- Node **22.23.1** — `fnm use` antes de `npm test` o `npx playwright test`.
- Spec de referencia: `docs/superpowers/specs/2026-07-20-import-en-onboarding-design.md`, decisiones **D1–D5**.
- **Ninguna cadena literal en JSX** — todas por `t()` (`next-intl`, locale único `es`).
- Clases de Tailwind **enteras, nunca interpoladas**.
- **NO cambiar** la mecánica de lotes (`BATCH_SIZE = 20`, `BATCH_CONCURRENCY = 5`) ni el tope `MAX_ROWS = 3000`: fuera de alcance.
- **NO crear `loading.tsx`** en `/onboarding` (`docs/TRAMPAS.md` §4).
- La suite e2e **no se corre entera de una tacada**: grupos de 2–3 specs (`docs/TRAMPAS.md` §5).
- Doc canónica al cerrar: si cambia el esquema o se cierra la feature, actualizar el doc canónico **y su fecha de frescura** (README §Gobernanza documental). Este plan **no** toca el esquema.
- Commits en español, imperativo, con prefijo.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/lib/import/run-batches.ts` | **Nuevo.** El bucle de lotes, **puro** (sin React). Lo comparten `/importar` y el asistente |
| `src/lib/import/run-batches.test.ts` | **Nuevo.** Tests del troceo |
| `src/lib/import/use-import-run.ts` | **Nuevo.** Envoltorio de estado de React sobre el anterior |
| `src/app/importar/import-form.tsx` | **Modificar.** Pasa a consumir el hook; su aspecto no cambia |
| `src/app/importar/actions.ts` | **Modificar.** Añade `saveUnmatchedBatch` |
| `src/app/onboarding/step-titles.tsx` | **Modificar.** Añade el bloque opt-in de importación |
| `src/app/onboarding/import-panel.tsx` | **Nuevo.** Subidor + barra + resumen, versión compacta |
| `messages/es.json` | **Modificar.** Claves nuevas bajo `onboarding.wizard.*` |
| `e2e/importar-onboarding.spec.ts` | **Nuevo.** Primer e2e de importación del proyecto |

---

## Task 1: Extraer el bucle de lotes (implementa **D3**)

**Files:**
- Create: `src/lib/import/run-batches.ts`
- Create: `src/lib/import/use-import-run.ts`
- Test: `src/lib/import/run-batches.test.ts`

**Interfaces:**
- Consumes: `commitImportBatch(itemType, rows): Promise<ImportRowResult[]>` de `@/app/importar/actions`; tipos `ImportRow`, `ImportRowResult`, `ItemType`.
- Produces:
  - `BATCH_SIZE = 20`
  - `runImportBatches(itemType, rows, commit, onProgress?): Promise<ImportRowResult[]>` — **pura**, sin React
  - `type ImportRunPhase = "idle" | "processing" | "done"`
  - `useImportRun(): { phase, processed, total, results, start(itemType, rows): Promise<ImportRowResult[]> }`

⚠️ **El bucle va en un módulo aparte, NO dentro del hook.** `vitest.config.ts` corre en
`environment: "node"` y `@testing-library/react` **no está instalado**: probar el hook exigiría
añadir jsdom + testing-library y **cambiar el entorno de los 38 ficheros de test existentes**.
Separando la parte pura se prueba lo que importa —el troceo— sin tocar nada de eso, y el hook
queda como envoltorio fino de estado.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it, vi } from "vitest";
import { runImportBatches, BATCH_SIZE } from "./run-batches";
import type { ImportRow, ImportRowResult } from "./types";

const fila = (n: number): ImportRow => ({
  rowNumber: n,
  title: `T${n}`,
  author: null,
  isbn: null,
  publisher: null,
  pageCount: null,
  year: null,
  status: "completed",
  rating: null,
  bookFormat: null,
  diaryDates: [],
  unknownStatusLabel: null,
});

const okCommit = async (
  _t: unknown,
  rows: ImportRow[],
): Promise<ImportRowResult[]> =>
  rows.map((r) => ({ rowNumber: r.rowNumber, title: r.title, outcome: "imported" }));

describe("runImportBatches", () => {
  it("trocea en lotes de BATCH_SIZE", async () => {
    const tamanos: number[] = [];
    await runImportBatches(
      "book",
      Array.from({ length: 45 }, (_, i) => fila(i + 1)),
      async (t, rows) => {
        tamanos.push(rows.length);
        return okCommit(t, rows);
      },
    );
    // 45 filas con BATCH_SIZE 20 -> 20, 20, 5.
    expect(tamanos).toEqual([BATCH_SIZE, BATCH_SIZE, 5]);
  });

  it("acumula los resultados en orden de fichero", async () => {
    const out = await runImportBatches(
      "book",
      Array.from({ length: 45 }, (_, i) => fila(i + 1)),
      okCommit,
    );
    expect(out).toHaveLength(45);
    expect(out[0].rowNumber).toBe(1);
    expect(out[44].rowNumber).toBe(45);
  });

  it("informa del progreso una vez por lote, acumulado", async () => {
    const progreso: number[] = [];
    await runImportBatches(
      "book",
      Array.from({ length: 45 }, (_, i) => fila(i + 1)),
      okCommit,
      (n) => progreso.push(n),
    );
    expect(progreso).toEqual([20, 40, 45]);
  });

  it("con cero filas no llama al servidor", async () => {
    const commit = vi.fn();
    const out = await runImportBatches("book", [], commit);
    expect(commit).not.toHaveBeenCalled();
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `fnm use 22.23.1 && npx vitest run src/lib/import/run-batches.test.ts`
Expected: FAIL — `Failed to resolve import "./run-batches"`.

- [ ] **Step 3: Implementar la parte pura**

```ts
import type { ItemType } from "@/lib/catalog/types";
import type { ImportRow, ImportRowResult } from "./types";

// Tamaño del lote que el CLIENTE manda por llamada. El servidor procesa 5 filas
// en paralelo DENTRO de cada lote (BATCH_CONCURRENCY en actions.ts). Devolver
// tras cada lote es lo que mantiene cada invocación holgada bajo el timeout y
// permite pintar la barra.
export const BATCH_SIZE = 20;

export type CommitBatch = (
  itemType: ItemType,
  rows: ImportRow[],
) => Promise<ImportRowResult[]>;

/**
 * El bucle de lotes de una importación. PURO a propósito (sin React): lo
 * comparten la pantalla completa de `/importar` y el panel del onboarding, y
 * así el troceo se puede probar con vitest en entorno node.
 *
 * `onProgress` recibe el acumulado tras CADA lote, no el total al final: es lo
 * que alimenta la barra.
 */
export async function runImportBatches(
  itemType: ItemType,
  rows: ImportRow[],
  commit: CommitBatch,
  onProgress?: (processed: number) => void,
): Promise<ImportRowResult[]> {
  const collected: ImportRowResult[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const chunkResults = await commit(itemType, chunk);
    collected.push(...chunkResults);
    onProgress?.(i + chunk.length);
  }

  return collected;
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/import/run-batches.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Escribir el hook (envoltorio fino, sin lógica propia)**

```ts
"use client";

import { useCallback, useState } from "react";
import type { ItemType } from "@/lib/catalog/types";
import type { ImportRow, ImportRowResult } from "./types";
import { commitImportBatch } from "@/app/importar/actions";
import { runImportBatches, type CommitBatch } from "./run-batches";

export type ImportRunPhase = "idle" | "processing" | "done";

/**
 * Estado de React alrededor de `runImportBatches`. Aquí NO hay lógica: todo lo
 * decidible vive en run-batches.ts, que sí tiene tests.
 */
export function useImportRun(commit: CommitBatch = commitImportBatch) {
  const [phase, setPhase] = useState<ImportRunPhase>("idle");
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<ImportRowResult[]>([]);

  const start = useCallback(
    async (itemType: ItemType, rows: ImportRow[]) => {
      setPhase("processing");
      setTotal(rows.length);
      setProcessed(0);
      setResults([]);

      const collected = await runImportBatches(itemType, rows, commit, setProcessed);

      setResults(collected);
      setPhase("done");
      return collected;
    },
    [commit],
  );

  return { phase, processed, total, results, start };
}
```

- [ ] **Step 6: Comprobar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 7: Commit**

```bash
git add src/lib/import/run-batches.ts src/lib/import/run-batches.test.ts src/lib/import/use-import-run.ts
git commit -m "feat(importar): extraer el bucle de lotes a un modulo puro + hook"
```

---

## Task 2: `/importar` pasa a consumir el hook

**Files:**
- Modify: `src/app/importar/import-form.tsx`

**Interfaces:**
- Consumes: `useImportRun`, `BATCH_SIZE` (Task 1).

Su aspecto **no cambia**: es un refactor puro. La comprobación es que `/importar` siga comportándose igual.

- [ ] **Step 1: Sustituir el estado local por el hook**

En `import-form.tsx`, borrar la constante `BATCH_SIZE` local (línea 11) y los estados
`processed`/`results` junto con el `useTransition`, y dejar el efecto así:

```tsx
"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ItemType } from "@/lib/catalog/types";
import type { ImportRow } from "@/lib/import/types";
import { useImportRun } from "@/lib/import/use-import-run";
import { parseImportFile, type ParseImportState } from "./actions";
import { UnmatchedRowForm } from "./unmatched-row-form";

const initialParseState: ParseImportState = {};

type Phase = "upload" | "processing" | "results";

export function ImportForm({ canResolveManually }: { canResolveManually: boolean }) {
  const t = useTranslations("import");
  const [parseState, parseAction, parsePending] = useActionState(
    parseImportFile,
    initialParseState
  );

  const [phase, setPhase] = useState<Phase>("upload");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [itemType, setItemType] = useState<ItemType>("book");
  const run = useImportRun();
  const startedRef = useRef(false);

  useEffect(() => {
    const parsed = parseState.result;
    if (!parsed || startedRef.current) return;
    startedRef.current = true;

    setRows(parsed.rows);
    setItemType(parsed.itemType);
    setPhase("processing");

    void run.start(parsed.itemType, parsed.rows).then(() => setPhase("results"));
  }, [parseState.result, run]);
```

- [ ] **Step 2: Apuntar el render al hook**

En el bloque `phase === "processing"`, sustituir `processed` por `run.processed`
y `rows.length` por `run.total`. En el bloque de resultados, sustituir las cuatro
lecturas de `results` por `run.results`:

```tsx
  const imported = run.results.filter((r) => r.outcome === "imported").length;
  const duplicate = run.results.filter((r) => r.outcome === "duplicate").length;
  const unmatched = run.results.filter((r) => r.outcome === "unmatched");
  const errored = run.results.filter((r) => r.outcome === "error");
  const unknownStatusRows = run.results.filter((r) => r.unknownStatus);
```

- [ ] **Step 3: Comprobar que compila y que la unidad sigue verde**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin salida de tsc; todos los tests pasan.

- [ ] **Step 4: Comprobar `/importar` en navegador**

Levantar `npm run dev`, entrar con el usuario de pruebas y subir un CSV de Goodreads
de 2-3 filas. Debe verse la barra de progreso y el resumen **igual que antes** del refactor.

- [ ] **Step 5: Commit**

```bash
git add src/app/importar/import-form.tsx
git commit -m "refactor(importar): la pantalla completa usa el hook compartido"
```

---

## Task 3: Guardar en bloque las filas sin match

**Files:**
- Modify: `src/app/importar/actions.ts`

**Interfaces:**
- Produces: `saveUnmatchedBatch(itemType: ItemType, rows: ImportRow[]): Promise<{ saved: number } | { error: "generic" }>`

`saveUnmatchedForReview` (la de fila a fila) **se conserva**: la sigue usando
`/importar`, donde el usuario está revisando y tiene sentido decidir una a una.

- [ ] **Step 1: Añadir la acción**

Al final de `src/app/importar/actions.ts`:

```ts
export type SaveUnmatchedBatchState =
  | { saved: number }
  | { error: "generic" };

/**
 * Guarda TODAS las filas sin match de una importación en la cola de revisión,
 * en un solo insert (D4). La variante de una en una (`saveUnmatchedForReview`)
 * sigue existiendo para `/importar`, donde el usuario las está revisando.
 *
 * En el onboarding no se le puede pedir que pulse N veces: quien acaba de
 * registrarse NUNCA es colaborador, así que no podría resolver ninguna.
 */
export async function saveUnmatchedBatch(
  itemType: ItemType,
  rows: ImportRow[]
): Promise<SaveUnmatchedBatchState> {
  if (rows.length === 0) return { saved: 0 };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("pending_import_rows").insert(
    rows.map((row) => ({
      user_id: user.id,
      item_type: itemType,
      payload: row as unknown as Json,
    }))
  );

  if (error) return { error: "generic" };
  return { saved: rows.length };
}
```

- [ ] **Step 2: Comprobar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida. `Json` **ya está importado** en la línea 8 de ese fichero, así que no hay que añadir nada.

- [ ] **Step 3: Commit**

```bash
git add src/app/importar/actions.ts
git commit -m "feat(importar): guardar en bloque las filas sin match"
```

---

## Task 4: El panel de importación del asistente

**Files:**
- Create: `src/app/onboarding/import-panel.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `useImportRun` (Task 1), `saveUnmatchedBatch` (Task 3), `parseImportFile` de `@/app/importar/actions`.
- Produces: `<ImportPanel onDone={(added: number) => void} onCancel={() => void} />`

- [ ] **Step 1: Añadir las cadenas**

Dentro de `onboarding.wizard` en `messages/es.json`, junto a las existentes:

```json
"importCta": "¿Vienes de Goodreads o Letterboxd?",
"importAction": "Importar mi biblioteca",
"importOr": "o elige de aquí",
"importBack": "Mejor elijo de la lista",
"importWarning": "No cierres esta pestaña mientras importamos.",
"importDone": "{added, plural, one {# título añadido} other {# títulos añadidos}}",
"importPending": "{count, plural, one {# necesita revisión, te avisamos cuando esté} other {# necesitan revisión, te avisamos cuando estén}}",
"importNothing": "No hemos podido añadir nada de ese fichero."
```

- [ ] **Step 2: Crear el panel**

```tsx
"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useImportRun } from "@/lib/import/use-import-run";
import {
  parseImportFile,
  saveUnmatchedBatch,
  type ParseImportState,
} from "@/app/importar/actions";
import type { ImportRow } from "@/lib/import/types";

const initialParseState: ParseImportState = {};

/**
 * Versión compacta del importador para el paso 2 del asistente (D2): sube,
 * procesa con barra, y resume. Sin lista de filas sin match — esas se guardan
 * solas en la cola de revisión (D4) y aquí solo se cuentan.
 */
export function ImportPanel({
  onDone,
  onCancel,
}: {
  onDone: (added: number) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("onboarding.wizard");
  const tImport = useTranslations("import");
  const [parseState, parseAction, parsePending] = useActionState(
    parseImportFile,
    initialParseState,
  );
  const run = useImportRun();
  const startedRef = useRef(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const parsed = parseState.result;
    if (!parsed || startedRef.current) return;
    startedRef.current = true;

    void run.start(parsed.itemType, parsed.rows).then(async (results) => {
      const unmatched = results
        .filter((r) => r.outcome === "unmatched")
        .map((r) => parsed.rows.find((row) => row.rowNumber === r.rowNumber))
        .filter((row): row is ImportRow => row !== undefined);

      if (unmatched.length > 0) {
        await saveUnmatchedBatch(parsed.itemType, unmatched);
        setPendingCount(unmatched.length);
      }
      onDone(results.filter((r) => r.outcome === "imported").length);
    });
  }, [parseState.result, run, onDone]);

  if (run.phase === "processing") {
    const percent = run.total > 0 ? Math.round((run.processed / run.total) * 100) : 0;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {tImport("processing", { processed: run.processed, total: run.total })}
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("importWarning")}</p>
      </div>
    );
  }

  if (run.phase === "done") {
    const added = run.results.filter((r) => r.outcome === "imported").length;
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">
          {added > 0 ? t("importDone", { added }) : t("importNothing")}
        </p>
        {pendingCount > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("importPending", { count: pendingCount })}
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={parseAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p>{tImport("help.goodreads")}</p>
        <p>{tImport("help.letterboxd")}</p>
      </div>

      <input
        type="file"
        name="file"
        accept=".csv"
        required
        className="text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent-foreground"
      />

      {parseState.error && (
        <p className="text-sm text-status-dropped">
          {tImport(`errors.${parseState.error}`)}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={parsePending}>
          {parsePending ? tImport("uploading") : tImport("upload")}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("importBack")}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Comprobar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/import-panel.tsx messages/es.json
git commit -m "feat(onboarding): panel compacto de importacion"
```

---

## Task 5: Enchufar el panel en el paso 2

**Files:**
- Modify: `src/app/onboarding/step-titles.tsx`

**Interfaces:**
- Consumes: `<ImportPanel>` (Task 4).

- [ ] **Step 1: Añadir el estado de modo y el bloque de llamada**

En `step-titles.tsx`, tras los `useState` existentes:

```tsx
  // "grid" = la rejilla de siempre; "import" = el subidor ocupa su sitio (D1).
  const [mode, setMode] = useState<"grid" | "import">("grid");
  const [imported, setImported] = useState(0);
```

Y añadir el import: `import { ImportPanel } from "./import-panel";`

- [ ] **Step 2: Pintar el panel cuando toca**

Justo antes del `return` de la rejilla (el que contiene `grid-cols-3`), insertar:

```tsx
  if (mode === "import") {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-[22px] font-semibold">{t("titlesTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("importCta")}</p>
        </div>

        <ImportPanel
          onDone={(added) => setImported(added)}
          onCancel={() => setMode("grid")}
        />

        <Button
          type="button"
          onClick={() => router.push(nextHref)}
          disabled={imported === 0 && pending}
          className="w-full justify-center"
        >
          {t("continue")}
        </Button>
      </div>
    );
  }
```

- [ ] **Step 3: Añadir el disparador sobre la rejilla**

Dentro del `return` de la rejilla, justo después del bloque del título
(`<div className="flex flex-col gap-1">…</div>`), insertar:

```tsx
      <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
        <p className="text-sm font-semibold">{t("importCta")}</p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setMode("import")}
          className="self-start"
        >
          {t("importAction")}
        </Button>
      </div>

      <p className="text-center font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
        {t("importOr")}
      </p>
```

- [ ] **Step 4: Comprobar en navegador**

Dejar el usuario de pruebas sin onboarding y recorrer el paso 2:

```sql
update public.profiles set onboarded_at = null where username = 'devtest';
```

Debe verse el bloque «¿Vienes de Goodreads o Letterboxd?» sobre la rejilla; al pulsar,
el subidor la sustituye; «Mejor elijo de la lista» vuelve a la rejilla. Comprobar a
**400px y 940px**, claro y oscuro.

- [ ] **Step 5: Restaurar el estado del usuario de pruebas**

```sql
update public.profiles set onboarded_at = now() where username = 'devtest';
```

- [ ] **Step 6: Commit**

```bash
git add src/app/onboarding/step-titles.tsx
git commit -m "feat(onboarding): el paso 2 ofrece importar o elegir de la rejilla"
```

---

## Task 6: E2E del recorrido

**Files:**
- Create: `e2e/importar-onboarding.spec.ts`
- Create: `e2e/fixtures/goodreads-min.csv`

Es el **primer e2e de importación** del proyecto.

- [ ] **Step 1: Crear el CSV de prueba**

`e2e/fixtures/goodreads-min.csv` — dos títulos que Open Library resuelve y uno inventado
que no va a matchear:

```csv
Book Id,Title,Author,ISBN13,My Rating,Exclusive Shelf,Date Read
1,Dune,Frank Herbert,"=""9780441172719""",4,read,2024/01/02
2,Piranesi,Susanna Clarke,"=""9781635575637""",5,read,2024/03/04
3,Zzzz Titulo Que No Existe En Ningun Catalogo,Nadie,"=""""",0,to-read,
```

- [ ] **Step 2: Escribir el spec**

```ts
import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function setOnboardedAt(value: string | null) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${USERNAME}`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ onboarded_at: value }),
    },
  );
  if (!res.ok) throw new Error(`no se pudo fijar onboarded_at: ${res.status}`);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
  // El proxy cachea "ya onboardeado" por usuario; al forzarlo por debajo hay
  // que tirar la cookie o el gate decide con el valor viejo.
  await page.context().clearCookies({ name: "bs_onb" });
}

test.describe("importar desde el onboarding", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  test.setTimeout(180_000);

  test.afterEach(async () => {
    await setOnboardedAt(new Date().toISOString());
  });

  test("subir un CSV en el paso 2 añade los títulos y cuenta los que no matchean", async ({
    page,
  }) => {
    await setOnboardedAt(null);
    await login(page);

    await page.goto("/onboarding?paso=2");
    await expect(page.getByRole("heading", { name: "Añade algo para empezar" })).toBeVisible();

    await page.getByRole("button", { name: "Importar mi biblioteca" }).click();
    await page.setInputFiles(
      'input[type="file"]',
      path.join(__dirname, "fixtures", "goodreads-min.csv"),
    );
    await page.getByRole("button", { name: /Subir|Importar fichero/ }).click();

    // El resumen tarda: hay llamadas a Open Library por fila sin cachear.
    await expect(page.getByText(/títulos? añadidos?|No hemos podido añadir/)).toBeVisible({
      timeout: 120_000,
    });

    // La fila inventada no matchea y debe reportarse como pendiente de revisión.
    await expect(page.getByText(/necesitan? revisión/)).toBeVisible();

    await page.getByRole("button", { name: /^Continuar/ }).click();
    await expect(page).toHaveURL(/paso=(3|fin)/, { timeout: 30_000 });
  });

  test("«Mejor elijo de la lista» devuelve a la rejilla", async ({ page }) => {
    await setOnboardedAt(null);
    await login(page);

    await page.goto("/onboarding?paso=2");
    await page.getByRole("button", { name: "Importar mi biblioteca" }).click();
    await expect(page.locator('input[type="file"]')).toBeVisible();

    await page.getByRole("button", { name: "Mejor elijo de la lista" }).click();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });
});
```

- [ ] **Step 3: Ejecutar**

Run: `fnm use 22.23.1 && npx playwright test e2e/importar-onboarding.spec.ts --reporter=list`
Expected: 2 passed.

Si el primero se pasa de tiempo, **no subir el timeout a ciegas**: comprobar primero si el
dev server sigue vivo (`docs/TRAMPAS.md` §5).

- [ ] **Step 4: Comprobar que no hay regresión**

Run: `npx playwright test e2e/onboarding.spec.ts e2e/signup.spec.ts --reporter=list`
Expected: todo verde. **No correr la suite entera de una tacada.**

- [ ] **Step 5: Limpiar los datos del test**

El spec añade títulos reales a la biblioteca del usuario de pruebas. Borrarlos:

```sql
delete from public.pending_import_rows
 where user_id = (select user_id from public.profiles where username = 'devtest');
```

Los pases de Dune/Piranesi pueden quedarse: son catálogo real y el seed de dev ya los usa.

- [ ] **Step 6: Commit**

```bash
git add e2e/importar-onboarding.spec.ts e2e/fixtures/goodreads-min.csv
git commit -m "test(onboarding): e2e de la importacion desde el paso 2"
```

---

## Cierre

- [ ] `npx tsc --noEmit` limpio y `npm test` verde.
- [ ] Comprobación en navegador a **400px y 940px**, claro y oscuro.
- [ ] Actualizar el plan 07 (`docs/redesign/plan-07-transversal.md`) §2.4 mencionando el paso de importación.
- [ ] **Si algo de esto cambió el esquema, actualizar `data-model.md` y su fecha de frescura** (no debería: este plan no toca BD).
- [ ] Usar `superpowers:finishing-a-development-branch` para cerrar la rama.
