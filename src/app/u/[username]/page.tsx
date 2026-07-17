import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
  getProfileByUsername,
  getProfileIdentity,
} from "@/lib/profile/get-profile-by-username";
import {
  getFollowCounts,
  getFollowState,
  getPendingRequests,
} from "@/lib/social/follows";
import { FollowButton } from "@/components/social/follow-button";
import { FollowRequests } from "@/components/social/follow-requests";
import { PrivateProfileStub } from "@/components/social/private-profile-stub";
import { getLibraryStats } from "@/lib/library/get-library-stats";
import type { ItemType } from "@/lib/catalog/types";
import type { LibrarySort, MediaStatus } from "@/lib/library/types";
import { ProfileHeader } from "@/components/profile-header";
import { SectionTabs, type SectionTab } from "@/components/section-tabs";
import { LockIcon } from "@/components/ui/icons";
import {
  Skeleton,
  SkeletonLine,
  SkeletonCard,
  SkeletonCoverGrid,
} from "@/components/ui/skeleton";
import { ActivityTab } from "./_tabs/activity-tab";
import { CollectionTab } from "./_tabs/collection-tab";
import { StatsTab } from "./_tabs/stats-tab";
import { RinconTab } from "./_tabs/rincon-tab";
import { VisibilityToggle } from "./visibility-toggle";

const VALID_TABS: SectionTab[] = [
  "actividad",
  "estadisticas",
  "rincon",
  "coleccion",
];
// Estadísticas y Rincón son del dueño: un visitante no las alcanza ni por URL.
const OWNER_ONLY_TABS: SectionTab[] = ["estadisticas", "rincon"];
const VALID_TYPES: ItemType[] = ["book", "movie", "series"];
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

  // Deep-links de la IA vieja (plan 05, P2). El Panel se partió en dos, así que
  // `?tab=panel` aterriza en Estadísticas; y el dueño ya no tiene Colección
  // aquí: su biblioteca es /coleccion.
  if (parsedParams.tab === "panel") {
    redirect(`${basePath}?tab=estadisticas`);
  }
  if (isOwner && parsedParams.tab === "coleccion") {
    redirect("/coleccion");
  }

  const requestedTab = VALID_TABS.includes(parsedParams.tab as SectionTab)
    ? (parsedParams.tab as SectionTab)
    : null;
  const tab: SectionTab =
    requestedTab && (isOwner || !OWNER_ONLY_TABS.includes(requestedTab))
      ? requestedTab
      : "actividad";

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
  // pestaña llega por streaming detrás de su <Suspense> (Fase B).
  const [counts, followState, pendingRequests, stats] = await Promise.all([
    getFollowCounts(supabase, profile.userId),
    getFollowState(supabase, user?.id ?? null, profile.userId),
    isOwner ? getPendingRequests(supabase, profile.userId) : Promise.resolve([]),
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

      {tab === "actividad" && (
        <Suspense fallback={<ProfileSectionSkeleton />}>
          <ActivityTab
            userId={profile.userId}
            viewerLoggedIn={!!user}
            isOwner={isOwner}
          />
        </Suspense>
      )}

      {tab === "estadisticas" && (
        <Suspense fallback={<ProfileSectionSkeleton />}>
          <StatsTab userId={profile.userId} monthParam={parsedParams.month} />
        </Suspense>
      )}

      {tab === "rincon" && (
        <Suspense fallback={<ProfileSectionSkeleton />}>
          <RinconTab
            userId={profile.userId}
            includeArchived={parsedParams.archivados === "1"}
            basePath={basePath}
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
            basePath={basePath}
            itemType={itemType}
            status={status}
            search={search}
            sort={sort}
          />
        </Suspense>
      )}
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
