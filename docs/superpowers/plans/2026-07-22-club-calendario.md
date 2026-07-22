# Calendario de club — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar en una sola forma (`CalendarMark`) las tres fuentes de fecha de un club y exponerlas en una vista `/club/[slug]/calendario` y en una tira «Próximo» del feed.

**Architecture:** Dos consultas cargan TODAS las marcas del club una sola vez en el server component; un componente cliente pinta el mes visible y navega en memoria, sincronizando la URL con `window.history.pushState` (sin re-ejecutar el servidor). Toda la lógica de derivación y de rejilla vive en funciones puras testeables con Vitest.

**Tech Stack:** Next.js 16.2.10 (App Router, RSC), TypeScript, Tailwind v4 con tokens CSS, next-intl (locale único `messages/es.json`), Supabase/Postgres con RLS, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-22-club-calendario-design.md`
**Rama:** `feat/club-calendario`, sale de `feat/club-eventos` (PR #146, sin mergear). NO rebasar sobre `main`.

## Global Constraints

- **No hay migración.** Esta feature no toca el esquema. `due_on` y el kind `evento` ya existen. No se edita `docs/requirements/data-model.md`.
- **Fechas de Postgres: nunca `new Date(cadenaISO)`.** Un `date` no lleva zona; pasarlo por `Date` lo interpreta como UTC y puede retroceder un día. Para formatear se usa `format-date.ts`; para comparar, comparación de cadenas ISO (lexicográfico == cronológico).
- **Aritmética de calendario: reutilizar `@/lib/stats/dates`.** `daysInMonth(month)`, `shiftMonth(month, delta)`, `todayISO()`, `toISODate(date)` YA EXISTEN. Construir `Date` desde **números** (`new Date(y, m - 1, d)`) es seguro y es la convención del repo. **No escribir helpers nuevos de mes ni de «hoy».**
- **`href` es `null` siempre que `activityKind === "evento"`, sea cual sea el `markKind`.** Un evento no tiene ficha; cualquier enlace a `/actividad/{id}` para un evento es un 404. Este fallo ya apareció tres veces en la rama anterior. **Los consumidores deciden mirando `href`, nunca el kind** — un hito de una actividad evento también llega sin enlace.
- **Un `evento` ignora SIEMPRE su `ends_on`**, aunque tenga valor.
- **`past` es estricto:** una marca de HOY no es pasado (`date < today`).
- **Estados que entran al calendario:** `active` y `finished`. Fuera `proposed` y `archived`.
- **Semana que empieza en LUNES.**
- **Tailwind v4:** clases enteras y literales, nunca construidas por concatenación.
- **i18n:** toda copy visible pasa por `messages/es.json`. Nada de literales en JSX.
- **Antes de escribir código de Next**, leer lo relevante en `node_modules/next/dist/docs/`.

---

## Estructura de ficheros

**Se crean:**

| Fichero | Responsabilidad |
|---|---|
| `src/lib/clubs/activities/calendar-marks.ts` | Puras: tipos, derivación de marcas, rejilla del mes, agenda, parseo del parámetro `mes` |
| `src/lib/clubs/activities/calendar-marks.test.ts` | Vitest de todo lo anterior |
| `src/lib/clubs/activities/calendar.ts` | Acceso a datos: `getClubCalendarMarks(clubId, clubSlug)` |
| `src/components/clubs/calendar/mark-accent.ts` | `MARK_ACCENT` por clase de marca |
| `src/components/clubs/calendar/month-grid.tsx` | Rejilla presentacional del mes |
| `src/components/clubs/calendar/agenda-list.tsx` | Lista presentacional de la agenda |
| `src/components/clubs/calendar/club-calendar.tsx` | Componente cliente: estado del mes, navegación, «+ Evento» |
| `src/app/club/[slug]/calendario/page.tsx` | Ruta, gate de miembro, carga de marcas |
| `e2e/club-calendario.spec.ts` | e2e |

**Se modifican:**

| Fichero | Cambio |
|---|---|
| `src/lib/clubs/activities/format-date.ts` | Añadir `MONTHS_ES_LONG` y `formatMonthYear` |
| `src/components/clubs/club-shell.tsx:78-191` | Ranura «Calendario» en `ClubSidebar` |
| `src/components/clubs/club-summary.tsx` | Fusionar dos secciones en «Próximo» |
| `src/app/club/[slug]/page.tsx:11,177-199` | Cambiar `upcoming.ts` por `calendar.ts` |
| `messages/es.json` | Claves nuevas |
| `docs/requirements/backlog.md`, `docs/requirements/decisiones.md` | Cierre documental |

**Se borra:** `src/lib/clubs/activities/upcoming.ts` (Task 6, tras verificar que no quedan consumidores).

---

### Task 1: Funciones puras del calendario

**Files:**
- Create: `src/lib/clubs/activities/calendar-marks.ts`
- Test: `src/lib/clubs/activities/calendar-marks.test.ts`
- Modify: `src/lib/clubs/activities/format-date.ts`

**Interfaces:**
- Consumes: `ActivityKind` de `./core`; `daysInMonth`, `shiftMonth` de `@/lib/stats/dates`.
- Produces: los tipos `CalendarMarkKind`, `CalendarMark`, `CalendarActivityRow`, `CalendarCheckpointRow`, `MonthCell`; y las funciones `buildCalendarMarks`, `monthGrid`, `marksByDate`, `agendaForMonth`, `parseMonthParam`. `formatMonthYear` en `format-date.ts`. **Todas las tareas siguientes dependen de estos nombres exactos.**

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/clubs/activities/calendar-marks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildCalendarMarks,
  monthGrid,
  marksByDate,
  agendaForMonth,
  parseMonthParam,
  type CalendarActivityRow,
  type CalendarCheckpointRow,
} from "./calendar-marks";

const SLUG = "mi-club";
const HOY = "2026-07-22";

function actividad(over: Partial<CalendarActivityRow> = {}): CalendarActivityRow {
  return {
    id: "a1",
    kind: "buddy_read",
    title: "Fundación",
    status: "active",
    startsOn: null,
    endsOn: null,
    ...over,
  };
}

describe("buildCalendarMarks", () => {
  it("un evento produce UNA marca y nunca enlaza", () => {
    const marks = buildCalendarMarks(
      [actividad({ kind: "evento", title: "Café literario", startsOn: "2026-07-04" })],
      [],
      HOY,
      SLUG,
    );
    expect(marks).toHaveLength(1);
    expect(marks[0].markKind).toBe("evento");
    expect(marks[0].href).toBeNull();
    expect(marks[0].title).toBe("Café literario");
  });

  it("un evento IGNORA su ends_on aunque tenga valor", () => {
    const marks = buildCalendarMarks(
      [actividad({ kind: "evento", startsOn: "2026-07-04", endsOn: "2026-07-09" })],
      [],
      HOY,
      SLUG,
    );
    expect(marks).toHaveLength(1);
    expect(marks.map((m) => m.markKind)).toEqual(["evento"]);
  });

  it("una actividad normal con ambas fechas produce inicio y cierre, ambas enlazadas", () => {
    const marks = buildCalendarMarks(
      [actividad({ id: "a9", startsOn: "2026-07-20", endsOn: "2026-07-31" })],
      [],
      HOY,
      SLUG,
    );
    expect(marks.map((m) => m.markKind)).toEqual(["inicio", "cierre"]);
    expect(marks.every((m) => m.href === `/club/${SLUG}/actividad/a9`)).toBe(true);
  });

  it("proposed y archived no entran; finished sí", () => {
    const rows = [
      actividad({ id: "p", status: "proposed", startsOn: "2026-07-05" }),
      actividad({ id: "x", status: "archived", startsOn: "2026-07-06" }),
      actividad({ id: "f", status: "finished", startsOn: "2026-07-07" }),
    ];
    const marks = buildCalendarMarks(rows, [], HOY, SLUG);
    expect(marks.map((m) => m.activityId)).toEqual(["f"]);
  });

  it("past es estricto: hoy NO es pasado", () => {
    const marks = buildCalendarMarks(
      [
        actividad({ id: "hoy", kind: "evento", startsOn: HOY }),
        actividad({ id: "ayer", kind: "evento", startsOn: "2026-07-21" }),
      ],
      [],
      HOY,
      SLUG,
    );
    const byId = Object.fromEntries(marks.map((m) => [m.activityId, m.past]));
    expect(byId.hoy).toBe(false);
    expect(byId.ayer).toBe(true);
  });

  it("un hito toma el label como título y el título de la actividad como detalle", () => {
    const checkpoint: CalendarCheckpointRow = {
      id: "c1",
      label: "Hito 4",
      dueOn: "2026-07-18",
      activityId: "a1",
      activityTitle: "Fundación",
      activityKind: "buddy_read",
      activityStatus: "active",
    };
    const marks = buildCalendarMarks([], [checkpoint], HOY, SLUG);
    expect(marks).toHaveLength(1);
    expect(marks[0].markKind).toBe("hito");
    expect(marks[0].title).toBe("Hito 4");
    expect(marks[0].detail).toBe("Fundación");
    expect(marks[0].href).toBe(`/club/${SLUG}/actividad/a1`);
  });

  it("un hito de una actividad proposed no entra", () => {
    const checkpoint: CalendarCheckpointRow = {
      id: "c1",
      label: "Hito 1",
      dueOn: "2026-07-18",
      activityId: "a1",
      activityTitle: "Fundación",
      activityKind: "buddy_read",
      activityStatus: "proposed",
    };
    expect(buildCalendarMarks([], [checkpoint], HOY, SLUG)).toHaveLength(0);
  });

  it("ordena por fecha ascendente", () => {
    const marks = buildCalendarMarks(
      [
        actividad({ id: "b", kind: "evento", startsOn: "2026-07-26" }),
        actividad({ id: "a", kind: "evento", startsOn: "2026-07-04" }),
      ],
      [],
      HOY,
      SLUG,
    );
    expect(marks.map((m) => m.date)).toEqual(["2026-07-04", "2026-07-26"]);
  });
});

describe("monthGrid", () => {
  it("rellena semanas completas empezando en lunes", () => {
    // 1 jul 2026 es MIÉRCOLES -> dos celdas de relleno delante (lun 29, mar 30).
    const cells = monthGrid("2026-07");
    expect(cells.length % 7).toBe(0);
    expect(cells[0]).toEqual({ date: "2026-06-29", day: 29, outside: true });
    expect(cells[1]).toEqual({ date: "2026-06-30", day: 30, outside: true });
    expect(cells[2]).toEqual({ date: "2026-07-01", day: 1, outside: false });
  });

  it("un mes que empieza en DOMINGO lleva seis celdas de relleno delante", () => {
    // 1 nov 2026 es domingo: el peor caso con semana que empieza en lunes.
    const cells = monthGrid("2026-11");
    expect(cells.slice(0, 6).every((c) => c.outside)).toBe(true);
    expect(cells[6]).toEqual({ date: "2026-11-01", day: 1, outside: false });
  });

  it("febrero bisiesto tiene 29 días propios", () => {
    const propios = monthGrid("2028-02").filter((c) => !c.outside);
    expect(propios).toHaveLength(29);
    expect(propios[28].date).toBe("2028-02-29");
  });

  it("febrero no bisiesto tiene 28", () => {
    expect(monthGrid("2026-02").filter((c) => !c.outside)).toHaveLength(28);
  });
});

describe("agendaForMonth", () => {
  const marks = buildCalendarMarks(
    [
      actividad({ id: "e1", kind: "evento", startsOn: "2026-07-04" }),
      actividad({ id: "e2", kind: "evento", startsOn: "2026-07-26" }),
      actividad({ id: "e3", kind: "evento", startsOn: "2026-08-03" }),
    ],
    [],
    HOY,
    SLUG,
  );

  it("en el mes actual empieza en hoy", () => {
    expect(agendaForMonth(marks, "2026-07", HOY).map((m) => m.date)).toEqual([
      "2026-07-26",
    ]);
  });

  it("en otro mes lista todo el mes", () => {
    expect(agendaForMonth(marks, "2026-08", HOY).map((m) => m.date)).toEqual([
      "2026-08-03",
    ]);
  });

  it("en un mes pasado lista todo, incluido lo anterior a hoy", () => {
    expect(agendaForMonth(marks, "2026-07", "2026-09-01").map((m) => m.date)).toEqual([
      "2026-07-04",
      "2026-07-26",
    ]);
  });
});

describe("marksByDate", () => {
  it("agrupa varias marcas del mismo día", () => {
    const marks = buildCalendarMarks(
      [
        actividad({ id: "a", kind: "evento", startsOn: "2026-07-04" }),
        actividad({ id: "b", kind: "evento", startsOn: "2026-07-04" }),
      ],
      [],
      HOY,
      SLUG,
    );
    expect(marksByDate(marks).get("2026-07-04")).toHaveLength(2);
  });
});

describe("parseMonthParam", () => {
  it("acepta un mes válido", () => {
    expect(parseMonthParam("2026-10", HOY)).toBe("2026-10");
  });
  it("cae al mes de hoy si falta o es basura", () => {
    expect(parseMonthParam(null, HOY)).toBe("2026-07");
    expect(parseMonthParam("no-es-un-mes", HOY)).toBe("2026-07");
    expect(parseMonthParam("2026-13", HOY)).toBe("2026-07");
    expect(parseMonthParam("2026-00", HOY)).toBe("2026-07");
  });
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `npx vitest run src/lib/clubs/activities/calendar-marks.test.ts`
Expected: FAIL — no se resuelve el módulo `./calendar-marks`.

- [ ] **Step 3: Implementar `calendar-marks.ts`**

Crear `src/lib/clubs/activities/calendar-marks.ts`:

```ts
import { daysInMonth, shiftMonth } from "@/lib/stats/dates";
import type { ActivityKind } from "./core";

// Una sola forma para las TRES fuentes de fecha de un club: el due_on de los
// hitos, el starts_on de los eventos y la ventana starts_on/ends_on de las
// actividades. Antes cada superficie las cruzaba a mano con tres tipos
// distintos; upcoming.ts:70 dejó escrito que unificarlas era el trabajo del
// calendario.
export type CalendarMarkKind = "evento" | "hito" | "inicio" | "cierre";

export type CalendarMark = {
  /** ISO YYYY-MM-DD. Nunca un Date: un `date` de Postgres no lleva zona. */
  date: string;
  markKind: CalendarMarkKind;
  title: string;
  detail: string | null;
  activityId: string;
  activityKind: ActivityKind;
  /** null EXACTAMENTE cuando markKind === "evento": no tiene ficha propia. */
  href: string | null;
  past: boolean;
};

export type CalendarActivityRow = {
  id: string;
  kind: ActivityKind;
  title: string;
  status: string;
  startsOn: string | null;
  endsOn: string | null;
};

export type CalendarCheckpointRow = {
  id: string;
  label: string;
  dueOn: string;
  activityId: string;
  activityTitle: string;
  activityKind: ActivityKind;
  activityStatus: string;
};

// Una propuesta que nadie aprobó no es un compromiso del club, y una archivada
// se retiró a propósito. `finished` SÍ entra: un calendario que borra el pasado
// deja de ser un calendario.
const ESTADOS_VISIBLES = new Set(["active", "finished"]);

// Orden de desempate cuando dos marcas caen el mismo día. Solo para que la
// pantalla (y los tests) sean deterministas.
const ORDEN_MARCA: Record<CalendarMarkKind, number> = {
  inicio: 0,
  hito: 1,
  evento: 2,
  cierre: 3,
};

export function buildCalendarMarks(
  activities: CalendarActivityRow[],
  checkpoints: CalendarCheckpointRow[],
  today: string,
  clubSlug: string,
): CalendarMark[] {
  const marks: CalendarMark[] = [];

  for (const activity of activities) {
    if (!ESTADOS_VISIBLES.has(activity.status)) continue;

    // Un evento nunca enlaza: no tiene página propia y el <Link> daría 404.
    if (activity.kind === "evento") {
      if (activity.startsOn) {
        marks.push({
          date: activity.startsOn,
          markKind: "evento",
          title: activity.title,
          detail: null,
          activityId: activity.id,
          activityKind: activity.kind,
          href: null,
          past: activity.startsOn < today,
        });
      }
      // Su ends_on se ignora SIEMPRE: el kind no lo usa.
      continue;
    }

    const href = `/club/${clubSlug}/actividad/${activity.id}`;

    if (activity.startsOn) {
      marks.push({
        date: activity.startsOn,
        markKind: "inicio",
        title: activity.title,
        detail: null,
        activityId: activity.id,
        activityKind: activity.kind,
        href,
        past: activity.startsOn < today,
      });
    }
    if (activity.endsOn) {
      marks.push({
        date: activity.endsOn,
        markKind: "cierre",
        title: activity.title,
        detail: null,
        activityId: activity.id,
        activityKind: activity.kind,
        href,
        past: activity.endsOn < today,
      });
    }
  }

  for (const checkpoint of checkpoints) {
    if (!ESTADOS_VISIBLES.has(checkpoint.activityStatus)) continue;
    marks.push({
      date: checkpoint.dueOn,
      markKind: "hito",
      title: checkpoint.label,
      detail: checkpoint.activityTitle,
      activityId: checkpoint.activityId,
      activityKind: checkpoint.activityKind,
      href: `/club/${clubSlug}/actividad/${checkpoint.activityId}`,
      past: checkpoint.dueOn < today,
    });
  }

  // Cadenas ISO: el orden lexicográfico ES el cronológico.
  return marks.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      ORDEN_MARCA[a.markKind] - ORDEN_MARCA[b.markKind] ||
      a.title.localeCompare(b.title),
  );
}

export type MonthCell = {
  date: string;
  day: number;
  /** Del mes anterior o siguiente: relleno para completar la semana. */
  outside: boolean;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Rejilla de un mes "YYYY-MM", semanas completas empezando en LUNES.
//
// Aquí SÍ hace falta aritmética de calendario, y es correcta: `new Date(y, m-1,
// d)` construye desde NÚMEROS en hora local, que es lo que ya hace
// stats/dates.ts. Lo prohibido es `new Date("2026-07-04")` sobre una cadena
// venida de la BD, que se interpreta como UTC y puede retroceder un día.
export function monthGrid(month: string): MonthCell[] {
  const [year, monthNumber] = month.split("-").map(Number);

  // getDay() da 0=domingo; con semana que empieza en lunes, domingo pasa a 6.
  const firstWeekday = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;

  const cells: MonthCell[] = [];

  const previous = shiftMonth(month, -1);
  const previousTotal = daysInMonth(previous);
  for (let i = firstWeekday; i > 0; i--) {
    const day = previousTotal - i + 1;
    cells.push({ date: `${previous}-${pad(day)}`, day, outside: true });
  }

  const total = daysInMonth(month);
  for (let day = 1; day <= total; day++) {
    cells.push({ date: `${month}-${pad(day)}`, day, outside: false });
  }

  const next = shiftMonth(month, 1);
  let day = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: `${next}-${pad(day)}`, day, outside: true });
    day++;
  }

  return cells;
}

export function marksByDate(marks: CalendarMark[]): Map<string, CalendarMark[]> {
  const byDate = new Map<string, CalendarMark[]>();
  for (const mark of marks) {
    const list = byDate.get(mark.date);
    if (list) list.push(mark);
    else byDate.set(mark.date, [mark]);
  }
  return byDate;
}

// La agenda SIGUE al mes visible. En el mes actual arranca en hoy (así "lo que
// viene" sigue siendo cierto al entrar); en cualquier otro mes lista el mes
// entero, pasado incluido.
export function agendaForMonth(
  marks: CalendarMark[],
  month: string,
  today: string,
): CalendarMark[] {
  const esMesActual = today.startsWith(`${month}-`);
  const desde = esMesActual ? today : `${month}-01`;
  return marks.filter((m) => m.date.startsWith(`${month}-`) && m.date >= desde);
}

// Un ?mes= inválido cae al mes de hoy. Nunca 404: es un parámetro de
// presentación, no un recurso.
export function parseMonthParam(
  raw: string | null | undefined,
  today: string,
): string {
  if (raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
  return today.slice(0, 7);
}
```

- [ ] **Step 4: Añadir `formatMonthYear` a `format-date.ts`**

Añadir al final de `src/lib/clubs/activities/format-date.ts`:

```ts
// Nombres largos para la cabecera del calendario ("Julio 2026"). MONTHS_ES son
// las abreviaturas de las tarjetas de fecha; hacen falta las dos formas.
export const MONTHS_ES_LONG = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// month es "YYYY-MM". Se parte a mano por el mismo motivo que el resto del
// fichero: nada de new Date() sobre una fecha de la BD.
export function formatMonthYear(month: string): string {
  const [year, monthNumber] = month.split("-");
  return `${MONTHS_ES_LONG[Number(monthNumber) - 1] ?? ""} ${year}`;
}
```

- [ ] **Step 5: Ejecutar los tests**

Run: `npx vitest run src/lib/clubs/activities/calendar-marks.test.ts`
Expected: PASS, todos los bloques `describe` en verde.

- [ ] **Step 6: Comprobación de mutación**

Invertir a mano el `continue` que ignora el `ends_on` de un evento (quitarlo para que un evento genere también `cierre`) y volver a correr los tests. Debe fallar el test «un evento IGNORA su ends_on». Restaurar el `continue` después. Si el test NO falla, el test no vale y hay que arreglarlo antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add src/lib/clubs/activities/calendar-marks.ts src/lib/clubs/activities/calendar-marks.test.ts src/lib/clubs/activities/format-date.ts
git commit -m "feat(calendario): forma unificada CalendarMark y rejilla del mes"
```

---

### Task 2: Capa de datos

**Files:**
- Create: `src/lib/clubs/activities/calendar.ts`

**Interfaces:**
- Consumes: `buildCalendarMarks`, `CalendarActivityRow`, `CalendarCheckpointRow`, `CalendarMark` de Task 1; `createClient` de `@/lib/supabase/server`; `todayISO` de `@/lib/stats/dates`.
- Produces: `getClubCalendarMarks(clubId: string, clubSlug: string): Promise<CalendarMark[]>`.

- [ ] **Step 1: Implementar**

Crear `src/lib/clubs/activities/calendar.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/stats/dates";
import type { ActivityKind } from "./core";
import {
  buildCalendarMarks,
  type CalendarActivityRow,
  type CalendarCheckpointRow,
  type CalendarMark,
} from "./calendar-marks";

// TODAS las marcas del club, sin filtro de rango de fechas. El techo real por
// club son las actividades de toda su vida (decenas) más los hitos, que solo
// tiene buddy_read (~5-10 por lectura): ~300 marcas, ~35 KB. A cambio, navegar
// de mes no cuesta ningún viaje al servidor y no hace falta un índice por
// starts_on (la consulta va por club_id, que ya lo tiene).
//
// La RLS de club_activities y club_activity_checkpoints ya limita a miembros
// del club, así que aquí no hay gate adicional.
export async function getClubCalendarMarks(
  clubId: string,
  clubSlug: string,
): Promise<CalendarMark[]> {
  const supabase = await createClient();

  const [actividades, hitos] = await Promise.all([
    supabase
      .from("club_activities")
      .select("id, kind, title, status, starts_on, ends_on")
      .eq("club_id", clubId)
      .in("status", ["active", "finished"]),
    supabase
      .from("club_activity_checkpoints")
      .select(
        "id, label, due_on, activity_id, club_activities!inner(id, title, kind, club_id, status)",
      )
      .eq("club_activities.club_id", clubId)
      .in("club_activities.status", ["active", "finished"])
      .not("due_on", "is", null),
  ]);

  if (actividades.error) throw actividades.error;
  if (hitos.error) throw hitos.error;

  const activityRows: CalendarActivityRow[] = (actividades.data ?? []).map(
    (row) => ({
      id: row.id,
      kind: row.kind as ActivityKind,
      title: row.title,
      status: row.status as string,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
    }),
  );

  const checkpointRows: CalendarCheckpointRow[] = (hitos.data ?? []).map((row) => {
    // El join !inner llega como objeto, pero postgrest-js lo tipa como array
    // cuando no puede probar la cardinalidad. Se normaliza (igual que hacía
    // upcoming.ts:44-48).
    const activity = (
      Array.isArray(row.club_activities)
        ? row.club_activities[0]
        : row.club_activities
    ) as { id: string; title: string; kind: ActivityKind; status: string };

    return {
      id: row.id,
      label: row.label,
      dueOn: row.due_on as string,
      activityId: activity.id,
      activityTitle: activity.title,
      activityKind: activity.kind,
      activityStatus: activity.status,
    };
  });

  // Una sola lectura de "hoy" para toda la construcción: si se leyera dentro
  // del bucle, una petición a medianoche podría marcar unas fechas como
  // pasadas y otras no.
  return buildCalendarMarks(activityRows, checkpointRows, todayISO(), clubSlug);
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores. Si `row.status` o `row.starts_on` dan error de tipo, revisar `src/lib/supabase/database.types.ts` — NO añadir `any`, ajustar el cast como se hace arriba con `activity`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/clubs/activities/calendar.ts
git commit -m "feat(calendario): carga de todas las marcas del club"
```

---

### Task 3: Presentación de una marca (colores, i18n, celda y fila de agenda)

**Files:**
- Create: `src/components/clubs/calendar/mark-accent.ts`
- Create: `src/components/clubs/calendar/month-grid.tsx`
- Create: `src/components/clubs/calendar/agenda-list.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `CalendarMark`, `CalendarMarkKind`, `MonthCell`, `monthGrid`, `marksByDate` de Task 1; `formatDayMonth` de `format-date.ts`.
- Produces: `MARK_ACCENT: Record<CalendarMarkKind, MarkAccent>`; `<MonthGrid month marks today />`; `<AgendaList marks />`. Ambos son componentes **de cliente sin estado** (reciben todo por props) y se importan desde `club-calendar.tsx` en Task 4.

- [ ] **Step 1: Añadir las claves i18n**

En `messages/es.json`, dentro del objeto `"activity"`, añadir:

```json
"calendarTitle": "Calendario",
"calendarPrevMonth": "Mes anterior",
"calendarNextMonth": "Mes siguiente",
"calendarToday": "Hoy",
"calendarAgenda": "Agenda",
"calendarEmptyMonth": "Nada marcado en este mes.",
"calendarMore": "+{count}",
"markKind_evento": "Evento",
"markKind_hito": "Hito",
"markKind_inicio": "Empieza",
"markKind_cierre": "Cierre",
"summaryNext": "Próximo",
"summarySeeCalendar": "Ver calendario ›"
```

Y dentro de `"club"` → `"tabs"`, añadir:

```json
"calendario": "Calendario"
```

- [ ] **Step 2: Crear el mapa de color**

Crear `src/components/clubs/calendar/mark-accent.ts`:

```ts
import type { CalendarMarkKind } from "@/lib/clubs/activities/calendar-marks";

// Color por CLASE DE MARCA, no por kind de actividad. Son ejes distintos: la
// leyenda del calendario habla de evento/hito/inicio/cierre, mientras que
// ACTIVITY_ACCENT colorea por buddy_read/tierlist/... Los tokens salen de los
// que ya existen en el tema, no de los hex del mockup.
//
// Tailwind v4 necesita las clases enteras y literales, nunca concatenadas.
export type MarkAccent = {
  text: string;
  bgSoft: string;
  bar: string;
};

export const MARK_ACCENT: Record<CalendarMarkKind, MarkAccent> = {
  evento: {
    text: "text-type-series",
    bgSoft: "bg-type-series/10",
    bar: "bg-type-series",
  },
  hito: {
    text: "text-accent",
    bgSoft: "bg-accent/10",
    bar: "bg-accent",
  },
  inicio: {
    text: "text-green",
    bgSoft: "bg-green/10",
    bar: "bg-green",
  },
  cierre: {
    text: "text-gold",
    bgSoft: "bg-gold/10",
    bar: "bg-gold",
  },
};
```

- [ ] **Step 3: Crear la rejilla**

Crear `src/components/clubs/calendar/month-grid.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import {
  monthGrid,
  marksByDate,
  type CalendarMark,
} from "@/lib/clubs/activities/calendar-marks";
import { MARK_ACCENT } from "./mark-accent";

const DIAS_CORTOS = ["L", "M", "X", "J", "V", "S", "D"];
const DIAS_LARGOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Tope de chips por celda. Sin esto, un día con cinco hitos rompe la altura de
// la fila y descuadra la semana entera.
const MAX_CHIPS = 3;

export function MonthGrid({
  month,
  marks,
  today,
}: {
  month: string;
  marks: CalendarMark[];
  today: string;
}) {
  const t = useTranslations("activity");
  const cells = monthGrid(month);
  const byDate = marksByDate(marks);

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border bg-surface-muted">
        {DIAS_CORTOS.map((corto, i) => (
          <div
            key={corto}
            className="py-2 text-center font-mono text-[9.5px] tracking-wider text-muted-foreground uppercase"
          >
            <span className="lg:hidden">{corto}</span>
            <span className="hidden lg:inline">{DIAS_LARGOS[i]}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const delDia = byDate.get(cell.date) ?? [];
          const esHoy = cell.date === today;
          return (
            <div
              key={cell.date}
              className={`flex aspect-square min-w-0 flex-col gap-1 border-r border-b border-border p-1.5 last:border-r-0 lg:aspect-auto lg:min-h-[112px] lg:p-2 ${
                cell.outside ? "bg-surface-muted/50" : ""
              }`}
            >
              <span
                className={`self-start rounded-md px-1.5 py-0.5 text-xs leading-none font-semibold ${
                  esHoy
                    ? "bg-accent text-accent-foreground"
                    : cell.outside
                      ? "text-foreground-faint"
                      : "text-foreground"
                }`}
              >
                {cell.day}
              </span>

              {/* Móvil: puntos. Escritorio: chips con el texto. */}
              <div className="flex flex-wrap gap-0.5 lg:hidden">
                {delDia.slice(0, MAX_CHIPS).map((mark, i) => (
                  <span
                    key={`${mark.activityId}-${mark.markKind}-${i}`}
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${MARK_ACCENT[mark.markKind].bar}`}
                  />
                ))}
              </div>

              <div className="hidden min-w-0 flex-col gap-0.5 lg:flex">
                {delDia.slice(0, MAX_CHIPS).map((mark, i) => {
                  const accent = MARK_ACCENT[mark.markKind];
                  return (
                    <span
                      key={`${mark.activityId}-${mark.markKind}-${i}`}
                      title={`${t(`markKind_${mark.markKind}`)} · ${mark.title}`}
                      className={`truncate rounded-md border-l-[3px] px-1.5 py-0.5 text-[11px] leading-tight ${accent.bgSoft} ${accent.text} ${
                        mark.past ? "opacity-50" : ""
                      }`}
                      style={{ borderLeftColor: "currentColor" }}
                    >
                      {mark.title}
                    </span>
                  );
                })}
                {delDia.length > MAX_CHIPS && (
                  <span className="px-1.5 font-mono text-[9.5px] text-muted-foreground">
                    {t("calendarMore", { count: delDia.length - MAX_CHIPS })}
                  </span>
                )}
              </div>

              {/* Lectores de pantalla: el recuento del día, que los puntos y los
                  chips truncados no transmiten. */}
              {delDia.length > 0 && (
                <span className="sr-only">
                  {delDia.map((m) => `${t(`markKind_${m.markKind}`)}: ${m.title}`).join(". ")}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Crear la agenda**

Crear `src/components/clubs/calendar/agenda-list.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CalendarMark } from "@/lib/clubs/activities/calendar-marks";
import { formatDayMonth } from "@/lib/clubs/activities/format-date";
import { MARK_ACCENT } from "./mark-accent";

export function AgendaList({ marks }: { marks: CalendarMark[] }) {
  const t = useTranslations("activity");

  if (marks.length === 0) {
    return (
      <p className="rounded-card border border-border bg-surface p-4 text-sm text-muted-foreground">
        {t("calendarEmptyMonth")}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {marks.map((mark, i) => {
        const { day, month } = formatDayMonth(mark.date);
        const accent = MARK_ACCENT[mark.markKind];

        const inner = (
          <>
            <span aria-hidden className="flex w-10 shrink-0 flex-col items-center leading-none">
              <span className="font-serif text-xl font-semibold text-foreground">{day}</span>
              <span className="mt-0.5 font-mono text-[8.5px] text-muted-foreground uppercase">
                {month}
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col border-l border-border pl-3">
              <span
                className={`mb-1.5 inline-flex w-fit items-center gap-1.5 rounded-chip px-2 py-0.5 font-mono text-[9px] tracking-wide uppercase ${accent.bgSoft} ${accent.text}`}
              >
                <span aria-hidden className={`h-1.5 w-1.5 rounded-[2px] ${accent.bar}`} />
                {t(`markKind_${mark.markKind}`)}
              </span>
              <span className="truncate font-serif text-[14.5px] leading-tight font-semibold text-foreground">
                {mark.title}
              </span>
              {mark.detail && (
                <span className="mt-1 truncate text-[11.5px] text-muted-foreground">
                  {mark.detail}
                </span>
              )}
            </span>
          </>
        );

        const clases = `flex items-start gap-3 rounded-card border border-border bg-surface px-3 py-3 ${
          mark.past ? "opacity-50" : ""
        }`;

        // Un evento NO enlaza: no tiene ficha y el <Link> daría 404. El mismo
        // envoltorio condicional que activity-card.tsx.
        return (
          <li key={`${mark.activityId}-${mark.markKind}-${i}`}>
            {mark.href ? (
              <Link href={mark.href} className={`${clases} hover:opacity-80`}>
                {inner}
              </Link>
            ) : (
              <div className={clases}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubs/calendar/ messages/es.json
git commit -m "feat(calendario): rejilla del mes, agenda y color por clase de marca"
```

---

### Task 4: Componente cliente del calendario

**Files:**
- Create: `src/components/clubs/calendar/club-calendar.tsx`

**Interfaces:**
- Consumes: `MonthGrid` y `AgendaList` de Task 3; `MARK_ACCENT` de Task 3; `agendaForMonth`, `parseMonthParam`, `CalendarMark` de Task 1; `formatMonthYear` de `format-date.ts`; `shiftMonth` de `@/lib/stats/dates`; `EventForm` de `@/components/clubs/propose/event-form`; `Button`/`buttonVariants` de `@/components/ui/button`; `ChevronLeftIcon`, `ChevronRightIcon` de `@/components/ui/icons`.
- Produces: `<ClubCalendar marks today clubId canModerate />`.

**Contexto que el implementador necesita:**

`EventForm` ya existe y sirve tanto para crear como para editar; su discriminador es la prop `activity`. Para CREAR se usa sin ella:

```tsx
<EventForm clubId={clubId} onDone={...} onCancel={...} />
```

- [ ] **Step 1: Leer los docs de Next sobre shallow routing**

Run: `grep -n -A20 "Shallow routing on the client" node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md`
Expected: confirma que `window.history.pushState` se integra con el router y sincroniza con `useSearchParams`.

**Si esta sección NO existe o dice otra cosa en la versión instalada: PARAR y reportar BLOCKED.** No sustituir por `router.push`/`router.replace`: re-ejecutan el server component y anulan la decisión de arquitectura (todas las marcas cargadas de una vez para que navegar de mes sea instantáneo).

- [ ] **Step 2: Implementar**

Crear `src/components/clubs/calendar/club-calendar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { shiftMonth } from "@/lib/stats/dates";
import {
  agendaForMonth,
  parseMonthParam,
  type CalendarMark,
  type CalendarMarkKind,
} from "@/lib/clubs/activities/calendar-marks";
import { formatMonthYear } from "@/lib/clubs/activities/format-date";
import { EventForm } from "@/components/clubs/propose/event-form";
import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { MonthGrid } from "./month-grid";
import { AgendaList } from "./agenda-list";
import { MARK_ACCENT } from "./mark-accent";

const CLASES_LEYENDA: CalendarMarkKind[] = ["evento", "hito", "inicio", "cierre"];

// El mes visible vive en el search param `mes`, y se cambia con
// window.history.pushState -- NO con router.push/replace. El App Router
// integra la History API nativa: la URL cambia y useSearchParams se entera,
// pero el server component NO se vuelve a ejecutar. Eso es lo que hace que la
// flecha sea instantánea: todas las marcas del club ya están en memoria.
export function ClubCalendar({
  marks,
  today,
  clubId,
  canModerate,
}: {
  marks: CalendarMark[];
  today: string;
  clubId: string;
  canModerate: boolean;
}) {
  const t = useTranslations("activity");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [creando, setCreando] = useState(false);

  const month = parseMonthParam(searchParams.get("mes"), today);
  const agenda = agendaForMonth(marks, month, today);

  function irAlMes(destino: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mes", destino);
    window.history.pushState(null, "", `?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-xl font-semibold text-foreground lg:sr-only">
          {t("calendarTitle")}
        </h1>
        {canModerate && !creando && (
          <Button type="button" onClick={() => setCreando(true)}>
            {t("newEvent")}
          </Button>
        )}
      </div>

      {creando && (
        <EventForm
          clubId={clubId}
          onDone={() => {
            setCreando(false);
            // Las marcas son props del server component: hay que releerlas.
            // Es una acción rara (crear un evento), así que el viaje al
            // servidor aquí no compromete la fluidez de las flechas.
            router.refresh();
          }}
          onCancel={() => setCreando(false)}
        />
      )}

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-7">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              aria-label={t("calendarPrevMonth")}
              onClick={() => irAlMes(shiftMonth(month, -1))}
              className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>

            <span
              data-testid="calendar-month"
              className="font-serif text-[22px] font-semibold whitespace-nowrap text-foreground"
            >
              {formatMonthYear(month)}
            </span>

            <button
              type="button"
              aria-label={t("calendarNextMonth")}
              onClick={() => irAlMes(shiftMonth(month, 1))}
              className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => irAlMes(today.slice(0, 7))}
              className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground"
            >
              {t("calendarToday")}
            </button>

            <div className="flex flex-wrap gap-3 lg:ml-auto">
              {CLASES_LEYENDA.map((markKind) => (
                <span
                  key={markKind}
                  className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase"
                >
                  <span
                    aria-hidden
                    className={`h-2 w-2 rounded-full ${MARK_ACCENT[markKind].bar}`}
                  />
                  {t(`markKind_${markKind}`)}
                </span>
              ))}
            </div>
          </div>

          <MonthGrid month={month} marks={marks} today={today} />
        </div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-[96px]">
          <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("calendarAgenda")}
          </h2>
          <AgendaList marks={agenda} />
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar que existen los iconos**

Run: `grep -n "ChevronRightIcon\|ChevronLeftIcon" src/components/ui/icons.tsx`
Expected: ambos exportados. Si `ChevronRightIcon` no existe, añadirlo en `icons.tsx` siguiendo exactamente el patrón de `ChevronLeftIcon` (mismo `viewBox` y props, con el `d` reflejado).

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubs/calendar/club-calendar.tsx src/components/ui/icons.tsx
git commit -m "feat(calendario): navegación de mes sin viaje al servidor"
```

---

### Task 5: La ruta y la entrada en el rail

**Files:**
- Create: `src/app/club/[slug]/calendario/page.tsx`
- Modify: `src/components/clubs/club-shell.tsx:78-114` (`ClubSidebar`)

**Interfaces:**
- Consumes: `getClubCalendarMarks` de Task 2; `ClubCalendar` de Task 4; `getClub` de `@/lib/clubs/clubs`; `ClubShell`, `ClubSidebar`, `ClubMainHeader` de `club-shell.tsx`; `todayISO` de `@/lib/stats/dates`.
- Produces: la ruta `/club/[slug]/calendario`. `ClubSidebar` acepta `active: ClubTab | "miembros" | "calendario"`.

- [ ] **Step 1: Añadir la ranura al rail**

En `src/components/clubs/club-shell.tsx`, cambiar la firma de `ClubSidebar` (línea ~81) para ampliar el tipo de `active`:

```tsx
  active: ClubTab | "miembros" | "calendario";
```

Y en el array `items` (líneas ~100-114), insertar la entrada **entre `actividades` y `miembros`**, en ese orden exacto:

```tsx
    {
      key: "calendario",
      href: `${base}/calendario`,
      label: tt("calendario"),
    },
```

Actualizar también el comentario de las líneas 74-77, que dice «las cuatro entradas (Feed · Actividades · Miembros · Gestión)»:

```tsx
// Sidebar de navegación del club (`.cnav` del frame 10): banner + identidad +
// las entradas (Feed · Actividades · Calendario · Miembros · Gestión) + pie con
// el estado de pertenencia. Es navegación DEL club, distinta de la nav global
// del topbar.
```

En móvil NO se añade pestaña: `ClubTabs` tiene tres entradas y Miembros tampoco está ahí. Se entra por «Ver calendario ›» del feed (Task 6), igual que hoy se entra a Miembros desde la cabecera.

- [ ] **Step 2: Crear la página**

Crear `src/app/club/[slug]/calendario/page.tsx`:

```tsx
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getClub } from "@/lib/clubs/clubs";
import { listClubActivities } from "@/lib/clubs/activities/core";
import { getClubCalendarMarks } from "@/lib/clubs/activities/calendar";
import { todayISO } from "@/lib/stats/dates";
import { ClubShell, ClubSidebar, ClubMainHeader } from "@/components/clubs/club-shell";
import { ClubCalendar } from "@/components/clubs/calendar/club-calendar";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const club = await getClub(slug);
  return { title: club ? `Calendario · ${club.name} — Biblioshare` : "Calendario — Biblioshare" };
}

export default async function ClubCalendarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const club = await getClub(slug);
  // Mismo gate que la vista de actividad: un club privado no filtra sus fechas
  // por URL. `viewerRole` es null para invited/requested, no solo para extraños.
  if (!club || !club.viewerRole) notFound();

  const canModerate =
    club.viewerRole === "moderator" || club.viewerRole === "owner";

  const [marks, activities, tt] = await Promise.all([
    getClubCalendarMarks(club.id, club.slug),
    listClubActivities(club.id),
    getTranslations("club.tabs"),
  ]);
  const pendingProposals = activities.filter((a) => a.status === "proposed").length;

  return (
    <ClubShell
      sidebar={
        <ClubSidebar
          club={club}
          active="calendario"
          canModerate={canModerate}
          pendingProposals={pendingProposals}
        />
      }
      desktopHeader={<ClubMainHeader title={tt("calendario")} />}
    >
      {/* useSearchParams necesita un boundary de Suspense. */}
      <Suspense fallback={null}>
        <ClubCalendar
          marks={marks}
          today={todayISO()}
          clubId={club.id}
          canModerate={canModerate}
        />
      </Suspense>
    </ClubShell>
  );
}
```

- [ ] **Step 3: Verificar que compila y arranca**

Run: `npx tsc --noEmit`
Expected: sin errores. Si `ClubSidebar` da error por el tipo de `active` en `src/app/club/[slug]/page.tsx` o en `miembros/page.tsx`, es que el Step 1 no amplió el tipo — volver a él.

- [ ] **Step 4: Comprobación manual**

Levantar el dev server SOLO si no hay uno corriendo ya:

```bash
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object OwningProcess
```

Si está libre: `npm run dev`. Visitar `http://localhost:3000/club/test-public-club/calendario` y comprobar: la rejilla pinta el mes actual, las flechas cambian el mes y la URL sin recargar, «Hoy» vuelve, y el botón atrás del navegador deshace el cambio de mes.

- [ ] **Step 5: Commit**

```bash
git add src/app/club/[slug]/calendario/page.tsx src/components/clubs/club-shell.tsx
git commit -m "feat(calendario): ruta /club/[slug]/calendario y ranura en el rail"
```

---

### Task 6: La tira «Próximo» del feed y el borrado de `upcoming.ts`

**Files:**
- Modify: `src/components/clubs/club-summary.tsx:1-6,24-43,103-175`
- Modify: `src/app/club/[slug]/page.tsx:11,177-199`
- Delete: `src/lib/clubs/activities/upcoming.ts`

**Interfaces:**
- Consumes: `getClubCalendarMarks` de Task 2; `CalendarMark` de Task 1; `MARK_ACCENT` de Task 3.
- Produces: `ClubSummary` cambia de firma — deja de aceptar `upcoming: UpcomingCheckpoint[]` y `events: UpcomingEvent[]`, y pasa a aceptar `upcoming: CalendarMark[]` (ya recortado por quien la llama).

- [ ] **Step 1: Verificar que no hay otros consumidores**

Run:
```bash
grep -rn "getUpcomingCheckpoints\|getUpcomingEvents\|UpcomingCheckpoint\|UpcomingEvent" src/ e2e/
```
Expected: solo `src/lib/clubs/activities/upcoming.ts`, `src/components/clubs/club-summary.tsx` y `src/app/club/[slug]/page.tsx`.

**Si aparece cualquier otro fichero: PARAR y reportar.** El plan asume que solo hay tres.

- [ ] **Step 2: Reescribir las dos secciones de fechas como una**

En `src/components/clubs/club-summary.tsx`:

Cambiar los imports (líneas 1-6):

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ClubActivity } from "@/lib/clubs/activities/core";
import type { CalendarMark } from "@/lib/clubs/activities/calendar-marks";
import { ACTIVITY_ACCENT } from "@/lib/clubs/activities/kinds/accent";
import { MARK_ACCENT } from "./calendar/mark-accent";
import { formatDayMonth } from "@/lib/clubs/activities/format-date";
```

Cambiar la firma (líneas 24-34) y la guarda de vacío (línea 43):

```tsx
export async function ClubSummary({
  activities,
  upcoming,
  clubSlug,
}: {
  activities: ClubActivity[];
  /** Las próximas marcas del club, ya recortadas por quien llama. */
  upcoming: CalendarMark[];
  clubSlug: string;
}) {
  const t = await getTranslations("activity");
  const active = activities.filter(
    (a) => a.status === "active" && a.kind !== "evento",
  );

  if (active.length === 0 && upcoming.length === 0) return null;
```

Sustituir los DOS bloques de las líneas 103-175 (`{upcoming.length > 0 && ...}` y `{events.length > 0 && ...}`) por este único bloque:

```tsx
      {upcoming.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="flex items-center justify-between gap-2 font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("summaryNext")}
            <Link
              href={`/club/${clubSlug}/calendario`}
              className="font-mono text-[9.5px] tracking-wide text-accent normal-case hover:opacity-80"
            >
              {t("summarySeeCalendar")}
            </Link>
          </h2>

          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {upcoming.map((mark, i) => {
              const { day, month } = formatDayMonth(mark.date);
              const accent = MARK_ACCENT[mark.markKind];

              const inner = (
                <>
                  <span aria-hidden className="flex shrink-0 flex-col items-center leading-none">
                    <span className="font-serif text-lg font-semibold text-foreground">
                      {day}
                    </span>
                    <span className="font-mono text-[8.5px] text-muted-foreground uppercase">
                      {month}
                    </span>
                  </span>
                  <span className="flex max-w-44 min-w-0 flex-col text-xs leading-tight">
                    <span className="truncate text-foreground">{mark.title}</span>
                    <span className={`truncate ${accent.text}`}>
                      {mark.detail ?? t(`markKind_${mark.markKind}`)}
                    </span>
                  </span>
                </>
              );

              const clases =
                "flex shrink-0 items-center gap-2.5 rounded-[10px] border border-border bg-surface px-3 py-2";

              // Un evento no tiene ficha: enlazarlo daría 404.
              return mark.href ? (
                <Link
                  key={`${mark.activityId}-${mark.markKind}-${i}`}
                  href={mark.href}
                  className={`${clases} hover:opacity-80`}
                >
                  {inner}
                </Link>
              ) : (
                <div key={`${mark.activityId}-${mark.markKind}-${i}`} className={clases}>
                  {inner}
                </div>
              );
            })}
          </div>
        </section>
      )}
```

- [ ] **Step 3: Cambiar la carga en la página del club**

En `src/app/club/[slug]/page.tsx`, sustituir el import de la línea 11:

```tsx
import { getClubCalendarMarks } from "@/lib/clubs/activities/calendar";
```

Y en `ClubFeedSection` (líneas 177-199), cambiar la carga y la llamada:

```tsx
  const [initialPage, marks, viewer, t] = await Promise.all([
    listClubPosts(club.id),
    getClubCalendarMarks(club.id, club.slug),
    getViewerIdentity(),
    getTranslations("club"),
  ]);
  await markClubRead(club.id);

  // La tira del feed lista SOLO hitos y eventos, no inicios ni cierres: justo
  // encima está "Actividades activas" hablando de esas mismas actividades. Las
  // marcas ya vienen ordenadas por fecha ascendente desde buildCalendarMarks.
  const hoy = todayISO();
  const proximas = marks
    .filter(
      (m) => !m.past && m.date >= hoy && (m.markKind === "hito" || m.markKind === "evento"),
    )
    .slice(0, 3);
```

Y en el JSX (líneas 194-199):

```tsx
        <ClubSummary
          activities={activities}
          upcoming={proximas}
          clubSlug={club.slug}
        />
```

Añadir el import de `todayISO` arriba del fichero:

```tsx
import { todayISO } from "@/lib/stats/dates";
```

- [ ] **Step 4: Borrar `upcoming.ts`**

```bash
git rm src/lib/clubs/activities/upcoming.ts
```

- [ ] **Step 5: Verificar que compila y que los tests siguen verdes**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores de tipo, todos los tests en verde. Un error que mencione `upcoming.ts` significa que el Step 1 se saltó un consumidor.

- [ ] **Step 6: Actualizar el e2e existente de eventos**

`e2e/club-evento.spec.ts:118-128` busca la sección «Próximas fechas», que ya no existe. Cambiar ese bloque para que busque «Próximo»:

```ts
    // ...y también en el resumen del club, ahora en la tira unificada
    // "Próximo" (el calendario fundió "Próximos hitos" y "Próximas fechas").
    await page.goto(`/club/${CLUB_SLUG}`);
    const seccionProximo = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Próximo" }) });
    await expect(seccionProximo.getByText(titulo)).toBeVisible({ timeout: 15000 });
    await page.goto(`/club/${CLUB_SLUG}?tab=actividades`);
```

**Ojo:** el evento del test se crea con fecha `2027-03-15` y la tira solo muestra 3 marcas. Si el club de pruebas acumula marcas más próximas, este assert fallará por diseño. Si eso ocurre, **no subir el límite de 3**: cambiar la fecha del test a algo que quepa, o comprobar la marca en `/calendario?mes=2027-03` en vez de en la tira. Reportarlo como concern.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(feed): tira Próximo unificada; muere upcoming.ts"
```

---

### Task 7: e2e del calendario

**Files:**
- Create: `e2e/club-calendario.spec.ts`

**Contexto:** `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` son la cuenta `devtest`, dueña de `test-public-club` (o sea, moderador+). `npm run test:e2e` **reutiliza el dev server que ya haya** — no arrancar otro.

- [ ] **Step 1: Escribir el spec**

Crear `e2e/club-calendario.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CLUB_SLUG = "test-public-club"; // devtest es su dueño (moderador+)

// Un mes lejano y fijo: así el test no depende de cuántas marcas tenga el club
// de pruebas hoy, ni se rompe al cruzar un fin de mes.
const MES = "2027-09";
const FECHA = "2027-09-15";

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

// Un moderador crea un evento DESDE el calendario y lo ve en su celda; y la
// navegación de mes cambia la URL sin recargar, con el botón atrás funcionando.
test("calendario: crea un evento y navega entre meses", async ({ page, request }) => {
  test.setTimeout(90_000);

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  let eventoId: string | null = null;

  try {
    await page.goto(`/club/${CLUB_SLUG}/calendario?mes=${MES}`);

    // Prueba positiva de que el calendario pintó su mes ANTES de afirmar nada
    // más: si no, los asserts siguientes serían trivialmente ciertos.
    await expect(page.getByTestId("calendar-month")).toHaveText("Septiembre 2027");

    const titulo = `e2e cal ${Date.now()}`;
    await page.getByRole("button", { name: /^nuevo evento$/i }).click();
    await page.getByLabel(/^título$/i).fill(titulo);
    await page.getByLabel(/^fecha$/i).fill(FECHA);
    await page.getByRole("button", { name: /^crear evento$/i }).click();

    // Existe en la BD. Se comprueba antes que la pantalla: la UI puede pintar
    // el título desde su propio estado aunque el submit haya fallado.
    let creado: { id: string; starts_on: string } | undefined;
    await expect
      .poll(
        async () => {
          const res = await request.get(
            `${SUPABASE_URL}/rest/v1/club_activities?title=eq.${encodeURIComponent(titulo)}&select=id,starts_on`,
            { headers: adminHeaders() },
          );
          [creado] = await res.json();
          return creado?.id ?? null;
        },
        { timeout: 15000 },
      )
      .not.toBeNull();
    eventoId = creado!.id;
    expect(creado!.starts_on).toBe(FECHA);

    // Y en pantalla: en la agenda del mes, que es donde el título se lee
    // entero (en la celda va truncado).
    await expect(page.getByText(titulo).first()).toBeVisible({ timeout: 15000 });

    // ── Navegación de mes ──
    await page.getByRole("button", { name: /mes siguiente/i }).click();
    await expect(page.getByTestId("calendar-month")).toHaveText("Octubre 2027");
    await expect(page).toHaveURL(/mes=2027-10/);

    // El atrás del navegador deshace el cambio de mes. Es la comprobación que
    // de verdad prueba que se usó pushState y no router.replace.
    await page.goBack();
    await expect(page.getByTestId("calendar-month")).toHaveText("Septiembre 2027");
    await expect(page).toHaveURL(/mes=2027-09/);

    // "Hoy" vuelve al mes actual.
    await page.getByRole("button", { name: /^hoy$/i }).click();
    await expect(page.getByTestId("calendar-month")).not.toHaveText("Septiembre 2027");

    console.log("CALENDARIO OK:", eventoId);
  } finally {
    if (eventoId) {
      // fetch nativo, NO el `request` de Playwright: ese fixture muere con el
      // contexto del navegador, así que un timeout dejaría la fila suelta
      // (ya pasó: 8 filas huérfanas motivaron esta regla).
      await fetch(`${SUPABASE_URL}/rest/v1/club_activities?id=eq.${eventoId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
      console.log("LIMPIEZA OK: evento", eventoId, "borrado");
    }
  }
});

// Un club privado no filtra sus fechas por URL a quien no es miembro.
test("calendario: un no-miembro recibe 404", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  // Control positivo primero: el club del que SÍ es miembro responde 200. Sin
  // esto, un 404 general (ruta mal registrada) pasaría por gate correcto.
  const propio = await page.goto(`/club/${CLUB_SLUG}/calendario`);
  expect(propio?.status()).toBe(200);

  const ajeno = await page.goto("/club/club-que-no-existe-xyz/calendario");
  expect(ajeno?.status()).toBe(404);
});
```

- [ ] **Step 2: Ejecutar**

Run: `npm run test:e2e -- club-calendario`
Expected: los dos tests en verde. Si falla el `goBack`, el Step 2 de la Task 4 no usó `pushState` — es el fallo que este test existe para cazar.

- [ ] **Step 3: Ejecutar la suite de club completa (no regresión)**

Run: `npm run test:e2e -- club`
Expected: verde, incluido `club-evento.spec.ts` con el cambio de la Task 6.

- [ ] **Step 4: Commit**

```bash
git add e2e/club-calendario.spec.ts
git commit -m "test(e2e): calendario de club — creación y navegación de mes"
```

---

### Task 8: Cierre documental

**Files:**
- Modify: `docs/requirements/backlog.md`
- Modify: `docs/requirements/decisiones.md`

- [ ] **Step 1: Marcar el backlog**

Buscar la entrada del calendario de club en `docs/requirements/backlog.md` y marcar su casilla. Si no existe ninguna entrada, añadirla ya marcada en la sección de clubes. **La narrativa de cómo se hizo NO va aquí** — va en la spec, que ya está escrita.

- [ ] **Step 2: Añadir la decisión**

Añadir **al final** de la tabla de `docs/requirements/decisiones.md` (append-only; no reescribir filas anteriores, y la fila va DENTRO de la tabla, antes del blockquote de «Nota histórica»):

```
| 2026-07-22 | Calendario de club | Todas las marcas del club se cargan de una vez y el mes se navega en memoria, con `window.history.pushState` para la URL. | El techo por club es ~300 marcas (~35 KB): acotar por ventana de meses es complejidad pagada por adelantado. `router.push`/`replace` re-ejecutarían el server component y harían cada flecha un viaje al servidor. |
| 2026-07-22 | Calendario de club | Una sola forma `CalendarMark` para las tres fuentes de fecha; `href` es null exactamente para `evento`. | Cada superficie cruzaba las fuentes a mano con tres tipos distintos. El enlace a la ficha de un evento (que no existe) ya causó tres 404 en la rama anterior. |
```

- [ ] **Step 3: Verificar que no se toca el esquema**

Run: `git diff --stat main -- supabase/`
Expected: **sin salida.** Esta feature no lleva migración. Si aparece algo, es un error: pararse y revisar.

- [ ] **Step 4: Abrir las issues de lo aplazado**

Abrir una issue por cada punto de la sección «No se construye» de la spec. Escribirlas para quien las lea en seis meses sin contexto: qué falta, qué se esperaba, y qué acota el problema.

1. **Hora del día en los eventos.** `club_activities.starts_on` es `date`, sin hora, pero los dos mockups pintan «18:30 · Café literario» y «19:00». Añadirla es un cambio de esquema con su propia trampa de zonas horarias (un `timestamptz` no se puede comparar con cadenas ISO como hace todo `calendar-marks.ts`). Acota: el calendario funciona entero sin ella.
2. **Asistencia a eventos.** El mockup pinta «6 asisten». Un evento no tiene participantes por diseño (spec 2026-07-22 de eventos). Decidir si eso cambia.
3. **Portada del ítem en la tarjeta de agenda.** El mockup pinta la carátula de Blade Runner en la fila de evento; un evento no tiene ítems asociados.
4. **Pestaña de calendario en móvil.** Hoy se entra solo por «Ver calendario ›» del feed. Si se observa que la gente no lo encuentra, reconsiderar. Nota: `ClubTabs` tiene tres entradas y Miembros tampoco está ahí, así que esto es coherente, no un olvido.
5. **La discrepancia de los mockups.** El de PC lleva cuatro clases en la leyenda y el de móvil tres (sin «Empieza»). Se implementaron las cuatro en ambos. Si al usarlo el móvil resulta ruidoso, aquí está el porqué de la decisión.

- [ ] **Step 5: Commit**

```bash
git add docs/requirements/backlog.md docs/requirements/decisiones.md
git commit -m "docs: cierra el calendario de club (backlog + decisiones)"
```

---

## Autorrevisión del plan

**Cobertura de la spec:**

| Sección de la spec | Tarea |
|---|---|
| §1 Modelo unificado, reglas de derivación, filtro de estado, `past` | Task 1 |
| §2 `calendar.ts` | Task 2 |
| §2 `calendar-marks.ts` puras | Task 1 |
| §2 Trampa de fechas | Global Constraints + comentarios en Task 1 |
| §3 Ruta y gate | Task 5 |
| §3 Mes en la URL sin viaje al servidor | Task 4 (con paso de verificación de docs y BLOCKED explícito) |
| §3 Layout dos columnas | Task 4 |
| §3 Desbordamiento de celda (3 + «+N») | Task 3 (`MAX_CHIPS`) |
| §3 Colores `MARK_ACCENT` | Task 3 |
| §3 «+ Evento» solo moderador | Task 4 |
| §4 Rail de PC; nada en móvil | Task 5 |
| §5 Tira «Próximo»; borrado de `upcoming.ts` | Task 6 |
| §6 Vitest | Task 1 |
| §6 Playwright | Task 7 |
| §7 Definición de hecho | Task 8 |

**Consistencia de tipos:** `CalendarMark`, `CalendarActivityRow`, `CalendarCheckpointRow`, `MonthCell` se definen en Task 1 y se consumen con esos nombres exactos en las Tasks 2, 3, 4 y 6. `getClubCalendarMarks(clubId, clubSlug)` recibe dos argumentos en su definición (Task 2) y en sus dos llamadas (Tasks 5 y 6). `MARK_ACCENT` se define en Task 3 y se consume en las Tasks 3, 4 y 6.

**Nota sobre una desviación deliberada de la spec:** la spec proponía `Date.UTC` para la aritmética de `monthGrid`. El plan usa `daysInMonth`/`shiftMonth` de `@/lib/stats/dates`, que **ya existen** y construyen `Date` desde números en hora local — igual de seguro y ya es la convención del repo. Duplicar helpers de fecha es exactamente el fallo que la rama anterior cometió con `todayISO()`.
