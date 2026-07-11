import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { getWeeklyActivity } from "@/lib/stats/get-weekly-activity";
import { getStreaks } from "@/lib/stats/get-streaks";
import { getMonthCalendar } from "@/lib/stats/get-month-calendar";
import { getAnnualCompleted } from "@/lib/stats/get-annual-completed";
import { getFeed } from "@/lib/social/feed";
import { NowConsuming } from "@/components/now-consuming";
import { WeeklyStrip } from "@/components/stats/weekly-strip";
import { StreakCard } from "@/components/stats/streak-card";
import { MonthCalendar } from "@/components/stats/month-calendar";
import { AnnualStats } from "@/components/stats/annual-stats";
import { GoalsForm } from "@/components/stats/goals-form";
import { HomeTabs } from "@/components/home/home-tabs";
import { FeedFilters } from "@/components/social/feed-filters";
import { FeedList } from "@/components/social/feed-list";
import { AppLogoIcon, SparklesIcon } from "@/components/ui/icons";
import type { ItemType } from "@/lib/catalog/types";

const MONTH_RE = /^\d{4}-\d{2}$/;
const ITEM_TYPES: readonly string[] = ["book", "movie", "series"];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    tab?: string;
    itemType?: string;
    reviewsOnly?: string;
  }>;
}) {
  const {
    month: monthParam,
    tab: tabParam,
    itemType: itemTypeParam,
    reviewsOnly: reviewsOnlyParam,
  } = await searchParams;
  const t = await getTranslations();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-border bg-surface shadow-sm">
            <AppLogoIcon className="h-10 w-10 text-accent" />
          </div>
          <SparklesIcon className="absolute -right-2 -top-2 h-6 w-6 text-accent" />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("common.appName")}
        </h1>
        <p className="max-w-md text-lg text-muted-foreground">
          {t("home.tagline")}
        </p>
        <Link href="/signup" className={buttonVariants("primary", "px-6")}>
          {t("home.cta")}
        </Link>
      </div>
    );
  }

  const activeTab = tabParam === "following" ? "following" : "panel";
  const itemType = ITEM_TYPES.includes(itemTypeParam ?? "")
    ? (itemTypeParam as ItemType)
    : undefined;
  const reviewsOnly = reviewsOnlyParam === "1";

  const profile = await getOwnProfile(supabase, user.id);

  let panelContent: ReactNode;
  let followingContent: ReactNode;

  if (activeTab === "panel") {
    const [inProgress, weekly, streaks, calendar, annual] = await Promise.all([
      getLibraryItems(supabase, user.id, { status: "in_progress" }),
      getWeeklyActivity(supabase, user.id),
      getStreaks(supabase, user.id),
      getMonthCalendar(
        supabase,
        user.id,
        MONTH_RE.test(monthParam ?? "")
          ? (monthParam as string)
          : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
      ),
      getAnnualCompleted(supabase, user.id, new Date().getFullYear()),
    ]);

    panelContent = (
      <div className="grid gap-8">
        <div className="grid gap-4 rounded-lg border border-border bg-surface p-4">
          <NowConsuming items={inProgress} linkToSession />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-4">
            <WeeklyStrip
              days={weekly}
              dailyGoalMinutes={profile?.dailyGoalMinutes ?? null}
            />
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <StreakCard streaks={streaks} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-4">
            <MonthCalendar initialCalendar={calendar} basePath="/" />
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <AnnualStats
              annual={annual}
              annualGoals={
                profile?.annualGoals ?? { book: null, movie: null, series: null }
              }
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <GoalsForm
            dailyGoalMinutes={profile?.dailyGoalMinutes ?? null}
            annualGoals={
              profile?.annualGoals ?? { book: null, movie: null, series: null }
            }
          />
        </div>
      </div>
    );
    followingContent = null;
  } else {
    const feedPage = await getFeed(supabase, user.id, {
      itemType,
      reviewsOnly,
      pageSize: 20,
    });

    followingContent = (
      <div className="flex flex-col gap-4">
        <FeedFilters itemType={itemType} reviewsOnly={reviewsOnly} />
        <FeedList
          initialEvents={feedPage.events}
          initialCursor={feedPage.nextCursor}
          itemType={itemType}
          reviewsOnly={reviewsOnly}
          viewerLoggedIn={true}
        />
      </div>
    );
    panelContent = null;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-10 w-1 shrink-0 rounded-full bg-accent"
        />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("home.welcome")}
          </h1>
          <p className="text-sm text-muted-foreground">@{profile?.username}</p>
        </div>
      </div>

      <HomeTabs
        labels={{ panel: t("home.tabs.panel"), following: t("home.tabs.following") }}
        panel={panelContent}
        following={followingContent}
      />
    </div>
  );
}
