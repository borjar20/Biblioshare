import { notFound, redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getSagaRoutes, sortCuratedRoutes } from "@/lib/sagas/get-saga-routes";
import { countRouteEntries, type RawRouteEntryCountRow } from "@/lib/sagas/count-route-entries";
import { sagaHref } from "@/lib/catalog/item-href";
import { RoutesManager } from "@/components/saga/routes/routes-manager";
import type { RouteRowData } from "@/components/saga/routes/route-row";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// Curación de itinerarios. Gate DURO collaborator+, igual que
// /saga/[id]/editar: gestionar rutas SÍ es curación (a diferencia de
// adoptar una, que es preferencia personal).
export default async function SagaRoutesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const user = await getCurrentUser();
  if (!user) redirect(loginHref(`/saga/${id}/rutas`));
  if (!hasMinRole(await getCurrentUserRole(), "collaborator")) redirect(sagaHref(id));

  // `show_map` decide el TEXTO de la fila del mapa generado, no si se pinta:
  // una saga sin mapa con un itinerario ya designado necesita esa fila para
  // poder dejar de designarlo.
  const { data: saga } = await supabase.from("sagas").select("id, name, show_map").eq("id", id).maybeSingle();
  if (!saga) notFound();

  const routes = sortCuratedRoutes(await getSagaRoutes(supabase, id));

  // Una consulta agregada, NO una por fila. Con cero itinerarios ni se lanza:
  // un `.in()` con lista vacía es una ida y vuelta a BD para no traer nada.
  let counts: Record<string, { steps: number; notes: number }> = {};
  if (routes.length > 0) {
    const { data } = await supabase
      .from("saga_route_entries")
      .select("route_id, note")
      .in(
        "route_id",
        routes.map((r) => r.id),
      );
    counts = countRouteEntries((data ?? []) as RawRouteEntryCountRow[]);
  }

  const rows: RouteRowData[] = routes.map((r) => ({
    ...r,
    ...(counts[r.id] ?? { steps: 0, notes: 0 }),
  }));

  return (
    <RoutesManager
      sagaId={id}
      sagaName={(saga as { name: string }).name}
      hasMap={Boolean((saga as { show_map: boolean | null }).show_map)}
      rows={rows}
    />
  );
}
