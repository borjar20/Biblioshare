import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { buttonVariants } from "@/components/ui/button";
import { LibraryFilters } from "@/components/library/library-filters";
import { LibraryItemCard } from "@/components/library/library-item-card";
import type { ItemType } from "@/lib/catalog/types";
import type { LibrarySort, MediaStatus } from "@/lib/library/types";
import {
  CollectionTabs,
  COLLECTION_TABS,
  type CollectionTab,
} from "./collection-tabs";
import { QueuesPanel } from "./queues-panel";

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

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <CollectionTabs active={tab} />

      {tab === "colas" ? (
        <QueuesPanel userId={user.id} activeParam={params.cola} />
      ) : (
        <LibraryGrid
          userId={user.id}
          itemType={tab === "general" ? undefined : tab}
          tab={tab}
          status={status}
          search={search}
          sort={sort}
          emptyLabel={tLibrary("empty")}
          emptyCta={tLibrary("emptyCta")}
        />
      )}
    </div>
  );
}

async function LibraryGrid({
  userId,
  itemType,
  tab,
  status,
  search,
  sort,
  emptyLabel,
  emptyCta,
}: {
  userId: string;
  itemType?: ItemType;
  tab: CollectionTab;
  status?: MediaStatus;
  search?: string;
  sort: LibrarySort;
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

  return (
    <>
      <LibraryFilters
        status={status}
        search={search}
        sort={sort}
        basePath="/coleccion"
        showTypeFilter={false}
        extraParams={tab === "general" ? undefined : { tab }}
      />

      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          <Link href="/buscar" className={buttonVariants("primary")}>
            {emptyCta}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <LibraryItemCard key={item.entryId} item={item} isOwner />
          ))}
        </div>
      )}
    </>
  );
}
