import type { SagaDetail } from "./get-saga-detail";

// Ruta activa. Precedencia: ?ruta= explícito → compatibilidad con el viejo
// ?orden=publicacion (enlaces ya compartidos) → la adoptada → la primera.
// Un slug desconocido (ruta borrada, enlace viejo) degrada a la primera en
// vez de dar 404: por eso la adopción guarda el slug y no un route_id.
export function resolveActiveRoute(
  detail: Pick<SagaDetail, "routes" | "routeChoice">,
  { ruta, orden }: { ruta?: string; orden?: string },
): string {
  const known = new Set(detail.routes.map((r) => r.slug));
  return (
    (ruta && known.has(ruta) && ruta) ||
    (orden === "publicacion" && known.has("publicacion") && "publicacion") ||
    (detail.routeChoice && known.has(detail.routeChoice) && detail.routeChoice) ||
    detail.routes[0]?.slug ||
    "publicacion"
  );
}
