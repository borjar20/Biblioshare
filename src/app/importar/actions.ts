"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import type { ItemType } from "@/lib/catalog/types";
import type { Json } from "@/lib/supabase/database.types";
import { detectFormat } from "@/lib/import/detect-format";
import { parseGoodreads } from "@/lib/import/parse-goodreads";
import { parseLetterboxd } from "@/lib/import/parse-letterboxd";
import { parseBookmory } from "@/lib/import/parse-bookmory";
import { commitImportRow, commitManualImportRow } from "@/lib/import/commit-row";
import type { ImportFormat, ImportRow, ImportRowResult } from "@/lib/import/types";

const CATALOG_TABLE_BY_TYPE = {
  book: "books",
  movie: "movies",
  series: "series",
} as const;

// Worst-case-time guard, independent of the request body size limit below.
const MAX_ROWS = 3000;

const FORMAT_ITEM_TYPE: Record<ImportFormat, ItemType> = {
  goodreads: "book",
  letterboxd: "movie",
  bookmory: "book",
};

export type ParseImportState = {
  error?: "noFile" | "unrecognizedFormat" | "tooManyRows";
  result?: { format: ImportFormat; itemType: ItemType; rows: ImportRow[] };
};

// Parses the uploaded file only — no DB writes yet. The client renders the
// parsed rows and drives commitImportBatch itself, batch by batch.
export async function parseImportFile(
  _prevState: ParseImportState,
  formData: FormData
): Promise<ParseImportState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "noFile" };

  const buffer = await file.arrayBuffer();
  const detected = detectFormat(buffer);
  if (!detected) return { error: "unrecognizedFormat" };

  const rows =
    detected.format === "bookmory"
      ? parseBookmory(buffer)
      : detected.format === "goodreads"
        ? parseGoodreads(new TextDecoder("utf-8").decode(buffer))
        : parseLetterboxd(new TextDecoder("utf-8").decode(buffer));

  if (rows.length === 0) return { error: "unrecognizedFormat" };
  if (rows.length > MAX_ROWS) return { error: "tooManyRows" };

  return {
    result: { format: detected.format, itemType: FORMAT_ITEM_TYPE[detected.format], rows },
  };
}

const BATCH_CONCURRENCY = 5;

// Invoked imperatively from the client (startTransition), one batch per
// call — same pattern as addExistingItemToLibrary/updateStatus. Next.js
// dispatches Server Actions sequentially per client, so the caller's loop
// over batches is naturally rate-limited already; concurrency here only
// bounds how many external API calls happen at once within one batch.
export async function commitImportBatch(
  itemType: ItemType,
  rows: ImportRow[]
): Promise<ImportRowResult[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Mismo tope que el parseo: cada fila puede disparar llamadas a APIs
  // externas, así que un cliente no debe poder enviar lotes arbitrarios.
  if (rows.length > MAX_ROWS) return [];

  const results: ImportRowResult[] = [];
  for (let i = 0; i < rows.length; i += BATCH_CONCURRENCY) {
    const chunk = rows.slice(i, i + BATCH_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map((row) => commitImportRow(supabase, user.id, itemType, row))
    );
    results.push(...chunkResults);
  }
  return results;
}

export type ResolveUnmatchedState = {
  error?: "titleRequired" | "forbidden" | "generic";
  result?: ImportRowResult;
};

// Manual resolution for a row with no automatic match — same trust level as
// /buscar/manual (freeform catalog data entry), so gated the same way.
export async function resolveUnmatchedImportRow(
  itemType: ItemType,
  row: ImportRow,
  _prevState: ResolveUnmatchedState,
  formData: FormData
): Promise<ResolveUnmatchedState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = await getCurrentUserRole(supabase);
  if (!hasMinRole(role, "collaborator")) return { error: "forbidden" };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "titleRequired" };
  const author = String(formData.get("author") ?? "").trim() || null;
  const yearRaw = String(formData.get("year") ?? "").trim();
  const year = yearRaw ? Number(yearRaw) : null;

  const result = await commitManualImportRow(supabase, user.id, itemType, row, {
    title,
    author,
    year,
  });
  if (result.outcome === "error") return { error: "generic" };
  return { result };
}

export type SaveForReviewState = {
  saved?: boolean;
  error?: "generic";
};

// Un usuario normal cuya fila no tuvo match la guarda para que un colaborador
// la resuelva más tarde (§7.7). La entrada de biblioteca no se crea todavía:
// se creará —a nombre de este usuario— cuando el colaborador resuelva la fila.
export async function saveUnmatchedForReview(
  itemType: ItemType,
  row: ImportRow,
  _prevState: SaveForReviewState
): Promise<SaveForReviewState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("pending_import_rows").insert({
    user_id: user.id,
    item_type: itemType,
    payload: row as unknown as Json,
  });

  if (error) return { error: "generic" };
  return { saved: true };
}

export type ResolvePendingState = {
  error?: "titleRequired" | "forbidden" | "generic";
  done?: boolean;
};

// Cola de revisión (colaborador): crea el ítem de catálogo con los datos que
// introduce el revisor y luego llama a resolve_pending_import, que crea la
// entrada de biblioteca y los pases PARA EL DUEÑO de la fila (no el revisor).
export async function resolvePendingRow(
  pendingId: string,
  itemType: ItemType,
  row: ImportRow,
  _prevState: ResolvePendingState,
  formData: FormData
): Promise<ResolvePendingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) {
    return { error: "forbidden" };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "titleRequired" };
  const author = String(formData.get("author") ?? "").trim() || null;
  const yearRaw = String(formData.get("year") ?? "").trim();
  const year = yearRaw ? Number(yearRaw) : null;

  // Alta del ítem de catálogo (misma forma por tipo que commitManualImportRow).
  const table = CATALOG_TABLE_BY_TYPE[itemType];
  const payload =
    itemType === "book"
      ? {
          title,
          author,
          published_year: year,
          publisher: row.publisher,
          total_pages: row.pageCount,
          isbn: row.isbn,
        }
      : itemType === "movie"
        ? { title, director: author, release_year: year }
        : { title, creator: author, release_year: year };

  const { data: inserted, error: insertError } = await supabase
    .from(table)
    .insert(payload as never)
    .select("id")
    .single();
  if (insertError) return { error: "generic" };

  const { error: rpcError } = await supabase.rpc("resolve_pending_import", {
    p_pending_id: pendingId,
    p_catalog_item_id: inserted.id,
  });
  if (rpcError) return { error: "generic" };

  revalidatePath("/importar/pendientes");
  return { done: true };
}

// El dueño descarta una de sus filas pendientes (o resueltas) — DELETE propio.
export async function dismissPendingRow(pendingId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("pending_import_rows")
    .delete()
    .eq("id", pendingId)
    .eq("user_id", user.id);

  revalidatePath("/importar/pendientes");
}
