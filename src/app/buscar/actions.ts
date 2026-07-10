"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { findOrCreateCatalogItem } from "@/lib/catalog/find-or-create";
import type { SearchResult } from "@/lib/catalog/types";

// queueId drops the new (planned) item straight into a named queue (§7.22);
// null/undefined leaves it in the "Sin cola" bucket. A foreign queue id is
// rejected by the FK + queues RLS and surfaces as a normal error, so there's
// no need to re-check ownership here.
export async function addToLibrary(result: SearchResult, queueId?: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The search flow (src/lib/catalog/search.ts) already persists new API
  // results into the catalog, so `catalogId` is normally already set here.
  // findOrCreateCatalogItem is only a fallback (mock mode, or results that
  // otherwise arrived without it).
  const itemId = result.catalogId ?? (await findOrCreateCatalogItem(supabase, result));

  const { error } = await supabase.from("library_entries").insert({
    user_id: user.id,
    item_type: result.itemType,
    item_id: itemId,
    ...(queueId && { queue_id: queueId }),
  });

  // Ignore "already in your library" conflicts; anything else is a real error.
  if (error && error.code !== "23505") {
    throw error;
  }

  revalidatePath("/buscar");
}
