import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { hasMinRole } from "@/lib/auth/roles";
import { getSagaIndexData } from "@/lib/sagas/get-saga-index";
import {
  filterSagaIndex,
  type SagaIndexFilterParams,
  type SagaIndexType,
  type SagaIndexView,
} from "@/lib/sagas/filter-saga-index";
import { SagaIndexFilters } from "@/components/saga/saga-index-filters";
import { SagaIndexCard } from "@/components/saga/saga-index-card";
import { SagaLoadMore } from "@/components/saga/saga-load-more";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchIcon } from "@/components/ui/icons";
import { CARD_GRID_COLS, SHELL_GRID } from "@/lib/ui/layout";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Sagas — Biblioshare" };

const PAGE_SIZE = 12;
const VALID_VIEWS: SagaIndexView[] = ["todas", "sigo", "universos"];
const VALID_TYPES: SagaIndexType[] = ["libro", "pelicula", "serie"];

export default async function SagasIndexPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    vista?: string;
    tipo?: string;
    itinerarios?: string;
    coleccion?: string;
    min5?: string;
    n?: string;
  }>;
}) {
  const raw = await searchParams;
  const query = raw.q?.trim() ?? "";
  const filterParams: SagaIndexFilterParams = {
    vista: VALID_VIEWS.includes(raw.vista as SagaIndexView) ? (raw.vista as SagaIndexView) : "todas",
    tipos: (raw.tipo?.split(",") ?? []).filter((v): v is SagaIndexType =>
      VALID_TYPES.includes(v as SagaIndexType),
    ),
    itinerarios: raw.itinerarios === "1",
    coleccion: raw.coleccion === "1",
    min5: raw.min5 === "1",
  };
  const n = Math.max(PAGE_SIZE, Number(raw.n) || PAGE_SIZE);

  const t = await getTranslations("sagaIndex");
  const supabase = await createClient();
  const data = await getSagaIndexData(supabase, query);
  const canCurate = hasMinRole(data.viewerRole, "collaborator");

  const filtered = filterSagaIndex(data.cards, filterParams);
  const visible = filtered.slice(0, n);
  const universeCount = data.cards.filter((c) => c.children.length > 0).length;

  function loadMoreHref() {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    if (filterParams.vista !== "todas") qs.set("vista", filterParams.vista);
    if (filterParams.tipos.length > 0) qs.set("tipo", filterParams.tipos.join(","));
    if (filterParams.itinerarios) qs.set("itinerarios", "1");
    if (filterParams.coleccion) qs.set("coleccion", "1");
    if (filterParams.min5) qs.set("min5", "1");
    qs.set("n", String(n + PAGE_SIZE));
    return `/sagas?${qs.toString()}`;
  }

  return (
    // 1152 px: el índice es una REJILLA (a 896 px se quedaba en dos columnas
    // con media pantalla vacía en escritorio), no una columna de lectura como
    // /coleccion o /buscar. El marco del mockup es de 1240 px.
    <div className={`mx-auto flex w-full ${SHELL_GRID} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {/* «38 SAGAS · 6 UNIVERSOS · SIGUES 4»: el pulso del catálogo entero,
            no el del filtro activo (ese va en el pie). */}
        <p className="font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground uppercase">
          {t("headCountSagas", { count: data.cards.length })}
          {` · ${t("headCountUniverses", { count: universeCount })}`}
          {data.isAuthenticated && ` · ${t("headCountFollowing", { count: data.followedIds.size })}`}
        </p>
        <span className="ml-auto" />
        {canCurate && (
          <Link
            href="/sagas/nueva"
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
          >
            ＋ {t("new")}
          </Link>
        )}
      </div>

      <SagaIndexFilters search={query || undefined} params={filterParams} />

      {visible.length === 0 ? (
        <EmptyState
          glyph={<SearchIcon className="h-7 w-7" />}
          title={t("emptyTitle")}
          message={t("emptyDescription")}
        />
      ) : (
        <>
          {/* «El universo manda» (decisión 4 del rediseño): la tarjeta de una
              saga con subsagas ocupa dos columnas, porque encierra a sus hijas
              y necesita sitio para sus chips — la fila entera con dos columnas,
              dos de tres a partir de `lg`.
              `grid-flow-row-dense` tapa el hueco que deja esa tarjeta doble
              cuando la paridad no cuadra (era el caso de «Ciclo de Fafhrd»,
              solo en su fila con medio ancho vacío al lado): el hueco lo ocupa
              la siguiente tarjeta que quepa, a costa de alterar el alfabético
              en ese punto. */}
          <div className={`grid grid-flow-row-dense gap-2.5 ${CARD_GRID_COLS}`}>
            {visible.map((card) => (
              <div key={card.id} className={card.children.length > 0 ? "sm:col-span-2" : undefined}>
                <SagaIndexCard card={card} isAuthenticated={data.isAuthenticated} />
              </div>
            ))}
          </div>
          {filtered.length > visible.length ? (
            <SagaLoadMore
              href={loadMoreHref()}
              label={t("loadMore")}
              showingLabel={t("showingCount", { shown: visible.length, total: filtered.length })}
              skeletonCount={Math.min(PAGE_SIZE, filtered.length - visible.length)}
            />
          ) : (
            <div className="flex items-center gap-3 border-t border-border pt-4">
              <p className="text-[12.5px] text-muted-foreground">
                {t("showingCount", { shown: visible.length, total: filtered.length })}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
