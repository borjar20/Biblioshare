import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  getProfileByUsername,
  getProfileIdentity,
} from "@/lib/profile/get-profile-by-username";
import {
  getFollowCounts,
  getFollowNotify,
  getFollowState,
  getPendingRequests,
} from "@/lib/social/follows";
import { FollowButton } from "@/components/social/follow-button";
import { NotifyBell } from "@/components/social/notify-bell";
import { ProfileSafetyActions } from "@/components/social/profile-safety-actions";
import { getBlockState } from "@/lib/social/block-state";
import { FollowRequests } from "@/components/social/follow-requests";
import { PrivateProfileStub } from "@/components/social/private-profile-stub";
import { getLibraryStats } from "@/lib/library/get-library-stats";
import type { ItemType } from "@/lib/catalog/types";
import { ProfileHeader } from "@/components/profile-header";
import { SectionTabs, type SectionTab } from "@/components/section-tabs";
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
import { YouRow } from "@/components/nav/you-row";
import { SHELL_APP } from "@/lib/ui/layout";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

const VALID_TABS: SectionTab[] = [
  "actividad",
  "estadisticas",
  "rincon",
  "coleccion",
];
// Estadísticas y Rincón son del dueño: un visitante no las alcanza ni por URL.
const OWNER_ONLY_TABS: SectionTab[] = ["estadisticas", "rincon"];
const VALID_TYPES: ItemType[] = ["book", "movie", "series"];

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
    periodo?: string;
    tipo?: string;
    medida?: string;
    archivados?: string;
  }>;
}) {
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

  return (
    <div className={`mx-auto flex w-full ${SHELL_APP} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}>
      <ProfileHeader
        profile={profile}
        stats={stats}
        isOwner={isOwner}
        counts={counts}
        followButton={
          !isOwner && blockState === "none" ? (
            <div className="flex items-start gap-2">
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
            </div>
          ) : undefined
        }
        safetyActions={
          user && !isOwner && blockState !== "blocked_by" ? (
            <ProfileSafetyActions targetUserId={profile.userId} initialState={blockState} />
          ) : undefined
        }
      />

      {/* Accesos a lo tuyo (Cuaderno, Estadísticas, Ajustes) — solo móvil: en
          sm+ los sirve el menú del avatar de la topbar. Ver YouRow. */}
      {isOwner && <YouRow username={profile.username} />}

      {/* Solicitudes de seguimiento: en el mockup v2 se mudan al desplegable de
          Notificaciones (P1/D3), que es del plan 07. Hasta entonces siguen
          aquí. Visibilidad y admin ya viven en /ajustes (⚙ de la cabecera). */}
      {isOwner && <FollowRequests requests={pendingRequests} />}

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
          <StatsTab
            userId={profile.userId}
            basePath={basePath}
            monthParam={parsedParams.month}
            metricParam={parsedParams.medida}
          />
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
          key={itemType ?? ""}
          fallback={<SkeletonCoverGrid count={10} />}
        >
          <CollectionTab
            userId={profile.userId}
            basePath={basePath}
            itemType={itemType}
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
