import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { buttonVariants } from "@/components/ui/button";
import { LibraryFilters } from "@/components/library/library-filters";
import { LibraryItemCard } from "@/components/library/library-item-card";
import { EmptyState } from "@/components/ui/empty-state";
import { InboxIcon } from "@/components/ui/icons";
import type { ItemType } from "@/lib/catalog/types";
import type { LibrarySort, MediaStatus } from "@/lib/library/types";
import {
  CollectionTabs,
  COLLECTION_TABS,
  type CollectionTab,
} from "./collection-tabs";
import { QueuesPanel } from "./queues-panel";
import { ContinueStrip } from "@/components/library/continue-strip";
import { CollectionSummary } from "@/components/library/collection-summary";
import { FavoritesShelf } from "@/components/favorites-shelf";
import { getLibrarySummary } from "@/lib/library/get-library-summary";
import { SkeletonCoverGrid } from "@/components/ui/skeleton";
import {
  CollectionOverviewSkeleton,
  QueuesSkeleton,
} from "@/components/library/collection-skeletons";

export const metadata: Metadata = {
  title: "Tu colección — Biblioshare",
};

const VALID_STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];
const VALID_SORTS: LibrarySort[] = ["recent", "rating", "title"];

// Tu biblioteca. Las colas viven aquí dentro (§IA del rediseño Paper): son una
// forma de organizar los pendientes, no una sección aparte.
export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    status?: string;
    q?: string;
    sort?: string;
    cola?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const tab: CollectionTab = COLLECTION_TABS.includes(
    params.tab as CollectionTab,
  )
    ? (params.tab as CollectionTab)
    : "general";
  const status = VALID_STATUSES.includes(params.status as MediaStatus)
    ? (params.status as MediaStatus)
    : undefined;
  const search = params.q?.trim() || undefined;
  const sort: LibrarySort = VALID_SORTS.includes(params.sort as LibrarySort)
    ? (params.sort as LibrarySort)
    : "recent";

  const t = await getTranslations("collection");
  const tLibrary = await getTranslations("library");

  // Shell inmediato (título + pestañas + filtros); cada sección con datos
  // llega por streaming detrás de su <Suspense> con skeleton (Fase B del plan
  // de navegación). El `key` de los boundaries es la consulta: al cambiar un
  // filtro, la sección vuelve a mostrar su skeleton en vez de congelarse.
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Cabecera del frame A/C: barrita de acento + título serif + contador de
          títulos (mono). El contador llega por streaming para no bloquear el
          shell instantáneo (plan 00). */}
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-[22px] w-2 shrink-0 rounded-full bg-accent"
        />
        <h1 className="font-serif text-2xl font-semibold text-foreground lg:text-[28px]">
          {t("title")}
        </h1>
        <Suspense fallback={null}>
          <TitleCount userId={user.id} />
        </Suspense>
      </div>

      <CollectionTabs active={tab} />

      {/* En General y sin filtros aplicados: lo que tienes a medias, fijado
          arriba, y el resumen de la colección. Con un filtro activo se ocultan
          — contradirían lo que la rejilla está mostrando. */}
      {tab === "general" && !status && !search && (
        <Suspense fallback={<CollectionOverviewSkeleton />}>
          <GeneralOverview userId={user.id} />
        </Suspense>
      )}

      {tab === "colas" ? (
        <Suspense key={params.cola ?? "all"} fallback={<QueuesSkeleton />}>
          <QueuesPanel userId={user.id} activeParam={params.cola} />
        </Suspense>
      ) : tab === "general" && !status && !search ? (
        // General (limpio) = «Actualizado recientemente» sin filtros (frame A):
        // solo lo último tocado, en un grid más denso (3 col en móvil).
        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("recentlyUpdated")}
          </h2>
          <Suspense fallback={<SkeletonCoverGrid count={12} />}>
            <LibraryGrid
              userId={user.id}
              sort="recent"
              limit={12}
              variant="recent"
              emptyTitle={tLibrary("emptyTitle")}
              emptyLabel={tLibrary("empty")}
              emptyCta={tLibrary("emptyCta")}
            />
          </Suspense>
        </section>
      ) : (
        // Pestañas de tipo (o General con un ?status=/q= heredado de un enlace
        // viejo): filtros + rejilla completa.
        <>
          <LibraryFilters
            status={status}
            search={search}
            sort={sort}
            basePath="/coleccion"
            showTypeFilter={false}
            extraParams={tab === "general" ? undefined : { tab }}
          />
          <Suspense
            key={`${tab}:${status ?? ""}:${search ?? ""}:${sort}`}
            fallback={<SkeletonCoverGrid count={10} />}
          >
            <LibraryGrid
              userId={user.id}
              itemType={tab === "general" ? undefined : tab}
              status={status}
              search={search}
              sort={sort}
              emptyTitle={tLibrary("emptyTitle")}
              emptyLabel={tLibrary("empty")}
              emptyCta={tLibrary("emptyCta")}
            />
          </Suspense>
        </>
      )}
    </div>
  );
}

// Contador de títulos junto al h1 (frame C: "128 títulos"). Su propia consulta
// para no acoplarse al summary de GeneralOverview, que solo existe en General.
async function TitleCount({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [summary, t] = await Promise.all([
    getLibrarySummary(supabase, userId),
    getTranslations("collection"),
  ]);
  if (summary.total === 0) return null;
  return (
    <span className="font-mono text-xs tracking-wide text-muted-foreground">
      {t("titleCount", { count: summary.total })}
    </span>
  );
}

async function GeneralOverview({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [inProgress, summary, favorites] = await Promise.all([
    getLibraryItems(supabase, userId, { status: "in_progress" }),
    getLibrarySummary(supabase, userId),
    getLibraryItems(supabase, userId, { favoritesOnly: true }),
  ]);

  return (
    <>
      {/* Frame C: en escritorio la fila superior es [continuar | resumen] a
          1fr/320px; en móvil se apila. `items-start` para que la tarjeta de
          resumen no se estire a la altura de la columna de continuar. */}
      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-6">
        <ContinueStrip items={inProgress} />
        <CollectionSummary summary={summary} />
      </div>
      {/* Los destacados del dueño viven aquí, no en su perfil: el perfil propio
          pierde la pestaña Colección (plan 05, P2) y sin esta casa se
          quedarían sin sitio (D2). */}
      <FavoritesShelf items={favorites} />
    </>
  );
}

async function LibraryGrid({
  userId,
  itemType,
  status,
  search,
  sort,
  limit,
  variant = "type",
  emptyTitle,
  emptyLabel,
  emptyCta,
}: {
  userId: string;
  itemType?: ItemType;
  status?: MediaStatus;
  search?: string;
  sort: LibrarySort;
  limit?: number;
  // "type": rejilla de pestaña (2 col móvil, frame B); "recent": recientes de
  // General (3 col móvil, frame A). En escritorio ambas van a 5 (frame C).
  variant?: "type" | "recent";
  emptyTitle: string;
  emptyLabel: string;
  emptyCta: string;
}) {
  const supabase = await createClient();
  const items = await getLibraryItems(supabase, userId, {
    itemType,
    status,
    search,
    sort,
    limit,
  });

  if (items.length === 0) {
    return (
      <EmptyState
        glyph={<InboxIcon className="h-7 w-7" />}
        title={emptyTitle}
        message={emptyLabel}
        action={
          <Link href="/buscar" className={buttonVariants("primary")}>
            {emptyCta}
          </Link>
        }
      />
    );
  }

  const gridClass =
    variant === "recent"
      ? "grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-5"
      : "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";

  return (
    <div className={gridClass}>
      {items.map((item) => (
        <LibraryItemCard key={item.entryId} item={item} isOwner inCollection />
      ))}
    </div>
  );
}
