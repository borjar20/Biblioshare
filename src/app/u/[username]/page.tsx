import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
  getProfileByUsername,
  getProfileIdentity,
  getOwnProfile,
} from "@/lib/profile/get-profile-by-username";
import {
  getFollowCounts,
  getFollowState,
  getPendingRequests,
} from "@/lib/social/follows";
import { FollowButton } from "@/components/social/follow-button";
import { FollowRequests } from "@/components/social/follow-requests";
import { PrivateProfileStub } from "@/components/social/private-profile-stub";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { getLibraryStats } from "@/lib/library/get-library-stats";
import { getMonthlyActivity } from "@/lib/diary/get-monthly-activity";
import { getWeeklyActivity } from "@/lib/stats/get-weekly-activity";
import { getStreaks } from "@/lib/stats/get-streaks";
import { getMonthCalendar } from "@/lib/stats/get-month-calendar";
import { getAnnualCompleted } from "@/lib/stats/get-annual-completed";
import { getChallenges } from "@/lib/challenges/get-challenges";
import { getChallengeProgress } from "@/lib/challenges/get-challenge-progress";
import { buttonVariants } from "@/components/ui/button";
import { LibraryFilters } from "@/components/library/library-filters";
import { LibraryItemCard } from "@/components/library/library-item-card";
import type { ItemType } from "@/lib/catalog/types";
import type { LibrarySort, MediaStatus } from "@/lib/library/types";
import { ProfileHeader } from "@/components/profile-header";
import { SectionTabs, type SectionTab } from "@/components/section-tabs";
import { LockIcon, InboxIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { NowConsuming } from "@/components/now-consuming";
import { FavoritesShelf } from "@/components/favorites-shelf";
import { ActivityChart } from "@/components/activity-chart";
import { ProfileStatCards } from "@/components/profile-stat-cards";
import { WeeklyStrip } from "@/components/stats/weekly-strip";
import { StreakCard } from "@/components/stats/streak-card";
import { MonthCalendar } from "@/components/stats/month-calendar";
import { AnnualStats } from "@/components/stats/annual-stats";
import { GoalsForm } from "@/components/stats/goals-form";
import { ChallengeCard } from "@/components/challenges/challenge-card";
import { NewChallenge } from "@/components/challenges/new-challenge";
import { VisibilityToggle } from "./visibility-toggle";

const VALID_TABS: SectionTab[] = ["panel", "coleccion", "actividad"];
const VALID_TYPES: ItemType[] = ["book", "movie", "series"];
const VALID_STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];
const VALID_SORTS: LibrarySort[] = ["recent", "rating", "title"];
const MONTH_RE = /^\d{4}-\d{2}$/;

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

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
  searchParams: Promise<{
    tab?: string;
    type?: string;
    status?: string;
    q?: string;
    sort?: string;
    month?: string;
    archivados?: string;
  }>;
}) {
  const { username } = await params;
  const parsedParams = await searchParams;

  const t = await getTranslations("profile");
  const tLibrary = await getTranslations("library");
  const tChallenges = await getTranslations("challenges");
  const tAdmin = await getTranslations("admin");
  const supabase = await createClient();

  const [
    profile,
    {
      data: { user },
    },
  ] = await Promise.all([
    getProfileByUsername(supabase, username),
    supabase.auth.getUser(),
  ]);

  // Perfil privado no visible para este visitante (ni dueño ni seguidor
  // aceptado): stub de identidad + solicitar-seguir (modelo Instagram, EPIC-05).
  if (!profile) {
    const identity = await getProfileIdentity(supabase, username);
    if (!identity) notFound();
    const followState = await getFollowState(
      supabase,
      user?.id ?? null,
      identity.userId,
    );
    return (
      <PrivateProfileStub
        identity={identity}
        followState={followState}
        viewerLoggedIn={!!user}
      />
    );
  }

  const isOwner = user?.id === profile.userId;
  const basePath = `/u/${profile.username}`;

  // El Panel es privado: un visitante no puede pedirlo por URL, y su pestaña
  // por defecto es la Colección.
  const requestedTab = VALID_TABS.includes(parsedParams.tab as SectionTab)
    ? (parsedParams.tab as SectionTab)
    : null;
  const tab: SectionTab =
    requestedTab && (isOwner || requestedTab !== "panel")
      ? requestedTab
      : isOwner
        ? "panel"
        : "coleccion";

  const itemType = VALID_TYPES.includes(parsedParams.type as ItemType)
    ? (parsedParams.type as ItemType)
    : undefined;
  const status = VALID_STATUSES.includes(parsedParams.status as MediaStatus)
    ? (parsedParams.status as MediaStatus)
    : undefined;
  const search = parsedParams.q?.trim() || undefined;
  const sort: LibrarySort = VALID_SORTS.includes(
    parsedParams.sort as LibrarySort,
  )
    ? (parsedParams.sort as LibrarySort)
    : "recent";

  const [counts, followState, pendingRequests, stats, favorites] =
    await Promise.all([
      getFollowCounts(supabase, profile.userId),
      getFollowState(supabase, user?.id ?? null, profile.userId),
      isOwner
        ? getPendingRequests(supabase, profile.userId)
        : Promise.resolve([]),
      getLibraryStats(supabase, profile.userId),
      getLibraryItems(supabase, profile.userId, { favoritesOnly: true }),
    ]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <ProfileHeader
        profile={profile}
        stats={stats}
        isOwner={isOwner}
        counts={counts}
        followButton={
          !isOwner ? (
            <FollowButton
              targetUserId={profile.userId}
              targetIsPublic={profile.isPublic}
              state={followState}
              viewerLoggedIn={!!user}
            />
          ) : undefined
        }
      />

      {isOwner && <FollowRequests requests={pendingRequests} />}

      {isOwner && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <VisibilityToggle
            username={profile.username}
            isPublic={profile.isPublic}
          />
          {/* Admin salió del nav en el rediseño Paper: es una ruta oculta y su
              única entrada es esta, en tu propio perfil. */}
          {profile.role === "admin" && (
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 font-mono text-xs tracking-wider text-muted-foreground uppercase underline hover:text-foreground"
            >
              <LockIcon className="h-3.5 w-3.5" />
              {tAdmin("navLabel")}
            </Link>
          )}
        </div>
      )}

      <SectionTabs active={tab} basePath={basePath} isOwner={isOwner} />

      {tab === "panel" && (
        <OwnerPanel
          userId={profile.userId}
          monthParam={parsedParams.month}
          includeArchived={parsedParams.archivados === "1"}
          basePath={basePath}
          privateNote={t("panelPrivateNote")}
          challengesTitle={tChallenges("title")}
          challengesEmpty={tChallenges("empty")}
          archivedLabel={
            parsedParams.archivados === "1"
              ? tChallenges("hideArchived")
              : tChallenges("showArchived")
          }
        />
      )}

      {tab === "coleccion" && (
        <CollectionTab
          userId={profile.userId}
          isOwner={isOwner}
          basePath={basePath}
          itemType={itemType}
          status={status}
          search={search}
          sort={sort}
          emptyOwnTitle={tLibrary("emptyTitle")}
          emptyOwn={tLibrary("empty")}
          emptyOwnCta={tLibrary("emptyCta")}
          emptyOtherTitle={t("emptyTitle")}
          emptyOther={t("empty")}
        />
      )}

      {tab === "actividad" && (
        <ActivityTab
          userId={profile.userId}
          isOwner={isOwner}
          favorites={favorites}
          stats={stats}
        />
      )}
    </div>
  );
}

// Panel privado: el dashboard que vivía en la home, más los retos personales.
async function OwnerPanel({
  userId,
  monthParam,
  includeArchived,
  basePath,
  privateNote,
  challengesTitle,
  challengesEmpty,
  archivedLabel,
}: {
  userId: string;
  monthParam?: string;
  includeArchived: boolean;
  basePath: string;
  privateNote: string;
  challengesTitle: string;
  challengesEmpty: string;
  archivedLabel: string;
}) {
  const supabase = await createClient();
  const ownProfile = await getOwnProfile(supabase, userId);

  const [inProgress, weekly, streaks, calendar, annual, challenges] =
    await Promise.all([
      getLibraryItems(supabase, userId, { status: "in_progress" }),
      getWeeklyActivity(supabase, userId),
      getStreaks(supabase, userId),
      getMonthCalendar(
        supabase,
        userId,
        MONTH_RE.test(monthParam ?? "")
          ? (monthParam as string)
          : currentMonthKey(),
      ),
      getAnnualCompleted(supabase, userId, new Date().getFullYear()),
      getChallenges(supabase, userId, { includeArchived }),
    ]);

  const challengeProgress = await getChallengeProgress(
    supabase,
    userId,
    challenges,
  );

  const annualGoals = ownProfile?.annualGoals ?? {
    book: null,
    movie: null,
    series: null,
  };

  return (
    <div className="grid gap-8">
      <p className="inline-flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2 font-mono text-xs text-muted-foreground">
        {privateNote}
      </p>

      <div className="grid gap-4 rounded-lg border border-border bg-surface p-4">
        <NowConsuming items={inProgress} linkToSession />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <WeeklyStrip
            days={weekly}
            dailyGoalMinutes={ownProfile?.dailyGoalMinutes ?? null}
          />
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <StreakCard streaks={streaks} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          {/* basePath es la base de la API (`${basePath}api/month-calendar`),
              no una ruta de página — se queda en "/". */}
          <MonthCalendar initialCalendar={calendar} basePath="/" />
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <AnnualStats annual={annual} annualGoals={annualGoals} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <GoalsForm
          dailyGoalMinutes={ownProfile?.dailyGoalMinutes ?? null}
          annualGoals={annualGoals}
        />
      </div>

      {/* Retos personales: viven en el Panel (§IA del rediseño Paper). */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">
          {challengesTitle}
        </h2>
        <NewChallenge />
        {challengeProgress.length === 0 ? (
          <p className="text-sm text-muted-foreground">{challengesEmpty}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {challengeProgress.map((p) => (
              <ChallengeCard key={p.challenge.id} progress={p} />
            ))}
          </div>
        )}
        <Link
          href={
            includeArchived
              ? `${basePath}?tab=panel`
              : `${basePath}?tab=panel&archivados=1`
          }
          className="self-start text-sm text-muted-foreground underline hover:text-foreground"
        >
          {archivedLabel}
        </Link>
      </div>
    </div>
  );
}

async function CollectionTab({
  userId,
  isOwner,
  basePath,
  itemType,
  status,
  search,
  sort,
  emptyOwnTitle,
  emptyOwn,
  emptyOwnCta,
  emptyOtherTitle,
  emptyOther,
}: {
  userId: string;
  isOwner: boolean;
  basePath: string;
  itemType?: ItemType;
  status?: MediaStatus;
  search?: string;
  sort: LibrarySort;
  emptyOwnTitle: string;
  emptyOwn: string;
  emptyOwnCta: string;
  emptyOtherTitle: string;
  emptyOther: string;
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
        itemType={itemType}
        status={status}
        search={search}
        sort={sort}
        basePath={basePath}
        extraParams={{ tab: "coleccion" }}
      />

      {items.length === 0 ? (
        <EmptyState
          glyph={<InboxIcon className="h-7 w-7" />}
          title={isOwner ? emptyOwnTitle : emptyOtherTitle}
          message={isOwner ? emptyOwn : emptyOther}
          action={
            isOwner ? (
              <Link href="/buscar" className={buttonVariants("primary")}>
                {emptyOwnCta}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <LibraryItemCard
              key={item.entryId}
              item={item}
              isOwner={isOwner}
            />
          ))}
        </div>
      )}
    </>
  );
}

// Actividad: la cara pública del perfil.
async function ActivityTab({
  userId,
  isOwner,
  favorites,
  stats,
}: {
  userId: string;
  isOwner: boolean;
  favorites: Awaited<ReturnType<typeof getLibraryItems>>;
  stats: Awaited<ReturnType<typeof getLibraryStats>>;
}) {
  const supabase = await createClient();
  const [inProgress, months] = await Promise.all([
    getLibraryItems(supabase, userId, { status: "in_progress" }),
    getMonthlyActivity(supabase, userId),
  ]);

  return (
    <>
      <NowConsuming items={inProgress} linkToSession={isOwner} />
      <FavoritesShelf items={favorites} />
      <ActivityChart months={months} />
      <ProfileStatCards stats={stats} />
    </>
  );
}
