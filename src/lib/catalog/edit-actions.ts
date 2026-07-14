"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { itemHref } from "@/lib/catalog/item-href";
import type { ItemType } from "@/lib/catalog/types";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { ensureBookEditions } from "@/lib/editions/sync-editions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type EditItemState = {
  error?: "forbidden" | "invalidTitle" | "invalidYear" | "generic";
  ok?: boolean;
};

export type DeleteEditionState = {
  error?: "forbidden" | "inUse" | "generic";
  ok?: boolean;
};

// Límites del editor de ficha. Holgados a propósito (mismo criterio que
// 20260715_text_length_limits.sql): cortan un POST abusivo directo al
// endpoint, no la escritura legítima de un colaborador.
const MAX_TITLE_LENGTH = 300;
const MAX_AUTHOR_LENGTH = 200;
const MAX_SYNOPSIS_LENGTH = 5000;
const MAX_GENRES = 10;
const MAX_GENRE_LENGTH = 40;
const MIN_YEAR = 1400;
const MAX_YEAR = 2200;
const MAX_COVER_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const COVER_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// "" -> null; entero fuera de [1400, 2200] o no numérico -> "invalid". Una
// server action es un endpoint POST público: no basta con que el <input
// type="number"> del formulario ya lo valide, porque nada impide un POST
// directo con year="0" o year="abc".
function parseYear(raw: FormDataEntryValue | null): number | null | "invalid" {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_YEAR || n > MAX_YEAR) return "invalid";
  return n;
}

// Coma-separados, recortados, sin vacíos. Más de 10 o alguno de más de 40
// caracteres se RECHAZA entero (no se trunca en silencio): con la interfaz ya
// limitando esto, llegar aquí fuera de rango solo puede ser un POST directo.
function parseGenres(raw: FormDataEntryValue | null): string[] | "invalid" {
  const value = String(raw ?? "").trim();
  if (!value) return [];
  const genres = value
    .split(",")
    .map((genre) => genre.trim())
    .filter((genre) => genre.length > 0);
  if (genres.length > MAX_GENRES) return "invalid";
  if (genres.some((genre) => genre.length > MAX_GENRE_LENGTH)) return "invalid";
  return genres;
}

// "" -> null; entero positivo válido -> el número; cualquier otra cosa ->
// null (campo opcional, sin código de error dedicado: total_pages/duration_minutes
// no son parte de las validaciones "no puedes romper" del brief, y el CHECK de
// la BD (book_editions/movie_versions) es el respaldo si igualmente se cuela
// algo raro).
function intOrNull(raw: FormDataEntryValue | null): number | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Patrón obligatorio de toda acción del editor (src/lib/editions/actions.ts):
// sin sesión -> /login; sin rol de colaborador -> error legible. La RLS (y,
// para books/movies/series, el trigger de esta misma migración) es la
// defensa real — esto es solo para no devolver un genérico feo.
async function requireCollaborator(
  supabase: SupabaseServerClient
): Promise<{ error: "forbidden" } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) {
    return { error: "forbidden" };
  }
  return null;
}

// Corrige título, autoría/dirección/creación, sinopsis, géneros y año de la
// ficha oficial (books/movies/series). Los datos vienen sucios de
// OpenLibrary/TMDB: esto es lo que permite a un colaborador limpiarlos.
export async function updateCatalogItem(
  itemType: ItemType,
  itemId: string,
  _prev: EditItemState,
  formData: FormData
): Promise<EditItemState> {
  const supabase = await createClient();
  const guard = await requireCollaborator(supabase);
  if (guard) return guard;

  const title = String(formData.get("title") ?? "").trim();
  if (!title || title.length > MAX_TITLE_LENGTH) return { error: "invalidTitle" };

  const author = String(formData.get("author") ?? "").trim();
  if (author.length > MAX_AUTHOR_LENGTH) return { error: "generic" };

  const synopsis = String(formData.get("synopsis") ?? "").trim();
  if (synopsis.length > MAX_SYNOPSIS_LENGTH) return { error: "generic" };

  const genres = parseGenres(formData.get("genres"));
  if (genres === "invalid") return { error: "generic" };

  const year = parseYear(formData.get("year"));
  if (year === "invalid") return { error: "invalidYear" };

  // author/synopsis vacíos se guardan como NULL, no como cadena vacía: así
  // "sin dato" se distingue de "el colaborador borró el campo a propósito"
  // solo por el valor NULL, igual que el resto del catálogo.
  const { error } =
    itemType === "book"
      ? await supabase
          .from("books")
          .update({
            title,
            author: author || null,
            synopsis: synopsis || null,
            genres,
            published_year: year,
          })
          .eq("id", itemId)
      : itemType === "movie"
        ? await supabase
            .from("movies")
            .update({
              title,
              director: author || null,
              synopsis: synopsis || null,
              genres,
              release_year: year,
            })
            .eq("id", itemId)
        : await supabase
            .from("series")
            .update({
              title,
              creator: author || null,
              synopsis: synopsis || null,
              genres,
              release_year: year,
            })
            .eq("id", itemId);

  if (error) return { error: "generic" };

  revalidatePath(itemHref(itemType, itemId));
  return { ok: true };
}

// Sube la portada corregida a Storage (bucket `covers`, público de lectura,
// solo colaborador+ puede escribir por su propia RLS) y guarda la URL pública
// en `cover_url`. El `accept` del <input> del cliente no es una defensa: el
// tipo y el tamaño se comprueban aquí, en el servidor.
export async function uploadCover(
  itemType: ItemType,
  itemId: string,
  formData: FormData
): Promise<EditItemState> {
  const supabase = await createClient();
  const guard = await requireCollaborator(supabase);
  if (guard) return guard;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "generic" };
  if (!ALLOWED_COVER_TYPES.has(file.type)) return { error: "generic" };
  if (file.size > MAX_COVER_BYTES) return { error: "generic" };

  const extension = COVER_EXTENSION[file.type];
  const path = `${itemType}/${itemId}.${extension}`;

  const buffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("covers")
    .upload(path, buffer, { upsert: true, contentType: file.type });
  if (uploadError) return { error: "generic" };

  const {
    data: { publicUrl },
  } = supabase.storage.from("covers").getPublicUrl(path);

  // El path es estable (upsert: true reemplaza el mismo objeto), así que sin
  // un parámetro de versión el navegador (o una CDN intermedia) seguiría
  // sirviendo la portada vieja tras sustituirla. Mismo patrón que
  // avatar-upload.tsx.
  const coverUrl = `${publicUrl}?v=${Date.now()}`;

  const { error } =
    itemType === "book"
      ? await supabase.from("books").update({ cover_url: coverUrl }).eq("id", itemId)
      : itemType === "movie"
        ? await supabase.from("movies").update({ cover_url: coverUrl }).eq("id", itemId)
        : await supabase.from("series").update({ cover_url: coverUrl }).eq("id", itemId);

  if (error) return { error: "generic" };

  revalidatePath(itemHref(itemType, itemId));
  return { ok: true };
}

// Corrige los datos de una edición concreta (book_editions / movie_versions).
// Las series no tienen ediciones (su unidad de progreso son los episodios),
// igual que en createEdition (src/lib/editions/actions.ts).
export async function updateEdition(
  editionId: string,
  itemType: ItemType,
  itemId: string,
  _prev: EditItemState,
  formData: FormData
): Promise<EditItemState> {
  const supabase = await createClient();
  const guard = await requireCollaborator(supabase);
  if (guard) return guard;

  if (itemType === "series") return { error: "forbidden" };

  // EditItemState no tiene un código dedicado para el nombre de la edición
  // (a diferencia de CreateEditionState.invalidLabel): se reutiliza
  // "invalidTitle", que es el equivalente conceptual más cercano.
  const label = String(formData.get("label") ?? "").trim();
  if (!label || label.length > 60) return { error: "invalidTitle" };

  const year = parseYear(formData.get("year"));
  if (year === "invalid") return { error: "invalidYear" };

  // Se acota también por el id del ítem (book_id / movie_id): si editionId e
  // itemId no coinciden, el .eq() adicional no encuentra fila y el update no
  // toca nada — mejor eso que revalidar la ruta equivocada.
  const { error } =
    itemType === "book"
      ? await supabase
          .from("book_editions")
          .update({
            label,
            publisher: String(formData.get("publisher") ?? "").trim() || null,
            published_year: year,
            language: String(formData.get("language") ?? "").trim() || null,
            total_pages: intOrNull(formData.get("totalUnits")),
            isbn: String(formData.get("isbn") ?? "").trim() || null,
          })
          .eq("id", editionId)
          .eq("book_id", itemId)
      : await supabase
          .from("movie_versions")
          .update({
            label,
            release_year: year,
            duration_minutes: intOrNull(formData.get("totalUnits")),
          })
          .eq("id", editionId)
          .eq("movie_id", itemId);

  if (error) return { error: "generic" };

  revalidatePath(itemHref(itemType, itemId));
  return { ok: true };
}

// Borra una edición del catálogo. NO puede borrar una que esté en uso.
export async function deleteEdition(
  editionId: string,
  itemType: ItemType,
  itemId: string
): Promise<DeleteEditionState> {
  const supabase = await createClient();
  const guard = await requireCollaborator(supabase);
  if (guard) return guard;

  if (itemType === "series") return { error: "forbidden" };

  // Chequeo amable en TypeScript: cuenta los pases que la RLS deja ver (los
  // de perfiles públicos). NO es la protección real — un pase contra un
  // perfil privado no entra en este count, así que puede quedarse corto. La
  // protección de verdad es el trigger block_edition_delete_if_used
  // (20260714_edition_delete_guard.sql), que ve TODOS los pases sin filtro de
  // RLS y es lo único que de verdad impide el borrado.
  const { count } = await supabase
    .from("diary_entries")
    .select("id", { count: "exact", head: true })
    .eq("edition_id", editionId);
  if ((count ?? 0) > 0) return { error: "inUse" };

  const { error } =
    itemType === "book"
      ? await supabase.from("book_editions").delete().eq("id", editionId).eq("book_id", itemId)
      : await supabase.from("movie_versions").delete().eq("id", editionId).eq("movie_id", itemId);

  if (error) {
    // El trigger de BD lanza esta excepción exacta cuando, pese al chequeo de
    // arriba, SÍ había pases (de perfiles privados, invisibles para este
    // cliente) usando la edición.
    if (error.message.includes("edition_in_use")) return { error: "inUse" };
    return { error: "generic" };
  }

  revalidatePath(itemHref(itemType, itemId));
  return { ok: true };
}

// Fuerza una nueva sincronización de ediciones: pone `editions_synced_at` a
// null y deja que ensureBookEditions (Tarea 6, src/lib/editions/sync-editions.ts)
// vuelva a preguntarle a OpenLibrary, exactamente como si fuera la primera
// visita a la ficha. Solo aplica a libros (las ediciones de película no se
// sincronizan desde una API externa).
export async function resyncEditions(bookId: string): Promise<EditItemState> {
  const supabase = await createClient();
  const guard = await requireCollaborator(supabase);
  if (guard) return guard;

  const { data: book, error } = await supabase
    .from("books")
    .update({ editions_synced_at: null })
    .eq("id", bookId)
    .select("id, openlibrary_work_key, isbn, editions_synced_at")
    .single();

  if (error || !book) return { error: "generic" };

  await ensureBookEditions(supabase, book);

  revalidatePath(itemHref("book", bookId));
  return { ok: true };
}
