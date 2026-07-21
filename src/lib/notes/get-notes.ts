import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { parsePosition } from "@/lib/library/position";
import type { Note, NoteCounts } from "./types";
import { NOTES_PAGE_SIZE, type NotesQuery } from "./query";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type Row = {
  id: string;
  item_type: ItemType;
  item_id: string;
  kind: "note" | "quote";
  body: string;
  position: unknown;
  is_favorite: boolean;
  meta: unknown;
  is_spoiler: boolean;
  is_public: boolean;
  created_at: string;
};

const NOTE_COLUMNS =
  "id, item_type, item_id, kind, body, position, is_favorite, meta, is_spoiler, is_public, created_at";

// Cuántas notas se lleva Memorizar al cliente para su sorteo. Acotado a
// propósito: antes esta pantalla hacía un `select` sin límite y traía el array
// entero solo para elegir una al azar. El cuaderno (/notas) es quien enseña
// todo, y lo hace paginando.
const SORTEO_LIMIT = 60;

// meta es jsonb opaco: lo que la BD garantiza es que es un objeto, no que
// tenga tags ni que sean strings. Se valida aquí, en el borde de lectura.
function tagsOf(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") return [];
  const raw = (meta as Record<string, unknown>).tags;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === "string");
}

function toNote(r: Row, itemTitle: string | null): Note {
  return {
    id: r.id,
    itemType: r.item_type,
    itemId: r.item_id,
    kind: r.kind,
    body: r.body,
    position: parsePosition(r.item_type, r.position),
    isFavorite: r.is_favorite,
    tags: tagsOf(r.meta),
    isSpoiler: r.is_spoiler,
    isPublic: r.is_public,
    createdAt: r.created_at,
    itemTitle,
  };
}

// Los títulos viven en books/movies/series según item_type, así que una nota no
// puede traerlos con un join: se resuelven en lote, tres consultas como mucho
// (mismo patrón que get-library-items). Se llama SIEMPRE sobre un conjunto ya
// acotado — nunca sobre la tabla entera.
async function resolveTitles(
  supabase: SupabaseServerClient,
  rows: Row[],
): Promise<Map<string, string>> {
  const idsByType: Record<ItemType, Set<string>> = {
    book: new Set(),
    movie: new Set(),
    series: new Set(),
  };
  for (const r of rows) idsByType[r.item_type].add(r.item_id);

  const empty = Promise.resolve({ data: [] as { id: string; title: string }[], error: null });
  const [books, movies, series] = await Promise.all([
    idsByType.book.size
      ? supabase.from("books").select("id, title").in("id", [...idsByType.book])
      : empty,
    idsByType.movie.size
      ? supabase.from("movies").select("id, title").in("id", [...idsByType.movie])
      : empty,
    idsByType.series.size
      ? supabase.from("series").select("id, title").in("id", [...idsByType.series])
      : empty,
  ]);
  if (books.error) throw books.error;
  if (movies.error) throw movies.error;
  if (series.error) throw series.error;

  const titleByKey = new Map<string, string>();
  for (const r of books.data ?? []) titleByKey.set(`book:${r.id}`, r.title);
  for (const r of movies.data ?? []) titleByKey.set(`movie:${r.id}`, r.title);
  for (const r of series.data ?? []) titleByKey.set(`series:${r.id}`, r.title);
  return titleByKey;
}

// En LIKE, `%` y `_` son comodines. Si el usuario busca «100%» sin escaparlos,
// el `%` se convierte en "lo que sea" y la búsqueda devuelve de más. El escape
// por defecto de Postgres es la barra invertida, que va primera para no
// escaparse a sí misma después.
function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// Una página del cuaderno: filtros y paginación en SQL, no en el cliente. El
// `count` exacto viaja con la misma consulta — es lo que necesita el paginador
// para saber si hay una página más.
export async function getNotesPage(
  supabase: SupabaseServerClient,
  userId: string,
  query: NotesQuery,
): Promise<{ notes: Note[]; total: number }> {
  let request = supabase
    .from("notes")
    .select(NOTE_COLUMNS, { count: "exact" })
    .eq("user_id", userId);

  if (query.kind !== "all") request = request.eq("kind", query.kind);
  if (query.favorites) request = request.eq("is_favorite", true);
  if (query.item) {
    request = request.eq("item_type", query.item.itemType).eq("item_id", query.item.itemId);
  }
  // Containment jsonb (`@>`): encuentra la etiqueta dentro del array sin
  // desanidarlo. La etiqueta llega ya normalizada por parseNotesQuery, con la
  // misma regla con la que se guardó.
  if (query.tag) request = request.contains("meta", { tags: [query.tag] });
  if (query.q) request = request.ilike("body", `%${escapeLike(query.q)}%`);

  // El orden `obra` agrupa: ordenar por (item_type, item_id) deja juntas todas
  // las notas de una obra, que es lo que la pantalla pinta como grupo. Es
  // arbitrario respecto al título —no se puede ordenar por una columna de tres
  // tablas distintas— pero es ESTABLE, y eso es lo que la paginación necesita
  // para no repetir ni saltarse filas. El orden de lectura dentro de cada grupo
  // lo pone compareNotes al pintar.
  //
  // `id` cierra los dos órdenes: sin un desempate determinista, dos notas con el
  // mismo created_at pueden bailar entre páginas.
  if (query.sort === "obra") {
    request = request
      .order("item_type", { ascending: true })
      .order("item_id", { ascending: true })
      .order("created_at", { ascending: true });
  } else {
    request = request.order("created_at", { ascending: false });
  }
  request = request.order("id", { ascending: true });

  const from = (query.page - 1) * NOTES_PAGE_SIZE;
  const { data, error, count } = await request.range(from, from + NOTES_PAGE_SIZE - 1);
  if (error) throw error;

  const rows = (data ?? []) as unknown as Row[];
  const titleByKey = await resolveTitles(supabase, rows);

  return {
    notes: rows.map((r) => toNote(r, titleByKey.get(`${r.item_type}:${r.item_id}`) ?? null)),
    total: count ?? 0,
  };
}

// Los contadores del rail del Rincón (frame H). Tres `count` en SQL: antes se
// derivaban recorriendo el array completo de notas en memoria, que era la razón
// por la que esa pantalla tenía que traérselas todas.
export async function getNoteCounts(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<NoteCounts> {
  const base = () =>
    supabase.from("notes").select("id", { count: "exact", head: true }).eq("user_id", userId);

  const [total, quotes, favorites] = await Promise.all([
    base(),
    base().eq("kind", "quote"),
    base().eq("is_favorite", true),
  ]);
  if (total.error) throw total.error;
  if (quotes.error) throw quotes.error;
  if (favorites.error) throw favorites.error;

  const totalCount = total.count ?? 0;
  const quotesCount = quotes.count ?? 0;
  return {
    quotes: quotesCount,
    // `kind` solo tiene dos valores (CHECK note/quote), así que restar es
    // exacto y ahorra una cuarta consulta.
    notes: totalCount - quotesCount,
    favorites: favorites.count ?? 0,
    total: totalCount,
  };
}

// Las notas recientes para el sorteo de Memorizar, acotadas. El sorteo elige al
// azar entre estas, no entre todas: la tarjeta enseña UNA nota, y traerse mil
// filas para eso es lo que este ciclo viene a arreglar. «Ver todas» lleva al
// cuaderno, que sí las recorre enteras paginando.
//
// **El sorteo se hace AQUÍ, no en la tarjeta** (issue #112). En el componente de
// cliente corría dos veces —al renderizar en servidor y al hidratar— y daba dos
// notas distintas, así que React tumbaba la hidratación. Y tampoco puede ir en
// el cuerpo de RinconTab: `react-hooks/purity` prohíbe llamar a una función
// impura durante el render, con razón (un re-render movería la nota). Esta
// función no es un componente, se ejecuta una vez por petición, y es la que ya
// se llama "para el sorteo": aquí la aleatoriedad es su trabajo, no un efecto
// secundario.
export async function getNotesForSorteo(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<{ notes: Note[]; initialIndex: number }> {
  const { data, error } = await supabase
    .from("notes")
    .select(NOTE_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(SORTEO_LIMIT);

  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const titleByKey = await resolveTitles(supabase, rows);
  const notes = rows.map((r) => toNote(r, titleByKey.get(`${r.item_type}:${r.item_id}`) ?? null));

  return {
    notes,
    initialIndex: notes.length > 0 ? Math.floor(Math.random() * notes.length) : 0,
  };
}

// Una nota por id, con el título de la obra resuelto. RLS la acota al dueño: si
// el id no existe o es de otro, devuelve null. La usa el export de la cita (F6).
export async function getNoteById(
  supabase: SupabaseServerClient,
  id: string,
): Promise<Note | null> {
  const { data, error } = await supabase
    .from("notes")
    .select(NOTE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const r = data as Row;

  const { data: titleRow } = await supabase
    .from(r.item_type === "book" ? "books" : r.item_type === "movie" ? "movies" : "series")
    .select("title")
    .eq("id", r.item_id)
    .maybeSingle();

  return toNote(r, (titleRow as { title: string } | null)?.title ?? null);
}

// Las notas del usuario para UNA obra, para la lista de la ficha. Sin orden en
// SQL: lo pone compareNotes en el cliente del servidor (src/lib/notes/sort.ts),
// porque ordenar por un jsonb con dos formas distintas desde SQL exigiría un
// índice de expresión por tipo de ítem para nada.
//
// Nota: cuelgan del ÍTEM, no del pase, así que esto trae también las notas de
// relecturas anteriores — que es lo que queremos (cada tarjeta lleva su fecha).
export async function getNotesForItem(
  supabase: SupabaseServerClient,
  userId: string,
  itemType: ItemType,
  itemId: string,
): Promise<Note[]> {
  const { data, error } = await supabase
    .from("notes")
    .select(NOTE_COLUMNS)
    .eq("user_id", userId)
    .eq("item_type", itemType)
    .eq("item_id", itemId);

  if (error) throw error;

  // Quien llama ya está EN la ficha de la obra y sabe el título.
  return ((data ?? []) as Row[]).map((r) => toNote(r, null));
}
