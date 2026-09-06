import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Both import entry points use the authenticated, role-checked registration RPC. */
export async function registerManualImportItem(
  client: Client,
  itemType: ItemType,
  fields: { title: string; author: string | null; year: number | null; pageCount: number | null },
): Promise<{ itemId: string } | { error: string }> {
  try {
    const { data, error } = await client.rpc("register_manual_catalog_item", {
      p_item_type: itemType,
      p_title: fields.title,
      p_creator: fields.author ?? undefined,
      p_year: fields.year ?? undefined,
      p_total_pages: itemType === "book" ? fields.pageCount ?? undefined : undefined,
      // ISBN and publisher belong to an identified edition, not legacy books
      // columns. Registering that edition remains tracked in #910.
    });
    if (error || !data) {
      console.error("register_manual_catalog_item (import) failed", { itemType, error });
      return { error: error?.message ?? "manual catalog registration returned no id" };
    }
    return { itemId: data };
  } catch (error) {
    console.error("register_manual_catalog_item (import) failed", { itemType, error });
    return { error: "manual catalog registration failed" };
  }
}
