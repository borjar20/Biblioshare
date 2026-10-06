import { createClient } from "@/lib/supabase/server";
import { loadWrapUpImageAssets } from "@/lib/wrap-ups/og-assets";
import { wrapUpImage } from "@/lib/wrap-ups/og-image";
import type { ShareSummary } from "@/lib/wrap-ups/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Imagen 9:16 de un wrap-up PUBLICADO (tarjeta del feed). Lee `wrap_up_shares`
// con el cliente de la PETICIÓN: la RLS `can_view_profile(user_id)` decide si
// quien mira (anónimo, el dueño, un seguidor o un tercero) puede verla, y si no
// vuelve fila es un 404 — no se distingue «no existe» de «no puedes verla».
//
// Sin `use cache` (regla #437, respuesta por escrito): 1) el dato NO es el mismo
// para un anónimo, el dueño y un tercero — un perfil privado se lo enseña a sus
// seguidores y a nadie más, así que una entrada compartida filtraría el resumen
// entre cuentas; 2) además leería cookies(). Por lo mismo, `Cache-Control:
// private, no-cache` (nunca la caché pública e inmutable por defecto de
// ImageResponse): un CDN no debe servir a un tercero lo que la RLS le dio a un
// seguidor, y `no-cache` obliga al navegador a revalidar — tras despublicar (o
// dejar de seguir a alguien) la imagen deja de verse en la siguiente petición.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("No encontrado", { status: 404 });

  const supabase = await createClient();
  const { data, error } = await supabase.from("wrap_up_shares").select("summary").eq("id", id).maybeSingle();
  // Sin detalles del error en la respuesta (ni código de Postgres ni mensaje).
  if (error) {
    console.error("wrap_up_shares", error.code);
    return new Response("Error", { status: 500 });
  }
  if (!data) return new Response("No encontrado", { status: 404 });

  const summary = data.summary as unknown as ShareSummary;
  return wrapUpImage(summary, await loadWrapUpImageAssets(summary), {
    headers: { "Cache-Control": "private, no-cache" },
  });
}
