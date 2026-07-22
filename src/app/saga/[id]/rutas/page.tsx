import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getSagaRoutes } from "@/lib/sagas/get-saga-routes";
import { sagaHref } from "@/lib/catalog/item-href";
import { CreateRouteForm } from "@/components/saga/create-route-form";
import { RouteList } from "@/components/saga/route-list";

// Curación de itinerarios (spec 2026-07-22, Task 8): crear, renombrar,
// reordenar y borrar. Gate DURO collaborator+, igual que
// /saga/[id]/mapa/editar: gestionar rutas SÍ es curación (a diferencia de
// adoptar una, que es preferencia personal).
export default async function SagaRoutesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("sagaEditor");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) redirect(sagaHref(id));

  const { data: saga } = await supabase.from("sagas").select("id, name").eq("id", id).maybeSingle();
  if (!saga) notFound();

  const routes = await getSagaRoutes(supabase, id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-lg font-semibold">{t("routesTitle")}</h1>

      {routes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("routesEmpty")}</p>
      ) : (
        <RouteList sagaId={id} routes={routes} />
      )}

      <CreateRouteForm sagaId={id} />
    </div>
  );
}
