"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { listNotifications, type Notification } from "@/lib/social/notifications";

// La lista de la campana, pedida al ABRIRLA. Antes viajaba en cada render de
// cada página desde AppShell, que bloquea el primer byte: veinte filas con sus
// actores para un desplegable que la mayoría de las visitas nunca abre
// (issue #283). El contador de no leídas sí sigue llegando con el chrome —
// ese se ve siempre.
export async function fetchNotifications(): Promise<Notification[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  return listNotifications(supabase, user.id);
}

// Se marca todo como leído al abrir la campana (mismo patrón simple que el
// resto de toggles de la app: sin selección fila a fila).
export async function markAllNotificationsRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const supabase = await createClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) throw error;
  // El Header (con la campana) vive en el layout raíz, presente en toda ruta.
  revalidatePath("/", "layout");
}
