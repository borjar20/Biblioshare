import type { Metadata } from "next";
import { Suspense } from "react";
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
import { ContinueStrip } from "@/components/library/continue-strip";
import { CollectionSummary } from "@/components/library/collection-summary";
import { getLibrarySummary } from "@/lib/library/get-library-summary";
import type { ItemType } from "@/lib/catalog/types";
import type { LibrarySort, MediaStatus } from "@/lib/library/types";
import { ProfileHeader } from "@/components/profile-header";
import { SectionTabs, type SectionTab } from "@/components/section-tabs";
import { LockIcon, InboxIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Skeleton,
  SkeletonLine,
  SkeletonCard,
  SkeletonCoverGrid,
} from "@/components/ui/skeleton";
import { NowConsuming } from "@/components/now-consuming";
import { FavoritesShelf } from "@/components/favorites-shelf";
import { ActivityChart } from "@/components/activity-chart";
import { FeedCard } from "@/components/social/feed-card";
import { getRecentReviews } from "@/lib/social/recent-reviews";
import { WeeklyStrip } from "@/components/stats/weekly-strip";
import { StreakCard } from "@/components/stats/streak-card";
import { BookGoalCard } from "@/components/stats/book-goal-card";
import { GoalRows } from "@/components/stats/goal-rows";
import { MonthCalendar } from "@/components/stats/month-calendar";
import { GoalsForm } from "@/components/stats/goals-form";
import { todayISO } from "@/lib/stats/dates";
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

  // Solo lo que necesita la cabecera se espera aquí; el contenido de cada
  // pestaña (panel, colección, actividad) llega por streaming detrás de su
  // <Suspense> (Fase B). `favorites` se movió dentro de ActivityTab.
  const [counts, followState, pendingRequests, stats] = await Promise.all([
    getFollowCounts(supabase, profile.userId),
    getFollowState(supabase, user?.id ?? null, profile.userId),
    isOwner
      ? getPendingRequests(supabase, profile.userId)
      : Promise.resolve([]),
    getLibraryStats(supabase, profile.userId),
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
        <Suspense fallback={<ProfileSectionSkeleton />}>
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
        </Suspense>
      )}

      {tab === "coleccion" && (
        <Suspense
          key={`${itemType ?? ""}:${status ?? ""}:${search ?? ""}:${sort}`}
          fallback={<SkeletonCoverGrid count={10} />}
        >
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
        </Suspense>
      )}

      {tab === "actividad" && (
        <Suspense fallback={<ProfileSectionSkeleton />}>
          <ActivityTab userId={profile.userId} viewerLoggedIn={!!user} />
        </Suspense>
      )}
    </div>
  );
}

// Fallback genérico para el Panel y la Actividad: un par de tarjetas skeleton.
function ProfileSectionSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <SkeletonCard>
        <SkeletonLine className="mb-4 w-32" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonLine className="mb-3 w-24" />
        <SkeletonLine className="w-full" />
        <SkeletonLine className="mt-2 w-3/4" />
      </SkeletonCard>
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
    <div className="grid gap-6">
      <p className="inline-flex items-center gap-2 rounded-lg border border-border bg-accent/5 px-3 py-2 text-[11px] text-muted-foreground">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
        {privateNote}
      </p>

      <NowConsuming items={inProgress} linkToSession variant="strip" />

      <div className="rounded-card border border-border bg-surface shadow-card p-4">
        <WeeklyStrip
          days={weekly}
          dailyGoalMinutes={ownProfile?.dailyGoalMinutes ?? null}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-border bg-surface shadow-card p-4">
          <StreakCard streaks={streaks} />
        </div>
        <div className="rounded-card border border-border bg-surface shadow-card p-4">
          <BookGoalCard
            completed={annual.byType.book}
            goal={annualGoals.book}
          />
        </div>
      </div>

      <div className="grid gap-4 rounded-card border border-border bg-surface shadow-card p-4">
        <GoalRows annual={annual} annualGoals={annualGoals} />
        <div className="border-t border-border" />
        <GoalsForm
          dailyGoalMinutes={ownProfile?.dailyGoalMinutes ?? null}
          annualGoals={annualGoals}
        />
      </div>

      <div className="rounded-card border border-border bg-surface shadow-card p-4">
        {/* basePath es la base de la API (`${basePath}api/month-calendar`),
            no una ruta de página — se queda en "/". */}
        <MonthCalendar
          initialCalendar={calendar}
          basePath="/"
          todayKey={todayISO()}
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
  // Sin filtros activos: "en curso" fijado + resumen encima de la rejilla,
  // como en /coleccion (mockup C). Con un filtro se ocultan — contradirían lo
  // que la rejilla está mostrando.
  const showOverview = !itemType && !status && !search;
  const [items, inProgress, summary] = await Promise.all([
    getLibraryItems(supabase, userId, {
      itemType,
      status,
      search,
      sort,
    }),
    showOverview
      ? getLibraryItems(supabase, userId, { status: "in_progress" })
      : Promise.resolve([]),
    showOverview ? getLibrarySummary(supabase, userId) : Promise.resolve(null),
  ]);

  return (
    <>
      {showOverview && (
        <>
          <ContinueStrip items={inProgress} />
          {summary && <CollectionSummary summary={summary} />}
        </>
      )}

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
  viewerLoggedIn,
}: {
  userId: string;
  viewerLoggedIn: boolean;
}) {
  const supabase = await createClient();
  const t = await getTranslations("profile");
  const [months, recentReviews, favorites] = await Promise.all([
    getMonthlyActivity(supabase, userId),
    getRecentReviews(supabase, userId),
    getLibraryItems(supabase, userId, { favoritesOnly: true }),
  ]);

  // Orden del mockup (frame D): gráfico anual → destacados → reseñas
  // recientes. "En curso" vive en Colección y los recuentos por tipo en los
  // chips de la cabecera — aquí ya no se repiten.
  return (
    <>
      <div className="rounded-card border border-border bg-surface shadow-card p-4">
        <ActivityChart months={months} />
      </div>
      <FavoritesShelf items={favorites} />
      {recentReviews.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("recentReviews")}
          </h2>
          {recentReviews.map((event) => (
            <FeedCard
              key={event.id}
              event={event}
              viewerLoggedIn={viewerLoggedIn}
              hideActor
            />
          ))}
        </div>
      )}
    </>
  );
}
