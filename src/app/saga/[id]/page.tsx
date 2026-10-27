import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { hasMinRole } from "@/lib/auth/roles";
import { getSagaDetail } from "@/lib/sagas/get-saga-detail";
import { resolveActiveRoute } from "@/lib/sagas/resolve-active-route";
import { SAGA_ITEM_ROLES, type SagaItemRole } from "@/lib/sagas/types";
import { SagaHero } from "@/components/saga/saga-hero";
import { SagaAbout } from "@/components/saga/ficha/saga-about";
import { SagaAllWorks } from "@/components/saga/ficha/saga-all-works";
import { SagaMapTab } from "@/components/saga/saga-map-tab";
import { SagaTabs } from "@/components/saga/saga-tabs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: saga } = await supabase
    .from("sagas")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  return { title: saga ? `${saga.name} — Biblioshare` : "Biblioshare" };
}

export default async function SagaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; orden?: string; ruta?: string; rol?: string }>;
}) {
  const { id } = await params;
  const { orden, ruta, rol } = await searchParams;
  const t = await getTranslations("saga");
  const supabase = await createClient();

  const detail = await getSagaDetail(supabase, id);
  if (!detail) notFound();

  // Rol del usuario: collaborator+ puede curar la saga (ficha, orden de
  // lectura, itinerarios). viewerRole viaja en el mismo batch de
  // getSagaDetail — sin segundo auth.getUser().
  const canCurate = hasMinRole(detail.viewerRole, "collaborator");

  const activeRoute = resolveActiveRoute(detail, { ruta, orden });

  // Lente por rol (fase 5). Un valor desconocido —enlace viejo, el `paralela`
  // de antes de la retirada, o algo escrito a mano— degrada a «todos» en vez de
  // dar 404 o vaciar el timeline sin explicación. Mismo criterio que el slug de
  // ruta desconocido, justo arriba.
  const activeRole: SagaItemRole | null = (SAGA_ITEM_ROLES as readonly string[]).includes(rol ?? "")
    ? (rol as SagaItemRole)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-6">
      <SagaHero detail={detail} isAuthenticated={detail.isAuthenticated} />

      <SagaTabs
        labels={{ info: t("tabInfo"), map: t("tabMap") }}
        info={
          <div className="flex flex-col gap-8 px-4 pb-10">
            <SagaAbout detail={detail} canConfigure={canCurate} />
            <SagaAllWorks groups={detail.groups} windows={detail.windows} />
          </div>
        }
        map={
          detail.hasGraph || detail.routes.some((r) => !r.synthetic) ? (
            <SagaMapTab
              detail={detail}
              activeRoute={activeRoute}
              canEdit={canCurate}
              activeRole={activeRole}
            />
          ) : null
        }
      />
    </div>
  );
}
