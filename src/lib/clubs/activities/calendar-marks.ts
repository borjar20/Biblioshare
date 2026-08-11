import { daysInMonth, shiftMonth } from "@/lib/stats/dates";
import type { ActivityKind } from "./core";
import type { ItemType } from "@/lib/catalog/types";
import type { Json } from "@/lib/supabase/database.types";
import { parseEventConfig, type EventType, type LanzamientoConfig } from "./event-types";

// Una sola forma para las TRES fuentes de fecha de un club: el due_on de los
// hitos, el starts_on de los eventos y la ventana starts_on/ends_on de las
// actividades. Antes cada superficie las cruzaba a mano con tres tipos
// distintos; el antiguo `upcoming.ts`, ya borrado, dejó escrito que unificarlas
// era el trabajo del calendario.
export type CalendarMarkKind = "evento" | "hito" | "inicio" | "cierre";

export type CalendarMark = {
  /** ISO YYYY-MM-DD. Nunca un Date: un `date` de Postgres no lleva zona. */
  date: string;
  markKind: CalendarMarkKind;
  title: string;
  detail: string | null;
  activityId: string;
  activityKind: ActivityKind;
  /**
   * null cuando la marca no tiene ficha a la que enlazar.
   *
   * Desde la spec 2026-08-04 un EVENTO sí enlaza, a su ficha propia
   * (/club/[slug]/evento/[id]) -- no a /actividad/[id], que sigue devolviendo 404
   * para eventos. Lo que se queda sin enlace es un HITO de una actividad evento:
   * un checkpoint no tiene ficha por su cuenta y la de la actividad no le
   * corresponde.
   *
   * Los consumidores comprueban `href`, nunca el kind.
   */
  href: string | null;
  past: boolean;
  /**
   * Solo tiene sentido en marcas de evento: si quien mira lo sigue. Se usa para la
   * marca accesible de la rejilla y el filtro «Sigues» de la agenda (§17, §16).
   * `false` en todo lo demás -- un hito o el inicio de una lectura conjunta no se
   * siguen.
   */
  followedByViewer: boolean;
  /**
   * Los dos SOLO están puestos en una marca de evento (markKind === "evento").
   * En hito/inicio/cierre son null, incluido el hito de una actividad evento:
   * esa marca es del checkpoint, y heredar el tipo del evento la pintaría del
   * color equivocado.
   */
  eventType: EventType | null;
  /** El medio de un lanzamiento, de `config.item.itemType`. null si no es lanzamiento o no tiene ítem. */
  medium: ItemType | null;
};

export type CalendarActivityRow = {
  id: string;
  kind: ActivityKind;
  title: string;
  status: string;
  startsOn: string | null;
  endsOn: string | null;
  eventType: EventType | null;
  config: Json | null;
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
//
// Se exporta porque la leyenda del calendario debe listar las clases en este
// MISMO orden: si fueran dos constantes gemelas en dos ficheros, reordenar una
// dejaría la leyenda contradiciendo a la rejilla sin que nada avisara.
export const ORDEN_MARCA: Record<CalendarMarkKind, number> = {
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
  /** Ids de los eventos que sigue quien mira. Vacío = nadie los sigue o no hay
   *  sesión; la función sigue siendo pura y no consulta nada. */
  followedEventIds: ReadonlySet<string> = new Set(),
): CalendarMark[] {
  const marks: CalendarMark[] = [];

  for (const activity of activities) {
    if (!ESTADOS_VISIBLES.has(activity.status)) continue;

    // Un evento enlaza a su ficha propia, que NO es /actividad/[id].
    if (activity.kind === "evento") {
      if (activity.startsOn) {
        // El medio sale del parser que ya existe, no de un segundo parser aquí:
        // `config` es opaca a la BD y `parseEventConfig` es su única puerta
        // tipada. Dos parsers sobre la misma jsonb son dos verdades.
        const eventType = activity.eventType;
        const config = eventType ? parseEventConfig(eventType, activity.config) : null;
        const medium =
          eventType === "lanzamiento"
            ? ((config as LanzamientoConfig).item?.itemType ?? null)
            : null;

        marks.push({
          date: activity.startsOn,
          markKind: "evento",
          title: activity.title,
          detail: null,
          activityId: activity.id,
          activityKind: activity.kind,
          href: `/club/${clubSlug}/evento/${activity.id}`,
          past: activity.startsOn < today,
          followedByViewer: followedEventIds.has(activity.id),
          eventType,
          medium,
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
        followedByViewer: false,
        eventType: null,
        medium: null,
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
        followedByViewer: false,
        eventType: null,
        medium: null,
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
      // Un evento no tiene ficha propia aunque le llegue un checkpoint: la
      // función es pura y no debe fiarse de que hoy solo buddy_read los use.
      href:
        checkpoint.activityKind === "evento"
          ? null
          : `/club/${clubSlug}/actividad/${checkpoint.activityId}`,
      past: checkpoint.dueOn < today,
      followedByViewer: false,
      eventType: null,
      medium: null,
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

// La tira "Próximo" del feed: solo hitos y eventos (los inicios/cierre de
// actividad ya se ven en "Actividades activas", justo encima), sin lo pasado,
// como mucho `limite`. Depende de que `marks` llegue YA ordenada por fecha
// ascendente -- lo hace `buildCalendarMarks` (está testeado) -- así que aquí
// NO se vuelve a ordenar.
export function proximasMarcas(
  marks: CalendarMark[],
  today: string,
  limite: number,
): CalendarMark[] {
  return marks
    .filter(
      (m) =>
        (m.markKind === "hito" || m.markKind === "evento") && m.date >= today,
    )
    .slice(0, limite);
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
  if (raw && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
  return today.slice(0, 7);
}
