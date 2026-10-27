// src/app/saga/[id]/page.tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { hasMinRole } from "@/lib/auth/roles";
import { sagaHref, sagaReadingHref } from "@/lib/catalog/item-href";
import { getSagaDetail } from "@/lib/sagas/get-saga-detail";
import { deriveShelf } from "@/lib/sagas/derive-shelf";
import { getSagaPassage } from "@/lib/sagas/get-saga-passage";
import { parseItemKey } from "@/lib/sagas/derive-map";
import { deriveSubsagaDoors } from "@/lib/sagas/subsaga-doors";
import { miniMapPoints } from "@/lib/sagas/mini-map";
import { getShelfSections, shelfRoutesFor } from "@/lib/sagas/shelf-sections";
import { resolveActiveRoute } from "@/lib/sagas/resolve-active-route";
import { DETAIL_CONTAINER } from "@/components/detail/detail-container";
import { SagaHeroCinematic } from "@/components/saga/ficha/saga-hero-cinematic";
import { SagaCuratorMenu } from "@/components/saga/ficha/saga-curator-menu";
import { SagaShelf } from "@/components/saga/ficha/saga-shelf";
import { NextUpCard } from "@/components/saga/ficha/next-up-card";
import { SagaAbout } from "@/components/saga/ficha/saga-about";
import { SagaAllWorks } from "@/components/saga/ficha/saga-all-works";
import { YourAverage } from "@/components/saga/ficha/your-average";
import { YourPassage, YourPassageSkeleton } from "@/components/saga/ficha/your-passage";
import { SubsagaDoors } from "@/components/saga/ficha/subsaga-doors";
import { AtlasTeaser } from "@/components/saga/ficha/atlas-teaser";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: saga } = await supabase.from("sagas").select("name").eq("id", id).maybeSingle();
  return { title: saga ? `${saga.name} — Biblioshare` : "Biblioshare" };
}

// Ficha de saga para el lector (spec 2026-10-27). Composición plana: cada
// bloque recibe ya calculado lo que pinta. Sin `use cache` (regla #437).
export default async function SagaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; orden?: string; ruta?: string; rol?: string }>;
}) {
  const { id } = await params;
  const { tab, orden, ruta, rol } = await searchParams;

  // Enlaces viejos a la pestaña «Mapa de lectura»: su contenido vive ahora en
  // «Cómo leerla», con los mismos parámetros.
  if (tab === "mapa") {
    const q = new URLSearchParams();
    if (ruta) q.set("ruta", ruta);
    if (orden) q.set("orden", orden);
    if (rol) q.set("rol", rol);
    const qs = q.toString();
    redirect(qs ? `${sagaReadingHref(id)}?${qs}` : sagaReadingHref(id));
  }

  const supabase = await createClient();
  const detail = await getSagaDetail(supabase, id);
  if (!detail) notFound();
  const canCurate = hasMinRole(detail.viewerRole, "collaborator");
  // La balda ofrece «Orden de lectura» aunque el mapa esté apagado (decisión
  // #3: el interruptor esconde el mapa, no el orden); ver shelfRoutesFor.
  const t = await getTranslations("saga");
  const shelfRoutes = shelfRoutesFor(detail, t("orderReading"));
  const activeRoute = resolveActiveRoute({ routes: shelfRoutes, routeChoice: detail.routeChoice }, { ruta, orden });

  const [sections, backdropUrl] = await Promise.all([
    getShelfSections(supabase, detail, activeRoute),
    firstMovieBackdrop(supabase, detail),
  ]);
  const shelf = deriveShelf(sections, { authenticated: detail.isAuthenticated });

  // Orden de la balda en formato `tipo:id` para «Tu paso». El id de nodo de la
  // balda es `i:<tipo>:<uuid>` (derive-map.ts, itemKey); parseItemKey lo
  // deshace. Los extras (opcionales sin número) también cuentan.
  const order = shelf.groups
    .flatMap((g) => [...g.slots.flatMap((s) => (s.kind === "tandem" ? s.works : [s.work])), ...g.extras])
    .flatMap((w) => {
      const ref = parseItemKey(w.key);
      return ref
        ? [{ key: `${ref.itemType}:${ref.itemId}`, title: w.title, href: w.href, optional: w.optional, skipped: w.skipped }]
        : [];
    });
  // Sin await: la promesa la consumen dos islas en <Suspense> y el hero y la
  // balda no esperan a esta lectura (regla #437: depende de la sesión).
  // «Tu paso» es accesorio: si la lectura falla, la ficha sigue sin él.
  const passage = getSagaPassage(supabase, detail, order).catch((e) => {
    console.error("getSagaPassage", e);
    return null;
  });
  const doors = deriveSubsagaDoors(detail.groups);

  return (
    <div className="flex w-full flex-col pb-12">
      <SagaHeroCinematic
        detail={detail}
        backdropUrl={backdropUrl}
        curatorMenu={canCurate ? <SagaCuratorMenu sagaId={detail.saga.id} hasParent={detail.parent !== null} /> : null}
      />
      <div className={`${DETAIL_CONTAINER} flex flex-col gap-8`}>
        <SagaShelf
          shelf={shelf}
          sagaName={detail.saga.name}
          routes={shelfRoutes.map((r) => ({ slug: r.slug, name: r.name }))}
          activeRoute={activeRoute}
          baseHref={sagaHref(detail.saga.id)}
          readingHref={`${sagaReadingHref(detail.saga.id)}?ruta=${encodeURIComponent(activeRoute)}`}
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <NextUpCard
            shelf={shelf}
            finishedExtra={
              <Suspense fallback={null}>
                <YourAverage passage={passage} />
              </Suspense>
            }
          />
          {/* Columna derecha reservada a «Entre amigos» (fase 3). */}
        </div>
        <SagaAbout detail={detail} canConfigure={canCurate} />
        <Suspense fallback={detail.isAuthenticated ? <YourPassageSkeleton /> : null}>
          <YourPassage passage={passage} sagaName={detail.saga.name} />
        </Suspense>
        <SubsagaDoors doors={doors} authenticated={detail.isAuthenticated} />
        {detail.graph && <AtlasTeaser href={`${sagaHref(detail.saga.id)}/mapa`} map={miniMapPoints(detail.graph)} />}
        <section>
          <SagaAllWorks groups={detail.groups} windows={detail.windows} />
        </section>
      </div>
    </div>
  );
}

// Backdrop de TMDB de la primera película de la saga que lo tenga (spec §1).
// Una consulta pequeña y con sesión: las películas son catálogo público, pero
// no hay `use cache` en esta página (regla #437) y no hace falta ninguno.
async function firstMovieBackdrop(
  supabase: Awaited<ReturnType<typeof createClient>>,
  detail: NonNullable<Awaited<ReturnType<typeof getSagaDetail>>>,
): Promise<string | null> {
  const movies = detail.groups.flatMap((g) => g.members).filter((m) => m.itemType === "movie");
  if (movies.length === 0) return null;
  const { data } = await supabase
    .from("movies")
    .select("id, backdrop_url, release_year")
    .in("id", movies.map((m) => m.itemId))
    .not("backdrop_url", "is", null)
    .order("release_year", { ascending: true, nullsFirst: false })
    .limit(1);
  return (data?.[0]?.backdrop_url as string | undefined) ?? null;
}
