import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getSagaRoutes } from "@/lib/sagas/get-saga-routes";
import { deleteRoute } from "@/lib/sagas/route-actions";
import { sagaHref } from "@/lib/catalog/item-href";
import { CreateRouteForm } from "@/components/saga/create-route-form";

// Curación de itinerarios (spec 2026-07-22, Task 8). Gate DURO
// collaborator+, igual que /saga/[id]/mapa/editar: crear/borrar rutas SÍ es
// curación (a diferencia de adoptar una, que es preferencia personal).
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
        <ul className="flex flex-col gap-2">
          {routes.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{r.name}</span>
                {r.summary && <span className="block truncate text-[11px] text-muted-foreground">{r.summary}</span>}
              </span>
              <Link
                href={`${sagaHref(id)}/rutas/${r.slug}/editar`}
                className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold"
              >
                {t("routeEditSteps")}
              </Link>
              <form action={deleteRoute.bind(null, r.id, id)}>
                <button type="submit" className="shrink-0 px-2 py-1 text-[11px] text-status-dropped">
                  {t("routeDelete")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <CreateRouteForm sagaId={id} />
    </div>
  );
}
