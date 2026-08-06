import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { Position } from "@/lib/library/position";
import { findOrCreateCatalogItem } from "@/lib/catalog/find-or-create";
import { catalogIdForMovieCandidate } from "./match-row";
import type {
  ImportCandidate,
  ImportDiaryDate,
  ImportRow,
  ImportRowResult,
} from "./types";
import { matchImportRow } from "./match-row";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const TABLE_BY_TYPE = {
  book: "books",
  movie: "movies",
  series: "series",
} as const;

type ActivePassResult =
  | { passId: string; isNew: boolean; historicalDate: ImportDiaryDate | null }
  | { error: string };

// El CSV entero se importa como pases (§Tarea 9, hub): sin library_entries.
// Cada fila produce el pase ACTIVO (el estado/nota que refleja el shelf de
// origen) más un pase histórico CERRADO por cada fecha de relectura del CSV
// (diaryDates) que no sea la que ya representa el activo.
//
// Si el estado es completed/dropped y el CSV trae fechas, la más reciente ES
// el pase activo (mismo criterio que 20260716_pass_hub_a_columns.sql: el
// activo de una obra terminada es su último pase cerrado) — no tendría
// sentido un pase activo "completado hoy" Y un histórico "completado el
// {fecha real}" para la MISMA lectura. Si el estado es planned/in_progress,
// el activo es un pase aparte y abierto (o planificado, sin fechas): las
// fechas del CSV son relecturas PASADAS, no la lectura en curso.
function mostRecentDate(dates: ImportDiaryDate[]): ImportDiaryDate | null {
  if (dates.length === 0) return null;
  return [...dates].sort((a, b) => a.finishedOn.localeCompare(b.finishedOn)).at(-1)!;
}

// Same idiom as add-existing-item.ts/buscar/actions.ts: a unique-violation on
// insert means the row is already in the user's library (ya tiene pase
// activo para esta obra), no un error real — se busca su id para que
// reimportar el mismo fichero sea idempotente.
async function ensureActivePass(
  supabase: SupabaseServerClient,
  userId: string,
  itemType: ItemType,
  itemId: string,
  row: ImportRow
): Promise<ActivePassResult> {
  const position: Position = row.bookFormat ? { format: row.bookFormat } : {};
  const historical =
    (row.status === "completed" || row.status === "dropped")
      ? mostRecentDate(row.diaryDates)
      : null;

  const { data: inserted, error } = await supabase
    .from("passes")
    .insert({
      user_id: userId,
      item_type: itemType,
      item_id: itemId,
      status: row.status,
      is_active: true,
      position,
      rating: row.rating,
      started_on: historical?.startedOn ?? null,
      finished_on: historical?.finishedOn ?? null,
      // Mismo valor por defecto que abrir un pase a mano (Hallazgo 3): sin
      // esto, el default de columna (false) dejaba el pase importado fuera
      // del feed de quien te sigue.
      is_public: true,
    })
    .select("id")
    .single();

  if (!error) return { passId: inserted.id, isNew: true, historicalDate: historical };

  if (error.code === "23505") {
    const { data: existing } = await supabase
      .from("passes")
      .select("id")
      .eq("user_id", userId)
      .eq("item_type", itemType)
      .eq("item_id", itemId)
      .eq("is_active", true)
      .single();
    if (existing) return { passId: existing.id, isNew: false, historicalDate: historical };
  }

  return { error: error.message };
}

// Un pase CERRADO por cada fecha del CSV que no sea ya el pase activo (una
// relectura pasada). No hay restricción única en BD que lo impida por sí sola
// para pases del hub (library_entry_id nulo no participa en
// diary_entries_one_pass_per_day, que es por library_entry_id) — se
// comprueba a mano para que reimportar el mismo fichero no duplique historial.
//
// created_at se backdatea a la fecha real del pase (Hallazgo Tarea 9,
// revisión): sin esto, TODOS los pases históricos de una importación nacen
// con created_at ≈ ahora (default de columna), y feed.ts's addedResult (el
// query "añadió X") no filtra por is_active — cada pase es su propio evento
// "added" a propósito, para que las relecturas orgánicas aparezcan. Sin
// backdate, importar un libro con 4 relecturas dispara 4 eventos "añadió"
// casi simultáneos a quien te sigue, todos con fecha de HOY, aunque las
// lecturas reales sean de hace años — se comprobó que addedResult ordena y
// pagina por created_at (ver feed.ts líneas ~153-160), así que un created_at
// real y antiguo cae fuera del feed reciente sin tocar esa query. finishedOn
// nunca es null en ImportDiaryDate, así que siempre hay fecha real que usar.
function historicalCreatedAt(date: ImportDiaryDate): string {
  return date.finishedOn;
}

async function addHistoricalPasses(
  supabase: SupabaseServerClient,
  userId: string,
  itemType: ItemType,
  itemId: string,
  row: ImportRow,
  skip: ImportDiaryDate | null
) {
  for (const date of row.diaryDates) {
    if (skip && date.finishedOn === skip.finishedOn) continue;

    const { data: existing } = await supabase
      .from("passes")
      .select("id")
      .eq("user_id", userId)
      .eq("item_type", itemType)
      .eq("item_id", itemId)
      .eq("finished_on", date.finishedOn)
      .maybeSingle();
    if (existing) continue;

    await supabase.from("passes").insert({
      user_id: userId,
      item_type: itemType,
      item_id: itemId,
      status: "completed",
      is_active: false,
      position: {},
      started_on: date.startedOn,
      finished_on: date.finishedOn,
      rating: row.rating,
      is_public: true,
      created_at: historicalCreatedAt(date),
    });
  }
}

async function commitPasses(
  supabase: SupabaseServerClient,
  userId: string,
  itemType: ItemType,
  itemId: string,
  row: ImportRow
): Promise<ImportRowResult> {
  const activeResult = await ensureActivePass(supabase, userId, itemType, itemId, row);
  if ("error" in activeResult) {
    return {
      rowNumber: row.rowNumber,
      title: row.title,
      outcome: "error",
      errorMessage: activeResult.error,
    };
  }

  // El `skip` solo es legítimo cuando el pase activo se acaba de crear CON esa
  // fecha: entonces ya la representa y duplicarla como histórico sobraría.
  //
  // Si el pase activo YA existía (isNew=false, reimportar sobre una biblioteca
  // con historial), no se escribió nada para esa fecha, así que saltarla la
  // perdía en silencio — el visionado nuevo de un reimport desaparecía. En ese
  // caso pasan todas por el camino histórico, que ya es idempotente: comprueba
  // si hay un pase con ese finished_on antes de insertar.
  const skip = activeResult.isNew ? activeResult.historicalDate : null;
  await addHistoricalPasses(supabase, userId, itemType, itemId, row, skip);

  return {
    rowNumber: row.rowNumber,
    title: row.title,
    outcome: activeResult.isNew ? "imported" : "duplicate",
    unknownStatus: row.unknownStatusLabel ?? undefined,
  };
}

export async function commitImportRow(
  supabase: SupabaseServerClient,
  userId: string,
  itemType: ItemType,
  row: ImportRow
): Promise<ImportRowResult> {
  try {
    const match = await matchImportRow(supabase, itemType, row);
    if (match.kind === "unmatched") {
      return { rowNumber: row.rowNumber, title: row.title, outcome: "unmatched" };
    }
    // No se escribe NADA todavía: la fila espera a que el usuario elija cuál de
    // las obras es en la pantalla de triaje (resolveAmbiguousImportRow).
    if (match.kind === "ambiguous") {
      return {
        rowNumber: row.rowNumber,
        title: row.title,
        outcome: "ambiguous",
        candidates: match.candidates,
      };
    }

    return await commitPasses(supabase, userId, itemType, match.catalogId, row);
  } catch (err) {
    return {
      rowNumber: row.rowNumber,
      title: row.title,
      outcome: "error",
      errorMessage: err instanceof Error ? err.message : "unknown error",
    };
  }
}

// El usuario ya desempató: se importa la fila contra la obra que eligió. El
// candidato puede venir del catálogo local (trae catalogId) o directo de TMDB
// (hay que darle de alta), igual que en `/buscar`. Las películas pasan por
// catalogIdForMovieCandidate para no cachear en inglés lo que el matcher
// tampoco cachea en inglés (ver su comentario).
// Da de alta (o localiza) el ítem de catálogo de un candidato de TMDB, sin
// crear pases: las películas pasan por catalogIdForMovieCandidate (no cachear en
// inglés), el resto por su catalogId local o findOrCreateCatalogItem. Extraído
// para reusarlo al resolver una fila de la cola de revisión con un candidato
// (issue #390), donde el pase se crea a nombre del DUEÑO, no del que resuelve.
export async function catalogIdForCandidate(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  candidate: ImportCandidate,
  userId: string
): Promise<string> {
  return itemType === "movie"
    ? await catalogIdForMovieCandidate(supabase, candidate, userId)
    : (candidate.catalogId ??
        (await findOrCreateCatalogItem(supabase, candidate, userId)));
}

export async function commitImportRowWithCandidate(
  supabase: SupabaseServerClient,
  userId: string,
  itemType: ItemType,
  row: ImportRow,
  candidate: ImportCandidate
): Promise<ImportRowResult> {
  try {
    const catalogId = await catalogIdForCandidate(supabase, itemType, candidate, userId);
    return await commitPasses(supabase, userId, itemType, catalogId, row);
  } catch (err) {
    return {
      rowNumber: row.rowNumber,
      title: row.title,
      outcome: "error",
      errorMessage: err instanceof Error ? err.message : "unknown error",
    };
  }
}

// Used by the "add manually" affordance on unmatched rows — same insert
// shape as src/app/buscar/manual/actions.ts's addManualItem, just invoked
// inline instead of through a page redirect, and reusing this module's pass
// commit logic.
export async function commitManualImportRow(
  supabase: SupabaseServerClient,
  userId: string,
  itemType: ItemType,
  row: ImportRow,
  overrides: { title: string; author: string | null; year: number | null }
): Promise<ImportRowResult> {
  const table = TABLE_BY_TYPE[itemType];
  const payload =
    itemType === "book"
      ? {
          title: overrides.title,
          author: overrides.author,
          published_year: overrides.year,
          publisher: row.publisher,
          total_pages: row.pageCount,
          isbn: row.isbn,
        }
      : itemType === "movie"
        ? { title: overrides.title, director: overrides.author, release_year: overrides.year }
        : { title: overrides.title, creator: overrides.author, release_year: overrides.year };

  const { data: inserted, error } = await supabase
    .from(table)
    .insert(payload as never)
    .select("id")
    .single();

  if (error) {
    return {
      rowNumber: row.rowNumber,
      title: row.title,
      outcome: "error",
      errorMessage: error.message,
    };
  }

  return await commitPasses(supabase, userId, itemType, inserted.id, row);
}
