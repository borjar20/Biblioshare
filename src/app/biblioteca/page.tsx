import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { getLibraryStats } from "@/lib/library/get-library-stats";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { getMonthlyActivity } from "@/lib/diary/get-monthly-activity";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { ProfileHeader } from "@/components/profile-header";
import { SectionTabs, type SectionTab } from "@/components/section-tabs";
import { NowConsuming } from "@/components/now-consuming";
import { ActivityChart } from "@/components/activity-chart";
import { LibraryFilters } from "./library-filters";
import { LibraryItemCard } from "./library-item-card";

export const metadata: Metadata = {
  title: "Mi biblioteca — Biblioshare",
};

const VALID_TABS: SectionTab[] = ["overview", "book", "movie", "series"];
const VALID_STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string }>;
}) {
  const params = await searchParams;
  const tab: SectionTab = VALID_TABS.includes(params.tab as SectionTab)
    ? (params.tab as SectionTab)
    : "overview";
  const status = VALID_STATUSES.includes(params.status as MediaStatus)
    ? (params.status as MediaStatus)
    : undefined;

  const t = await getTranslations("library");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy guarantees a session on this route; this keeps the type narrow.
  if (!user) return null;

  const profile = await getOwnProfile(supabase, user.id);
  if (!profile) return null;

  const stats = await getLibraryStats(supabase, user.id);

  const itemType: ItemType | undefined = tab === "overview" ? undefined : tab;

  const [items, inProgress, months] = await Promise.all([
    tab === "overview"
      ? getLibraryItems(supabase, user.id, {})
      : getLibraryItems(supabase, user.id, { itemType, status }),
    tab === "overview"
      ? getLibraryItems(supabase, user.id, { status: "in_progress" })
      : Promise.resolve([]),
    tab === "overview"
      ? getMonthlyActivity(supabase, user.id)
      : Promise.resolve([]),
  ]);

  const gridItems = tab === "overview" ? items.slice(0, 6) : items;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <ProfileHeader profile={profile} stats={stats} isOwner />

      <SectionTabs active={tab} basePath="/biblioteca" />

      {tab === "overview" && (
        <>
          <NowConsuming items={inProgress} />
          <ActivityChart months={months} />
        </>
      )}

      {tab !== "overview" && (
        <LibraryFilters
          status={status}
          showTypeFilter={false}
          extraParams={{ tab }}
        />
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
          <Link href="/buscar" className={buttonVariants("primary")}>
            {t("emptyCta")}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tab === "overview" && (
            <h2 className="text-lg font-semibold tracking-tight">
              {t("recentlyUpdated")}
            </h2>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {gridItems.map((item) => (
              <LibraryItemCard key={item.entryId} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
