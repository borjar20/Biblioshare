# «Mi registro» como línea de lectura — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En la ficha de libro, «Mi registro» pinta las sesiones como una tira del libro (un tramo por sesión, notas como marcas), las tres últimas sesiones y un historial por meses plegado; en los tres tipos desaparecen los duplicados (panel «Progreso», barra repetida, tarjeta envolvente) y las fechas pasan a absolutas.

**Architecture:** Una función pura (`buildReadingStrip`) convierte sesiones y notas en tramos, meses y grupos sueltos. Un componente de servidor (`ReadingLine`) la llama, prerenderiza las tarjetas de nota y compone la pestaña; la interacción (selección de tramo, historial) vive en componentes de cliente que reciben las tarjetas como `ReactNode`. Series y películas siguen con `LogPanel`, adelgazado y con la misma cabecera (`PassLogHead`).

**Tech Stack:** Next.js 16 (App Router, Server Components), React 19, Tailwind v4, CSS modules, next-intl, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-ficha-linea-de-lectura-design.md` (incluida su sección «Ajustes al planificar»). Prototipo: `.superpowers/brainstorm/2026-11-20/registro-largo.html`.

## Global Constraints

- Sin esquema, sin migraciones, sin `use cache` (regla #437: todo depende de quién mira).
- La única consulta que cambia es el tope de `getSessions` para libros (`READING_STRIP_SESSION_CAP = 500`); series siguen con 20.
- Copy en español, en `messages/es.json` (único idioma). No se reutilizan claves con otro significado.
- Fechas de sesión absolutas: «9 nov»; con año si no es el actual («9 nov 2025»). Nunca «hace N meses».
- La primera sesión se escribe «pág. 0 → N» (con historial completo).
- Una nota está en un solo sitio visible a la vez: el detalle del tramo seleccionado o un grupo suelto. Las filas de sesión solo llevan la pastilla «N notas».
- Accesibilidad: cada tramo es un `<button>` con `aria-pressed` y etiqueta (fecha, páginas, duración); la tira es `role="group"` con nombre; las filas de sesión dan el camino completo sin la tira.
- Animaciones solo dentro de `@media (prefers-reduced-motion: no-preference)`.
- Los e2e que se anclan al `h3` «Sesiones» y a su enlace hermano «Registrar sesión» deben seguir valiendo sin cambios: se conserva esa estructura.
- `diary-entry` (`PassDiary`) y «Nuevo pase» no cambian.
- Un solo implementador a la vez en el árbol; un commit por tarea. Trailer de commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Vitest no procesa CSS: los tests usan roles, texto y `data-*`, nunca nombres de clase.

## Preparación del entorno (una vez)

En PowerShell, desde la raíz del worktree (si no existen ya):

```powershell
if (-not (Test-Path node_modules)) { New-Item -ItemType Junction node_modules -Target D:\Proyectos\Personal\Biblioshare\node_modules }
if (-not (Test-Path .env.local)) { Copy-Item D:\Proyectos\Personal\Biblioshare\.env.local .env.local }
```

Cada comando de Node va en UNA llamada con `fnm env | Out-String | Invoke-Expression; fnm use 22;` delante. En esta máquina (8 GB) usa `--maxWorkers=2` al lanzar muchos ficheros de Vitest. No ejecutes `npm ci`; antes de borrar el worktree quita el junction (`cmd /c rmdir node_modules`).

## Estructura de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/lib/passes/reading-strip.ts` | Crear | `buildReadingStrip`, `resolveReadingPages`, `noteToStrip`, `marginToStrip`, tipos. |
| `src/lib/passes/reading-strip.test.ts` | Crear | Reglas de la tira. |
| `src/lib/passes/reading-strip.pages.test.ts` | Crear | Precedencia de páginas (sustituye a `log-panel.edition-pages.test.tsx`). |
| `src/lib/sessions/session-date.ts` (+ test) | Crear | `sessionDateLabel`, `monthLabel`, `durationLabel`. |
| `src/lib/sessions/get-sessions.ts` | Modificar | Opción `limit`. |
| `src/components/session-list.tsx` (+ test) | Modificar | Fecha absoluta; sin título con edición. |
| `src/components/notes/note-form.tsx` | Modificar | Prop `bare` (sin caja). |
| `src/components/detail/edition-chip.tsx` (+ test) | Crear | Chip de edición y pregunta pendiente. |
| `src/components/detail/pass-log-head.tsx` | Crear | Cabecera de la lectura (ordinal, chip, «Nuevo pase»). |
| `src/components/detail/log-panel.tsx` (+ tests) | Modificar | Sin `PassDataPanel`/`PassProgress`/caja; usa `PassLogHead`; exporta `AddingPlaceholder` y `AddToCollectionButton`. |
| `src/components/detail/pass-progress.tsx` | Borrar | Sin usos. |
| `src/components/detail/session-row.tsx` (+ test) | Crear | Fila de sesión con minibarra, pastilla y ⋯. |
| `src/components/detail/session-months.tsx` | Crear | «Ver las N sesiones, por mes» y los meses. |
| `src/components/detail/reading-strip.tsx` (+ `.module.css`, test) | Crear | Tarjeta de la tira, detalle, últimas sesiones. |
| `src/components/detail/reading-line.tsx` | Crear | Composición de servidor de la pestaña en libros. |
| `src/app/libro/[id]/page.tsx` | Modificar | Monta `ReadingLine`; sesiones con tope 500. |
| `src/app/pelicula/[id]/page.tsx`, `src/app/serie/[id]/page.tsx` | Modificar | `currentYear` a `LogPanel`. |
| `messages/es.json` | Modificar | Claves `detail.readingStrip.*`; quitar las de `PassDataPanel`/`PassProgress`. |
| `e2e/pase-hub.spec.ts` | Modificar | «Voy por la página» → `reading-current-page`. |
| Docs | Modificar | `decisiones.md`, `backlog.md`, `UI-GLOSARIO.md`, `graph.json`. |

---

### Task 1: La función de la tira

**Files:**
- Create: `src/lib/passes/reading-strip.ts`
- Test: `src/lib/passes/reading-strip.test.ts`, `src/lib/passes/reading-strip.pages.test.ts`
- Delete: `src/components/detail/log-panel.edition-pages.test.tsx` (su comprobación pasa al test de páginas)

**Interfaces:**
- Consumes: `ProgressSession` (`@/lib/sessions/types`), `Note` (`@/lib/notes/types`), `MarginNoteView` (`@/lib/margin/types`), `Pass` (`@/lib/passes/types`), `Edition` (`@/lib/editions/types`), `Position` (`@/lib/library/position`), `pagesForPass` (`@/lib/editions/edition-label`).
- Produces (los usan las tareas 5–7):
  - `READING_STRIP_SESSION_CAP: 500`
  - `type StripNote = { key: string; kind: "note" | "quote" | "margin"; page: number | null; createdAt: string }`
  - `type StripSegment = { sessionId: string; index: number; from: number; to: number; pages: number; advanced: boolean; date: string; minutes: number | null; hasPost: boolean; monthKey: string; recency: number; notes: StripNote[] }`
  - `type StripMonth = { key: string; segments: StripSegment[]; pages: number; minutes: number; notesCount: number; from: number; to: number }`
  - `type ReadingStrip = { segments: StripSegment[]; months: StripMonth[]; loose: { ahead: StripNote[]; afterLast: StripNote[]; other: StripNote[] }; scale: number; currentPage: number; totalPages: number | null; totalMinutes: number; pagesPerSession: number }`
  - `buildReadingStrip(input: { sessions: ProgressSession[]; notes: StripNote[]; totalPages: number | null; currentPage: number | null; closed: boolean; complete: boolean }): ReadingStrip`
  - `noteToStrip(note: Note): StripNote` (clave `note:<id>`)
  - `marginToStrip(view: MarginNoteView, totalPages: number | null): StripNote` (clave `margin:<noteId>`)
  - `resolveReadingPages(input: { passes: Pass[]; editions: Edition[]; workTotalUnits: number | null; position: Position }): { openPass: Pass | null; activePass: Pass | null; totalPages: number | null; currentPage: number | null }`

- [ ] **Step 1: Escribe los tests que fallan**

`src/lib/passes/reading-strip.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ProgressSession } from "@/lib/sessions/types";
import type { MarginNoteView } from "@/lib/margin/types";
import type { Note } from "@/lib/notes/types";
import { buildReadingStrip, marginToStrip, noteToStrip, type StripNote } from "./reading-strip";

function s(id: string, date: string, page: number | null, minutes: number | null = 30, createdAt = `${date}T10:00:00Z`): ProgressSession {
  return { id, sessionDate: date, createdAt, durationMinutes: minutes, position: page === null ? {} : { page }, hasPost: false };
}
function n(key: string, page: number | null, createdAt = "2026-08-01T00:00:00Z"): StripNote {
  return { key, kind: "note", page, createdAt };
}
const base = { notes: [] as StripNote[], totalPages: 400, currentPage: null, closed: false, complete: true };

describe("buildReadingStrip — tramos", () => {
  it("ordena por fecha y desempata por creación; la primera parte de 0", () => {
    const strip = buildReadingStrip({ ...base, sessions: [
      s("c", "2026-08-02", 50, 20, "2026-08-02T09:00:00Z"),
      s("a", "2026-07-30", 16),
      s("b", "2026-08-02", 30, 10, "2026-08-02T08:00:00Z"),
    ] });
    expect(strip.segments.map((x) => [x.sessionId, x.index, x.from, x.to, x.pages])).toEqual([
      ["a", 1, 0, 16, 16], ["b", 2, 16, 30, 14], ["c", 3, 30, 50, 20],
    ]);
  });
  it("una sesión que no avanza o retrocede no ocupa ancho, y la siguiente parte de su página", () => {
    const strip = buildReadingStrip({ ...base, sessions: [s("a", "2026-08-01", 40), s("b", "2026-08-02", 40), s("c", "2026-08-03", 35), s("d", "2026-08-04", 60)] });
    expect(strip.segments.map((x) => [x.from, x.to, x.pages, x.advanced])).toEqual([
      [0, 40, 40, true], [40, 40, 0, false], [40, 35, 0, false], [35, 60, 25, true],
    ]);
  });
  it("con historial incompleto, la primera cargada no inventa «desde 0»", () => {
    const strip = buildReadingStrip({ ...base, complete: false, sessions: [s("a", "2026-08-01", 120), s("b", "2026-08-02", 150)] });
    expect(strip.segments.map((x) => [x.from, x.to, x.advanced])).toEqual([[120, 120, false], [120, 150, true]]);
  });
  it("sin sesiones: tira vacía, página actual la del pase", () => {
    const strip = buildReadingStrip({ ...base, sessions: [], currentPage: 12 });
    expect(strip.segments).toEqual([]);
    expect(strip.months).toEqual([]);
    expect(strip.currentPage).toBe(12);
    expect(strip.pagesPerSession).toBe(0);
  });
});

describe("buildReadingStrip — notas", () => {
  const sessions = [s("a", "2026-08-01", 40), s("b", "2026-08-05", 90)];
  it("una nota es de la primera sesión cuyo tramo la contiene (desde < pág. ≤ hasta)", () => {
    const strip = buildReadingStrip({ ...base, sessions, notes: [n("x", 40), n("y", 41), n("z", 90)] });
    expect(strip.segments[0].notes.map((x) => x.key)).toEqual(["x"]);
    expect(strip.segments[1].notes.map((x) => x.key)).toEqual(["y", "z"]);
  });
  it("por delante de la página actual va a «Más adelante» con el pase abierto, y a «Después de la última sesión» cerrado", () => {
    const open = buildReadingStrip({ ...base, sessions, currentPage: 90, notes: [n("x", 200)] });
    expect(open.loose.ahead.map((x) => x.key)).toEqual(["x"]);
    const closed = buildReadingStrip({ ...base, sessions, currentPage: 90, closed: true, notes: [n("x", 200)] });
    expect(closed.loose.afterLast.map((x) => x.key)).toEqual(["x"]);
    expect(closed.loose.ahead).toEqual([]);
  });
  it("sin página, o sin tramo que la contenga, va a «Otras notas»", () => {
    const strip = buildReadingStrip({ ...base, sessions, notes: [n("sin", null), n("cero", 0)] });
    expect(strip.loose.other.map((x) => x.key)).toEqual(["cero", "sin"]);
  });
  it("dentro de un tramo, por página y a igualdad la más nueva primero", () => {
    const strip = buildReadingStrip({ ...base, sessions, notes: [
      n("vieja", 50, "2026-08-01T00:00:00Z"), n("nueva", 50, "2026-08-03T00:00:00Z"), n("antes", 45),
    ] });
    expect(strip.segments[1].notes.map((x) => x.key)).toEqual(["antes", "nueva", "vieja"]);
  });
  it("una sesión que no avanza no recibe notas", () => {
    const strip = buildReadingStrip({ ...base, sessions: [s("a", "2026-08-01", 40), s("b", "2026-08-02", 40)], notes: [n("x", 40)] });
    expect(strip.segments[0].notes.map((x) => x.key)).toEqual(["x"]);
    expect(strip.segments[1].notes).toEqual([]);
  });
});

describe("buildReadingStrip — meses, escala y cifras", () => {
  it("agrupa por mes del más reciente al más antiguo, con recuentos y antigüedad", () => {
    const strip = buildReadingStrip({ ...base, notes: [n("x", 10)], sessions: [
      s("a", "2026-07-08", 16, 25), s("b", "2026-07-12", 30, 30), s("c", "2026-08-02", 87, 31),
    ] });
    expect(strip.months.map((m) => [m.key, m.segments.length, m.pages, m.minutes, m.notesCount, m.from, m.to])).toEqual([
      ["2026-08", 1, 57, 31, 0, 30, 87], ["2026-07", 2, 30, 55, 1, 0, 30],
    ]);
    expect(strip.segments.map((x) => x.recency)).toEqual([0, 0, 1]);
    expect(strip.totalMinutes).toBe(86);
    expect(strip.pagesPerSession).toBe(29);
  });
  it("con un solo mes, la antigüedad es 1", () => {
    const strip = buildReadingStrip({ ...base, sessions: [s("a", "2026-08-01", 10)] });
    expect(strip.segments[0].recency).toBe(1);
  });
  it("la escala es el total del libro; sin total, la página alcanzada", () => {
    expect(buildReadingStrip({ ...base, sessions: [s("a", "2026-08-01", 90)] }).scale).toBe(400);
    expect(buildReadingStrip({ ...base, totalPages: null, sessions: [s("a", "2026-08-01", 90)] }).scale).toBe(90);
    expect(buildReadingStrip({ ...base, totalPages: 50, sessions: [s("a", "2026-08-01", 90)] }).scale).toBe(90);
  });
  it("la página actual es la del pase y, sin ella, la de la última sesión", () => {
    expect(buildReadingStrip({ ...base, currentPage: 95, sessions: [s("a", "2026-08-01", 90)] }).currentPage).toBe(95);
    expect(buildReadingStrip({ ...base, sessions: [s("a", "2026-08-01", 90)] }).currentPage).toBe(90);
  });
});

describe("conversión de notas", () => {
  it("noteToStrip toma la página del anclaje", () => {
    const note = { id: "1", kind: "quote", position: { page: 47 }, createdAt: "2026-08-01T00:00:00Z" } as Note;
    expect(noteToStrip(note)).toEqual({ key: "note:1", kind: "quote", page: 47, createdAt: "2026-08-01T00:00:00Z" });
    expect(noteToStrip({ ...note, position: {} } as Note).page).toBeNull();
  });
  it("marginToStrip: ratio → su página; al terminar → el total; episodio → sin página", () => {
    const view = { noteId: "m", createdAt: "2026-08-01T00:00:00Z" } as MarginNoteView;
    expect(marginToStrip({ ...view, anchor: { kind: "ratio", ratio: 0.5, page: 214, pages: 428 } }, 400).page).toBe(214);
    expect(marginToStrip({ ...view, anchor: { kind: "finish" } }, 400).page).toBe(400);
    expect(marginToStrip({ ...view, anchor: { kind: "finish" } }, null).page).toBeNull();
    expect(marginToStrip({ ...view, anchor: { kind: "episode", season: 1, episode: 2 } }, 400)).toEqual({ key: "margin:m", kind: "margin", page: null, createdAt: "2026-08-01T00:00:00Z" });
  });
});
```

`src/lib/passes/reading-strip.pages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PAGE_CASES, pageFixture } from "@/lib/editions/edition-pages.test-fixture";
import { resolveReadingPages } from "./reading-strip";

// Antes vivía en log-panel.edition-pages.test.tsx (#901): la precedencia de
// páginas (edición del pase → páginas de la obra) la aplica ahora la tira.
describe("resolveReadingPages aplica la precedencia de páginas (#901)", () => {
  it.each(PAGE_CASES)("$name", (sample) => {
    const { pass, editions } = pageFixture(sample);
    const r = resolveReadingPages({ passes: [pass], editions, workTotalUnits: sample.workPages, position: { page: 100 } });
    expect(r.totalPages).toBe(sample.expectedPages);
    expect(r.currentPage).toBe(100);
    expect(r.openPass?.id).toBe(pass.id);
  });
});
```

- [ ] **Step 2: Comprueba que fallan**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/passes/reading-strip.test.ts src/lib/passes/reading-strip.pages.test.ts`
Expected: FAIL, «Failed to resolve import "./reading-strip"».

- [ ] **Step 3: Implementa**

`src/lib/passes/reading-strip.ts`:

```ts
import type { ProgressSession } from "@/lib/sessions/types";
import type { Note } from "@/lib/notes/types";
import type { MarginNoteView } from "@/lib/margin/types";
import type { Pass } from "@/lib/passes/types";
import type { Edition } from "@/lib/editions/types";
import type { Position } from "@/lib/library/position";
import { pagesForPass } from "@/lib/editions/edition-label";

// La tira de «Mi registro» en libros (spec 2026-11-11-ficha-linea-de-lectura):
// un tramo por sesión, del ancho de lo que se leyó, con las notas colgando de su
// tramo. Pura: la ficha la llama en servidor y los tests, sin navegador.

/** Sesiones que la ficha de libro carga para la tira (`getSessions`). Si llegan
 *  justo estas, el historial puede estar cortado y la primera no parte de 0. */
export const READING_STRIP_SESSION_CAP = 500;

export type StripNote = { key: string; kind: "note" | "quote" | "margin"; page: number | null; createdAt: string };

export type StripSegment = {
  sessionId: string;
  /** Posición cronológica, desde 1 («Sesión N»). */
  index: number;
  from: number;
  to: number;
  /** Páginas leídas; 0 si la sesión no avanzó. */
  pages: number;
  advanced: boolean;
  date: string;
  minutes: number | null;
  hasPost: boolean;
  /** "YYYY-MM" de `sessionDate`. */
  monthKey: string;
  /** 0 = mes más antiguo de la lectura, 1 = el más reciente. */
  recency: number;
  notes: StripNote[];
};

export type StripMonth = {
  key: string;
  segments: StripSegment[];
  pages: number;
  minutes: number;
  notesCount: number;
  from: number;
  to: number;
};

export type ReadingStrip = {
  /** Cronológicos. */
  segments: StripSegment[];
  /** Del más reciente al más antiguo. */
  months: StripMonth[];
  loose: { ahead: StripNote[]; afterLast: StripNote[]; other: StripNote[] };
  /** Total de páginas que mide la tira (el libro o, sin total, lo alcanzado). */
  scale: number;
  currentPage: number;
  totalPages: number | null;
  totalMinutes: number;
  pagesPerSession: number;
};

export function noteToStrip(note: Note): StripNote {
  const page = "page" in note.position && note.position.page !== undefined ? note.position.page : null;
  return { key: `note:${note.id}`, kind: note.kind, page, createdAt: note.createdAt };
}

export function marginToStrip(view: MarginNoteView, totalPages: number | null): StripNote {
  const a = view.anchor;
  const page = a.kind === "ratio" ? a.page : a.kind === "finish" ? totalPages : null;
  return { key: `margin:${view.noteId}`, kind: "margin", page, createdAt: view.createdAt };
}

function reachedPage(session: ProgressSession): number | null {
  return "page" in session.position && session.position.page !== undefined ? session.position.page : null;
}

// Por página; a igualdad, la más nueva primero (mismo desempate que compareNotes).
// Las notas sin página van al final.
function byNoteOrder(a: StripNote, b: StripNote): number {
  const pa = a.page ?? Number.POSITIVE_INFINITY;
  const pb = b.page ?? Number.POSITIVE_INFINITY;
  if (pa !== pb) return pa < pb ? -1 : 1;
  return b.createdAt.localeCompare(a.createdAt);
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function buildReadingStrip(input: {
  sessions: ProgressSession[];
  notes: StripNote[];
  totalPages: number | null;
  currentPage: number | null;
  closed: boolean;
  /** false si las sesiones llegaron cortadas por el tope de carga. */
  complete: boolean;
}): ReadingStrip {
  const ordered = [...input.sessions].sort(
    (a, b) => a.sessionDate.localeCompare(b.sessionDate) || a.createdAt.localeCompare(b.createdAt),
  );

  const segments: StripSegment[] = [];
  let previous: number | null = input.complete ? 0 : null;
  ordered.forEach((session, i) => {
    const reached = reachedPage(session);
    const from = previous ?? reached ?? 0;
    const to = reached ?? from;
    const advanced = to > from;
    segments.push({
      sessionId: session.id,
      index: i + 1,
      from,
      to,
      pages: advanced ? to - from : 0,
      advanced,
      date: session.sessionDate,
      minutes: session.durationMinutes,
      hasPost: session.hasPost,
      monthKey: session.sessionDate.slice(0, 7),
      recency: 1,
      notes: [],
    });
    previous = to;
  });

  const monthKeys = [...new Set(segments.map((s) => s.monthKey))];
  for (const s of segments) {
    s.recency = monthKeys.length === 1 ? 1 : monthKeys.indexOf(s.monthKey) / (monthKeys.length - 1);
  }

  const lastTo = segments.length > 0 ? Math.max(...segments.map((s) => s.to)) : 0;
  const currentPage = input.currentPage ?? segments.at(-1)?.to ?? 0;
  const reached = Math.max(currentPage, lastTo);
  const scale =
    input.totalPages !== null && input.totalPages > 0
      ? Math.max(input.totalPages, reached)
      : Math.max(reached, 1);

  const loose: ReadingStrip["loose"] = { ahead: [], afterLast: [], other: [] };
  for (const note of [...input.notes].sort(byNoteOrder)) {
    if (note.page === null) {
      loose.other.push(note);
      continue;
    }
    const page = note.page;
    const home = segments.find((s) => s.advanced && s.from < page && page <= s.to);
    if (home) home.notes.push(note);
    else if (page > reached) (input.closed ? loose.afterLast : loose.ahead).push(note);
    else loose.other.push(note);
  }

  const months: StripMonth[] = [...monthKeys].reverse().map((key) => {
    const ms = segments.filter((s) => s.monthKey === key);
    return {
      key,
      segments: ms,
      pages: sum(ms.map((s) => s.pages)),
      minutes: sum(ms.map((s) => s.minutes ?? 0)),
      notesCount: sum(ms.map((s) => s.notes.length)),
      from: Math.min(...ms.map((s) => s.from)),
      to: Math.max(...ms.map((s) => s.to)),
    };
  });

  const totalPagesRead = sum(segments.map((s) => s.pages));
  return {
    segments,
    months,
    loose,
    scale,
    currentPage,
    totalPages: input.totalPages,
    totalMinutes: sum(segments.map((s) => s.minutes ?? 0)),
    pagesPerSession: segments.length > 0 ? Math.round(totalPagesRead / segments.length) : 0,
  };
}

// Qué pase manda en la pestaña y cuántas páginas tiene el libro para él. La
// edición del pase manda; sin ella, las páginas orientativas de la obra
// (pagesForPass, #901). Con el pase cerrado, la del pase activo (el último).
export function resolveReadingPages(input: {
  passes: Pass[];
  editions: Edition[];
  workTotalUnits: number | null;
  position: Position;
}): { openPass: Pass | null; activePass: Pass | null; totalPages: number | null; currentPage: number | null } {
  const openPass = input.passes.find((p) => p.status === "planned" || p.status === "in_progress") ?? null;
  const activePass = input.passes.find((p) => p.isActive) ?? null;
  const owner = openPass ?? activePass;
  const edition = owner?.editionId != null ? (input.editions.find((e) => e.id === owner.editionId) ?? null) : null;
  const currentPage = "page" in input.position && input.position.page !== undefined ? input.position.page : null;
  return { openPass, activePass, totalPages: pagesForPass(edition, input.workTotalUnits), currentPage };
}
```

Borra `src/components/detail/log-panel.edition-pages.test.tsx` (`git rm`).

- [ ] **Step 4: Comprueba que pasan**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/passes/reading-strip.test.ts src/lib/passes/reading-strip.pages.test.ts`
Expected: PASS. Si el fixture `pageFixture` crea el pase con `status` distinto de `planned`/`in_progress` o sin `isActive`, el test de páginas falla en `openPass?.id`: en ese caso informa NEEDS_CONTEXT, no cambies el fixture.

- [ ] **Step 5: Commit**

```bash
git add src/lib/passes/reading-strip.ts src/lib/passes/reading-strip.test.ts src/lib/passes/reading-strip.pages.test.ts
git rm src/components/detail/log-panel.edition-pages.test.tsx
git commit -m "feat(registro): la tira de lectura como función pura"
```

---

### Task 2: Fechas absolutas y tope de sesiones

**Files:**
- Create: `src/lib/sessions/session-date.ts`, `src/lib/sessions/session-date.test.ts`
- Modify: `src/lib/sessions/get-sessions.ts`, `src/components/session-list.tsx`, `src/components/session-list.test.tsx`

**Interfaces:**
- Produces:
  - `sessionDateLabel(iso: string, currentYear: number): string` → «9 nov» / «9 nov 2025»
  - `monthLabel(monthKey: string, currentYear: number): string` → «Agosto» / «Agosto de 2025»
  - `durationLabel(minutes: number): string` → «25 min» / «1 h 25 min» / «2 h»
  - `getSessions(supabase, passId, itemType, options?: { limit?: number })` (por defecto 20)
  - `SessionList` exige la prop nueva `currentYear: number` y deja de aceptar `editionLabel`.

- [ ] **Step 1: Escribe los tests que fallan**

`src/lib/sessions/session-date.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { durationLabel, monthLabel, sessionDateLabel } from "./session-date";

describe("sessionDateLabel", () => {
  it("sin año en el año en curso, con año si es otro", () => {
    expect(sessionDateLabel("2026-11-09", 2026)).toBe("9 nov");
    expect(sessionDateLabel("2025-11-09", 2026)).toBe("9 nov 2025");
  });
  it("no se mueve de día por la zona horaria", () => {
    expect(sessionDateLabel("2026-01-01", 2026)).toBe("1 ene");
  });
});

describe("monthLabel", () => {
  it("mes con mayúscula y año solo si no es el actual", () => {
    expect(monthLabel("2026-08", 2026)).toBe("Agosto");
    expect(monthLabel("2025-08", 2026)).toBe("Agosto de 2025");
  });
});

describe("durationLabel", () => {
  it("minutos, horas y minutos, u horas justas", () => {
    expect(durationLabel(25)).toBe("25 min");
    expect(durationLabel(85)).toBe("1 h 25 min");
    expect(durationLabel(120)).toBe("2 h");
  });
});
```

Sustituye el `describe` de `src/components/session-list.test.tsx` (desde la línea `// Una sesión de hace unos días` hasta el final) por:

```tsx
const session: ProgressSession = {
  id: "s1",
  sessionDate: "2026-08-14",
  createdAt: "2026-08-14T10:00:00Z",
  durationMinutes: 30,
  position: { page: 120 },
  hasPost: false,
};

function list(currentYear: number) {
  return (
    <NextIntlClientProvider locale="es" timeZone="Europe/Madrid" messages={{ item: messages.item }}>
      <SessionList passId="p1" itemType="book" itemId="b1" sessions={[session]} currentYear={currentYear} />
    </NextIntlClientProvider>
  );
}

describe("SessionList — fecha de la sesión", () => {
  it("pinta la fecha absoluta, igual en servidor y cliente", () => {
    expect(renderToString(list(2026))).toMatch(/14 ago/);
    render(list(2026));
    expect(screen.getByText("14 ago")).toBeTruthy();
  });
  it("lleva el año si no es el actual", () => {
    render(list(2027));
    expect(screen.getByText("14 ago 2026")).toBeTruthy();
  });
  it("nunca escribe una fecha relativa", () => {
    expect(renderToString(list(2026))).not.toMatch(/hace /);
  });
});
```

- [ ] **Step 2: Comprueba que fallan**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/sessions/session-date.test.ts src/components/session-list.test.tsx`
Expected: FAIL (no existe `./session-date`; `SessionList` pinta «hace…»/fecha con año).

- [ ] **Step 3: Implementa**

`src/lib/sessions/session-date.ts`:

```ts
// Fechas y duraciones de las sesiones en «Mi registro» (spec
// 2026-11-11-ficha-linea-de-lectura): absolutas, nunca «hace N meses». En UTC,
// porque `session_date` es una fecha sin hora: en otra zona se iría al día de
// antes. `currentYear` lo pone el servidor, así que servidor y cliente pintan
// lo mismo (sin desajuste de hidratación).
const DAY = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const DAY_YEAR = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "UTC" });
const MONTH_YEAR = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

const utc = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function sessionDateLabel(iso: string, currentYear: number): string {
  const date = utc(iso);
  return (date.getUTCFullYear() === currentYear ? DAY : DAY_YEAR).format(date);
}

export function monthLabel(monthKey: string, currentYear: number): string {
  const date = utc(`${monthKey}-01`);
  return capitalize((date.getUTCFullYear() === currentYear ? MONTH : MONTH_YEAR).format(date));
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
```

Si el ICU de Node devuelve otra forma (por ejemplo «9 nov.» con punto), informa NEEDS_CONTEXT con la salida real: no ajustes los tests a ciegas.

`src/lib/sessions/get-sessions.ts`: cambia la firma y el `limit`:

```ts
export async function getSessions(
  supabase: SupabaseServerClient,
  passId: string | null,
  itemType: ItemType,
  // La ficha de libro pide más (READING_STRIP_SESSION_CAP): la tira dibuja la
  // lectura entera. Series siguen con 20.
  { limit = 20 }: { limit?: number } = {},
): Promise<ProgressSession[]> {
```

y `.limit(20);` → `.limit(limit);`.

`src/components/session-list.tsx`:
- Quita los imports `useSyncExternalStore`, `useFormatter`, `sessionRelativeBasis`, y las constantes `subscribeNever`, `clientMinute`, `serverNow` con su comentario.
- Añade `import { sessionDateLabel } from "@/lib/sessions/session-date";`.
- En las props: quita `editionLabel` (y su JSDoc) y añade `/** Año en curso, del servidor: decide si la fecha lleva año. */ currentYear: number;`.
- Quita `const format = useFormatter();`, el bloque `nowMs`/`now` con su comentario, el `{editionLabel && …}` del `h3` y el párrafo `{editionLabel && (<p …>{t("edition", …)}</p>)}`.
- Sustituye el cálculo `relativeBasis` y el `<time>` por:

```tsx
                  <time
                    dateTime={session.sessionDate}
                    className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground lg:text-[11px]"
                  >
                    {sessionDateLabel(session.sessionDate, currentYear)}
                  </time>
```

- Borra la clave `item.sessions.edition` de `messages/es.json` si `git grep -n 'sessions.edition\|t("edition"' -- src/components/session-list.tsx` ya no devuelve nada.

Arregla los llamadores de `SessionList` que pasaban `editionLabel` (solo `log-panel.tsx`; la tarea 4 lo reescribe, así que aquí basta con quitar esa prop y pasar `currentYear={new Date().getFullYear()}` provisional para que compile; la tarea 4 lo sustituye por la prop).

- [ ] **Step 4: Comprueba que pasan**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/sessions/session-date.test.ts src/components/session-list.test.tsx; npx tsc --noEmit`
Expected: PASS y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sessions/session-date.ts src/lib/sessions/session-date.test.ts src/lib/sessions/get-sessions.ts src/components/session-list.tsx src/components/session-list.test.tsx src/components/detail/log-panel.tsx messages/es.json
git commit -m "feat(registro): fechas de sesión absolutas y tope de carga configurable"
```

---

### Task 3: Fila de sesión y formulario de nota sin caja

**Files:**
- Create: `src/components/detail/session-row.tsx`, `src/components/detail/session-row.test.tsx`
- Modify: `src/components/notes/note-form.tsx`, `messages/es.json`

**Interfaces:**
- Consumes: `StripSegment` (tarea 1), `sessionDateLabel`, `durationLabel` (tarea 2), `deleteSession` (`@/lib/sessions/actions`), `ActionMenu` (`@/components/ui/action-menu`).
- Produces:
  - `useSegmentText(): (segment: StripSegment) => string` — «pág. 148 → 190 · 42 páginas · 1 h 25 min», o «pág. 40 · 30 min» si no avanzó.
  - `SessionRow({ segment, scale, currentYear, itemId, onShowNotes }: { segment: StripSegment; scale: number; currentYear: number; itemId: string; onShowNotes: (sessionId: string) => void })` → un `<li>`.
  - `NoteForm` acepta `bare?: boolean` (sin borde, fondo ni sombra).
  - Claves `detail.readingStrip.page`, `.range`, `.rangePages`, `.notesPill`.

- [ ] **Step 1: Añade las claves de i18n**

En `messages/es.json`, dentro de `"detail": { … }`, añade junto a `"log"` el bloque (se completará en las tareas 5 y 6):

```json
    "readingStrip": {
      "page": "pág. {page}",
      "range": "pág. {from} → {to}",
      "rangePages": "{count, plural, one {# página} other {# páginas}}",
      "notesPill": "{count, plural, one {# nota} other {# notas}}"
    },
```

- [ ] **Step 2: Escribe el test que falla**

`src/components/detail/session-row.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { StripSegment } from "@/lib/passes/reading-strip";
import { SessionRow } from "./session-row";

const actions = vi.hoisted(() => ({ deleteSession: vi.fn() }));
vi.mock("@/lib/sessions/actions", () => actions);
afterEach(() => { cleanup(); vi.restoreAllMocks(); actions.deleteSession.mockReset(); });

const seg = (over: Partial<StripSegment> = {}): StripSegment => ({
  sessionId: "s10", index: 10, from: 148, to: 190, pages: 42, advanced: true, date: "2026-08-14",
  minutes: 85, hasPost: false, monthKey: "2026-08", recency: 1, notes: [], ...over,
});

function row(segment: StripSegment, onShowNotes = vi.fn()) {
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <ul><SessionRow segment={segment} scale={412} currentYear={2026} itemId="b1" onShowNotes={onShowNotes} /></ul>
    </NextIntlClientProvider>,
  );
  return onShowNotes;
}

describe("SessionRow", () => {
  it("fecha absoluta, tramo, páginas y duración", () => {
    row(seg());
    expect(screen.getByText("14 ago")).toBeTruthy();
    expect(screen.getByText("pág. 148 → 190 · 42 páginas · 1 h 25 min")).toBeTruthy();
  });
  it("una sesión que no avanza dice solo su página", () => {
    row(seg({ from: 40, to: 40, pages: 0, advanced: false, minutes: null }));
    expect(screen.getByText("pág. 40")).toBeTruthy();
  });
  it("la pastilla de notas pide abrir su tramo", () => {
    const onShow = row(seg({ notes: [{ key: "note:1", kind: "note", page: 150, createdAt: "x" }] }));
    fireEvent.click(screen.getByRole("button", { name: "1 nota" }));
    expect(onShow).toHaveBeenCalledWith("s10");
  });
  it("sin notas no hay pastilla", () => {
    row(seg());
    expect(screen.queryByRole("button", { name: /nota/ })).toBeNull();
  });
  it("borrar una sesión con publicación pregunta antes", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    row(seg({ hasPost: true }));
    fireEvent.click(screen.getByRole("button", { name: "Acciones de la sesión" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Eliminar" }));
    expect(confirm).toHaveBeenCalled();
    expect(actions.deleteSession).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Comprueba que falla**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail/session-row.test.tsx`
Expected: FAIL, no existe `./session-row`.

- [ ] **Step 4: Implementa**

`src/components/detail/session-row.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import type { StripSegment } from "@/lib/passes/reading-strip";
import { deleteSession } from "@/lib/sessions/actions";
import { durationLabel, sessionDateLabel } from "@/lib/sessions/session-date";
import { ActionMenu } from "@/components/ui/action-menu";

/** «pág. 148 → 190 · 42 páginas · 1 h 25 min»; sin avance, «pág. 40 · 30 min». */
export function useSegmentText() {
  const t = useTranslations("detail.readingStrip");
  return (s: StripSegment) =>
    [
      s.advanced ? `${t("range", { from: s.from, to: s.to })} · ${t("rangePages", { count: s.pages })}` : t("page", { page: s.to }),
      s.minutes != null ? durationLabel(s.minutes) : null,
    ]
      .filter(Boolean)
      .join(" · ");
}

// Una sesión en «Mi registro» (libros): fecha absoluta, tramo y una minibarra
// que dice en qué parte del libro cayó. Las notas NO se pintan aquí (una nota
// está en un solo sitio visible): la pastilla abre su tramo en la tira.
export function SessionRow({
  segment,
  scale,
  currentYear,
  itemId,
  onShowNotes,
}: {
  segment: StripSegment;
  scale: number;
  currentYear: number;
  itemId: string;
  onShowNotes: (sessionId: string) => void;
}) {
  const t = useTranslations("detail.readingStrip");
  const tSessions = useTranslations("item.sessions");
  const text = useSegmentText();
  const [isPending, startTransition] = useTransition();
  const notes = segment.notes.length;

  return (
    <li className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border py-2.5 text-[13px] first:border-t-0">
      <time dateTime={segment.date} className="font-mono text-[11px] text-muted-foreground tabular-nums">
        {sessionDateLabel(segment.date, currentYear)}
      </time>
      <div className="min-w-0">
        <span className="text-foreground">{text(segment)}</span>
        {notes > 0 && (
          <button
            type="button"
            onClick={() => onShowNotes(segment.sessionId)}
            className="ml-2 rounded-full border border-border px-2 py-px text-[11px] transition-colors hover:bg-surface-muted"
            style={{ color: "var(--accent-ink)" }}
          >
            {t("notesPill", { count: notes })}
          </button>
        )}
        <span aria-hidden className="relative mt-1.5 block h-1 overflow-hidden rounded-sm bg-surface-3">
          <span
            className="absolute inset-y-0 rounded-sm bg-accent"
            style={{ left: `${(segment.from / scale) * 100}%`, width: `${Math.max(0.8, (segment.pages / scale) * 100)}%` }}
          />
        </span>
      </div>
      {/* Mismo borrado que session-list.tsx (F3-012): pregunta solo si la
          sesión arrastra su publicación y su hilo. */}
      <ActionMenu
        label={tSessions("actionsLabel")}
        menuAlign="right"
        triggerClassName="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
        items={[
          {
            key: "delete",
            label: tSessions("delete"),
            danger: true,
            disabled: isPending,
            onSelect: () => {
              if (segment.hasPost && !window.confirm(tSessions("deleteConfirmShared"))) return;
              startTransition(() => deleteSession(segment.sessionId, "book", itemId));
            },
          },
        ]}
      />
    </li>
  );
}
```

Si `ActionMenu` no expone su botón como «Acciones de la sesión» ni sus entradas como `menuitem`, mira cómo lo prueba `src/components/session-list.test.tsx` o el test de `ActionMenu` y usa los mismos roles en el último test; no cambies `ActionMenu`.

`src/components/notes/note-form.tsx`: añade la prop y cambia la clase del `<form>`:

```tsx
export function NoteForm({
  itemType,
  itemId,
  anchor,
  bare = false,
}: {
  itemType: ItemType;
  itemId: string;
  anchor: NoteAnchor;
  /** Sin la caja (borde, fondo y sombra): dentro de «Mi registro», que ya no
   *  anida tarjetas (spec 2026-11-11-ficha-linea-de-lectura). */
  bare?: boolean;
}) {
```

```tsx
    <form
      action={formAction}
      className={
        bare
          ? "flex flex-col gap-3"
          : "flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card"
      }
    >
```

- [ ] **Step 5: Comprueba que pasa**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail/session-row.test.tsx; npx eslint src/components/detail/session-row.tsx src/components/notes/note-form.tsx`
Expected: PASS; eslint sin salida.

- [ ] **Step 6: Commit**

```bash
git add src/components/detail/session-row.tsx src/components/detail/session-row.test.tsx src/components/notes/note-form.tsx messages/es.json
git commit -m "feat(registro): fila de sesión con minibarra y formulario de nota sin caja"
```

---

### Task 4: Cabecera de la lectura, chip de edición y `LogPanel` sin duplicados

**Files:**
- Create: `src/components/detail/edition-chip.tsx`, `src/components/detail/edition-chip.test.tsx`, `src/components/detail/pass-log-head.tsx`
- Modify: `src/components/detail/log-panel.tsx`, `src/components/detail/log-panel.test.tsx`, `src/app/pelicula/[id]/page.tsx`, `src/app/serie/[id]/page.tsx`, `messages/es.json`
- Delete: `src/components/detail/pass-progress.tsx`

**Interfaces:**
- Consumes: `SessionList` con `currentYear` (tarea 2), `NoteForm` con `bare` (tarea 3), `EditionPicker`, `shouldAskForEdition`, `setPassEdition`, `formatEdition`, `editionAskedStorageKey`, `useItemStatus`, `usePassActions`, `PassDiary`, `AddToCollectionSheet`.
- Produces:
  - `EditionChip({ itemType, itemId, openPass, passes, editions, canContribute }: { itemType: "book" | "movie"; itemId: string; openPass: Pass; passes: Pass[]; editions: Edition[]; canContribute: boolean })`
  - `PassLogHead({ itemType, itemId, entryStatus, passes, editions, canContribute }: { itemType: ItemType; itemId: string; entryStatus: MediaStatus; passes: Pass[]; editions: Edition[]; canContribute: boolean })`
  - `log-panel.tsx` exporta además `AddingPlaceholder()` y `AddToCollectionButton({ itemType, itemId }: { itemType: ItemType; itemId: string })`.
  - `LogPanel` pierde `workTotalUnits` y gana `currentYear: number`.
  - Claves `detail.readingStrip.chooseEdition`, `.chooseVersion`.

- [ ] **Step 1: Claves de i18n**

En `detail.readingStrip` de `messages/es.json` añade:

```json
      "chooseEdition": "Elegir edición",
      "chooseVersion": "Elegir versión",
```

- [ ] **Step 2: Escribe el test que falla**

`src/components/detail/edition-chip.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { Pass } from "@/lib/passes/types";
import type { Edition } from "@/lib/editions/types";
import { editionAskedStorageKey } from "@/lib/passes/edition-asked";

const actions = vi.hoisted(() => ({ setPassEdition: vi.fn() }));
vi.mock("@/lib/passes/actions", () => actions);
vi.mock("./edition-picker", () => ({
  EditionPicker: ({ onPick }: { onPick: (id: string) => void }) => (
    <button type="button" onClick={() => onPick("e2")}>picker</button>
  ),
}));
import { EditionChip } from "./edition-chip";

beforeEach(() => { window.localStorage.clear(); actions.setPassEdition.mockReset(); });
afterEach(cleanup);

const pass = (editionId: string | null): Pass => ({
  id: "p1", status: "in_progress", isActive: true, position: {}, startedOn: null, finishedOn: null, rating: null,
  review: null, reviewIsSpoiler: false, isPublic: false, editionId, pinnedOrder: null, droppedReason: null, droppedReasonNote: null,
});
const edition: Edition = {
  id: "e1", label: "Nocturna", publisher: null, year: 2016, language: "es", totalUnits: 412, isbn: null, coverUrl: null,
} as Edition;

function chip(p: Pass) {
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <EditionChip itemType="book" itemId="b1" openPass={p} passes={[p]} editions={[edition]} canContribute={false} />
    </NextIntlClientProvider>,
  );
}

describe("EditionChip", () => {
  it("con edición, la nombra", () => {
    chip(pass("e1"));
    expect(screen.getByRole("button", { name: "Nocturna · 412 p" })).toBeTruthy();
  });
  it("sin edición y con la pregunta contestada, dice «Elegir edición» y abre el selector al pulsar", () => {
    window.localStorage.setItem(editionAskedStorageKey("p1"), "1");
    chip(pass(null));
    expect(screen.queryByRole("button", { name: "picker" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Elegir edición" }));
    fireEvent.click(screen.getByRole("button", { name: "picker" }));
    expect(actions.setPassEdition).toHaveBeenCalledWith("p1", "book", "b1", "e2");
  });
});
```

Si `Edition` exige campos que el literal no trae, completa el literal con los que pida `tsc` (valores neutros: `null`), sin cambiar `label` ni `totalUnits`. Si `formatEdition` da otra forma para esa edición, usa en el primer test la cadena que devuelva `formatEdition(edition, "book")` llamándola en el propio test.

- [ ] **Step 3: Comprueba que falla**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail/edition-chip.test.tsx`
Expected: FAIL, no existe `./edition-chip`.

- [ ] **Step 4: Implementa el chip y la cabecera**

`src/components/detail/edition-chip.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { Pass } from "@/lib/passes/types";
import type { Edition } from "@/lib/editions/types";
import { setPassEdition } from "@/lib/passes/actions";
import { formatEdition } from "@/lib/editions/edition-label";
import { editionAskedStorageKey } from "@/lib/passes/edition-asked";
import { EditionPicker } from "./edition-picker";
import { shouldAskForEdition } from "./edition-question";

// Venían de log-panel.tsx (PassDataPanel). Se lee solo en el inicializador de
// useState: el primer pintado ya sabe si la pregunta toca, sin lecturas impuras.
function readEditionAsked(passId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(editionAskedStorageKey(passId)) === "1";
  } catch {
    return false;
  }
}

function writeEditionAsked(passId: string) {
  try {
    window.localStorage.setItem(editionAskedStorageKey(passId), "1");
  } catch {
    // Cuota llena o almacenamiento inaccesible: la pregunta podrá volver.
  }
}

// La edición del pase abierto, como chip de la cabecera de «Mi registro»
// (spec 2026-11-11-ficha-linea-de-lectura). Sustituye al select y a la pregunta
// del panel «Progreso». La pregunta pendiente se abre sola; si no, el chip la
// abre. El selector cae en su propia línea (`order-last basis-full`) dentro de
// la fila flex-wrap de PassLogHead. El padre lo monta con `key={openPass.id}`.
export function EditionChip({
  itemType,
  itemId,
  openPass,
  passes,
  editions,
  canContribute,
}: {
  itemType: "book" | "movie";
  itemId: string;
  openPass: Pass;
  passes: Pass[];
  editions: Edition[];
  canContribute: boolean;
}) {
  const t = useTranslations("detail.readingStrip");
  const tEditions = useTranslations("editions");
  const [isPending, startTransition] = useTransition();
  const [answered, setAnswered] = useState(() => readEditionAsked(openPass.id));
  const [open, setOpen] = useState(false);
  const pending = shouldAskForEdition({
    itemType,
    editionCount: editions.length,
    passEditionId: openPass.editionId,
    answered,
  });
  const edition = openPass.editionId ? (editions.find((e) => e.id === openPass.editionId) ?? null) : null;
  const showPicker = pending || open;

  function close() {
    setAnswered(true);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={showPicker}
        disabled={isPending}
        onClick={() => setOpen((o) => !o)}
        className="rounded-md px-2 py-0.5 font-mono text-[10px] tracking-[0.06em] uppercase disabled:opacity-60"
        style={{ color: "var(--accent-ink)", background: "color-mix(in oklab, var(--accent) 12%, transparent)" }}
      >
        {edition ? formatEdition(edition, itemType) : t(itemType === "movie" ? "chooseVersion" : "chooseEdition")}
      </button>
      {showPicker && (
        <div className="order-last basis-full rounded-md border border-border p-2.5">
          <EditionPicker
            itemType={itemType}
            itemId={itemId}
            editions={editions}
            passes={passes}
            title={tEditions("whichEditionReading")}
            disabled={isPending}
            canContribute={canContribute}
            passId={openPass.id}
            onPick={(editionId) => {
              close();
              startTransition(() => setPassEdition(openPass.id, itemType, itemId, editionId));
            }}
            onUnknown={() => {
              writeEditionAsked(openPass.id);
              close();
            }}
            onCandidatePicked={close}
          />
        </div>
      )}
    </>
  );
}
```

Comprueba con `git grep -n "shouldAskForEdition" src/components/detail/edition-question.ts` que su firma recibe `{ itemType, editionCount, passEditionId, answered }` (es la que usaba `PassDataPanel`). Si `itemType` no admite `"movie"` en esa función, informa NEEDS_CONTEXT.

`src/components/detail/pass-log-head.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import type { Pass } from "@/lib/passes/types";
import type { Edition } from "@/lib/editions/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { useItemStatus } from "./item-status-context";
import { usePassActions } from "./pass-actions-provider";
import { EditionChip } from "./edition-chip";

// Cabecera de «Mi registro» en los tres tipos: «Pase activo», el ordinal, la
// edición (libros y películas) y «Nuevo pase». Antes vivía dentro de
// ManagedLog (log-panel.tsx).
export function PassLogHead({
  itemType,
  itemId,
  entryStatus,
  passes,
  editions,
  canContribute,
}: {
  itemType: ItemType;
  itemId: string;
  entryStatus: MediaStatus;
  passes: Pass[];
  editions: Edition[];
  canContribute: boolean;
}) {
  const tPasses = useTranslations("passes");
  const accent = MEDIA_ACCENT[itemType];
  // El estado se cambia en la tarjeta del hero; aquí solo se lee. El
  // `?? entryStatus` cubre la ventana de «Quitar de mi biblioteca».
  const { status: sharedStatus } = useItemStatus();
  const status = sharedStatus ?? entryStatus;
  const { isPending, newPass } = usePassActions();
  const openPass = passes.find((p) => p.status === "planned" || p.status === "in_progress") ?? null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="min-w-0">
        <span className="block font-mono text-[9.5px] tracking-wider text-muted-foreground uppercase">
          {tPasses("activeLabel")}
        </span>
        <span className="font-serif text-base leading-tight font-semibold">
          {tPasses(`nth.${itemType}`, { n: passes.length })}
        </span>
      </div>
      {openPass && itemType !== "series" && (
        <EditionChip
          key={openPass.id}
          itemType={itemType}
          itemId={itemId}
          openPass={openPass}
          passes={passes}
          editions={editions}
          canContribute={canContribute}
        />
      )}
      {/* «Nuevo pase» no se pinta sobre un pendiente: no hay nada que cerrar. */}
      {status !== "planned" && (
        <button
          type="button"
          disabled={isPending}
          onClick={newPass}
          className={`ml-auto shrink-0 rounded-lg border px-[11px] py-1.5 font-mono text-[10px] font-medium whitespace-nowrap disabled:opacity-60 ${accent.text} ${accent.borderSoft}`}
        >
          {tPasses("newPass")}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Reescribe `log-panel.tsx`**

Sustituye el contenido entero de `src/components/detail/log-panel.tsx` por:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { SessionList } from "@/components/session-list";
import { NoteForm } from "@/components/notes/note-form";
import { AddToCollectionSheet } from "@/components/library/add-to-collection-sheet";
import { PassDiary } from "@/components/detail/pass-diary";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import type { Position } from "@/lib/library/position";
import type { ProgressSession } from "@/lib/sessions/types";
import type { Pass } from "@/lib/passes/types";
import type { Edition } from "@/lib/editions/types";
import { PassLogHead } from "./pass-log-head";

export type ManagedEntry = {
  entryId: string;
  status: MediaStatus;
  position: Position;
};

// «Mi registro» de series y películas (los libros usan ReadingLine, spec
// 2026-11-11-ficha-linea-de-lectura): cabecera, sesiones (series), diario de
// pases, notas y «Añadir a colección». El estado, la nota y la acción principal
// son de la tarjeta del hero; aquí no se repiten (sin panel «Progreso»).
export function LogPanel({
  itemType,
  itemId,
  entry,
  passes,
  sessions,
  editions,
  currentYear,
  canContribute = false,
}: {
  itemType: ItemType;
  itemId: string;
  entry: ManagedEntry | null;
  passes: Pass[];
  sessions: ProgressSession[];
  editions: Edition[];
  /** Año en curso, del servidor: decide si las fechas llevan año. */
  currentYear: number;
  canContribute?: boolean;
}) {
  if (!entry) return <AddingPlaceholder />;
  const activePass = passes.find((p) => p.isActive) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PassLogHead
        itemType={itemType}
        itemId={itemId}
        entryStatus={entry.status}
        passes={passes}
        editions={editions}
        canContribute={canContribute}
      />
      {itemType !== "movie" && activePass && (
        <SessionList
          passId={activePass.id}
          itemType={itemType}
          itemId={itemId}
          sessions={sessions}
          currentYear={currentYear}
        />
      )}
      <PassDiary itemType={itemType} itemId={itemId} passes={passes} editions={editions} />
      <NoteForm bare itemType={itemType} itemId={itemId} anchor={{ kind: "none" }} />
      <AddToCollectionButton itemType={itemType} itemId={itemId} />
    </div>
  );
}

// Ventana transitoria tras elegir una intención en la tarjeta: el estado ya es
// optimista pero la entry del servidor aún no ha llegado.
export function AddingPlaceholder() {
  const t = useTranslations("item");
  return <p className="py-8 text-center text-sm text-muted-foreground">{t("addingToLibrary")}</p>;
}

// «Añadir a colección» (Colección v2 S2). Isla de cliente propia: el trigger es
// una función y ReadingLine (servidor) no puede pasársela a AddToCollectionSheet.
export function AddToCollectionButton({ itemType, itemId }: { itemType: ItemType; itemId: string }) {
  const t = useTranslations("item");
  return (
    <AddToCollectionSheet
      itemType={itemType}
      itemId={itemId}
      renderTrigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="flex items-center justify-center gap-2 self-start rounded-[10px] border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
        >
          <span aria-hidden>▤</span>
          {t("addToCollection")}
        </button>
      )}
    />
  );
}
```

Antes de pegarlo, comprueba en el fichero actual que el anclaje de `NoteForm` para series y películas era `{ kind: "none" }` (el de página solo aplicaba a libros). Si para series era de episodio, conserva esa rama.

Borra `src/components/detail/pass-progress.tsx` tras comprobar que no tiene más usos: `git grep -n "pass-progress" -- src` debe devolver solo el propio fichero.

En `messages/es.json`, dentro de `detail.log`, borra `progressTitle`, `page`, `pageOnly`, `edition`, `noEdition` y, de `detail.log.progress`, `start`, `current`, `currentRest` y `total`, tras comprobar con `git grep -n` que nada los usa ya. Deja `detail.log.progress.closeHint`: lo usa la tarea 5.

- [ ] **Step 6: Pasa `currentYear` en series y películas**

En `src/app/pelicula/[id]/page.tsx` y `src/app/serie/[id]/page.tsx`, en el `<LogPanel …>`, quita `workTotalUnits={…}` si lo hay y añade `currentYear={new Date().getFullYear()}`. Es un componente de servidor que ya ha leído datos de la petición, así que `new Date()` no rompe el prerender; si `next dev` avisa de lo contrario en la tarea 7, informa.

- [ ] **Step 7: Actualiza los tests de `LogPanel`**

En `src/components/detail/log-panel.test.tsx`, en `renderLog`, pasa `currentYear={2026}` a `<LogPanel>`. Añade al final del `describe`:

```tsx
  it("ya no pinta el panel «Progreso» ni la página", () => {
    renderLog();
    expect(screen.queryByText("Progreso")).toBeNull();
    expect(screen.queryByText(/Voy por la página/)).toBeNull();
  });
```

- [ ] **Step 8: Comprueba**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail/edition-chip.test.tsx src/components/detail/log-panel.test.tsx src/components/session-list.test.tsx; npx tsc --noEmit; npx eslint src/components/detail/edition-chip.tsx src/components/detail/pass-log-head.tsx src/components/detail/log-panel.tsx`
Expected: PASS, `tsc` sin errores (la ficha de libro aún monta `LogPanel` con `workTotalUnits`: quítalo allí también y pasa `currentYear={new Date().getFullYear()}`; la tarea 6 la sustituye), eslint sin salida.

- [ ] **Step 9: Commit**

```bash
git add src/components/detail/edition-chip.tsx src/components/detail/edition-chip.test.tsx src/components/detail/pass-log-head.tsx src/components/detail/log-panel.tsx src/components/detail/log-panel.test.tsx "src/app/pelicula/[id]/page.tsx" "src/app/serie/[id]/page.tsx" "src/app/libro/[id]/page.tsx" messages/es.json
git rm src/components/detail/pass-progress.tsx
git commit -m "feat(registro): cabecera con chip de edición y Mi registro sin panel Progreso"
```

---

### Task 5: La tarjeta de la tira y el historial por meses

**Files:**
- Create: `src/components/detail/reading-strip.tsx`, `src/components/detail/reading-strip.module.css`, `src/components/detail/session-months.tsx`, `src/components/detail/reading-strip.test.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `ReadingStrip`, `StripSegment`, `StripNote` (tarea 1); `sessionDateLabel`, `monthLabel`, `durationLabel` (tarea 2); `SessionRow`, `useSegmentText` (tarea 3); `NoteForm` con `bare` (tarea 3).
- Produces:
  - `ReadingStrip({ strip, itemId, sessionsPassId, currentYear, noteNodes, showCloseHint }: { strip: ReadingStrip; itemId: string; sessionsPassId: string | null; currentYear: number; noteNodes: Record<string, ReactNode>; showCloseHint: boolean })` (el componente se exporta como `ReadingStripCard` para no chocar con el tipo).
  - `SessionMonths({ months, total, scale, currentYear, itemId, onShowNotes })`.
  - `data-testid`: `reading-strip` (sección), `reading-current-page` (cifra), `reading-strip-detail` (detalle), `session-month` (cada mes).

- [ ] **Step 1: Claves de i18n**

En `detail.readingStrip` añade:

```json
      "pageOf": "de {total} · {percent} %",
      "summary": "{sessions, plural, one {# sesión} other {# sesiones}} · {time} · {perSession} págs. por sesión",
      "stripLabel": "Sesiones a lo largo del libro",
      "segmentLabel": "{date}: páginas {from} a {to}",
      "legendNote": "Nota o cita",
      "legendMargin": "Nota en el margen",
      "detailTitle": "Sesión {n} · {date}",
      "recent": "Últimas sesiones",
      "seeAll": "Ver las {count} sesiones, por mes",
      "hideAll": "Ocultar el historial",
      "monthSummary": "{sessions, plural, one {# sesión} other {# sesiones}} · {pages, plural, one {# página} other {# páginas}} · {time}{notes, plural, =0 {} one { · # nota} other { · # notas}}",
      "empty": "Todavía no has registrado ninguna sesión. Registra la primera y aquí verás tu lectura dibujada.",
      "ahead": "Más adelante",
      "afterLast": "Después de la última sesión",
      "other": "Otras notas",
```

- [ ] **Step 2: Escribe el test que falla**

`src/components/detail/reading-strip.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { ProgressSession } from "@/lib/sessions/types";
import { buildReadingStrip, type StripNote } from "@/lib/passes/reading-strip";

vi.mock("@/lib/sessions/actions", () => ({ deleteSession: vi.fn() }));
vi.mock("@/components/notes/note-form", () => ({ NoteForm: () => <p>compositor</p> }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
import { ReadingStripCard } from "./reading-strip";

afterEach(cleanup);

const s = (id: string, date: string, page: number): ProgressSession => ({
  id, sessionDate: date, createdAt: `${date}T10:00:00Z`, durationMinutes: 30, position: { page }, hasPost: false,
});
const note = (key: string, page: number): StripNote => ({ key, kind: "note", page, createdAt: "2026-08-01T00:00:00Z" });

function renderStrip(sessions: ProgressSession[], notes: StripNote[] = []) {
  const strip = buildReadingStrip({ sessions, notes, totalPages: 400, currentPage: null, closed: false, complete: true });
  const noteNodes = Object.fromEntries(notes.map((n) => [n.key, <p key={n.key}>{`texto ${n.key}`}</p>]));
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <ReadingStripCard strip={strip} itemId="b1" sessionsPassId="p1" currentYear={2026} noteNodes={noteNodes} showCloseHint={false} />
    </NextIntlClientProvider>,
  );
}
const four = [s("a", "2026-07-08", 40), s("b", "2026-07-20", 90), s("c", "2026-08-02", 150), s("d", "2026-08-10", 200)];

describe("ReadingStripCard", () => {
  it("conserva el h3 «Sesiones» con su enlace hermano (e2e)", () => {
    renderStrip(four);
    const heading = screen.getByRole("heading", { name: "Sesiones", level: 3 });
    expect(within(heading.parentElement!).getByRole("link", { name: "Registrar sesión" }).getAttribute("href")).toBe("/sesion/p1");
  });
  it("cifra la página actual", () => {
    renderStrip(four);
    expect(screen.getByTestId("reading-current-page").textContent).toBe("pág. 200");
  });
  it("abre por defecto la última sesión, con sus notas", () => {
    renderStrip(four, [note("note:1", 180), note("note:2", 60)]);
    const detail = screen.getByTestId("reading-strip-detail");
    expect(within(detail).getByText(/Sesión 4 · 10 ago/)).toBeTruthy();
    expect(within(detail).getByText("texto note:1")).toBeTruthy();
    expect(screen.queryByText("texto note:2")).toBeNull();
  });
  it("tocar un tramo lo abre; tocarlo otra vez, o Escape, lo cierra", () => {
    renderStrip(four, [note("note:2", 60)]);
    const tramo = screen.getByRole("button", { name: /20 jul: páginas 40 a 90/ });
    fireEvent.click(tramo);
    expect(tramo.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("texto note:2")).toBeTruthy();
    fireEvent.click(tramo);
    expect(screen.queryByTestId("reading-strip-detail")).toBeNull();
    fireEvent.click(tramo);
    fireEvent.keyDown(tramo, { key: "Escape" });
    expect(screen.queryByTestId("reading-strip-detail")).toBeNull();
  });
  it("la pastilla de una fila abre su tramo", () => {
    renderStrip(four, [note("note:9", 120)]);
    fireEvent.click(screen.getByRole("button", { name: "1 nota" }));
    expect(within(screen.getByTestId("reading-strip-detail")).getByText(/Sesión 3/)).toBeTruthy();
  });
  it("solo enseña las tres últimas; el historial por meses, a un toque y con el mes en curso abierto", () => {
    renderStrip(four);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Ver las 4 sesiones, por mes" }));
    const months = screen.getAllByTestId("session-month");
    expect(months).toHaveLength(2);
    expect(months[0].hasAttribute("open")).toBe(true);
    expect(months[1].hasAttribute("open")).toBe(false);
  });
  it("con tres sesiones o menos no hay historial", () => {
    renderStrip(four.slice(0, 3));
    expect(screen.queryByRole("button", { name: /Ver las/ })).toBeNull();
  });
  it("sin sesiones: el vacío único con el compositor", () => {
    renderStrip([]);
    expect(screen.getByText(/Todavía no has registrado ninguna sesión/)).toBeTruthy();
    expect(screen.getByText("compositor")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Sesiones a lo largo del libro" })).not.toBeNull();
  });
});
```

- [ ] **Step 3: Comprueba que falla**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail/reading-strip.test.tsx`
Expected: FAIL, no existe `./reading-strip`.

- [ ] **Step 4: Implementa**

`src/components/detail/reading-strip.module.css`:

```css
/* La tira de «Mi registro» (spec 2026-11-11-ficha-linea-de-lectura): un tramo
   por sesión. Los tramos encogen para caber (mínimo 3px) y el resto es pista. */
.track {
  display: flex;
  gap: 2px;
  height: 34px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface-muted);
}
.segment {
  flex: 0 1 auto;
  min-width: 3px;
  height: 100%;
  background: var(--accent);
  opacity: calc(0.38 + var(--recency) * 0.62);
}
.segment:hover,
.segment:focus-visible,
.segment[aria-pressed="true"] {
  opacity: 1;
}
.segment[aria-pressed="true"] {
  box-shadow: inset 0 -4px 0 var(--foreground);
}
.monthStart {
  margin-left: 4px;
}
.rest {
  flex: 1 1 0;
  min-width: 0;
}
.mark,
.markMargin {
  position: absolute;
  top: 0;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  border-radius: 2px 2px 50% 50%;
}
.mark {
  background: var(--accent-ink);
}
.markMargin {
  border: 2px solid var(--accent-ink);
}
@media (prefers-reduced-motion: no-preference) {
  .segment {
    transition: opacity 150ms ease, transform 150ms ease;
  }
  .segment:hover {
    transform: scaleY(1.08);
  }
}
```

`src/components/detail/session-months.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { StripMonth } from "@/lib/passes/reading-strip";
import { durationLabel, monthLabel } from "@/lib/sessions/session-date";
import { SessionRow } from "./session-row";

// El historial completo, por meses y plegado (spec 2026-11-11, «Historial por
// meses»). El mes más reciente va abierto. Solo se monta con más de tres
// sesiones: las tres últimas ya están a la vista.
export function SessionMonths({
  months,
  total,
  scale,
  currentYear,
  itemId,
  onShowNotes,
}: {
  months: StripMonth[];
  total: number;
  scale: number;
  currentYear: number;
  itemId: string;
  onShowNotes: (sessionId: string) => void;
}) {
  const t = useTranslations("detail.readingStrip");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="self-start rounded-[9px] border border-border px-3 py-1.5 text-[12.5px] font-medium text-foreground-soft transition-colors hover:bg-surface-muted"
      >
        {open ? t("hideAll") : t("seeAll", { count: total })}
      </button>
      {open &&
        months.map((m, i) => (
          <details key={m.key} open={i === 0} data-testid="session-month" className="rounded-[12px] border border-border bg-surface">
            <summary className="flex cursor-pointer list-none flex-col gap-1 px-3.5 py-3">
              <span className="font-serif text-[17px] font-semibold">{monthLabel(m.key, currentYear)}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {t("monthSummary", { sessions: m.segments.length, pages: m.pages, time: durationLabel(m.minutes), notes: m.notesCount })}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">{t("range", { from: m.from, to: m.to })}</span>
            </summary>
            <ul className="flex flex-col border-t border-border px-3.5">
              {[...m.segments].reverse().map((s) => (
                <SessionRow key={s.sessionId} segment={s} scale={scale} currentYear={currentYear} itemId={itemId} onShowNotes={onShowNotes} />
              ))}
            </ul>
          </details>
        ))}
    </div>
  );
}
```

`src/components/detail/reading-strip.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ReadingStrip } from "@/lib/passes/reading-strip";
import { durationLabel, monthLabel, sessionDateLabel } from "@/lib/sessions/session-date";
import { NoteForm } from "@/components/notes/note-form";
import { SessionRow, useSegmentText } from "./session-row";
import { SessionMonths } from "./session-months";
import styles from "./reading-strip.module.css";

// La tarjeta de la tira (spec 2026-11-11-ficha-linea-de-lectura, punto 2), las
// tres últimas sesiones y el historial. Las tarjetas de nota llegan del servidor
// ya pintadas (`noteNodes`, por clave `note:<id>` / `margin:<id>`). Una nota se
// ve en un solo sitio: el detalle del tramo seleccionado.
export function ReadingStripCard({
  strip,
  itemId,
  sessionsPassId,
  currentYear,
  noteNodes,
  showCloseHint,
}: {
  strip: ReadingStrip;
  itemId: string;
  /** Pase dueño de las sesiones: destino de «Registrar sesión». */
  sessionsPassId: string | null;
  currentYear: number;
  noteNodes: Record<string, ReactNode>;
  showCloseHint: boolean;
}) {
  const t = useTranslations("detail.readingStrip");
  const tSessions = useTranslations("item.sessions");
  const tProgress = useTranslations("detail.log.progress");
  const segmentText = useSegmentText();
  const { segments, scale } = strip;
  const lastId = segments.at(-1)?.sessionId ?? null;

  // Abre por defecto la última sesión: «donde estás». Si llega otra última
  // (sesión nueva tras revalidar), se vuelve a ella (ajuste en render).
  const [selected, setSelected] = useState<string | null>(lastId);
  const [prevLastId, setPrevLastId] = useState(lastId);
  if (lastId !== prevLastId) {
    setPrevLastId(lastId);
    setSelected(lastId);
  }
  const current = segments.find((s) => s.sessionId === selected) ?? null;

  const cardRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pointerType = useRef("mouse");

  function showNotes(sessionId: string) {
    setSelected(sessionId);
    cardRef.current?.scrollIntoView({ block: "nearest" });
  }

  // Con el dedo, el tramo más cercano al punto tocado: no se exige acertar en
  // 3px. Con ratón o teclado, el tramo pulsado.
  function nearestTo(x: number): string | null {
    let best: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const b of trackRef.current?.querySelectorAll<HTMLButtonElement>("[data-segment]") ?? []) {
      const r = b.getBoundingClientRect();
      const d = Math.abs(x - (r.left + r.width / 2));
      if (d < bestDistance) {
        bestDistance = d;
        best = b.dataset.segment ?? null;
      }
    }
    return best;
  }
  function onTrackClick(e: MouseEvent<HTMLDivElement>) {
    const hit = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-segment]")?.dataset.segment ?? null;
    const id = pointerType.current !== "mouse" && e.detail > 0 ? (nearestTo(e.clientX) ?? hit) : hit;
    if (id) setSelected((prev) => (prev === id ? null : id));
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" && selected) {
      e.stopPropagation();
      setSelected(null);
    }
  }

  const visible = segments.filter((s) => s.advanced);
  const marks = [...segments.flatMap((s) => s.notes), ...strip.loose.ahead, ...strip.loose.afterLast, ...strip.loose.other].filter(
    (n): n is typeof n & { page: number } => n.page !== null && n.page <= scale,
  );
  const percent = strip.totalPages ? Math.min(100, Math.round((strip.currentPage / strip.totalPages) * 100)) : null;
  const monthsChrono = [...strip.months].reverse();

  return (
    <section data-testid="reading-strip" className="flex flex-col gap-4" aria-labelledby="reading-strip-title">
      {/* h3 y enlace hermanos: varios e2e se anclan a esta estructura. */}
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="reading-strip-title" data-section-title className="label-section">
          {tSessions("title")}
        </h3>
        {sessionsPassId && (
          <Link href={`/sesion/${sessionsPassId}`} className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground">
            {tSessions("add")}
          </Link>
        )}
      </div>

      <div ref={cardRef} onKeyDown={onKeyDown} className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="m-0">
            <span
              data-testid="reading-current-page"
              className="font-serif text-[26px] leading-none font-semibold tabular-nums"
              style={{ color: "var(--work-title)" }}
            >
              {t("page", { page: strip.currentPage })}
            </span>
            {strip.totalPages !== null && percent !== null && (
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                {t("pageOf", { total: strip.totalPages, percent })}
              </span>
            )}
          </p>
          {segments.length > 0 && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {t("summary", { sessions: segments.length, time: durationLabel(strip.totalMinutes), perSession: strip.pagesPerSession })}
            </span>
          )}
        </div>

        <div className="relative pt-3.5">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-3">
            {marks.map((n) => (
              <span key={n.key} className={n.kind === "margin" ? styles.markMargin : styles.mark} style={{ left: `${(n.page / scale) * 100}%` }} />
            ))}
          </div>
          <div
            ref={trackRef}
            role="group"
            aria-label={t("stripLabel")}
            className={styles.track}
            onPointerDown={(e) => {
              pointerType.current = e.pointerType;
            }}
            onClick={onTrackClick}
          >
            {visible.map((s, i) => {
              const date = sessionDateLabel(s.date, currentYear);
              const label = [t("segmentLabel", { date, from: s.from, to: s.to }), s.minutes != null ? durationLabel(s.minutes) : null]
                .filter(Boolean)
                .join(", ");
              return (
                <button
                  key={s.sessionId}
                  type="button"
                  data-segment={s.sessionId}
                  aria-pressed={s.sessionId === selected}
                  aria-label={label}
                  title={label}
                  className={`${styles.segment} ${i > 0 && visible[i - 1].monthKey !== s.monthKey ? styles.monthStart : ""}`}
                  style={{ width: `${(s.pages / scale) * 100}%`, "--recency": s.recency } as CSSProperties}
                />
              );
            })}
            <span aria-hidden className={styles.rest} />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>{t("page", { page: 0 })}</span>
            <span>{t("page", { page: scale })}</span>
          </div>
        </div>

        {segments.length > 0 && (
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
            <span className="flex flex-wrap gap-3">
              {monthsChrono.map((m) => (
                <span key={m.key} className="flex items-center gap-1.5">
                  <span aria-hidden className="h-2 w-2 rounded-sm bg-accent" style={{ opacity: 0.38 + m.segments[0].recency * 0.62 }} />
                  {monthLabel(m.key, currentYear)}
                </span>
              ))}
            </span>
            <span className="flex gap-3">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className={styles.mark} style={{ position: "static", margin: 0 }} />
                {t("legendNote")}
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className={styles.markMargin} style={{ position: "static", margin: 0 }} />
                {t("legendMargin")}
              </span>
            </span>
          </div>
        )}

        {showCloseHint && strip.totalPages !== null && (
          <p className="m-0 text-[12.5px] text-muted-foreground">{tProgress("closeHint", { total: strip.totalPages })}</p>
        )}

        {current && (
          <div data-testid="reading-strip-detail" className="flex flex-col gap-2 rounded-[10px] bg-surface-muted p-3">
            <p className="m-0 text-sm font-semibold">
              {t("detailTitle", { n: current.index, date: sessionDateLabel(current.date, currentYear) })}{" "}
              <span className="font-normal text-muted-foreground">· {segmentText(current)}</span>
            </p>
            {current.notes.map((n) => (
              <div key={n.key}>{noteNodes[n.key]}</div>
            ))}
            <NoteForm key={current.sessionId} bare itemType="book" itemId={itemId} anchor={{ kind: "page", page: current.to }} />
          </div>
        )}

        {segments.length === 0 && (
          <>
            <p className="m-0 text-sm text-muted-foreground">{t("empty")}</p>
            <NoteForm bare itemType="book" itemId={itemId} anchor={{ kind: "page", page: strip.currentPage }} />
          </>
        )}
      </div>

      {segments.length > 0 && (
        <div>
          <p className="label-section m-0 mb-1">{t("recent")}</p>
          <ul className="flex flex-col">
            {segments
              .slice(-3)
              .reverse()
              .map((s) => (
                <SessionRow key={s.sessionId} segment={s} scale={scale} currentYear={currentYear} itemId={itemId} onShowNotes={showNotes} />
              ))}
          </ul>
        </div>
      )}

      {segments.length > 3 && (
        <SessionMonths
          months={strip.months}
          total={segments.length}
          scale={scale}
          currentYear={currentYear}
          itemId={itemId}
          onShowNotes={showNotes}
        />
      )}
    </section>
  );
}
```

`scrollIntoView` no existe en jsdom: si el test de la pastilla falla por eso, protégelo con `cardRef.current?.scrollIntoView?.({ block: "nearest" })`.

Comprueba que `--work-title`, `bg-accent`, `bg-surface-3` y `text-foreground-soft` existen (`git grep -n "work-title\|surface-3\|foreground-soft" -- src/app/globals.css src/components/detail/work-scope.module.css`).

- [ ] **Step 5: Comprueba que pasa**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/detail/reading-strip.test.tsx src/components/detail/session-row.test.tsx; npx eslint src/components/detail/reading-strip.tsx src/components/detail/session-months.tsx`
Expected: PASS; eslint sin salida.

- [ ] **Step 6: Commit**

```bash
git add src/components/detail/reading-strip.tsx src/components/detail/reading-strip.module.css src/components/detail/session-months.tsx src/components/detail/reading-strip.test.tsx messages/es.json
git commit -m "feat(registro): la tira del libro con detalle por tramo y el historial por meses"
```

---

### Task 6: `ReadingLine` y la ficha de libro

**Files:**
- Create: `src/components/detail/reading-line.tsx`
- Modify: `src/app/libro/[id]/page.tsx`

**Interfaces:**
- Consumes: `buildReadingStrip`, `noteToStrip`, `marginToStrip`, `resolveReadingPages`, `READING_STRIP_SESSION_CAP` (tarea 1); `getSessions` con `{ limit }` (tarea 2); `PassLogHead` (tarea 4); `AddingPlaceholder`, `AddToCollectionButton`, `ManagedEntry` (tarea 4); `ReadingStripCard` (tarea 5); `NoteCard`, `MarginNoteCard`, `MarginComposerButton`, `MarginReveal`, `MarginRetroSeen`, `PassDiary`; `getNotesForItem`, `getItemMarginNotes`.
- Produces: `ReadingLine(props)` (servidor) montado en el hueco `log` de la ficha de libro.

- [ ] **Step 1: Implementa `ReadingLine`**

`src/components/detail/reading-line.tsx`:

```tsx
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { ProgressSession } from "@/lib/sessions/types";
import type { Pass } from "@/lib/passes/types";
import type { Edition } from "@/lib/editions/types";
import type { getNotesForItem } from "@/lib/notes/get-notes";
import type { getItemMarginNotes } from "@/lib/margin/queries";
import {
  READING_STRIP_SESSION_CAP,
  buildReadingStrip,
  marginToStrip,
  noteToStrip,
  resolveReadingPages,
} from "@/lib/passes/reading-strip";
import { NoteCard } from "@/components/notes/note-card";
import { MarginNoteCard } from "@/components/margin/margin-note-card";
import { MarginComposerButton } from "@/components/margin/margin-composer-button";
import { MarginReveal } from "@/components/margin/margin-reveal";
import { MarginRetroSeen } from "@/components/margin/margin-retro-seen";
import { PassDiary } from "./pass-diary";
import { PassLogHead } from "./pass-log-head";
import { ReadingStripCard } from "./reading-strip";
import { AddToCollectionButton, AddingPlaceholder, type ManagedEntry } from "./log-panel";

type Notes = Awaited<ReturnType<typeof getNotesForItem>>;
type Margin = Awaited<ReturnType<typeof getItemMarginNotes>>;

// «Mi registro» en libros (spec 2026-11-11-ficha-linea-de-lectura): cabecera,
// tira, notas sueltas, cabecera del margen, diario y «Añadir a colección».
// Servidor: espera notas y margen (que la ficha empezó antes de after(), #754),
// arma la tira y pinta las tarjetas de nota para pasarlas a las islas.
// Sin `use cache`: todo depende de quién mira (regla #437).
export async function ReadingLine({
  itemId,
  entry,
  passes,
  sessions,
  editions,
  workTotalUnits,
  canContribute,
  notesPromise,
  marginPromise,
  marginPages,
  currentYear,
}: {
  itemId: string;
  entry: ManagedEntry | null;
  passes: Pass[];
  sessions: ProgressSession[];
  editions: Edition[];
  workTotalUnits: number | null;
  canContribute: boolean;
  notesPromise: Promise<Notes> | null;
  marginPromise: Promise<Margin> | null;
  marginPages: number | null;
  currentYear: number;
}) {
  if (!entry) return <AddingPlaceholder />;

  const t = await getTranslations("detail.readingStrip");
  const tMargin = await getTranslations("margin");
  const [notes, margin] = await Promise.all([
    notesPromise ?? Promise.resolve([] as Notes),
    marginPromise ?? Promise.resolve({ found: [], mine: [] } as Margin),
  ]);

  const { openPass, activePass, totalPages, currentPage } = resolveReadingPages({
    passes,
    editions,
    workTotalUnits,
    position: entry.position,
  });
  const marginAll = [...margin.found, ...margin.mine.filter((m) => !margin.found.some((f) => f.noteId === m.noteId))];

  const strip = buildReadingStrip({
    sessions,
    notes: [...notes.map(noteToStrip), ...marginAll.map((v) => marginToStrip(v, totalPages))],
    totalPages,
    currentPage,
    closed: openPass === null,
    complete: sessions.length < READING_STRIP_SESSION_CAP,
  });

  const noteNodes: Record<string, ReactNode> = {};
  for (const n of notes) noteNodes[`note:${n.id}`] = <NoteCard note={n} />;
  for (const v of marginAll) {
    noteNodes[`margin:${v.noteId}`] = (
      <MarginNoteCard note={v} showNew={!!v.encounter && !v.encounter.seenAt && v.encounter.foundVia === "retro"} />
    );
  }

  // Mismo reparto que margin-section.tsx: revelación al cruzar el punto, y los
  // encuentros retroactivos se marcan vistos.
  const reveal = margin.found.filter((n) => n.encounter && !n.encounter.seenAt && n.encounter.foundVia !== "retro");
  const retroUnseen = margin.found.flatMap((n) =>
    n.encounter && !n.encounter.seenAt && n.encounter.foundVia === "retro" ? [n.encounter.id] : [],
  );

  const showCloseHint =
    openPass !== null &&
    totalPages !== null &&
    totalPages > 0 &&
    strip.currentPage < totalPages &&
    (totalPages - strip.currentPage) / totalPages < 0.1;

  const groups = [
    ["ahead", strip.loose.ahead],
    ["afterLast", strip.loose.afterLast],
    ["other", strip.loose.other],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <PassLogHead
        itemType="book"
        itemId={itemId}
        entryStatus={entry.status}
        passes={passes}
        editions={editions}
        canContribute={canContribute}
      />
      <ReadingStripCard
        strip={strip}
        itemId={itemId}
        sessionsPassId={activePass?.id ?? null}
        currentYear={currentYear}
        noteNodes={noteNodes}
        showCloseHint={showCloseHint}
      />
      {groups.map(([key, list]) =>
        list.length === 0 ? null : (
          <section key={key} className="flex flex-col gap-3" aria-labelledby={`loose-${key}`}>
            <h3 id={`loose-${key}`} data-section-title className="label-section">
              {t(key)}
            </h3>
            {list.map((n) => (
              <div key={n.key}>{noteNodes[n.key]}</div>
            ))}
          </section>
        ),
      )}
      <section className="flex flex-col gap-3" aria-labelledby="margin-title">
        <div className="flex items-center justify-between gap-2">
          <h3 id="margin-title" data-section-title className="label-section">
            {tMargin("sectionTitle")}
          </h3>
          <MarginComposerButton itemType="book" itemId={itemId} pages={marginPages} />
        </div>
        <MarginRetroSeen key={retroUnseen.join(",")} ids={retroUnseen} />
        <MarginReveal key={reveal.map((n) => n.encounter!.id).join(",")} notes={reveal} />
      </section>
      <PassDiary itemType="book" itemId={itemId} passes={passes} editions={editions} />
      <AddToCollectionButton itemType="book" itemId={itemId} />
    </div>
  );
}
```

Comprueba las props de `MarginRetroSeen`, `MarginReveal` y `MarginNoteCard` con las que usa `src/components/margin/margin-section.tsx`; si difieren de las de arriba, usa las de `margin-section.tsx`.

- [ ] **Step 2: Monta `ReadingLine` en la ficha de libro**

En `src/app/libro/[id]/page.tsx`:
- Importa `ReadingLine` (`@/components/detail/reading-line`) y `READING_STRIP_SESSION_CAP` (`@/lib/passes/reading-strip`). Quita los imports de `LogPanel` (deja `type ManagedEntry` desde `log-panel`), `NotesSection` y `MarginSection` si dejan de usarse.
- En la llamada a `getSessions`, pasa el tope: `sessions = await getSessions(supabase, currentPassId, "book", { limit: READING_STRIP_SESSION_CAP });`
- Sustituye el contenido de `log={…}` por:

```tsx
      log={
        <Suspense fallback={null}>
          <ReadingLine
            itemId={book.id}
            entry={entry}
            passes={passes}
            sessions={sessions}
            editions={editions}
            workTotalUnits={book.total_pages}
            canContribute={canContribute}
            notesPromise={userId ? notesPromise : null}
            marginPromise={userId ? marginPromise : null}
            marginPages={marginPages}
            currentYear={new Date().getFullYear()}
          />
        </Suspense>
      }
```

`notesPromise` y `marginPromise` siguen empezando donde están (antes de `after()`, #754): no los muevas. Si el tipo de esas variables no casa con el de las props, ajusta solo la anotación de las props de `ReadingLine`.

- [ ] **Step 3: Comprueba**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx tsc --noEmit; npx eslint src/components/detail/reading-line.tsx "src/app/libro/[id]/page.tsx"; npx vitest run src/components/detail src/lib/passes src/lib/sessions src/components/session-list.test.tsx --maxWorkers=2`
Expected: `tsc` y eslint sin errores; todos los tests en verde.

- [ ] **Step 4: Commit**

```bash
git add src/components/detail/reading-line.tsx "src/app/libro/[id]/page.tsx"
git commit -m "feat(registro): la ficha de libro monta la línea de lectura"
```

---

### Task 7: E2E, navegador y documentación

**Files:**
- Modify: `e2e/pase-hub.spec.ts`, `docs/requirements/decisiones.md`, `docs/requirements/backlog.md`, `docs/UI-GLOSARIO.md`, `docs/architecture/graph.json`

- [ ] **Step 1: Adapta `pase-hub`**

En `e2e/pase-hub.spec.ts`:
- Añade junto a los demás helpers:

```ts
// La página actual en la tira de «Mi registro» (spec 2026-11-11-ficha-linea-de-lectura).
function currentPage(page: Page) {
  return page.getByTestId("reading-current-page");
}
```

- Sustituye cada `page.getByText("Voy por la página 20")` (y `p.getByText("Voy por la página 20")` dentro de `reloadUntilVisible`) por `currentPage(page).filter({ hasText: /^pág\. 20$/ })` (o `currentPage(p)…`).
- Sustituye cada `await expect(page.getByText(/^Voy por la página/)).toHaveCount(0);` por `await expect(currentPage(page)).toHaveText("pág. 0");`.
- En la Regla 5, sustituye `await expect(page.getByText("Progreso", { exact: true })).toBeVisible();` por `await expect(page.getByTestId("reading-strip")).toBeVisible();`.

Busca otros restos: `git grep -n "Voy por la página\|\"Progreso\"\|Tu edición" -- e2e` debe quedar vacío.

- [ ] **Step 2: Lanza los e2e de la ficha**

Con el puerto 3000 libre, arranca el servidor del worktree en segundo plano (`fnm env | Out-String | Invoke-Expression; fnm use 22; npx next dev --webpack -p 3000`), espera a que `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/login` dé `200` y lanza:

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; npx playwright test e2e/pase-hub.spec.ts e2e/notas-captura.spec.ts e2e/notas-en-el-margen.spec.ts e2e/registrar-sesion-v2.spec.ts e2e/cierre-ritual.spec.ts e2e/posts.spec.ts e2e/ficha-acciones.spec.ts --reporter=line
```

Expected: en verde. El bloque serial «ciclo de vida de un libro» de `pase-hub` puede fallar en frío por un clic antes de hidratar: si falla, repítelo una vez con `--grep "ciclo de vida"` antes de investigar. Si `notas-captura` no encuentra la nota (debe verse una vez, en el detalle del tramo abierto por defecto), comprueba que la sesión del test avanza y que la nota cae en su tramo; si no cae, informa: es una decisión de diseño, no un arreglo del test.

- [ ] **Step 3: Recorrido en el navegador**

Con el servidor arrancado, con el agente `qa-verifier` o con un script de Playwright que use el usuario de pruebas de `.env.local`, abre «Mi registro» de un libro con varias sesiones y comprueba:
1. La tira dibuja un tramo por sesión, con huecos entre meses y marcas de notas.
2. Por defecto está abierta la última sesión; tocar otro tramo lo abre; Escape lo cierra.
3. Las tres últimas sesiones llevan fecha absoluta; «Ver las N sesiones, por mes» despliega los meses con el actual abierto.
4. En móvil (375 px) la tira cabe entera y tocar cerca de un tramo fino lo selecciona.
5. Tema claro y oscuro; con movimiento reducido no hay transiciones.
6. La ficha de serie y la de película muestran «Mi registro» sin el panel «Progreso» y con fechas absolutas.

Para el servidor al terminar.

- [ ] **Step 4: Documentación**

Añade al final de `docs/requirements/decisiones.md`:

```markdown
## 2026-11-20 — «Mi registro» como tira de lectura

- En libros, las sesiones se pintan como una **tira del libro**: un tramo por sesión, del ancho de
  lo leído, con las notas como marcas. Su altura no depende de cuántas sesiones haya. Debajo, las
  tres últimas; el resto, en un historial por meses plegado.
- **Una nota está en un solo sitio visible:** el detalle del tramo seleccionado (por defecto, la
  última sesión) o un grupo suelto («Más adelante», «Después de la última sesión», «Otras notas»).
- **Fechas absolutas** en todas las listas de sesiones («9 nov»; con año si no es el actual).
- **Fuera el panel «Progreso»** en los tres tipos: su nota y su página ya estaban en la tarjeta
  del pase. La edición pasa a un chip en la cabecera de «Mi registro».
- La ficha de libro carga hasta 500 sesiones por pase (antes 20) para dibujar la lectura entera.
- Spec: `docs/superpowers/specs/2026-11-11-ficha-linea-de-lectura-design.md`.
```

En `docs/requirements/backlog.md`, marca `[x]` el ítem «"Mi registro" como línea de lectura en libros…» y añade al final de su texto `decisiones del 2026-11-20.`

En `docs/UI-GLOSARIO.md`, en la sección de la ficha (búscala con `git grep -n "Mi registro" -- docs/UI-GLOSARIO.md`), añade las entradas «tira de lectura», «tramo», «Más adelante», «Otras notas» y «Después de la última sesión» con el formato de sus vecinas.

En `docs/architecture/graph.json`, en el nodo `r-ficha`, añade a `gotchas`: `"En libros, «Mi registro» lo compone ReadingLine (servidor) con buildReadingStrip; series y películas siguen con LogPanel. getSessions lleva limit 500 solo en libros."`. Comprueba que el JSON sigue siendo válido: `node -e "JSON.parse(require('fs').readFileSync('docs/architecture/graph.json','utf8'))"`.

- [ ] **Step 5: Commit**

```bash
git add e2e/pase-hub.spec.ts docs/requirements/decisiones.md docs/requirements/backlog.md docs/UI-GLOSARIO.md docs/architecture/graph.json
git commit -m "test(registro): e2e de la tira y documentación"
```
