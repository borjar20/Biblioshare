import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { hasMinRole } from "@/lib/auth/roles";
import { sagaAtlasHref, sagaHref } from "@/lib/catalog/item-href";
import { getSagaDetail } from "@/lib/sagas/get-saga-detail";
import { getRouteEntries } from "@/lib/sagas/get-saga-routes";
import { deriveTimeline } from "@/lib/sagas/derive-timeline";
import { mainOrderFor, shelfRoutesFor } from "@/lib/sagas/shelf-sections";
import { resolveActiveRoute } from "@/lib/sagas/resolve-active-route";
import { deriveAtlas } from "@/lib/sagas/atlas/model";
import { itinerarySteps } from "@/lib/sagas/atlas/itinerary";
import { routeCounter } from "@/lib/sagas/atlas/route-counter";
import { atlasRoutes, legacyAtlasQuery } from "@/lib/sagas/atlas/lens";
import { SagaAtlas } from "@/components/saga/atlas/saga-atlas";
import { AtlasSkeleton } from "@/components/saga/atlas/atlas-skeleton";

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

type AtlasPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lente?: string; ruta?: string; orden?: string; rol?: string }>;
};

// Atlas de la saga (spec 2026-10-28). Sustituye al grafo y a «Cómo leerla».
// Sin `use cache` (regla #437): `detail` lleva estados y pases del lector.
// La página es un shell síncrono: `params`, `searchParams` y la sesión se leen
// dentro del <Suspense> (Cache Components: fuera de él bloquean la navegación,
// «uncached data during prerendering»). El fantasma es el suelo del atlas.
export default function SagaAtlasPage(props: AtlasPageProps) {
  return (
    <Suspense fallback={<AtlasSkeleton />}>
      <SagaAtlasContent {...props} />
    </Suspense>
  );
}

// Los `redirect`/`notFound` de aquí dentro ocurren ya en streaming: Next emite
// el redirect como meta en cliente y el 404 con el `not-found.tsx` del segmento
// (docs de `redirect` y `notFound`, Next 16). Solo redirige a la ficha si la
// saga no tiene obras (`shelfGraph` vacío): ya no mira `detail.graph` ni el
// interruptor `show_map` (spec §3 y §9).
async function SagaAtlasContent({ params, searchParams }: AtlasPageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const legacy = legacyAtlasQuery(sp);
  if (legacy) {
    // Nunca `/mapa?` con la query vacía (p. ej. `?orden=lectura` se traduce a nada).
    const base = sagaAtlasHref(id);
    redirect(legacy.size ? `${base}?${legacy}` : base);
  }

  const supabase = await createClient();
  const detail = await getSagaDetail(supabase, id);
  if (!detail) notFound();
  if (detail.shelfGraph.nodes.length === 0) redirect(sagaHref(id));

  const t = await getTranslations("saga");
  const routes = atlasRoutes(shelfRoutesFor(detail, t("orderReading")));
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
      // Sobre `shelfGraph` entero, no sobre `model`: con la preferencia apagada el modelo ya
      // no trae las opcionales, y el interruptor tiene que seguir ahí para volver a encenderla.
      optionalCount={detail.shelfGraph.nodes.filter((n) => n.kind === "item" && n.optional).length}
      showOptional={detail.showOptionalReadings}
      // «Publicación» no se ofrece como ruta (es una lente): quien la adoptó arranca en esa lente.
      defaultLens={detail.routeChoice === "publicacion" ? "publicacion" : "orden"}
    />
  );
}
