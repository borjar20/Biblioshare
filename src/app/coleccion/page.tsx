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
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

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
      ) : (
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

async function GeneralOverview({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [inProgress, summary] = await Promise.all([
    getLibraryItems(supabase, userId, { status: "in_progress" }),
    getLibrarySummary(supabase, userId),
  ]);

  return (
    <>
      <ContinueStrip items={inProgress} />
      <CollectionSummary summary={summary} />
    </>
  );
}

async function LibraryGrid({
  userId,
  itemType,
  status,
  search,
  sort,
  emptyTitle,
  emptyLabel,
  emptyCta,
}: {
  userId: string;
  itemType?: ItemType;
  status?: MediaStatus;
  search?: string;
  sort: LibrarySort;
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

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((item) => (
        <LibraryItemCard key={item.entryId} item={item} isOwner />
      ))}
    </div>
  );
}
