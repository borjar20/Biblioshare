import { getCurrentUser } from "@/lib/supabase/server";
import { getOwnWrapUp } from "@/lib/wrap-ups/get-own-wrap-ups";
import { loadWrapUpImageAssets } from "@/lib/wrap-ups/og-assets";
import { summaryForPayload } from "@/lib/wrap-ups/share-summary";
import { wrapUpImage } from "@/lib/wrap-ups/og-image";
import { isWrapUpKind } from "@/lib/wrap-ups/windows";

// Imagen 9:16 del wrap-up PROPIO (spec 2026-10-06 §5): la que «Compartir» manda
// a la hoja del sistema. Sin `use cache` (regla #437): depende de la sesión.
// `private, no-store`: ImageResponse pone por defecto una caché pública e
// inmutable de un año, y la imagen cambia con «Actualizar».
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  if (!isWrapUpKind(kind)) return new Response("No encontrado", { status: 404 });

  const wrapUp = await getOwnWrapUp(kind);
  if (!wrapUp) return new Response("No encontrado", { status: 404 });

  const summary = summaryForPayload(wrapUp.payload);
  return wrapUpImage(summary, await loadWrapUpImageAssets(summary), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="biblioshare-${kind}-${summary.periodEnd}.png"`,
    },
  });
}
