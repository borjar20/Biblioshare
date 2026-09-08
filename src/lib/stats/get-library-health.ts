// «Biblioteca y estados» (§4 del esquema): lo que no dice el reparto de estados
// —cuánto de lo que empiezas acaba terminado, cuánto tiempo lleva esperando la
// pila y si crece o mengua—.
//
// Dos honestidades que condicionan lo que se puede afirmar:
//
//  · La tasa de finalización se calcula sobre lo CERRADO (terminadas +
//    abandonadas), no sobre la biblioteca entera. Meter los pendientes en el
//    denominador da un porcentaje que baja cada vez que añades algo, y eso no
//    mide constancia: mide apetito.
//  · La antigüedad y el balance ordenan por `created_at`, no por `planned_on`.
//    `planned_on` es forward-only (issue #361): el historial importado lo tiene
//    a null, así que ordenar por él escondería justo lo más viejo.

import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import type { ItemFilter } from "./filter";
import { type StatsPeriod, periodBounds } from "./period";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type LibraryHealth = {
  /** Terminadas / (terminadas + abandonadas), en %. `null` si no hay cerradas. */
  completionRate: number | null;
  /** Abandonadas / (terminadas + abandonadas), en %. */
  dropRate: number | null;
  /** Meses que lleva esperando la pila, en mediana. `null` si está vacía. */
  medianWaitMonths: number | null;
  /** Pases que entraron en la pila durante el periodo. */
  added: number;
  /** Obras terminadas durante el periodo. */
  finished: number;
  /** `added` y `finished` desglosados por tipo, para la barra apilada. */
  addedByType: Record<ItemType, number>;
  finishedByType: Record<ItemType, number>;
  /**
   * Pendientes al cierre de cada mes de los últimos 12. Es acumulado real
   * (añadidos menos terminados hasta esa fecha), no el saldo del mes.
   */
  backlog: { month: string; pending: number }[];
};

type Row = {
  item_type: ItemType;
  status: MediaStatus;
  is_active: boolean;
  created_at: string;
  finished_on: string | null;
};

const MONTHS_BACK = 12;

/** Mediana de una lista de números. Sin copia defensiva: la lista es local. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2);
}

function monthsBetween(fromISO: string, now: Date): number {
  const from = new Date(fromISO);
  const m =
    (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  return Math.max(0, m);
}

/** Cálculo puro, para poder probarlo sin BD. */
export function computeLibraryHealth(
  rows: Row[],
  period: StatsPeriod,
  now: Date,
): LibraryHealth {
  const bounds = periodBounds(period, now);
  const within = (iso: string | null) =>
    !bounds || (iso !== null && iso.slice(0, 10) >= bounds.start && iso.slice(0, 10) < bounds.endExclusive);

  let completed = 0;
  let dropped = 0;
  let added = 0;
  let finished = 0;
  const addedByType: Record<ItemType, number> = { book: 0, movie: 0, series: 0 };
  const finishedByType: Record<ItemType, number> = { book: 0, movie: 0, series: 0 };
  const waits: number[] = [];

  for (const row of rows) {
    if (row.status === "completed") completed++;
    if (row.status === "dropped") dropped++;
    if (row.is_active && row.status === "planned") {
      waits.push(monthsBetween(row.created_at, now));
    }
    if (within(row.created_at)) {
      added++;
      addedByType[row.item_type]++;
    }
    if (row.finished_on && within(row.finished_on)) {
      finished++;
      finishedByType[row.item_type]++;
    }
  }

  const closed = completed + dropped;

  // Evolución de la pila: cuántas obras seguían abiertas al cerrar cada uno de
  // los últimos 12 meses (creadas ya, y aún sin terminar).
  //
  // Los pases ABANDONADOS quedan fuera de la serie entera, no dentro. No hay
  // fecha de abandono en el esquema, así que incluirlos los dejaría abiertos
  // para siempre y la curva subiría sola: preferimos no contarlos a contarlos
  // mal.
  const openable = rows.filter((r) => r.status !== "dropped" && !(r.status === "completed" && r.finished_on === null));
  const backlog: LibraryHealth["backlog"] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    // Primer día del mes SIGUIENTE al que se cierra: el corte es exclusivo.
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const cutoff = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
    let open = 0;
    for (const row of openable) {
      if (row.created_at.slice(0, 10) >= cutoff) continue;
      if (row.finished_on && row.finished_on < cutoff) continue;
      open++;
    }
    const closing = new Date(now.getFullYear(), now.getMonth() - i, 1);
    backlog.push({
      month: `${closing.getFullYear()}-${String(closing.getMonth() + 1).padStart(2, "0")}`,
      pending: open,
    });
  }

  return {
    completionRate: closed > 0 ? Math.round((completed / closed) * 100) : null,
    dropRate: closed > 0 ? Math.round((dropped / closed) * 100) : null,
    medianWaitMonths: median(waits),
    added,
    finished,
    addedByType,
    finishedByType,
    backlog,
  };
}

export async function getLibraryHealth(
  supabase: SupabaseServerClient,
  userId: string,
  period: StatsPeriod = "all",
  itemFilter: ItemFilter = "all",
  now = new Date(),
): Promise<LibraryHealth> {
  let query = supabase
    .from("passes")
    .select("item_type, status, is_active, created_at, finished_on")
    .eq("user_id", userId);
  if (itemFilter !== "all") query = query.eq("item_type", itemFilter);

  const { data, error } = await query;
  if (error) throw error;

  return computeLibraryHealth((data ?? []) as Row[], period, now);
}
