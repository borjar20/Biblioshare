"use server";

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
  // NO se revalida nada, y es a propósito (F1-014). Aquí había un
  // `revalidatePath("/", "layout")` —la revalidación más cara que existe: purga
  // la Client Cache entera— pagada por la acción MÁS frecuente de la app, para
  // actualizar un número de dos dígitos.
  //
  // No hacía falta ni entonces: el contador no está cacheado en ninguna parte.
  // `getUnreadCount` es una consulta viva que corre dentro del <Suspense>
  // dinámico de `SessionChrome` (app-shell.tsx), así que cualquier render
  // posterior ya lee la BD. Y entre medias el badge tampoco se queda rancio: la
  // campana baja su contador a 0 en el cliente al abrirse, y el Header vive en
  // el layout raíz —no se desmonta al navegar—, así que ese 0 sobrevive.
  //
  // Tampoco se sustituye por un tag: un contador de no leídas depende de
  // `auth.uid()`, y cachear eso con una etiqueta compartida sería servirle a un
  // usuario el contador de otro (regla #437 de AGENTS.md). Lo correcto para un
  // dato por-usuario es justo esto: no cachearlo.
}
