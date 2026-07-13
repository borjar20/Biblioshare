import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getClub } from "@/lib/clubs/clubs";
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

  const [initialPage, activities] = await Promise.all([
    isMember && tab === "feed"
      ? listClubPosts(club.id)
      : Promise.resolve({ posts: [], nextCursor: null }),
    isMember ? listClubActivities(club.id) : Promise.resolve([]),
  ]);

  const upcoming =
    isMember && tab === "feed" ? await getUpcomingCheckpoints(club.id) : [];

  // Abrir el feed es haberlo leído: a partir de aquí, las novedades se cuentan
  // desde ahora. Solo en el feed — mirar la pestaña de Gestión no es ponerse al
  // día con la conversación del club.
  if (isMember && tab === "feed") await markClubRead(club.id);

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
            <>
              <ClubSummary
                activities={activities}
                upcoming={upcoming}
                clubSlug={club.slug}
              />
              <ClubFeed
                clubId={club.id}
                viewerId={user.id}
                viewerRole={club.viewerRole!}
                initialPage={initialPage}
              />
            </>
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
            <ClubManagement
              clubId={club.id}
              clubSlug={club.slug}
              viewerId={user.id}
              viewerRole={club.viewerRole as "moderator" | "owner"}
              initialActivities={activities}
              initialJoinRequests={await listJoinRequests(club.id)}
            />
          )}
        </>
      )}
    </div>
  );
}
