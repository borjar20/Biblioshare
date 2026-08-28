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
  const role = await getCurrentUserRole();
  if (!hasMinRole(role, "collaborator")) return { error: "forbidden" };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "titleRequired" };

  const creator = String(formData.get("creator") ?? "").trim() || null;
  const yearRaw = String(formData.get("year") ?? "").trim();
  const year = yearRaw ? Number(yearRaw) : null;
  const coverUrl = String(formData.get("coverUrl") ?? "").trim() || null;

  let pageCount: number | null = null;
  let isbn: string | null = null;
  let publisher: string | null = null;
  if (itemType === "book") {
    publisher = String(formData.get("publisher") ?? "").trim() || null;

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

  // El alta va por RPC definer, NO por insert directo: desde #674 parte F
  // (20260818_catalog_f_revoke_insert.sql) `authenticated` no tiene INSERT
  // sobre books/movies/series, y este call site se quedó atrás — moría con
  // 42501 "permission denied for table books" en cada alta manual. La RPC
  // acepta los canónicos tecleados por el colaborador (a diferencia de
  // `register_catalog_item`, que solo sabe nacer una shell desde un id externo)
  // y revalida el rol en servidor.
  const { data: itemId, error } = await supabase.rpc("register_manual_catalog_item", {
    p_item_type: itemType,
    p_title: title,
    p_creator: creator ?? undefined,
    p_year: year ?? undefined,
    p_cover_url: coverUrl ?? undefined,
    p_publisher: publisher ?? undefined,
    p_total_pages: pageCount ?? undefined,
    p_isbn: isbn ?? undefined,
  });

  // Tragarse el error sin dejar rastro es lo que hizo invisible la regresión de
  // #674 durante meses: la pantalla decía "genérico" y los logs, nada.
  if (error || !itemId) {
    console.error("register_manual_catalog_item failed", { itemType, error });
    return { error: error?.message.includes("forbidden") ? "forbidden" : "generic" };
  }

  // Alta manual con ISBN → deja además una edición real colgada de la obra
  // (mismo camino validado que `ensureBookEdition`, no un insert directo).
  // Es una MEJORA, no un requisito: el alta de la obra ya está hecha arriba,
  // así que cualquier fallo aquí se traga con console.error y no rompe el
  // flujo (patrón de src/lib/catalog/find-or-create.ts).
  if (itemType === "book" && isbn) {
    const { error: editionError } = await supabase.rpc("register_book_edition", {
      p_book_id: itemId,
      p_isbn: isbn,
      p_publisher: publisher ?? undefined,
      p_year: year ?? undefined,
      p_pages: pageCount ?? undefined,
      p_cover_url: coverUrl ?? undefined,
    });
    if (editionError) {
      console.error("register_book_edition (alta manual)", { itemId, editionError });
    }
  }

  // Alta = pase activo en planned vía la máquina (el ítem acaba de nacer,
  // así que no puede haber pase previo; la transición crea el activo).
  try {
    await applyTransition(supabase, user.id, itemType, itemId, "planned", undefined, { silent: true });
  } catch (transitionError) {
    console.error("addManualItem applyTransition failed", { itemId, transitionError });
    return { error: "generic" };
  }

  const profile = await getOwnProfile(user.id);
  redirect(profile ? `/u/${profile.username}` : "/");
}
