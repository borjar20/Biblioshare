"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import type { ItemType } from "@/lib/catalog/types";
import { normalizeIsbn } from "@/lib/catalog/isbn";
import { applyTransition } from "@/lib/passes/apply-transition";

export type AddManualItemState = {
  error?: "titleRequired" | "invalidPageCount" | "invalidIsbn" | "forbidden" | "generic";
};

const TABLE_BY_TYPE = {
  book: "books",
  movie: "movies",
  series: "series",
} as const;

export async function addManualItem(
  itemType: ItemType,
  _prevState: AddManualItemState,
  formData: FormData
): Promise<AddManualItemState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Crear ítems a mano es contribución curada → colaborador+ (§7.35).
  const role = await getCurrentUserRole(supabase);
  if (!hasMinRole(role, "collaborator")) return { error: "forbidden" };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "titleRequired" };

  const creator = String(formData.get("creator") ?? "").trim() || null;
  const yearRaw = String(formData.get("year") ?? "").trim();
  const year = yearRaw ? Number(yearRaw) : null;
  const coverUrl = String(formData.get("coverUrl") ?? "").trim() || null;

  let pageCount: number | null = null;
  let isbn: string | null = null;
  if (itemType === "book") {
    const pageCountRaw = String(formData.get("pageCount") ?? "").trim();
    if (pageCountRaw) {
      pageCount = Number(pageCountRaw);
      if (!Number.isInteger(pageCount) || pageCount < 0) {
        return { error: "invalidPageCount" };
      }
    }

    const isbnRaw = String(formData.get("isbn") ?? "").trim();
    if (isbnRaw) {
      isbn = normalizeIsbn(isbnRaw);
      if (!isbn) return { error: "invalidIsbn" };
    }
  }

  const table = TABLE_BY_TYPE[itemType];
  const payload =
    itemType === "book"
      ? {
          title,
          author: creator,
          published_year: year,
          cover_url: coverUrl,
          publisher: String(formData.get("publisher") ?? "").trim() || null,
          total_pages: pageCount,
          isbn,
        }
      : itemType === "movie"
        ? { title, director: creator, release_year: year, cover_url: coverUrl }
        : { title, creator, release_year: year, cover_url: coverUrl };

  // Insert shape differs per item type (picked above); same reconciliation
  // pattern as findOrCreateCatalogItem in ../actions.ts.
  const { data: inserted, error } = await supabase
    .from(table)
    .insert(payload as never)
    .select("id")
    .single();

  if (error) return { error: "generic" };

  // Alta = pase activo en planned vía la máquina (el ítem acaba de nacer,
  // así que no puede haber pase previo; la transición crea el activo).
  try {
    await applyTransition(supabase, user.id, itemType, inserted.id, "planned");
  } catch {
    return { error: "generic" };
  }

  const profile = await getOwnProfile(supabase, user.id);
  redirect(profile ? `/u/${profile.username}` : "/");
}
