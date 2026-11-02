import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getClub } from "@/lib/clubs/clubs";
import { getClubIdentity, hasPendingRequest } from "@/lib/clubs/join-requests";
import { PrivateClubStub } from "@/components/clubs/private-club-stub";
import { listClubActivities } from "@/lib/clubs/activities/core";
import { listClubDirectory } from "@/lib/clubs/directory";
import { getFollowedClubMembers } from "@/lib/clubs/followed-members";
import { personasHref } from "@/lib/comparisons/personas-query";
import { MemberDirectory } from "@/components/clubs/member-directory";
import { ClubShell, ClubSidebar } from "@/components/clubs/club-shell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const club = await getClub(slug);
  return {
    title: club
      ? `Miembros · ${club.name} — Biblioshare`
      : "Miembros — Biblioshare",
  };
}

export default async function ClubMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(`/club/${slug}/miembros`));

  const club = await getClub(slug);

  // Mismo desdoble que la portada del club: sin fila legible puede ser 404 o un
  // club privado que la RLS te niega entero (→ stub para pedir entrar).
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

  // El directorio es members-only (la RLS del roster ya lo gatea). Un no-miembro
  // de un club público ve el club pero no su gente: lo devolvemos a la portada.
  if (!club.viewerRole) redirect(`/club/${club.slug}`);

  const canModerate =
    club.viewerRole === "moderator" || club.viewerRole === "owner";
  const [initial, activities, followed, t] = await Promise.all([
    listClubDirectory(club.id, { filter: "all", page: 0 }),
    canModerate ? listClubActivities(club.id) : Promise.resolve([]),
    getFollowedClubMembers(club.id, user.id),
    getTranslations("club"),
  ]);
  const pendingProposals = activities.filter(
    (a) => a.status === "proposed",
  ).length;

  // En escritorio el directorio vive dentro del shell del club (frame 11): el
  // sidebar da la navegación y el directorio trae su propio chrome (buscador +
  // filtros). Por eso no se pasa mobile/desktopHeader al shell.
  return (
    <ClubShell
      sidebar={
        <ClubSidebar
          club={club}
          active="miembros"
          canModerate={canModerate}
          pendingProposals={pendingProposals}
        />
      }
    >
      <div className="flex flex-col">
        {/* Sin nadie a quien sigas no hay con quién comparar: el botón no se pinta. */}
        {followed.length > 0 && (
          <Link
            href={personasHref(followed)}
            title={t("compareMembersHint")}
            className="mb-4 inline-flex min-h-11 items-center self-start rounded-full border border-border px-4 text-sm font-medium text-foreground hover:bg-surface-muted"
          >
            {t("compareMembers")}
          </Link>
        )}
        <MemberDirectory
          clubId={club.id}
          clubSlug={club.slug}
          clubName={club.name}
          initial={initial}
          canModerate={canModerate}
          viewerId={user.id}
        />
      </div>
    </ClubShell>
  );
}
