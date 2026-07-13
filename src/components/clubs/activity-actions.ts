"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLibraryItems } from "@/lib/library/get-library-items";
import type { LibraryItem } from "@/lib/library/types";
import type { ItemType } from "@/lib/catalog/types";

// getLibraryItems() ya soporta search/itemType server-side -- se reutiliza tal cual,
// envuelta en una server action ("use server") ya que la función en sí no lo es (toma un
// cliente Supabase ya creado, se llama desde componentes de servidor). Mismo patrón que
// loadOwnRecentActivity en club-post-actions.ts (Bloque F).
export async function loadMyLibraryItems(search?: string, itemType?: ItemType): Promise<LibraryItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return getLibraryItems(supabase, user.id, { search, itemType });
}
