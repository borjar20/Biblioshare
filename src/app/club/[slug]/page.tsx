import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getClub, getViewerIdentity } from "@/lib/clubs/clubs";
import { SkeletonCard, SkeletonLine, Skeleton } from "@/components/ui/skeleton";
import { listClubPosts } from "@/lib/clubs/posts";
import { listClubActivities } from "@/lib/clubs/activities/core";
import { getUpcomingCheckpoints } from "@/lib/clubs/activities/upcoming";
import { ClubHeader } from "@/components/clubs/club-header";
import { ClubTabs, CLUB_TABS, type ClubTab } from "@/components/clubs/club-tabs";
import { ClubSummary } from "@/components/clubs/club-summary";
import { ClubManagement } from "@/components/clubs/club-management";
import { PrivateClubStub } from "@/components/clubs/private-club-stub";
import {
  getClubIdentity,
  hasPendingRequest,
  listJoinRequests,
} from "@/lib/clubs/join-requests";
import { markClubRead } from "@/lib/clubs/unread";
import { ClubFeed } from "@/components/clubs/club-feed";
import { ActivityList } from "@/components/clubs/activity-list";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const club = await getClub(slug);
  return { title: club ? `${club.name} — Biblioshare` : "Club — Biblioshare" };
}

export default async function ClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab: tabParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const club = await getClub(slug);

  // Sin fila legible en `clubs` puede ser una de dos cosas: que el club no
  // exista, o que exista y sea PRIVADO (la RLS te niega la fila entera). La
  // vista de identidad distingue los dos casos — antes ambos daban un 404, y
  // alguien con el enlace de un club privado no tenía forma de pedir entrar.
  if (!club) {
    const identity = await getClubIdentity(slug);
    if (!identity) notFound();
    return (
      <PrivateClubStub
        club={identity}
        hasRequested={await hasPendingRequest(identity.id)}
      />
    );
  }

  const isMember = Boolean(club.viewerRole);
  const canModerate =
    club.viewerRole === "moderator" || club.viewerRole === "owner";

  // Gestión es solo para moderator+: no basta con ocultar la pestaña, hay que
  // rechazar también quien la pida por URL.
  const requested = CLUB_TABS.includes(tabParam as ClubTab)
    ? (tabParam as ClubTab)
    : null;
  const tab: ClubTab =
    requested === "gestion" && !canModerate ? "feed" : (requested ?? "feed");

  // La cabecera y las pestañas (con su badge) forman el shell: solo necesitan
  // el club y el recuento de actividades. El contenido pesado de cada pestaña
  // —posts del feed, próximos hitos, solicitudes de entrada— llega por
  // streaming detrás de su <Suspense> (Fase B del plan de navegación).
  const activities = isMember ? await listClubActivities(club.id) : [];
  const pendingProposals = activities.filter(
    (a) => a.status === "proposed",
  ).length;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <ClubHeader club={club} userId={user.id} />

      {/* Sin ser miembro no hay contenido que enseñar: el club existe, pero su
          interior es de sus miembros (SD-4). */}
      {isMember && (
        <>
          <ClubTabs
            active={tab}
            basePath={`/club/${club.slug}`}
            canModerate={canModerate}
            activityCount={canModerate ? pendingProposals : 0}
          />

          {tab === "feed" && (
            <Suspense fallback={<ClubContentSkeleton />}>
              <ClubFeedSection
                club={club}
                userId={user.id}
                activities={activities}
              />
            </Suspense>
          )}

          {tab === "actividades" && (
            <ActivityList
              clubId={club.id}
              clubSlug={club.slug}
              initialActivities={activities}
              isModerator={canModerate}
            />
          )}

          {tab === "gestion" && canModerate && (
            <Suspense fallback={<ClubContentSkeleton />}>
              <ClubManagementSection
                club={club}
                userId={user.id}
                activities={activities}
              />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}

type ClubDetail = NonNullable<Awaited<ReturnType<typeof getClub>>>;
type ClubActivities = Awaited<ReturnType<typeof listClubActivities>>;

// Feed del club: posts + próximos hitos, y marcar el club como leído. Aislado
// en su boundary para que la cabecera y las pestañas pinten sin esperarlo.
async function ClubFeedSection({
  club,
  userId,
  activities,
}: {
  club: ClubDetail;
  userId: string;
  activities: ClubActivities;
}) {
  const [initialPage, upcoming, viewer] = await Promise.all([
    listClubPosts(club.id),
    getUpcomingCheckpoints(club.id),
    getViewerIdentity(),
  ]);
  // Abrir el feed es haberlo leído: a partir de aquí, las novedades se cuentan
  // desde ahora.
  await markClubRead(club.id);

  return (
    <>
      <ClubSummary
        activities={activities}
        upcoming={upcoming}
        clubSlug={club.slug}
      />
      <ClubFeed
        clubId={club.id}
        viewerId={userId}
        viewerRole={club.viewerRole!}
        viewerName={viewer?.name ?? ""}
        viewerAvatarUrl={viewer?.avatarUrl ?? null}
        initialPage={initialPage}
      />
    </>
  );
}

// Gestión: las solicitudes de entrada se consultan aquí para no bloquear el
// shell.
async function ClubManagementSection({
  club,
  userId,
  activities,
}: {
  club: ClubDetail;
  userId: string;
  activities: ClubActivities;
}) {
  const joinRequests = await listJoinRequests(club.id);
  return (
    <ClubManagement
      clubId={club.id}
      clubSlug={club.slug}
      viewerId={userId}
      viewerRole={club.viewerRole as "moderator" | "owner"}
      initialActivities={activities}
      initialJoinRequests={joinRequests}
    />
  );
}

// Fallback de contenido del club: un par de tarjetas skeleton.
function ClubContentSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <SkeletonCard>
        <SkeletonLine className="mb-3 w-32" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonLine className="mb-3 w-24" />
        <SkeletonLine className="w-full" />
        <SkeletonLine className="mt-2 w-3/4" />
      </SkeletonCard>
    </div>
  );
}
