import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  getProfileByUsername,
  getProfileIdentity,
} from "@/lib/profile/get-profile-by-username";
import { getOwnCollectionAlias } from "@/lib/profile/collection-alias";
import {
  getFollowCounts,
  getFollowNotify,
  getFollowState,
  getPendingRequests,
} from "@/lib/social/follows";
import { FollowButton } from "@/components/social/follow-button";
import { NotifyBell } from "@/components/social/notify-bell";
import { CompareWithLink } from "@/components/comparisons/compare-with-link";
import { ProfileSafetyActions } from "@/components/social/profile-safety-actions";
import { getBlockState } from "@/lib/social/block-state";
import { FollowRequests } from "@/components/social/follow-requests";
import { PrivateProfileStub } from "@/components/social/private-profile-stub";
import { getLibraryStats } from "@/lib/library/get-library-stats";
import type { ItemType } from "@/lib/catalog/types";
import { ProfileHero } from "@/components/profile/profile-hero";
import { ProfileIdentity } from "@/components/profile/profile-identity";
import { ProfileFigures } from "@/components/profile/profile-figures-server";
import { ProfileNow } from "@/components/profile/profile-now-server";
import { ProfileYear } from "@/components/profile/profile-year-server";
import {
  FiguresSkeleton,
  HeroSkeleton,
  NowSkeleton,
  YearSkeleton,
} from "@/components/profile/profile-skeletons";
import { SectionTabs, type SectionTab } from "@/components/section-tabs";
import {
  Skeleton,
  SkeletonLine,
  SkeletonCard,
  SkeletonCoverGrid,
} from "@/components/ui/skeleton";
import { ActivityTab } from "./_tabs/activity-tab";
import { CollectionTab } from "./_tabs/collection-tab";
import {ExperiencesTab} from "./_tabs/experiences-tab";
import { SHELL_APP } from "@/lib/ui/layout";

const VALID_TABS: SectionTab[] = [
  "actividad",
  "coleccion",
  "experiencias",
];
const VALID_TYPES: ItemType[] = ["book", "movie", "series"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username} — Biblioshare` };
}

type PublicProfileProps = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{
    tab?: string;
    type?: string;
    status?: string;
    q?: string;
    sort?: string;
    month?: string;
    periodo?: string;
    tipo?: string;
    medida?: string;
    archivados?: string;
    state?:string;
    kind?:string;
    cursor?:string;
  }>;
};

// La página es SÍNCRONA y solo pinta el boundary (#476, patrón de #442): la
// lectura de `params`/`searchParams` y la sesión bajan a ProfileContent, por
// debajo del <Suspense>. Así todos los enlaces a /u/* comparten shell estático.
export default function PublicProfilePage(props: PublicProfileProps) {
  return (
    <Suspense fallback={<ProfileShellSkeleton />}>
      <ProfileContent {...props} />
    </Suspense>
  );
}

// Rejilla del perfil, compartida por el árbol real y su esqueleto para que no
// se desincronicen (CLS, #284).
const PROFILE_LAYOUT_CLASS = `relative mx-auto -mt-12 grid w-full ${SHELL_APP} gap-6 px-4 sm:px-6 lg:-mt-[70px] lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-11 lg:px-8`;

// Fantasma del shell del perfil: replica el árbol de ProfileContent (cabecera,
// rejilla con columna de identidad y columna de pestañas) para que el
// intercambio no mueva nada (CLS, #284).
function ProfileShellSkeleton() {
  return (
    <div className="flex w-full flex-col pb-8">
      <HeroSkeleton />
      <div className={PROFILE_LAYOUT_CLASS}>
        <aside className="flex min-w-0 flex-col gap-5">
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-3 lg:grid-cols-1 lg:gap-y-4">
            <div className="col-start-1 row-start-1 w-fit rounded-full border-4 border-background">
              <Skeleton className="h-[84px] w-[84px] rounded-full lg:h-[104px] lg:w-[104px]" />
            </div>
            <div className="col-span-2 row-start-2 min-w-0 lg:col-span-1">
              <Skeleton className="h-[29px] w-44 rounded-md lg:h-[36px]" />
              <SkeletonLine className="mt-1 h-3 w-28" />
            </div>
          </div>
          <FiguresSkeleton />
          <NowSkeleton />
          <YearSkeleton />
        </aside>
        <div className="flex min-w-0 flex-col gap-6 lg:pt-[86px]">
          <div className="flex gap-6 border-b border-border pb-3">
            <SkeletonLine className="w-20" />
            <SkeletonLine className="w-24" />
          </div>
          <ProfileSectionSkeleton />
        </div>
      </div>
    </div>
  );
}

async function ProfileContent({ params, searchParams }: PublicProfileProps) {
  const { username } = await params;
  const parsedParams = await searchParams;

  const supabase = await createClient();

  const [profile, user] = await Promise.all([
    getProfileByUsername(supabase, username),
    getCurrentUser(),
  ]);

  // Perfil privado no visible para este visitante (ni dueño ni seguidor
  // aceptado): stub de identidad + solicitar-seguir (modelo Instagram, EPIC-05).
  if (!profile) {
    const identity = await getProfileIdentity(supabase, username);
    if (!identity) notFound();
    const blockState = user
      ? await getBlockState(supabase, user.id, identity.userId)
      : "none";
    if (blockState === "blocked_by") notFound();
    const followState =
      blockState === "none"
        ? await getFollowState(supabase, user?.id ?? null, identity.userId)
        : "none";
    return (
      <PrivateProfileStub
        identity={identity}
        followState={followState}
        viewerLoggedIn={!!user}
        blockState={blockState}
      />
    );
  }

  const isOwner = user?.id === profile.userId;
  const basePath = `/u/${profile.username}`;

  // Conserva los enlaces personales antiguos solo para su dueño. Un tercero
  // sigue viendo la actividad de esta persona, nunca sus herramientas.
  if (isOwner && ["panel", "estadisticas"].includes(parsedParams.tab ?? "")) {
    const filters = new URLSearchParams();
    for (const key of ["periodo", "tipo", "medida"] as const) {
      if (parsedParams[key]) filters.set(key, parsedParams[key]);
    }
    redirect(`/estadisticas${filters.size ? `?${filters.toString()}` : ""}`);
  }
  if (isOwner && parsedParams.tab === "rincon") {
    redirect(`/coleccion/rincon${parsedParams.archivados === "1" ? "?archivados=1" : ""}`);
  }
  const collectionAlias = getOwnCollectionAlias(isOwner, parsedParams.tab, parsedParams.type);
  if (collectionAlias) redirect(collectionAlias);

  const requestedTab = VALID_TABS.includes(parsedParams.tab as SectionTab)
    ? (parsedParams.tab as SectionTab)
    : null;
  const tab: SectionTab = requestedTab ?? "actividad";

  const itemType = VALID_TYPES.includes(parsedParams.type as ItemType)
    ? (parsedParams.type as ItemType)
    : undefined;

  // Solo lo que necesita la cabecera se espera aquí; el contenido de cada
  // pestaña llega por streaming detrás de su <Suspense> (Fase B).
  const [counts, followState, pendingRequests, stats, blockState] = await Promise.all([
    getFollowCounts(supabase, profile.userId),
    getFollowState(supabase, user?.id ?? null, profile.userId),
    isOwner ? getPendingRequests(supabase, profile.userId) : Promise.resolve([]),
    getLibraryStats(supabase, profile.userId),
    user ? getBlockState(supabase, user.id, profile.userId) : Promise.resolve("none" as const),
  ]);

  const notifyEvents =
    !isOwner && blockState === "none" && followState === "accepted"
      ? await getFollowNotify(supabase, user?.id ?? null, profile.userId)
      : [];

  const name = profile.displayName || profile.username;
  return (
    <div className="flex w-full flex-col pb-8">
      <Suspense fallback={<HeroSkeleton />}>
        <ProfileHero userId={profile.userId} name={name} />
      </Suspense>
      <div data-testid="profile-layout" className={PROFILE_LAYOUT_CLASS}>
        <aside className="flex min-w-0 flex-col gap-5">
          <ProfileIdentity
            profile={profile}
            isOwner={isOwner}
            counts={counts}
            followButton={
              !isOwner && blockState === "none" ? (
                <div className="flex flex-wrap items-start gap-2">
                  <FollowButton
                    targetUserId={profile.userId}
                    targetIsPublic={profile.isPublic}
                    state={followState}
                    viewerLoggedIn={!!user}
                  />
                  {followState === "accepted" && (
                    <NotifyBell
                      targetUserId={profile.userId}
                      username={profile.username}
                      initial={notifyEvents}
                    />
                  )}
                  {/* Entre nosotros sin guardar grupo (#1484): solo con seguimiento aceptado. */}
                  {followState === "accepted" && (
                    <CompareWithLink userId={profile.userId} />
                  )}
                </div>
              ) : undefined
            }
            safetyActions={
              user && !isOwner && blockState !== "blocked_by" ? (
                <ProfileSafetyActions targetUserId={profile.userId} initialState={blockState} />
              ) : undefined
            }
          />
          <Suspense fallback={<FiguresSkeleton />}>
            <ProfileFigures userId={profile.userId} stats={stats} />
          </Suspense>
          <Suspense fallback={<NowSkeleton />}>
            <ProfileNow userId={profile.userId} />
          </Suspense>
          <Suspense fallback={<YearSkeleton />}>
            <ProfileYear userId={profile.userId} isOwner={isOwner} />
          </Suspense>
        </aside>
        <div className="flex min-w-0 flex-col gap-6 lg:pt-[86px]">
          {isOwner && <FollowRequests requests={pendingRequests} />}
          <SectionTabs active={tab} basePath={basePath} isOwner={isOwner} />
          {tab==="experiencias"&&<Suspense fallback={<ProfileSectionSkeleton/>}><ExperiencesTab userId={profile.userId} viewerId={user?.id??null} basePath={basePath} params={parsedParams} isOwner={isOwner}/></Suspense>}

          {tab === "actividad" && (
            <Suspense fallback={<ProfileSectionSkeleton />}>
              <ActivityTab
                userId={profile.userId}
                viewerLoggedIn={!!user}
                isOwner={isOwner}
              />
            </Suspense>
          )}

          {tab === "coleccion" && (
            <Suspense
              key={`${itemType ?? ""}:${profile.hideDropped}`}
              fallback={<SkeletonCoverGrid count={10} />}
            >
              <CollectionTab
                userId={profile.userId}
                basePath={basePath}
                itemType={itemType}
                // Preferencia del DUEÑO, no del visitante: si decide que sus
                // abandonados no cuentan como su biblioteca, tampoco los enseña
                // (spec, alcance).
                hideDropped={profile.hideDropped}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

// Fallback genérico de las pestañas con tarjetas: un par de skeletons.
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
