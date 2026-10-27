import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { hasMinRole } from "@/lib/auth/roles";
import { sagaHref } from "@/lib/catalog/item-href";
import { getSagaDetail } from "@/lib/sagas/get-saga-detail";
import { SAGA_ITEM_ROLES, type SagaItemRole } from "@/lib/sagas/types";
import { resolveActiveRoute } from "@/lib/sagas/resolve-active-route";
import { DETAIL_CONTAINER } from "@/components/detail/detail-container";
import { SagaMapTab } from "@/components/saga/saga-map-tab";

// «Cómo leerla» (spec 2026-10-27 §5): el contenido de la antigua pestaña
// «Mapa de lectura», sin cambios de comportamiento, en su propia página. Es
// INTERINA: el atlas de la saga (subproyecto 2) la sustituye.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: saga } = await supabase.from("sagas").select("name").eq("id", id).maybeSingle();
  return { title: saga ? `${saga.name} · cómo leerla — Biblioshare` : "Biblioshare" };
}

export default async function SagaReadingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ orden?: string; ruta?: string; rol?: string }>;
}) {
  const { id } = await params;
  const { orden, ruta, rol } = await searchParams;
  const t = await getTranslations("saga");
  const supabase = await createClient();
  const detail = await getSagaDetail(supabase, id);
  if (!detail) notFound();

  const activeRoute = resolveActiveRoute(detail, { ruta, orden });
  // Lente por rol: un valor desconocido degrada a «todos» en vez de dar 404.
  const activeRole: SagaItemRole | null = (SAGA_ITEM_ROLES as readonly string[]).includes(rol ?? "")
    ? (rol as SagaItemRole)
    : null;

  return (
    <div className={`${DETAIL_CONTAINER} flex flex-col gap-4 py-6`}>
      <header className="flex items-center gap-3">
        <Link href={sagaHref(id)} aria-label={t("backToSaga")} className="grid h-9 w-9 place-items-center rounded-lg border border-border">
          ‹
        </Link>
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.14em] text-accent uppercase">{t("readingEyebrow")}</p>
          <h1 className="truncate font-serif text-[22px] font-semibold">{detail.saga.name}</h1>
        </div>
      </header>
      <SagaMapTab
        detail={detail}
        activeRoute={activeRoute}
        canEdit={hasMinRole(detail.viewerRole, "collaborator")}
        activeRole={activeRole}
      />
    </div>
  );
}
