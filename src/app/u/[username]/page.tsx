import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getProfileByUsername } from "@/lib/profile/get-profile-by-username";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { getLibraryStats } from "@/lib/library/get-library-stats";
import { getMonthlyActivity } from "@/lib/diary/get-monthly-activity";
import { buttonVariants } from "@/components/ui/button";
import { LibraryFilters } from "./library-filters";
import type { ItemType } from "@/lib/catalog/types";
import type { LibrarySort, MediaStatus } from "@/lib/library/types";
import { ProfileHeader } from "@/components/profile-header";
import { SectionTabs, type SectionTab } from "@/components/section-tabs";
import { NowConsuming } from "@/components/now-consuming";
import { FavoritesShelf } from "@/components/favorites-shelf";
import { ActivityChart } from "@/components/activity-chart";
import { LibraryItemCard } from "./library-item-card";
import { VisibilityToggle } from "./visibility-toggle";

const VALID_TABS: SectionTab[] = ["overview", "book", "movie", "series"];
const VALID_STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];
const VALID_SORTS: LibrarySort[] = ["recent", "rating", "title"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username} — Biblioshare` };
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string; status?: string; q?: string; sort?: string }>;
}) {
  const { username } = await params;
  const parsedParams = await searchParams;
  const tab: SectionTab = VALID_TABS.includes(parsedParams.tab as SectionTab)
    ? (parsedParams.tab as SectionTab)
    : "overview";
  const status = VALID_STATUSES.includes(parsedParams.status as MediaStatus)
    ? (parsedParams.status as MediaStatus)
    : undefined;
  const search = parsedParams.q?.trim() || undefined;
  const sort: LibrarySort = VALID_SORTS.includes(parsedParams.sort as LibrarySort)
    ? (parsedParams.sort as LibrarySort)
    : "recent";

  const t = await getTranslations("profile");
  const tLibrary = await getTranslations("library");
  const supabase = await createClient();

  const [profile, {
    data: { user },
  }] = await Promise.all([
    getProfileByUsername(supabase, username),
    supabase.auth.getUser(),
  ]);

  if (!profile) notFound();

  const isOwner = user?.id === profile.userId;
  const basePath = `/u/${profile.username}`;
  const itemType: ItemType | undefined = tab === "overview" ? undefined : tab;

  const [items, stats, inProgress, months, favorites] = await Promise.all([
    tab === "overview"
      ? getLibraryItems(supabase, profile.userId, {})
      : getLibraryItems(supabase, profile.userId, { itemType, status, search, sort }),
    getLibraryStats(supabase, profile.userId),
    tab === "overview"
      ? getLibraryItems(supabase, profile.userId, { status: "in_progress" })
      : Promise.resolve([]),
    tab === "overview"
      ? getMonthlyActivity(supabase, profile.userId)
      : Promise.resolve([]),
    getLibraryItems(supabase, profile.userId, { favoritesOnly: true }),
  ]);

  const gridItems = tab === "overview" ? items.slice(0, 6) : items;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <ProfileHeader profile={profile} stats={stats} isOwner={isOwner} />

      <FavoritesShelf items={favorites} />

      {isOwner && (
        <VisibilityToggle username={profile.username} isPublic={profile.isPublic} />
      )}

      <SectionTabs active={tab} basePath={basePath} />

      {tab === "overview" && (
        <>
          <NowConsuming items={inProgress} />
          <ActivityChart months={months} />
        </>
      )}

      {tab !== "overview" && (
        <LibraryFilters
          status={status}
          search={search}
          sort={sort}
          basePath={basePath}
          showTypeFilter={false}
          extraParams={{ tab }}
        />
      )}

      {items.length === 0 ? (
        isOwner ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">{tLibrary("empty")}</p>
            <Link href="/buscar" className={buttonVariants("primary")}>
              {tLibrary("emptyCta")}
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {tab === "overview" && (
            <h2 className="text-lg font-semibold tracking-tight">
              {t("recentlyUpdated")}
            </h2>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {gridItems.map((item) => (
              <LibraryItemCard key={item.entryId} item={item} isOwner={isOwner} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
