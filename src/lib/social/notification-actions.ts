"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Se marca todo como leído al abrir la campana (mismo patrón simple que el
// resto de toggles de la app: sin selección fila a fila).
export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) throw error;
  // El Header (con la campana) vive en el layout raíz, presente en toda ruta.
  revalidatePath("/", "layout");
}
