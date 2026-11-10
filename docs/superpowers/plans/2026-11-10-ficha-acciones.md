# Botones y acciones de la ficha — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir «Seguir» por tres intenciones y convertir la tarjeta del pase en el mando de la obra (estado, acción principal y nota), dejando Mi registro para el historial.

**Architecture:** La lógica de transición que hoy vive en `LogPanel` y `useFollow` pasa a un proveedor único, `PassActionsProvider`, montado a la altura de la ficha: expone `usePassActions()` y monta una sola vez las hojas de cierre, nuevo pase y retomar. `PassCard`, `StickyPassCta` y `LogPanel` consumen ese hook. Qué botón toca en cada estado sale de una tabla pura.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, next-intl, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-ficha-acciones-design.md`

## Global Constraints

- **Requisito previo:** la PR 1617 (ficha cartel) mergeada en `main`, y esta rama (`claude/ficha-acciones`) rebasada sobre `main`. No empieces antes.
- **No cambian** las server actions (`updateStatus`, `addExistingItemToLibrary`, `ratePass`, `removeFromLibrary`, `closePass`), `applyTransition`, el esquema ni las hojas de sesión y cierre.
- **Regla #437:** ningún `use cache` nuevo. Todo lo de aquí depende del usuario.
- **`ItemStatusContext` sigue siendo la fuente del estado optimista.** `aria-busy` mientras hay una escritura en vuelo (#106).
- **Se conservan:** `data-testid="status-badge"` en el control de estado de la tarjeta; la validación en servidor de `?cerrar` contra el pase ACTIVO; el aviso de `removeFromLibrary` con `window.confirm`; una sola instancia de cada hoja.
- **Películas no tienen «en curso»**, salvo un pase heredado que lo tenga.
- **Sin sesión iniciada:** ninguna intención escribe; todas van a `loginHref(pathname)`.
- **Copy** en español en `messages/es.json`. Textos exactos en la Task 1.
- **Entorno (Windows, PowerShell):**
  - Si no existe, crea el junction una vez y no lo borres: `New-Item -ItemType Junction -Path node_modules -Target D:\Proyectos\Personal\Biblioshare\node_modules`.
  - Prefijo de cada comando de Node: `fnm env | Out-String | Invoke-Expression; fnm use 22;`. Encadena con `;`.
  - `next dev` y `next build` necesitan `--webpack`. Un solo servidor en el puerto 3000; mátalo al terminar.
  - Escribe ficheros con las herramientas de edición (UTF-8).
- **Commits:** cada mensaje termina con una línea en blanco y `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

---

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/lib/passes/pass-actions.ts` (+ test) | Crear | Tabla pura: intenciones por tipo y acción principal por estado |
| `messages/es.json` | Modificar | Textos de intenciones y acciones |
| `src/components/detail/pass-actions-provider.tsx` (+ test) | Crear | Hook `usePassActions`, hojas montadas una vez, `?cerrar` |
| `src/components/detail/pass-card.tsx` (+ test) | Modificar | Vista de intenciones y vista de mando |
| `src/components/detail/sticky-pass-cta.tsx` | Modificar | Usa la acción principal |
| `src/components/detail/use-follow.ts` | Borrar | Lo sustituye el proveedor |
| `src/components/detail/log-panel.tsx` (+ tests) | Modificar | Sin selector, sin enlace de quitar, sin hojas |
| `src/app/{libro,pelicula,serie}/[id]/page.tsx` | Modificar | Montan el proveedor y le pasan sus datos |
| `e2e/ficha-acciones.spec.ts` | Crear | Intenciones, mando y cierre |
| e2e existentes | Modificar | «Seguir» y selector en Mi registro |
| Docs | Modificar | `decisiones.md`, backlog, glosario, grafo, issue #1164 |

---

### Task 1: Tabla de acciones y textos

**Files:**
- Create: `src/lib/passes/pass-actions.ts`, `src/lib/passes/pass-actions.test.ts`
- Modify: `messages/es.json`

**Interfaces:**
- Produces:
  - `type Intent = "want" | "started" | "done"`
  - `intentsFor(itemType: ItemType): Intent[]`
  - `intentStatus(intent: Intent): MediaStatus`
  - `type PrimaryAction = "start" | "session" | "episode" | "watched" | "again" | "resume"`
  - `primaryAction(itemType: ItemType, status: MediaStatus): PrimaryAction`
  - Claves `item.intent.<want|started|done>.<book|movie|series>` e `item.action.<PrimaryAction>.<book|movie|series>`

- [ ] **Step 1: Escribe el test**

```ts
// src/lib/passes/pass-actions.test.ts
import { describe, expect, it } from "vitest";
import messages from "../../../messages/es.json";
import { intentStatus, intentsFor, primaryAction } from "./pass-actions";

describe("intentsFor", () => {
  it("libro y serie ofrecen tres; película, dos (no tiene «en curso»)", () => {
    expect(intentsFor("book")).toEqual(["want", "started", "done"]);
    expect(intentsFor("series")).toEqual(["want", "started", "done"]);
    expect(intentsFor("movie")).toEqual(["want", "done"]);
  });
  it("cada intención deja un estado", () => {
    expect(intentStatus("want")).toBe("planned");
    expect(intentStatus("started")).toBe("in_progress");
    expect(intentStatus("done")).toBe("completed");
  });
});

describe("primaryAction", () => {
  it.each([
    ["book", "planned", "start"], ["book", "in_progress", "session"], ["book", "completed", "again"], ["book", "dropped", "resume"],
    ["series", "planned", "episode"], ["series", "in_progress", "episode"], ["series", "completed", "again"], ["series", "dropped", "resume"],
    ["movie", "planned", "watched"], ["movie", "in_progress", "watched"], ["movie", "completed", "again"], ["movie", "dropped", "resume"],
  ] as const)("%s %s → %s", (type, status, action) => {
    expect(primaryAction(type, status)).toBe(action);
  });
});

describe("textos", () => {
  const item = messages.item as unknown as {
    intent: Record<string, Record<string, string>>;
    action: Record<string, Record<string, string>>;
  };
  it("hay texto para cada intención y tipo que se ofrece", () => {
    for (const type of ["book", "movie", "series"] as const) {
      for (const intent of intentsFor(type)) expect(item.intent[intent][type], `${intent}.${type}`).toBeTruthy();
    }
  });
  it("hay texto para cada acción principal alcanzable", () => {
    for (const type of ["book", "movie", "series"] as const) {
      for (const status of ["planned", "in_progress", "completed", "dropped"] as const) {
        const action = primaryAction(type, status);
        expect(item.action[action][type], `${action}.${type}`).toBeTruthy();
      }
    }
  });
  it("los textos acordados", () => {
    expect(item.intent.want.book).toBe("Quiero leerlo");
    expect(item.intent.done.movie).toBe("Ya la vi");
    expect(item.action.watched.movie).toBe("Marcar vista");
    expect(item.action.again.movie).toBe("Registrar otro visionado");
  });
});
```

- [ ] **Step 2: Comprueba que falla**

Run: `npx vitest run src/lib/passes/pass-actions.test.ts`
Expected: FAIL; el módulo no existe.

- [ ] **Step 3: Implementa**

```ts
// src/lib/passes/pass-actions.ts
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";

// Qué se ofrece en la ficha (spec 2026-11-10). Puro: los textos viven en
// messages/es.json → item.intent.* e item.action.*.

export type Intent = "want" | "started" | "done";

// Una película se ve de una sentada: no tiene «la estoy viendo».
export function intentsFor(itemType: ItemType): Intent[] {
  return itemType === "movie" ? ["want", "done"] : ["want", "started", "done"];
}

const INTENT_STATUS: Record<Intent, MediaStatus> = {
  want: "planned",
  started: "in_progress",
  done: "completed",
};

export function intentStatus(intent: Intent): MediaStatus {
  return INTENT_STATUS[intent];
}

export type PrimaryAction = "start" | "session" | "episode" | "watched" | "again" | "resume";

export function primaryAction(itemType: ItemType, status: MediaStatus): PrimaryAction {
  if (status === "completed") return "again";
  if (status === "dropped") return "resume";
  if (itemType === "movie") return "watched";
  if (itemType === "series") return "episode";
  return status === "planned" ? "start" : "session";
}
```

En `messages/es.json`, dentro de `"item"`, añade:

```json
"intent": {
  "want": { "book": "Quiero leerlo", "movie": "Quiero verla", "series": "Quiero verla" },
  "started": { "book": "Lo estoy leyendo", "series": "La estoy viendo" },
  "done": { "book": "Ya lo leí", "movie": "Ya la vi", "series": "Ya la vi" }
},
"action": {
  "start": { "book": "Empezar a leer" },
  "session": { "book": "Registrar sesión" },
  "episode": { "series": "Marcar episodio" },
  "watched": { "movie": "Marcar vista" },
  "again": { "book": "Volver a leer", "movie": "Registrar otro visionado", "series": "Volver a verla" },
  "resume": { "book": "Retomar", "movie": "Retomar", "series": "Retomar" }
},
"actionError": "No se pudo guardar. Inténtalo de nuevo.",
"doneButPlanned": "La añadimos como pendiente, pero no se pudo marcar como terminada."
```

Valida el JSON con `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8'))"`.

- [ ] **Step 4: Comprueba que pasa**

Run: `npx vitest run src/lib/passes/pass-actions.test.ts; npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/passes/pass-actions.ts src/lib/passes/pass-actions.test.ts messages/es.json
git commit -m "feat(ficha): tabla de intenciones y acción principal por estado"
```

---

### Task 2: `PassActionsProvider`

**Files:**
- Create: `src/components/detail/pass-actions-provider.tsx`, `src/components/detail/pass-actions-provider.test.tsx`
- Modify: `src/app/libro/[id]/page.tsx`, `src/app/pelicula/[id]/page.tsx`, `src/app/serie/[id]/page.tsx`

**Interfaces:**
- Consumes: `Intent`, `intentStatus`, `primaryAction` (Task 1); `useItemStatus`; `updateStatus`, `addExistingItemToLibrary`, `ratePass`; `ClosePassSheet`, `NewPassSheet`, `ResumePassSheet`; `loginHref`.
- Produces:
  - `PassActionsProvider({ itemType, itemId, isLoggedIn, activePassId, activePassOpen, sessionHref, droppedAtLabel, initialClosingPassId, children })`
    - `activePassOpen: boolean` — el pase activo está pendiente o en curso.
    - `sessionHref: string | null` — a dónde lleva «Registrar sesión» / «Marcar episodio».
  - `usePassActions(): { isPending: boolean; error: "actionError" | "doneButPlanned" | null; addWith(intent: Intent): void; changeStatus(next: MediaStatus): void; runPrimary(): void; newPass(): void; rate(rating: number): void }`

- [ ] **Step 1: Lee antes de escribir**

Lee enteros `src/components/detail/log-panel.tsx` (de la línea 150 a la 300 y de la 512 a la 560: `handleNewPass`, `handleStatusChange`, el seguimiento de `initialClosingPassId` y el montaje de las tres hojas) y `src/components/detail/use-follow.ts`. La lógica se **mueve**, con sus comentarios, no se reescribe.

- [ ] **Step 2: Escribe el test**

```tsx
// src/components/detail/pass-actions-provider.test.tsx
// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaStatus } from "@/lib/library/types";

const h = vi.hoisted(() => ({
  updateStatus: vi.fn(), add: vi.fn(), rate: vi.fn(), push: vi.fn(), refresh: vi.fn(),
}));
vi.mock("@/lib/library/manage-actions", () => ({ updateStatus: h.updateStatus }));
vi.mock("@/lib/library/add-existing-item", () => ({ addExistingItemToLibrary: h.add }));
vi.mock("@/lib/passes/actions", () => ({ ratePass: h.rate }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: vi.fn(), refresh: h.refresh }),
  usePathname: () => "/libro/b1",
}));
vi.mock("./close-pass-sheet", () => ({
  ClosePassSheet: ({ passId, status }: { passId: string; status: string }) => <div data-testid="close-sheet">{passId}:{status}</div>,
}));
vi.mock("./new-pass-sheet", () => ({ NewPassSheet: () => <div data-testid="new-pass-sheet" /> }));
vi.mock("./resume-pass-sheet", () => ({ ResumePassSheet: () => <div data-testid="resume-sheet" /> }));

import { ItemStatusProvider, useItemStatus } from "./item-status-context";
import { PassActionsProvider, usePassActions } from "./pass-actions-provider";

let api: ReturnType<typeof usePassActions>;
function Probe() {
  api = usePassActions();
  const { status } = useItemStatus();
  return <output data-testid="status">{status ?? "none"}</output>;
}
function mount(over: Partial<Parameters<typeof PassActionsProvider>[0]> = {}, status: MediaStatus | null = null) {
  return render(
    <ItemStatusProvider initialStatus={status}>
      <PassActionsProvider itemType="book" itemId="b1" isLoggedIn activePassId={null} activePassOpen={false}
        sessionHref={null} droppedAtLabel="" initialClosingPassId={null} {...over}>
        <Probe />
      </PassActionsProvider>
    </ItemStatusProvider>,
  );
}
const done = (over = {}) => ({ kind: "done", passId: "p1", closed: false, created: true, ...over });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => { Object.values(h).forEach((f) => f.mockReset()); h.add.mockResolvedValue(undefined); h.updateStatus.mockResolvedValue(done()); });
afterEach(cleanup);

describe("addWith", () => {
  it("«quiero»: añade como pendiente, optimista, sin cambiar de estado después", async () => {
    mount();
    act(() => api.addWith("want"));
    expect(screen.getByTestId("status").textContent).toBe("planned");
    await flush();
    expect(h.add).toHaveBeenCalledWith("book", "b1");
    expect(h.updateStatus).not.toHaveBeenCalled();
  });
  it("«lo estoy leyendo»: añade y pasa a en curso", async () => {
    mount();
    act(() => api.addWith("started"));
    expect(screen.getByTestId("status").textContent).toBe("in_progress");
    await flush();
    expect(h.updateStatus).toHaveBeenCalledWith("book", "b1", "in_progress");
  });
  it("«ya lo leí»: termina y abre la hoja de cierre", async () => {
    h.updateStatus.mockResolvedValue(done({ closed: true }));
    mount();
    act(() => api.addWith("done"));
    await flush();
    expect(screen.getByTestId("close-sheet").textContent).toBe("p1:completed");
  });
  it("si falla el segundo paso, queda pendiente y avisa", async () => {
    h.updateStatus.mockRejectedValue(new Error("x"));
    mount();
    act(() => api.addWith("done"));
    await flush();
    expect(screen.getByTestId("status").textContent).toBe("planned");
    expect(api.error).toBe("doneButPlanned");
  });
  it("si falla el añadir, vuelve a no estar en la biblioteca", async () => {
    h.add.mockRejectedValue(new Error("x"));
    mount();
    act(() => api.addWith("want"));
    await flush();
    expect(screen.getByTestId("status").textContent).toBe("none");
    expect(api.error).toBe("actionError");
  });
  it("sin sesión no escribe: va a login", () => {
    mount({ isLoggedIn: false });
    act(() => api.addWith("want"));
    expect(h.add).not.toHaveBeenCalled();
    expect(h.push).toHaveBeenCalledWith(expect.stringContaining("/login"));
  });
  it("ignora un segundo toque mientras guarda", async () => {
    mount();
    act(() => { api.addWith("want"); api.addWith("want"); });
    await flush();
    expect(h.add).toHaveBeenCalledTimes(1);
  });
});

describe("changeStatus", () => {
  it("terminar abre la hoja de cierre con ese estado", async () => {
    h.updateStatus.mockResolvedValue(done({ closed: true }));
    mount({}, "in_progress");
    act(() => api.changeStatus("dropped"));
    await flush();
    expect(screen.getByTestId("close-sheet").textContent).toBe("p1:dropped");
  });
  it("askResume revierte el estado y abre la pregunta", async () => {
    h.updateStatus.mockResolvedValue({ kind: "askResume" });
    mount({}, "dropped");
    act(() => api.changeStatus("in_progress"));
    await flush();
    expect(screen.getByTestId("status").textContent).toBe("dropped");
    expect(screen.getByTestId("resume-sheet")).toBeTruthy();
  });
  it("no abre el cierre si llega closed sin passId", async () => {
    h.updateStatus.mockResolvedValue(done({ closed: true, passId: "" }));
    mount({}, "in_progress");
    act(() => api.changeStatus("completed"));
    await flush();
    expect(screen.queryByTestId("close-sheet")).toBeNull();
  });
  it("si falla, revierte y avisa", async () => {
    h.updateStatus.mockRejectedValue(new Error("x"));
    mount({}, "in_progress");
    act(() => api.changeStatus("completed"));
    await flush();
    expect(screen.getByTestId("status").textContent).toBe("in_progress");
    expect(api.error).toBe("actionError");
  });
});

describe("runPrimary", () => {
  it("libro pendiente: pasa a en curso y abre la sesión del pase", async () => {
    mount({}, "planned");
    act(() => api.runPrimary());
    await flush();
    expect(h.updateStatus).toHaveBeenCalledWith("book", "b1", "in_progress");
    expect(h.push).toHaveBeenCalledWith("/sesion/p1");
  });
  it("libro en curso: va a la sesión sin escribir", () => {
    mount({ sessionHref: "/sesion/p9" }, "in_progress");
    act(() => api.runPrimary());
    expect(h.push).toHaveBeenCalledWith("/sesion/p9");
    expect(h.updateStatus).not.toHaveBeenCalled();
  });
  it("película pendiente: marca vista y abre el cierre", async () => {
    h.updateStatus.mockResolvedValue(done({ closed: true }));
    mount({ itemType: "movie" }, "planned");
    act(() => api.runPrimary());
    await flush();
    expect(h.updateStatus).toHaveBeenCalledWith("movie", "b1", "completed");
    expect(screen.getByTestId("close-sheet")).toBeTruthy();
  });
  it("película vista: otro visionado, ya cerrado, con su hoja", async () => {
    h.updateStatus.mockResolvedValue(done({ closed: true }));
    mount({ itemType: "movie" }, "completed");
    act(() => api.runPrimary());
    await flush();
    expect(h.updateStatus).toHaveBeenCalledWith("movie", "b1", "completed", "restart");
    expect(screen.getByTestId("close-sheet")).toBeTruthy();
  });
  it("libro terminado: nuevo pase en curso", async () => {
    mount({}, "completed");
    act(() => api.runPrimary());
    await flush();
    expect(h.updateStatus).toHaveBeenCalledWith("book", "b1", "in_progress", "restart");
  });
  it("abandonado: intenta retomar", async () => {
    h.updateStatus.mockResolvedValue({ kind: "askResume" });
    mount({}, "dropped");
    act(() => api.runPrimary());
    await flush();
    expect(screen.getByTestId("resume-sheet")).toBeTruthy();
  });
});

describe("newPass", () => {
  it("con el pase aún abierto, pregunta cómo cerrarlo", () => {
    mount({ activePassOpen: true }, "in_progress");
    act(() => api.newPass());
    expect(screen.getByTestId("new-pass-sheet")).toBeTruthy();
    expect(h.updateStatus).not.toHaveBeenCalled();
  });
});

describe("rate", () => {
  it("puntúa el pase activo", async () => {
    mount({ activePassId: "p1" }, "completed");
    act(() => api.rate(8));
    await flush();
    expect(h.rate).toHaveBeenCalledWith("p1", "book", "b1", 8);
  });
  it("sin pase activo no hace nada", () => {
    mount({}, null);
    act(() => api.rate(8));
    expect(h.rate).not.toHaveBeenCalled();
  });
});

describe("?cerrar", () => {
  it("abre el cierre desde el primer pintado, y de nuevo si cambia", () => {
    const { rerender } = mount({ initialClosingPassId: "p7" }, "completed");
    expect(screen.getByTestId("close-sheet").textContent).toBe("p7:completed");
    rerender(
      <ItemStatusProvider initialStatus="completed">
        <PassActionsProvider itemType="book" itemId="b1" isLoggedIn activePassId="p8" activePassOpen={false}
          sessionHref={null} droppedAtLabel="" initialClosingPassId="p8"><Probe /></PassActionsProvider>
      </ItemStatusProvider>,
    );
    expect(screen.getByTestId("close-sheet").textContent).toBe("p8:completed");
  });
});

it("usePassActions fuera del proveedor lanza", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<Probe />)).toThrow();
  spy.mockRestore();
});
```

- [ ] **Step 3: Comprueba que falla**

Run: `npx vitest run src/components/detail/pass-actions-provider.test.tsx`
Expected: FAIL; el módulo no existe.

- [ ] **Step 4: Implementa**

Reglas del proveedor (es un componente cliente):

- **Estado propio:** `closingPassId`, `closingStatus`, `resumeOpen`, `newPassOpen`, `error`, y `useTransition` para `isPending`. Un `ref` de «ocupado» que ignora cualquier llamada mientras hay otra en vuelo.
- **Cada escritura** hace `setSaving(true)` antes y `setSaving(false)` en `finally`, limpia `error` al empezar y llama a `router.refresh()` al terminar con éxito.
- **`addWith(intent)`:**
  1. Sin sesión: `router.push(loginHref(pathname))` y fin.
  2. `setStatus(intentStatus(intent))`.
  3. `await addExistingItemToLibrary(itemType, itemId)`. Si falla: `setStatus(null)`, `error = "actionError"`.
  4. Si `intent !== "want"`: `await updateStatus(itemType, itemId, intentStatus(intent))`. Si falla: `setStatus("planned")`, `error = "doneButPlanned"`. Si vuelve `closed` con `passId`: abre el cierre con `"completed"`.
- **`changeStatus(next)`:** el cuerpo actual de `handleStatusChange`, con la reversión al estado anterior si la acción lanza.
- **`newPass()`:** el cuerpo actual de `handleNewPass`, usando `activePassOpen` en lugar de buscar en `passes`.
- **`runPrimary()`**, según `primaryAction(itemType, status)`:

  | Acción | Qué hace |
  |---|---|
  | `start` | `updateStatus(…, "in_progress")` y `router.push("/sesion/" + outcome.passId)` |
  | `session`, `episode` | `router.push(sessionHref)` si existe |
  | `watched` | `changeStatus("completed")` |
  | `again` | `newPass()` |
  | `resume` | `changeStatus("in_progress")` |

- **`rate(rating)`:** si hay `activePassId`, `ratePass(activePassId, itemType, itemId, rating)`; si falla, `error = "actionError"`.
- **`?cerrar`:** el seguimiento de `initialClosingPassId` durante el render (patrón `prev`), tal como está en `LogPanel`, con su comentario.
- **Hojas:** las tres, montadas aquí con las mismas props que hoy. `ResumePassSheet` recibe `droppedAtLabel`.
- **`usePassActions`** lanza si no hay proveedor, como `useItemStatus`.

En las tres páginas, dentro de `ItemStatusProvider` y envolviendo `ItemShell`:

```tsx
<PassActionsProvider
  itemType="book"
  itemId={book.id}
  isLoggedIn={Boolean(user)}
  activePassId={activePass?.id ?? null}
  activePassOpen={activePass?.status === "planned" || activePass?.status === "in_progress"}
  sessionHref={activePass ? `/sesion/${activePass.id}` : null}
  droppedAtLabel={activePass ? formatPosition("book", activePass.position) : ""}
  initialClosingPassId={cerrar && cerrar === activePass?.id ? cerrar : null}
>
```

- `sessionHref`: libro → `/sesion/<id>`; serie → `/serie/<id>?tab=episodes`; película → `null`.
- `cerrar` ya se lee en el componente de detalle (`const { cerrar } = await searchParams`). Comprueba en cada página que `activePass` es el pase con `is_active`; si esa variable significa «pase abierto», obtén el activo como lo hace el componente de pestañas (`passes.find((p) => p.isActive)`), sin añadir consultas.
- Deja de pasar `initialClosingPassId` a `LogPanel` en la Task 4, no ahora: hasta entonces conviven y la hoja se abriría dos veces. Para evitarlo en este commit, pasa `initialClosingPassId={null}` a `LogPanel` ya.

- [ ] **Step 5: Comprueba que pasa**

Run: `npx vitest run src/components/detail; npx tsc --noEmit; npm run lint`
Expected: PASS y 0 errores.

- [ ] **Step 6: Commit**

```bash
git add -A src/components/detail src/app/libro src/app/pelicula src/app/serie
git commit -m "feat(ficha): proveedor único de acciones del pase y sus hojas"
```

---

### Task 3: La tarjeta como mando

**Files:**
- Modify: `src/components/detail/pass-card.tsx`, `src/components/detail/pass-card.test.tsx`, `src/components/detail/sticky-pass-cta.tsx`
- Delete: `src/components/detail/use-follow.ts`
- Modify: las tres páginas (props de `PassCard` y `StickyPassCta`)

**Interfaces:**
- Consumes: `usePassActions` (Task 2); `intentsFor`, `primaryAction` (Task 1); `StatusSegments`; `RatingDots`.
- Produces:
  - `PassCard({ itemType, progress, rating })` — desaparecen `itemId`, `isLoggedIn`, `labels`, `ctaHref`, `ctaLabel`, `ratingLabel`, `goToLogLabel`.
  - `StickyPassCta({ itemType })`.

- [ ] **Step 1: Reescribe el test**

Sustituye los casos de `pass-card.test.tsx` por estos, envolviendo en `ItemStatusProvider` y en un `PassActionsProvider` mockeado (`vi.mock("./pass-actions-provider", …)` que exponga un `usePassActions` con `vi.fn()` por método):

```tsx
it("sin pase: tres intenciones en libro, la primera como principal", () => {
  renderCard({ itemType: "book" }, null);
  const buttons = screen.getAllByRole("button").map((b) => b.textContent);
  expect(buttons).toEqual(["Quiero leerlo", "Lo estoy leyendo", "Ya lo leí"]);
  expect(screen.queryByText("Seguir")).toBeNull();
});
it("sin pase: dos intenciones en película", () => {
  renderCard({ itemType: "movie" }, null);
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Quiero verla", "Ya la vi"]);
});
it("una intención llama a addWith", () => {
  renderCard({ itemType: "book" }, null);
  fireEvent.click(screen.getByRole("button", { name: "Ya lo leí" }));
  expect(actions.addWith).toHaveBeenCalledWith("done");
});
it("con pase: el estado se cambia en la tarjeta", () => {
  renderCard({ itemType: "book" }, "in_progress");
  const group = screen.getByRole("group", { name: "Tu estado" });
  fireEvent.click(within(group).getByRole("button", { name: /Leído/ }));
  expect(actions.changeStatus).toHaveBeenCalledWith("completed");
});
it.each([
  ["book", "planned", "Empezar a leer"], ["book", "in_progress", "Registrar sesión"],
  ["series", "in_progress", "Marcar episodio"], ["movie", "planned", "Marcar vista"],
  ["movie", "completed", "Registrar otro visionado"], ["book", "dropped", "Retomar"],
] as const)("%s %s: botón «%s»", (itemType, status, label) => {
  renderCard({ itemType }, status);
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(actions.runPrimary).toHaveBeenCalledTimes(1);
});
it("la nota se pone en la tarjeta", () => {
  renderCard({ itemType: "book", rating: null }, "completed");
  fireEvent.click(screen.getByRole("button", { name: "8/10" }));
  expect(actions.rate).toHaveBeenCalledWith(8);
});
it("pendiente: sin nota", () => {
  renderCard({ itemType: "book" }, "planned");
  expect(screen.queryByRole("button", { name: "8/10" })).toBeNull();
});
it("mientras guarda, todo deshabilitado y aria-busy", () => {
  actions.isPending = true;
  renderCard({ itemType: "book" }, "in_progress");
  screen.getAllByRole("button").forEach((b) => expect(b).toHaveProperty("disabled", true));
  expect(screen.getByTestId("status-badge").getAttribute("aria-busy")).toBe("true");
});
it("muestra el error con role=alert", () => {
  actions.error = "actionError";
  renderCard({ itemType: "book" }, "in_progress");
  expect(screen.getByRole("alert").textContent).toContain("No se pudo guardar");
});
it("conserva la barra de progreso", () => {
  renderCard({ itemType: "book", progress: { percent: 41, left: "pág. 100 / 244", right: "41%" } }, "in_progress");
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("41");
});
```

Comprueba el nombre accesible real de los botones de `StatusSegments` y de `RatingDots` antes de fijar los selectores.

- [ ] **Step 2: Comprueba que falla**

Run: `npx vitest run src/components/detail/pass-card.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementa**

- **Sin pase (`status === null`):** un botón por intención de `intentsFor(itemType)`, con `t(\`intent.${intent}.${itemType}\`)`. El primero es `<Button>` principal a todo el ancho; los demás, secundarios, en una fila de dos columnas (en película, uno solo a todo el ancho). Todos `disabled={isPending}` y `onClick={() => addWith(intent)}`.
- **Con pase:**
  - `StatusSegments` con `status`, `itemType`, `onChange={changeStatus}`, `disabled={isPending}`, envuelto en un contenedor con `data-testid="status-badge"` y `aria-busy={isSaving}`.
  - La barra de progreso, sin cambios.
  - Botón principal: `t(\`action.${primaryAction(itemType, status)}.${itemType}\`)`, `onClick={runPrimary}`. Es un `<button>`, no un enlace: la navegación la hace el proveedor.
  - Nota: `RatingDots` con `onChange={rate}`, solo si `status !== "planned"`. Estado local optimista de la nota, resincronizado con la prop `rating` (patrón `prev` durante el render).
- **Error:** `{error && <p role="alert">{t(error)}</p>}`.
- `StickyPassCta`: mismo texto y `runPrimary`; se sigue ocultando sin pase.
- Borra `use-follow.ts` y las claves `item.follow`/`item.following` de `messages/es.json` **solo** si `grep -rn "\"follow\"\|t(\"follow" src` no encuentra otros usos en ese namespace. `LogPanel` usa `t("following")` en su placeholder: se resuelve en la Task 4.
- En las páginas, quita de `PassCard` y `StickyPassCta` las props que ya no existen, y las variables que queden sin uso (`railLabels`, etc.).

- [ ] **Step 4: Comprueba que pasa**

Run: `npx vitest run src/components/detail; npx tsc --noEmit; npm run lint`
Expected: PASS y 0 errores.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/detail src/app/libro src/app/pelicula src/app/serie messages
git commit -m "feat(ficha): intenciones y tarjeta como mando de la obra"
```

---

### Task 4: Mi registro, solo historial

**Files:**
- Modify: `src/components/detail/log-panel.tsx`, `src/components/detail/log-panel.edition-pages.test.tsx` y demás tests de `log-panel`
- Modify: las tres páginas (dejan de pasar `initialClosingPassId`)

- [ ] **Step 1: Escribe el test**

Añade a un test de `LogPanel` (con `usePassActions` mockeado):

```tsx
it("no pinta el selector de estado ni el enlace de quitar", () => {
  renderLog();
  expect(screen.queryByRole("group", { name: "Tu estado" })).toBeNull();
  expect(screen.queryByText("Quitar de mi biblioteca")).toBeNull();
});
it("«Nuevo pase» delega en el proveedor", () => {
  renderLog({ status: "completed" });
  fireEvent.click(screen.getByRole("button", { name: /Nuevo pase/i }));
  expect(actions.newPass).toHaveBeenCalledTimes(1);
});
it("no monta hojas propias", () => {
  const { container } = renderLog();
  expect(container.querySelector("dialog")).toBeNull();
});
```

Run: `npx vitest run src/components/detail/log-panel`
Expected: FAIL.

- [ ] **Step 2: Implementa**

En `log-panel.tsx`:

- Quita `StatusSegments`, el botón rojo de quitar, las tres hojas y su estado (`closingPassId`, `closingStatus`, `resumeOpen`, `newPassOpen`), `handleStatusChange`, `handleNewPass` y la prop `initialClosingPassId`.
- «Nuevo pase» llama a `usePassActions().newPass` y usa su `isPending`.
- Quita los imports que queden sin uso (`updateStatus`, `removeFromLibrary`, las hojas…). `ratePass` se queda si `PassDataPanel` lo sigue usando.
- El placeholder `FollowingPlaceholder` se queda con un texto propio: cambia `t("following")` por la clave nueva `item.addingToLibrary` («Añadiendo…»).
- Reajusta los `order-N` que queden con huecos, sin cambiar el orden visible del resto.

En las páginas, quita `initialClosingPassId` de `LogPanel` y el cálculo que ya no se use.

- [ ] **Step 3: Verifica**

Run: `npx vitest run src/components/detail; npx tsc --noEmit; npm run lint`
Expected: PASS y 0 errores.

Después, con `npx next dev --webpack -p 3000` y un spec temporal que no se commitea, captura a 412 y 1440 px, en claro y oscuro: obra sin añadir (libro y película), libro en curso, película vista y Mi registro. Comprueba que la tarjeta cabe bajo el título en móvil con el selector de cuatro estados, que no hay scroll horizontal y que no hay errores en consola. Para el servidor.

- [ ] **Step 4: Commit**

```bash
git add -A src/components/detail src/app/libro src/app/pelicula src/app/serie messages
git commit -m "feat(ficha): Mi registro queda para el historial"
```

---

### Task 5: e2e

**Files:**
- Create: `e2e/ficha-acciones.spec.ts`
- Modify: los specs que usan «Seguir» o el selector en Mi registro

- [ ] **Step 1: Localiza lo que cambia**

Run: `grep -rln -E '"Seguir"|Seguir"|status-badge|tab=log|Tu estado|statusSegments' e2e`
Lee cada resultado y anota qué comprueba.

- [ ] **Step 2: Crea `e2e/ficha-acciones.spec.ts`**

Copia de `e2e/cierre-ritual.spec.ts` sus helpers (`login`, `rest`, `patch`, `devtestId`, `snapshotPass` y la limpieza de posts); no importes un `.spec.ts`. Cada test restaura en `finally` lo que cambie. Casos:

1. **«Quiero leerlo»** en un libro que devtest no tiene: la obra queda `planned` en BD y la pestaña activa no cambia.
2. **«Lo estoy leyendo»:** queda `in_progress`.
3. **«Ya la vi»** en una película: aparece «¿Qué te ha parecido?»; tras «Ahora no», la BD dice `completed` con `rating` nulo.
4. **Estado desde la tarjeta:** con la pestaña Información activa, cambiar a terminada abre el cierre sin cambiar de pestaña.
5. **Nota desde la tarjeta:** pulsar «8/10» deja `rating = 8` en BD.
6. **«Marcar vista»** con la pestaña Comunidad activa abre el cierre ahí.
7. **Terminar un libro desde la sesión** abre el cierre con la pestaña Información activa.
8. **Anónimo:** «Quiero leerlo» lleva a `/login` y la URL de vuelta es la ficha.
9. **Mi registro** no tiene selector de estado.

Para obtener una obra que devtest no tenga, consulta `passes` del usuario y elige un id del catálogo que no esté; al terminar, borra los pases creados.

- [ ] **Step 3: Adapta los specs existentes**

Sustituye «Seguir» por la intención equivalente («Quiero leerlo» / «Quiero verla»), y los cambios de estado en Mi registro por el selector de la tarjeta. Si un spec esperaba aterrizar en `?tab=log` tras seguir, ahora navega él a esa pestaña. No borres aserciones para ponerlo en verde.

- [ ] **Step 4: Corre contra build de producción**

1. `npx next build --webpack`
2. Con el puerto 3000 libre, `npm run start` en segundo plano; espera con `curl --retry 90 --retry-delay 2 --retry-all-errors -s -o /dev/null http://localhost:3000/`.
3. `npx playwright test e2e/ficha-acciones.spec.ts e2e/pase-hub.spec.ts e2e/registrar-sesion-v2.spec.ts e2e/cierre-ritual.spec.ts e2e/ficha-cartel.spec.ts e2e/ficha-cinematica.spec.ts e2e/happy-path.spec.ts` más los que salieron en el Step 1.
4. Para el servidor.

Conocidos sin relación: `registrar-sesion-v2:509` (#1605), `notas-captura:309` y `pase-hub` intermitentes. Cualquier otro fallo se investiga y se reporta.

- [ ] **Step 5: Commit**

```bash
git add e2e
git commit -m "test(ficha): e2e de intenciones, mando de la tarjeta y cierre"
```

---

### Task 6: Documentación

**Files:**
- Modify: `docs/requirements/decisiones.md` (al final), `docs/requirements/backlog.md`, `docs/UI-GLOSARIO.md`, `docs/architecture/graph.json` (+ `node docs/architecture/sync.mjs`)

- [ ] **Step 1: `decisiones.md`**

Añade al final:

```markdown
## 2026-11-10 — Botones y acciones de la ficha

- **Tres intenciones sustituyen a «Seguir»** en la ficha de obra («Quiero leerlo», «Lo estoy
  leyendo», «Ya lo leí», y sus equivalentes; la película no tiene la segunda). «Seguir» añadía como
  pendiente sin decirlo y se confundía con seguir a personas.
- **La tarjeta del pase es el mando:** estado, acción principal y nota se cambian en ella. Mi registro
  queda para el historial y pierde el selector de estado.
- **Un solo proveedor de acciones** (`PassActionsProvider`) monta las hojas de cierre, nuevo pase y
  retomar. Antes vivían en `LogPanel`, que solo existe con su pestaña activa; por eso el cierre tras
  una sesión dependía de `&tab=log`.
- Sin cambios en server actions ni esquema. Resuelve los hallazgos 1, 2 y 5 de #1164.
- Spec: `docs/superpowers/specs/2026-11-10-ficha-acciones-design.md`.
```

- [ ] **Step 2: Backlog, glosario, grafo e issue**

- **Backlog:** `- [x] Botones y acciones de la ficha (spec 2026-11-10)` junto a la ficha cartel.
- **Glosario:** «Seguir» ya no se aplica a obras; añade las intenciones como forma de añadir una obra a la biblioteca.
- **Grafo:** sigue `docs/architecture/README.md`; actualiza el flujo de cerrar pase y los nodos de detalle, y ejecuta `node docs/architecture/sync.mjs` y `--check`.
- **Issue #1164:** comenta qué hallazgos resuelve esta PR (1, 2 y 5) y cuáles siguen abiertos (3, 4 y 6). No la cierres.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs(ficha): decisión, backlog, glosario y grafo de las acciones"
```

---

## Self-review (hecho al escribir el plan)

| Sección de la spec | Task |
|---|---|
| Tres intenciones, por tipo | 1, 3 |
| Estado en la tarjeta | 2, 3 |
| Acción principal por estado | 1, 2, 3 |
| Nota en la tarjeta | 2, 3 |
| Mi registro sin selector ni enlace de quitar | 4 |
| Proveedor único y hojas | 2 |
| `?cerrar` sin depender de la pestaña | 2, 5 |
| `StickyPassCta` | 3 |
| Errores y dobles envíos | 2, 3 |
| Anónimo | 2, 5 |
| Pruebas | 1–5 |

**Riesgo a vigilar:** en la Task 2 conviven por un commit el proveedor y la lógica vieja de `LogPanel`. El plan lo acota pasando `initialClosingPassId={null}` a `LogPanel` hasta la Task 4; no dejes ese estado intermedio sin la Task 4 hecha.
