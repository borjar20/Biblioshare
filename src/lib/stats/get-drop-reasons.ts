import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { parsePosition } from "@/lib/library/position";
import type { ItemFilter } from "./filter";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Los cinco valores del enum `public.pass_dropped_reason`. La traducción a
 * etiqueta legible NO vive aquí: es presentación, y va en `specs.ts`.
 */
export const DROP_REASONS = [
  "no_enganchado",
  "aburrido",
  "no_es_momento",
  "no_esperado",
  "otro",
] as const;

export type DropReason = (typeof DROP_REASONS)[number];

export type DropReasonRow = { dropped_reason: DropReason | null };

export type DropReasons = {
  /** Cuántos abandonos por motivo. Los cinco salen siempre, aunque valgan cero. */
  byReason: Record<DropReason, number>;
  /**
   * Abandonos QUE TRAEN motivo. Es el denominador honesto: la columna nació el
   * 2026-08-14 sin backfill, así que todo lo abandonado antes tiene motivo NULL
   * y es indistinguible de «no contestó».
   */
  withReason: number;
  /** Abandonos totales del periodo, con motivo o sin él. */
  total: number;
};

/** Cuenta por motivo, sin inventar los que faltan. */
export function computeDropReasons(rows: DropReasonRow[]): DropReasons {
  // Los cinco arrancan en cero a propósito: un cero MEDIDO es una respuesta
  // («nunca lo dejo por aburrimiento»), y omitir la categoría lo convertiría en
  // un hueco, que es lo contrario.
  const byReason = Object.fromEntries(DROP_REASONS.map((r) => [r, 0])) as Record<
    DropReason,
    number
  >;
  let withReason = 0;
  for (const row of rows) {
    if (row.dropped_reason === null) continue;
    byReason[row.dropped_reason] += 1;
    withReason += 1;
  }
  return { byReason, withReason, total: rows.length };
}

export type DropPointRow = {
  /** `jsonb` sin validar en BD: puede llegar con la forma de otro tipo de obra. */
  position: unknown;
  /** Páginas de la ficha del catálogo. `null` = no se sabe. */
  totalPages: number | null;
};

export type DropPoint = {
  /** Avance medio al abandonar, en % de la obra. `null` si nada es medible. */
  averagePercent: number | null;
  /**
   * El avance MÁXIMO al que has abandonado alguna vez: pasado ese punto, nunca
   * has dejado un libro. `null` con menos de `MIN_DROPS_FOR_LIMIT` medidos — el
   * máximo de dos muestras no acota nada, y enunciarlo como límite sería
   * presentar ruido como hallazgo.
   */
  pointOfNoReturn: number | null;
  /** Abandonos con avance calculable. */
  measured: number;
  /** Abandonos que no se pudieron medir, y por qué existe el denominador. */
  unmeasurable: number;
};

/**
 * Cuántos abandonos medibles hacen falta para afirmar un punto de no retorno.
 *
 * No es una constante estadística, es una regla de prudencia: es un MÁXIMO, y un
 * máximo sobre dos o tres muestras se mueve entero con el siguiente dato.
 */
const MIN_DROPS_FOR_LIMIT = 5;

/**
 * Dónde abandonas: el % de la obra que llevabas al dejarla.
 *
 * Solo libros: es lo único con una talla comparable en la ficha. Las tres
 * exclusiones se CUENTAN en vez de callarse, porque las tres son frecuentes:
 * un libro sin páginas en ficha, una `position` con la forma de otro tipo de
 * obra (el `jsonb` no se valida en BD, trade-off asumido en §3 del modelo de
 * datos) y una página por encima del final, que pasa cuando la edición leída no
 * es la de la ficha.
 */
export function computeDropPoint(rows: DropPointRow[]): DropPoint {
  const percents: number[] = [];
  let unmeasurable = 0;

  for (const row of rows) {
    const position = parsePosition("book", row.position);
    const page = "page" in position ? position.page : undefined;
    if (page === undefined || !row.totalPages || row.totalPages <= 0 || page > row.totalPages) {
      unmeasurable += 1;
      continue;
    }
    percents.push(Math.round((page / row.totalPages) * 100));
  }

  if (percents.length === 0) {
    return { averagePercent: null, pointOfNoReturn: null, measured: 0, unmeasurable };
  }

  return {
    averagePercent: Math.round(percents.reduce((s, p) => s + p, 0) / percents.length),
    pointOfNoReturn:
      percents.length >= MIN_DROPS_FOR_LIMIT ? Math.max(...percents) : null,
    measured: percents.length,
    unmeasurable,
  };
}

export type DropStats = DropReasons & { point: DropPoint };

/**
 * Los abandonos del usuario, con su motivo y el punto en que los dejó.
 *
 * ⚠️ **Lee de `public.pass_reviews`, NUNCA de `passes`.** `passes` no concede
 * `SELECT` sobre `dropped_reason` a nadie: su RLS de SELECT es de visibilidad de
 * PERFIL (`can_view_profile`), no de dueño, así que un grant ahí filtraría el
 * motivo a cualquiera que pueda ver el perfil. La vista es `SECURITY DEFINER` y
 * enmascara la columna por `d.user_id = auth.uid()`. Un `select("dropped_reason")`
 * sobre `passes` falla con «permission denied», y es correcto que falle.
 *
 * Consecuencia para quien añada consumidores: **este dato solo puede pintarse en
 * `/estadisticas`**, que es privada y del dueño. Nunca en la pestaña pública del
 * perfil.
 *
 * **Sin `use cache`**, jamás: depende de `auth.uid()` (regla #437).
 */
export async function getDropStats(
  supabase: SupabaseServerClient,
  userId: string,
  itemFilter: ItemFilter = "all",
): Promise<DropStats> {
  let query = supabase
    .from("pass_reviews")
    .select("item_type, item_id, dropped_reason, position")
    .eq("user_id", userId)
    .eq("status", "dropped");
  if (itemFilter !== "all") query = query.eq("item_type", itemFilter);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as {
    item_type: ItemType;
    item_id: string;
    dropped_reason: DropReason | null;
    position: unknown;
  }[];

  const reasons = computeDropReasons(rows);

  // El punto de abandono solo tiene sentido en libros: es lo único con una talla
  // comparable en la ficha. Una película abandonada no dice por dónde ibas.
  const books = rows.filter((r) => r.item_type === "book");
  const bookIds = [...new Set(books.map((r) => r.item_id))];

  let pages = new Map<string, number | null>();
  if (bookIds.length > 0) {
    const { data: catalog, error: bookError } = await supabase
      .from("books")
      .select("id, total_pages")
      .in("id", bookIds);
    if (bookError) throw bookError;
    pages = new Map(
      ((catalog ?? []) as { id: string; total_pages: number | null }[]).map((b) => [
        b.id,
        b.total_pages,
      ]),
    );
  }

  const point = computeDropPoint(
    books.map((r) => ({ position: r.position, totalPages: pages.get(r.item_id) ?? null })),
  );

  return { ...reasons, point };
}
