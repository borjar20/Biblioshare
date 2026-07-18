import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getClub } from "@/lib/clubs/clubs";
import { getClubIdentity, hasPendingRequest } from "@/lib/clubs/join-requests";
import { PrivateClubStub } from "@/components/clubs/private-club-stub";
import { listClubDirectory } from "@/lib/clubs/directory";
import { MemberDirectory } from "@/components/clubs/member-directory";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
  const initial = await listClubDirectory(club.id, { filter: "all", page: 0 });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <MemberDirectory
        clubId={club.id}
        clubSlug={club.slug}
        clubName={club.name}
        initial={initial}
        canModerate={canModerate}
        viewerId={user.id}
      />
    </div>
  );
}
