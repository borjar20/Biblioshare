import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { hasMinRole } from "@/lib/auth/roles";
import { getSagaDetail } from "@/lib/sagas/get-saga-detail";
import { SagaHero } from "@/components/saga/saga-hero";
import { SagaInfo } from "@/components/saga/saga-info";
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
  searchParams: Promise<{ tab?: string; orden?: string; ruta?: string }>;
}) {
  const { id } = await params;
  const { orden, ruta } = await searchParams;
  const t = await getTranslations("saga");
  const supabase = await createClient();

  const detail = await getSagaDetail(supabase, id);
  if (!detail) notFound();

  // Rol del usuario: collaborator+ puede curar la saga (ficha, orden de
  // lectura, itinerarios). viewerRole viaja en el mismo batch de
  // getSagaDetail — sin segundo auth.getUser().
  const canCurate = hasMinRole(detail.viewerRole, "collaborator");

  // Ruta activa. Precedencia: ?ruta= explícito → compatibilidad con el viejo
  // ?orden=publicacion (enlaces ya compartidos) → la adoptada → la primera.
  // Un slug desconocido (ruta borrada, enlace viejo) degrada a la primera en
  // vez de dar 404: por eso la adopción guarda el slug y no un route_id.
  const known = new Set(detail.routes.map((r) => r.slug));
  const activeRoute =
    (ruta && known.has(ruta) && ruta) ||
    (orden === "publicacion" && known.has("publicacion") && "publicacion") ||
    (detail.routeChoice && known.has(detail.routeChoice) && detail.routeChoice) ||
    detail.routes[0]?.slug ||
    "publicacion";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-6">
      <SagaHero detail={detail} isAuthenticated={detail.isAuthenticated} />

      <SagaTabs
        labels={{ info: t("tabInfo"), map: t("tabMap") }}
        info={
          <SagaInfo
            overview={detail.saga.overview}
            groups={detail.groups}
            hasGraph={detail.hasGraph}
            canConfigure={canCurate}
            sagaId={detail.saga.id}
            hasParent={detail.parent !== null}
          />
        }
        map={
          detail.hasGraph || detail.routes.some((r) => !r.synthetic) ? (
            <SagaMapTab detail={detail} activeRoute={activeRoute} canEdit={canCurate} />
          ) : null
        }
      />
    </div>
  );
}
