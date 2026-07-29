# Borrado rápido de ediciones desde la ficha — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que un colaborador+ borre una edición desde la tira de la ficha, con confirmación, sin abrir el editor de ficha.

**Architecture:** No hay backend nuevo: la server action `deleteEdition` ya existe y ya la protege un trigger en base de datos. Lo que se añade es (a) un dato — qué ediciones tienen pases y por tanto no se pueden borrar — que se calcula en el servidor encadenando sobre la promesa de ediciones que ya viaja por streaming, y (b) un botón `×` con diálogo de confirmación dentro de `EditionStrip`.

**Tech Stack:** Next.js (App Router, React 19 `use()`), Supabase JS, next-intl, Tailwind, Vitest, Playwright.

Spec: `docs/superpowers/specs/2026-07-29-borrado-rapido-ediciones-design.md`.

## Global Constraints

- Comentarios y copy de la interfaz **en español**, como todo el repo. Los comentarios explican el *porqué*, no el *qué*.
- Sin cambios de esquema ni migraciones. `docs/requirements/data-model.md` no se toca.
- Locale único: `messages/es.json`.
- El chequeo de "en uso" del cliente es **orientativo**: la RLS de `passes` solo deja ver los pases propios y los de perfiles públicos. La protección real es el trigger `block_edition_delete_if_used`, y su error `inUse` debe verse en la interfaz.
- Series quedan fuera: no tienen ediciones.
- Node 22 para correr las pruebas (el shell arranca en v20 y rompe Vitest): `fnm use 22` antes de `npm test`.
- El worktree necesita `.env.local` copiado desde la raíz del repo para que Playwright tenga credenciales.

---

### Task 1: `getUsedEditionIds`

Qué ediciones de una lista tienen algún pase registrado.

**Files:**
- Create: `src/lib/editions/get-used-edition-ids.ts`
- Test: `src/lib/editions/get-used-edition-ids.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `getUsedEditionIds(supabase: SupabaseServerClient, editionIds: string[]): Promise<string[]>` — devuelve los ids **deduplicados** que aparecen en `passes.edition_id`. Con `editionIds` vacío devuelve `[]` sin consultar.

- [ ] **Step 1: Write the failing test**

Crea `src/lib/editions/get-used-edition-ids.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { getUsedEditionIds } from "./get-used-edition-ids";

type Client = Parameters<typeof getUsedEditionIds>[0];

// Doble mínimo del cliente de Supabase: solo la cadena from().select().in(),
// que es lo único que usa la función. `inSpy` deja comprobar que NO se
// consulta cuando no hay ids que preguntar.
function fakeClient(rows: Array<{ edition_id: string | null }>) {
  const inSpy = vi.fn().mockResolvedValue({ data: rows, error: null });
  const client = {
    from: () => ({ select: () => ({ in: inSpy }) }),
  } as unknown as Client;
  return { client, inSpy };
}

describe("getUsedEditionIds", () => {
  it("no consulta nada si no hay ediciones", async () => {
    const { client, inSpy } = fakeClient([]);
    expect(await getUsedEditionIds(client, [])).toEqual([]);
    expect(inSpy).not.toHaveBeenCalled();
  });

  it("deduplica cuando varios pases usan la misma edicion", async () => {
    const { client } = fakeClient([
      { edition_id: "ed-1" },
      { edition_id: "ed-1" },
      { edition_id: "ed-2" },
    ]);
    expect(await getUsedEditionIds(client, ["ed-1", "ed-2", "ed-3"])).toEqual([
      "ed-1",
      "ed-2",
    ]);
  });

  it("descarta los pases sin edicion fijada", async () => {
    const { client } = fakeClient([{ edition_id: null }, { edition_id: "ed-9" }]);
    expect(await getUsedEditionIds(client, ["ed-9"])).toEqual(["ed-9"]);
  });

  it("devuelve lista vacia si la consulta falla", async () => {
    const { client } = fakeClient([]);
    expect(await getUsedEditionIds(client, ["ed-1"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
fnm use 22 && npx vitest run src/lib/editions/get-used-edition-ids.test.ts
```

Esperado: FAIL — `Failed to resolve import "./get-used-edition-ids"`.

- [ ] **Step 3: Write minimal implementation**

Crea `src/lib/editions/get-used-edition-ids.ts`:

```ts
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Qué ediciones de la lista tienen ya algún pase registrado contra ellas. Sirve
// para NO ofrecer el borrado rápido de algo que el trigger
// block_edition_delete_if_used va a rechazar de todas formas.
//
// Es un chequeo ORIENTATIVO, igual que el que hace deleteEdition: la RLS de
// `passes` solo deja ver los pases propios y los de perfiles públicos, así que
// una edición usada solo por perfiles privados no sale aquí. Por eso la
// interfaz sigue teniendo que saber enseñar el error `inUse` cuando el borrado
// falla pese a todo.
export async function getUsedEditionIds(
  supabase: SupabaseServerClient,
  editionIds: string[]
): Promise<string[]> {
  if (editionIds.length === 0) return [];

  const { data } = await supabase
    .from("passes")
    .select("edition_id")
    .in("edition_id", editionIds);

  const used = new Set<string>();
  for (const row of data ?? []) {
    if (row.edition_id) used.add(row.edition_id);
  }
  return [...used];
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/editions/get-used-edition-ids.test.ts
```

Esperado: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editions/get-used-edition-ids.ts src/lib/editions/get-used-edition-ids.test.ts
git commit -m "feat(ediciones): helper para saber que ediciones tienen pases"
```

---

### Task 2: Llevar `usedEditionIds` hasta la tira

Cablear el dato desde las dos fichas hasta `EditionStrip`. Sin cambio visible todavía: esta tarea se valida con `tsc` y `eslint`.

**Files:**
- Modify: `src/components/detail/edition-details.tsx`
- Modify: `src/components/detail/edition-strip.tsx` (solo la firma)
- Modify: `src/app/libro/[id]/page.tsx`
- Modify: `src/app/pelicula/[id]/page.tsx`

**Interfaces:**
- Consumes: `getUsedEditionIds` (Task 1).
- Produces: `EditionStrip` acepta `usedEditionIds: string[]` (prop **obligatoria**); `EditionsSection` acepta `usedEditionIdsPromise: Promise<string[]>` (prop **obligatoria**).

- [ ] **Step 1: Añadir la prop a `EditionsSection`**

En `src/components/detail/edition-details.tsx`, añade `usedEditionIdsPromise` a las dos firmas y resuélvela junto a las ediciones. El fichero queda así de la línea 19 al final:

```tsx
export function EditionsSection({
  itemType,
  itemId,
  editionsPromise,
  usedEditionIdsPromise,
  selectedEditionId,
  canContribute,
  editionsFallback,
}: {
  itemType: ItemType;
  itemId: string;
  /** Se resuelve con las ediciones (posible sync desde OpenLibrary): llega por
   *  streaming, resuelto con use() dentro del <Suspense>. */
  editionsPromise: Promise<Edition[]>;
  /** Ediciones con pases, que NO se pueden borrar. Se encadena sobre
   *  editionsPromise en la página, así que llega por el mismo streaming y no
   *  retrasa la tira. Es `[]` para quien no puede contribuir. */
  usedEditionIdsPromise: Promise<string[]>;
  /** La edición del pase abierto del que mira, si tiene. */
  selectedEditionId: string | null;
  canContribute: boolean;
  /** Fallback de la tira mientras el promise no resuelve. */
  editionsFallback: ReactNode;
}) {
  return (
    <Suspense fallback={editionsFallback}>
      <ResolvedEditionStrip
        itemType={itemType}
        itemId={itemId}
        editionsPromise={editionsPromise}
        usedEditionIdsPromise={usedEditionIdsPromise}
        selectedEditionId={selectedEditionId}
        canContribute={canContribute}
      />
    </Suspense>
  );
}

// Resuelve el promise con use() (React 19): suspende hasta que las ediciones
// están.
function ResolvedEditionStrip({
  editionsPromise,
  usedEditionIdsPromise,
  ...props
}: {
  itemType: ItemType;
  itemId: string;
  editionsPromise: Promise<Edition[]>;
  usedEditionIdsPromise: Promise<string[]>;
  selectedEditionId: string | null;
  canContribute: boolean;
}) {
  const editions = use(editionsPromise);
  const usedEditionIds = use(usedEditionIdsPromise);
  return (
    <EditionStrip
      editions={editions}
      usedEditionIds={usedEditionIds}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Añadir la prop a `EditionStrip`**

En `src/components/detail/edition-strip.tsx`, dentro del bloque de props (que hoy termina en `canContribute: boolean;`), añade:

```tsx
  /** Ediciones con pases registrados: no se ofrece borrarlas. */
  usedEditionIds: string[];
```

y en la desestructuración de parámetros, añade `usedEditionIds,` justo después de `selectedEditionId,`. Aún no se usa: eso es la Task 3.

- [ ] **Step 3: Calcular la promesa en la ficha de libro**

En `src/app/libro/[id]/page.tsx`, justo **después** de la línea que define `canContribute` (`const canContribute = role ? hasMinRole(role, "collaborator") : false;`), añade:

```tsx
  // Solo colaborador+ puede borrar, así que solo para ellos se paga la consulta.
  // Se encadena sobre editionsPromise en vez de esperarla: así el dato viaja por
  // el mismo <Suspense> que la tira y no bloquea la página.
  const usedEditionIdsPromise = canContribute
    ? editionsPromise.then((eds) =>
        getUsedEditionIds(
          supabase,
          eds.map((e) => e.id),
        ),
      )
    : Promise.resolve<string[]>([]);
```

Añade el import junto a los demás de `@/lib/editions/...`:

```tsx
import { getUsedEditionIds } from "@/lib/editions/get-used-edition-ids";
```

Y pasa la prop en el `<EditionsSection>` de esa página, debajo de `editionsPromise={editionsPromise}`:

```tsx
                usedEditionIdsPromise={usedEditionIdsPromise}
```

- [ ] **Step 4: Calcular la promesa en la ficha de película**

En `src/app/pelicula/[id]/page.tsx` las ediciones ya vienen resueltas (no hay sync externo). Justo después de `const canContribute = role ? hasMinRole(role, "collaborator") : false;` añade:

```tsx
  // Mismo criterio que en la ficha de libro: solo colaborador+ paga la consulta.
  // Aquí las ediciones ya están resueltas, así que la promesa es directa.
  const usedEditionIdsPromise = canContribute
    ? getUsedEditionIds(
        supabase,
        editions.map((e) => e.id),
      )
    : Promise.resolve<string[]>([]);
```

Import junto a `getEditions`:

```tsx
import { getUsedEditionIds } from "@/lib/editions/get-used-edition-ids";
```

Y en su `<EditionsSection>`, debajo de `editionsPromise={Promise.resolve(editions)}`:

```tsx
                  usedEditionIdsPromise={usedEditionIdsPromise}
```

- [ ] **Step 5: Comprobar tipos y lint**

```bash
npx tsc --noEmit && npm run lint
```

Esperado: sin errores. Si `tsc` se queja de que falta `usedEditionIdsPromise` en algún `<EditionsSection>`, es que quedó una ficha sin cablear (solo hay dos: libro y película; la de serie pasa `editions={[]}` a `ItemShell` y **no** usa `EditionsSection`).

- [ ] **Step 6: Commit**

```bash
git add src/components/detail/edition-details.tsx src/components/detail/edition-strip.tsx "src/app/libro/[id]/page.tsx" "src/app/pelicula/[id]/page.tsx"
git commit -m "refactor(ediciones): la tira recibe que ediciones estan en uso"
```

---

### Task 3: El `×` y su diálogo de confirmación

**Files:**
- Modify: `src/components/detail/edition-strip.tsx`
- Modify: `messages/es.json`
- Test: `e2e/borrado-rapido-ediciones.spec.ts` (se crea aquí, se ejecuta en la Task 4)

**Interfaces:**
- Consumes: `usedEditionIds` (Task 2); `deleteEdition(editionId: string, itemType: ItemType, itemId: string): Promise<DeleteEditionState>` de `@/lib/catalog/edit-actions`, donde `DeleteEditionState = { error?: "forbidden" | "inUse" | "generic"; ok?: boolean }`.
- Produces: `data-testid="delete-edition"` en el botón `×` y `data-testid="delete-edition-dialog"` en el `<dialog>`, que es de lo que tira el e2e.

- [ ] **Step 1: Añadir las claves de traducción**

En `messages/es.json`, dentro del objeto `"editions"`, junto a las que ya hay (`add`, `yours`, …), añade:

```json
    "delete": "Borrar {label}",
    "confirmTitle": "¿Borrar esta edición?",
    "confirmBody": "Se borra del catálogo para toda la comunidad. No se puede deshacer.",
    "confirmDelete": "Borrar",
    "deleting": "Borrando…",
    "cancel": "Cancelar",
```

Y dentro de `"editions"."errors"`, junto a `forbidden` / `invalidLabel` / `generic`, añade:

```json
      "inUse": "No se puede borrar: hay pases registrados contra esta edición.",
      "deleteFailed": "No se pudo borrar la edición.",
```

(Se añaden claves propias en vez de reusar `errors.forbidden`/`errors.generic`, cuyo texto habla de *añadir* ediciones.)

- [ ] **Step 2: Escribir el e2e (falla porque el botón no existe)**

Crea `e2e/borrado-rapido-ediciones.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Libro del catálogo dev sobre el que se siembra (el mismo que usa happy-path).
const BOOK_ID = "12b43d1b-60d4-4ce6-bd38-1bdf729d4193";
// UUID fijos, como el resto de semillas QA (docs/TESTING.md): permiten limpiar
// ANTES y DESPUÉS, así que una pasada que muera a mitad no envenena la siguiente.
const FREE_EDITION_ID = "e0d17e00-0000-4000-8000-000000000001";
const USED_EDITION_ID = "e0d17e00-0000-4000-8000-000000000002";
const USED_PASS_ID = "e0d17e00-0000-4000-8000-000000000003";

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

async function cleanup() {
  // El pase primero: el trigger block_edition_delete_if_used impide borrar una
  // edición que todavía tenga pases.
  await rest(`passes?id=eq.${USED_PASS_ID}`, { method: "DELETE" });
  await rest(`book_editions?id=in.(${FREE_EDITION_ID},${USED_EDITION_ID})`, {
    method: "DELETE",
  });
}

async function seed() {
  // Guarda de dato: sembrar contra un libro que ya no existe deja filas
  // huérfanas y un fallo ilegible más adelante.
  const books = (await (await rest(`books?id=eq.${BOOK_ID}&select=id`)).json()) as unknown[];
  if (books.length === 0) {
    throw new Error(
      `[borrado-ediciones] el libro ${BOOK_ID} ya no está en \`books\`: elige otro para BOOK_ID.`,
    );
  }

  const profiles = (await (
    await rest(`profiles?username=eq.${USERNAME}&select=user_id`)
  ).json()) as Array<{ user_id: string }>;
  const userId = profiles[0]?.user_id;
  if (!userId) throw new Error(`[borrado-ediciones] no hay perfil con username=${USERNAME}`);

  await cleanup();

  await rest("book_editions", {
    method: "POST",
    body: JSON.stringify([
      { id: FREE_EDITION_ID, book_id: BOOK_ID, label: "QA LIBRE" },
      { id: USED_EDITION_ID, book_id: BOOK_ID, label: "QA EN USO" },
    ]),
  });

  await rest("passes", {
    method: "POST",
    body: JSON.stringify({
      id: USED_PASS_ID,
      user_id: userId,
      item_type: "book",
      item_id: BOOK_ID,
      edition_id: USED_EDITION_ID,
      status: "reading",
      is_active: false,
    }),
  });
}

async function editionExists(id: string): Promise<boolean> {
  const rows = (await (await rest(`book_editions?id=eq.${id}&select=id`)).json()) as unknown[];
  return rows.length > 0;
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// El botón × de una edición concreta: la tarjeta se localiza por su etiqueta.
function deleteButton(page: import("@playwright/test").Page, label: string) {
  return page
    .locator('[data-testid="edition-card"]')
    .filter({ hasText: label })
    .getByTestId("delete-edition");
}

// La cuenta `devtest` es admin en dev, que cumple colaborador+.
test.describe("borrado rápido de ediciones desde la ficha", () => {
  test.skip(!EMAIL || !PASSWORD || !SERVICE_KEY, "TEST_USER_*/SERVICE_KEY no configurados");
  test.setTimeout(90_000);

  test.beforeEach(async () => {
    await seed();
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("una edición sin pases se borra desde la tira; con pases no se ofrece", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/libro/${BOOK_ID}?tab=info`);

    // La edición libre ofrece ×; la que tiene un pase, no.
    await expect(deleteButton(page, "QA LIBRE")).toBeVisible();
    await expect(deleteButton(page, "QA EN USO")).toHaveCount(0);

    // Cancelar no borra.
    await deleteButton(page, "QA LIBRE").click();
    const dialog = page.getByTestId("delete-edition-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    expect(await editionExists(FREE_EDITION_ID)).toBe(true);

    // Confirmar sí borra: la tarjeta desaparece y la fila también.
    await deleteButton(page, "QA LIBRE").click();
    await dialog.getByRole("button", { name: "Borrar", exact: true }).click();
    await expect(
      page.locator('[data-testid="edition-card"]').filter({ hasText: "QA LIBRE" }),
    ).toHaveCount(0);
    expect(await editionExists(FREE_EDITION_ID)).toBe(false);
  });
});
```

> Nota sobre cobertura: el caso «un usuario sin rol no ve el ×» **no** se prueba aquí. La cuenta de pruebas es admin en dev y degradarle el rol a mitad de suite deja el entorno envenenado si la pasada muere. El `×` está detrás de la misma prop `canContribute` que ya gobierna el «+ Añadir edición», así que comparte gate con algo ya cubierto — y la server action revalida el rol por su cuenta.

- [ ] **Step 3: Verificar que el e2e falla**

Con un `next dev` en el puerto 3000 (o dejando que Playwright lo levante):

```bash
npx playwright test e2e/borrado-rapido-ediciones.spec.ts
```

Esperado: FAIL en `expect(deleteButton(page, "QA LIBRE")).toBeVisible()` — el botón todavía no existe.

- [ ] **Step 4: Implementar el `×` y el diálogo**

En `src/components/detail/edition-strip.tsx`:

Imports — cambia la primera línea de imports de React y añade los que faltan:

```tsx
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
```

```tsx
import { deleteEdition, type DeleteEditionState } from "@/lib/catalog/edit-actions";
import { CheckIcon, PlusIcon, XIcon } from "@/components/ui/icons";
```

(la línea `import { CheckIcon, PlusIcon } from "@/components/ui/icons";` se sustituye por la de arriba).

Estado — justo después de `const [expanded, setExpanded] = useState(false);`:

```tsx
  // Borrado rápido (colaborador+): un único <dialog> reutilizado, con la
  // edición pendiente en estado. Mismo patrón que hero-menu.tsx — el <dialog>
  // nativo ya da foco, Escape y cierre por clic fuera.
  const used = new Set(usedEditionIds);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const [pendingDelete, setPendingDelete] = useState<Edition | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteEditionState>({});
  const [deletePending, startDeleteTransition] = useTransition();

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    if (pendingDelete && !dialog.open) dialog.showModal();
    if (!pendingDelete && dialog.open) dialog.close();
  }, [pendingDelete]);

  function askDelete(edition: Edition) {
    // El error de un intento anterior no puede sobrevivir a abrir otra
    // edición: diría "en uso" de algo que sí se puede borrar.
    setDeleteState({});
    setPendingDelete(edition);
  }

  function confirmDelete() {
    const edition = pendingDelete;
    if (!edition) return;
    startDeleteTransition(async () => {
      const result = await deleteEdition(edition.id, itemType, itemId);
      setDeleteState(result);
      // Con error el diálogo SE QUEDA abierto: `inUse` es información útil
      // (hay pases contra esa edición), no un fallo que esconder.
      if (result.ok) setPendingDelete(null);
    });
  }
```

Botón — dentro de la tarjeta, sustituye el bloque actual del `✓`:

```tsx
              {isSelected && (
                <span
                  className={`absolute top-2.5 right-2.5 flex h-4 w-4 items-center justify-center ${accent.text}`}
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
              )}
```

por:

```tsx
              {isSelected && (
                <span
                  className={`absolute top-2.5 right-2.5 flex h-4 w-4 items-center justify-center ${accent.text}`}
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
              )}
              {/* El × no compite con el ✓ por la esquina: la edición marcada
                  como «La tuya» es la del pase abierto de quien mira, así que
                  siempre está en uso y nunca ofrece borrado. */}
              {canContribute && !used.has(edition.id) && (
                <button
                  type="button"
                  data-testid="delete-edition"
                  aria-label={t("delete", { label: edition.label })}
                  onClick={() => askDelete(edition)}
                  className="absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-status-dropped"
                >
                  <XIcon aria-hidden className="h-3 w-3" />
                </button>
              )}
```

Diálogo — antes del `</section>` de cierre, después del formulario de alta:

```tsx
      <dialog
        ref={deleteDialogRef}
        data-testid="delete-edition-dialog"
        onClose={() => setPendingDelete(null)}
        aria-label={t("confirmTitle")}
        className="m-auto w-[min(360px,92vw)] rounded-card border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-scrim"
        onClick={(event) => {
          if (event.target === deleteDialogRef.current) setPendingDelete(null);
        }}
      >
        <div className="flex flex-col gap-3 p-5">
          <p className="text-sm font-semibold">{t("confirmTitle")}</p>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-xs uppercase">
              {pendingDelete?.label}
            </span>
            {" — "}
            {t("confirmBody")}
          </p>

          {deleteState.error && (
            <p className="text-sm text-status-dropped">
              {t(
                deleteState.error === "inUse"
                  ? "errors.inUse"
                  : deleteState.error === "forbidden"
                    ? "errors.forbidden"
                    : "errors.deleteFailed",
              )}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPendingDelete(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={deletePending}
              onClick={confirmDelete}
              className="text-status-dropped"
            >
              {deletePending ? t("deleting") : t("confirmDelete")}
            </Button>
          </div>
        </div>
      </dialog>
```

- [ ] **Step 5: Comprobar tipos y lint**

```bash
npx tsc --noEmit && npm run lint
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/detail/edition-strip.tsx messages/es.json e2e/borrado-rapido-ediciones.spec.ts
git commit -m "feat(ediciones): borrado rapido desde la tira de la ficha"
```

---

### Task 4: Verificación end-to-end

**Files:**
- Modify (si el e2e destapa fallos): `src/components/detail/edition-strip.tsx`, `e2e/borrado-rapido-ediciones.spec.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada nuevo.

- [ ] **Step 1: Dejar un solo `next dev` en el 3000**

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object OwningProcess
```

Si hay uno de otra sesión, mátalo (`Stop-Process -Id <pid>`) antes de seguir: los redirects de Supabase y los e2e esperan el 3000.

- [ ] **Step 2: Correr la suite unitaria completa**

```bash
fnm use 22 && npm test
```

Esperado: PASS (incluidos los 4 tests de `get-used-edition-ids`).

- [ ] **Step 3: Correr el e2e nuevo**

```bash
npx playwright test e2e/borrado-rapido-ediciones.spec.ts
```

Esperado: PASS. Si falla porque la tarjeta «QA LIBRE» no aparece, comprueba que la ficha se abrió en la pestaña Info (`?tab=info`) y que la tira ya salió de su `EditionsLoading` — la primera visita puede sincronizar con OpenLibrary.

- [ ] **Step 4: Correr la suite e2e de la ficha para descartar regresiones**

```bash
npx playwright test e2e/happy-path.spec.ts e2e/pase-hub.spec.ts
```

Esperado: PASS.

- [ ] **Step 5: Commit de cualquier arreglo**

```bash
git add -A
git commit -m "fix(ediciones): ajustes del borrado rapido tras el e2e"
```

(Si no hubo arreglos, no hay commit: salta este paso.)

---

### Task 5: Documentación y pendientes

**Files:**
- Modify: `docs/requirements/decisiones.md`
- Create: issue en GitHub (no es un fichero del repo)

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Añadir la decisión al final de `decisiones.md`**

Append-only: se añade **al final**, sin tocar las entradas anteriores. Copia el formato de la última entrada del fichero (mira las 30 últimas líneas antes de escribir) y registra:

- El `×` vive en la tira de la ficha, no solo en el editor: borrar ediciones basura de OpenLibrary es trabajo repetitivo y el editor cuesta tres gestos por edición.
- Se pide confirmación en vez de ofrecer deshacer: el borrado es del catálogo compartido y un «deshacer» real implicaría recrear la fila con otro id.
- Se asume a sabiendas el límite de la RLS de `passes` (una edición usada solo por perfiles privados sí enseña el `×` y falla con `inUse` al confirmar). Se descarta la RPC `SECURITY DEFINER` en este cambio porque exige migración en dev y prod.

- [ ] **Step 2: Abrir la issue de la detección exacta**

```bash
gh issue create --title "Detección exacta de ediciones en uso (RPC SECURITY DEFINER)" --body "..."
```

El cuerpo debe contener, para quien lo lea sin contexto dentro de seis meses:

- **Qué pasa:** el `×` de borrado rápido de la tira de ediciones (y el chequeo previo de `deleteEdition`) cuentan pases a través de la RLS de `passes`, que solo deja ver los propios y los de perfiles públicos. Una edición usada únicamente por perfiles privados aparece como borrable.
- **Qué se espera:** que esa edición no ofrezca el `×`.
- **Cómo reproducirlo:** con dos cuentas — la B con el perfil en privado registra un pase contra una edición; la A (colaborador) abre la ficha y ve el `×` en esa edición; al confirmar, el borrado falla con «hay pases registrados contra esta edición».
- **Qué acota el problema:** no es un agujero de datos — el trigger `block_edition_delete_if_used` (`20260714_editions_f_delete_guard.sql`) sí ve todos los pases e impide el borrado. El fallo es de interfaz: se ofrece una acción que no se puede completar.
- **Arreglo propuesto:** una RPC `SECURITY DEFINER` que reciba una lista de ids y devuelva los que tienen pases, sustituyendo a `getUsedEditionIds` (`src/lib/editions/get-used-edition-ids.ts`) y al `count` de `deleteEdition` (`src/lib/catalog/edit-actions.ts`). Exige migración en dev y luego en prod.

- [ ] **Step 3: Commit de la documentación**

```bash
git add docs/requirements/decisiones.md
git commit -m "docs(decisiones): borrado rapido de ediciones desde la ficha"
```

---

## Nota sobre `backlog.md`

Esto no cierra ninguna casilla del backlog: es una mejora de ergonomía sobre el borrado que ya existía (plan `2026-07-14-ediciones-ficha-y-editor.md`), no una feature pendiente listada. Si al mirar `docs/requirements/backlog.md` aparece un punto que sí lo cubre, márcalo en la Task 5.
