"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidateLibrary, revalidateProfilePages } from "@/lib/reactivity/revalidate";

// Simple version of §7.9: a single flat set of up to MAX_FAVORITES pinned
// items, no reordering UI. `pinned_order` is only used to preserve a stable
// display order (oldest pin first), not exposed for manual reordering.
const MAX_FAVORITES = 6;

export type ToggleFavoriteState = {
  error?: "maxReached";
};

// entryId es el id del pase ACTIVO de la obra (§Tarea 9, hub): favoritos
// fija/desfija sobre ese pase, no sobre library_entries — el .eq("is_active",
// true) de cada consulta de abajo es defensa en profundidad: un entryId de un
// pase archivado (relectura vieja) nunca debería llegar aquí, pero si llegara
// no debe tocar pinned_order de un pase que ya no representa la obra.
export async function toggleFavorite(
  entryId: string
): Promise<ToggleFavoriteState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: current, error: fetchError } = await supabase
    .from("diary_entries")
    .select("pinned_order")
    .eq("id", entryId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!current) return {};

  if (current.pinned_order !== null) {
    const { error } = await supabase
      .from("diary_entries")
      .update({ pinned_order: null })
      .eq("id", entryId)
      .eq("user_id", user.id);

    if (error) throw error;
    revalidateLibraryViews();
    return {};
  }

  const { count, error: countError } = await supabase
    .from("diary_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true)
    .not("pinned_order", "is", null);

  if (countError) throw countError;
  if ((count ?? 0) >= MAX_FAVORITES) return { error: "maxReached" };

  const { data: topPin, error: topPinError } = await supabase
    .from("diary_entries")
    .select("pinned_order")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .not("pinned_order", "is", null)
    .order("pinned_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (topPinError) throw topPinError;

  const { error } = await supabase
    .from("diary_entries")
    .update({ pinned_order: (topPin?.pinned_order ?? 0) + 1 })
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidateLibraryViews();
  return {};
}

// La biblioteca se ve desde dos sitios desde el rediseño Paper: /coleccion (la
// tuya) y /u/[username] (la de cualquiera). Un pin afecta a ambas.
function revalidateLibraryViews() {
  revalidateLibrary();
  revalidateProfilePages();
}
