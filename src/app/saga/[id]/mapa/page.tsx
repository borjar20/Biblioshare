import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { hasMinRole } from "@/lib/auth/roles";
import { sagaHref } from "@/lib/catalog/item-href";
import { getSagaDetail } from "@/lib/sagas/get-saga-detail";
import { getRouteEntries } from "@/lib/sagas/get-saga-routes";
import { deriveTimeline } from "@/lib/sagas/derive-timeline";
import { mainOrderFor, shelfRoutesFor } from "@/lib/sagas/shelf-sections";
import { resolveActiveRoute } from "@/lib/sagas/resolve-active-route";
import { deriveAtlas } from "@/lib/sagas/atlas/model";
import { itinerarySteps } from "@/lib/sagas/atlas/itinerary";
import { routeCounter } from "@/lib/sagas/atlas/route-counter";
import { legacyAtlasQuery } from "@/lib/sagas/atlas/lens";
import { SagaAtlas } from "@/components/saga/atlas/saga-atlas";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: saga } = await supabase.from("sagas").select("name").eq("id", id).maybeSingle();
  return { title: saga ? `${saga.name} · Atlas — Biblioshare` : "Biblioshare" };
}

// Atlas de la saga (spec 2026-10-28). Sustituye al grafo y a «Cómo leerla».
// Sin `use cache` (regla #437): `detail` lleva estados y pases del lector.
// Solo redirige a la ficha si la saga no tiene obras (`shelfGraph` vacío): ya no
// mira `detail.graph` ni el interruptor `show_map` (spec §3 y §9).
export default async function SagaAtlasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lente?: string; ruta?: string; orden?: string; rol?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const legacy = legacyAtlasQuery(sp);
  if (legacy) {
    // Nunca `/mapa?` con la query vacía (p. ej. `?orden=lectura` se traduce a nada).
    const base = `${sagaHref(id)}/mapa`;
    redirect(legacy.size ? `${base}?${legacy}` : base);
  }

  const supabase = await createClient();
  const detail = await getSagaDetail(supabase, id);
  if (!detail) notFound();
  if (detail.shelfGraph.nodes.length === 0) redirect(sagaHref(id));

  const t = await getTranslations("saga");
  // «Publicación» ya es una lente: no se ofrece como itinerario.
  const routes = shelfRoutesFor(detail, t("orderReading")).filter((r) => r.slug !== "publicacion");
  const activeRoute = resolveActiveRoute({ routes, routeChoice: detail.routeChoice }, { ruta: sp.ruta });
  const row = routes.find((r) => r.slug === activeRoute && r.id !== undefined);
  const entries = row?.id ? await getRouteEntries(supabase, row.id) : null;

  const sections = deriveTimeline(detail.shelfGraph, {
    authenticated: detail.isAuthenticated,
    showOptional: detail.showOptionalReadings,
  });
  const years = new Map(detail.groups.flatMap((g) => g.members).map((m) => [`i:${m.itemType}:${m.itemId}`, m.year] as const));
  const model = deriveAtlas({
    sections,
    authenticated: detail.isAuthenticated,
    years,
    steps: entries ? itinerarySteps(entries, mainOrderFor(detail)) : null,
  });

  return (
    <SagaAtlas
      sagaId={id}
      sagaName={detail.saga.name}
      workCount={detail.memberCount}
      model={model}
      authenticated={detail.isAuthenticated}
      routes={routes.map((r) => ({ slug: r.slug, name: r.name, summary: r.summary, curated: r.id !== undefined }))}
      activeRoute={activeRoute}
      adoptedRoute={detail.routeChoice}
      counter={entries ? routeCounter(detail, entries) : null}
      canEdit={hasMinRole(detail.viewerRole, "collaborator")}
    />
  );
}
