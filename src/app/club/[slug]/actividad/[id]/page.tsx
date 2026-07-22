import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getClub } from "@/lib/clubs/clubs";
import { getActivity, listClubActivities } from "@/lib/clubs/activities/core";
import { getActivityKindDefinition } from "@/lib/clubs/activities/kinds/registry";
import { ActivityDetailView } from "@/components/clubs/activity-detail";
import { ClubShell, ClubSidebar } from "@/components/clubs/club-shell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const activity = await getActivity(id);
  return { title: activity ? `${activity.title} — Biblioshare` : "Actividad — Biblioshare" };
}

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const club = await getClub(slug);
  if (!club || !club.viewerRole) notFound();

  const activity = await getActivity(id);
  if (!activity || activity.clubId !== club.id) notFound();

  // Un kind sin página propia (evento) no tiene nada que renderizar aquí: la URL
  // es adivinable y sin esto se serviría una vista vacía y rota.
  if (!getActivityKindDefinition(activity.kind).hasDetailView) notFound();

  const canModerate =
    club.viewerRole === "moderator" || club.viewerRole === "owner";
  // El sidebar necesita el pip de propuestas pendientes, igual que miembros/page.tsx.
  const activities = canModerate ? await listClubActivities(club.id) : [];
  const pendingProposals = activities.filter((a) => a.status === "proposed").length;

  // La actividad vive dentro del shell del club (spec 2026-07-21): sin esto la
  // pantalla perdía el sidebar en PC y quedaba en una columna suelta. NO se pasa
  // `desktopHeader`: la cabecera con las acciones se pinta una sola vez dentro
  // del contenido, porque duplicarla rompería los locators del e2e.
  return (
    <ClubShell
      sidebar={
        <ClubSidebar
          club={club}
          active="actividades"
          canModerate={canModerate}
          pendingProposals={pendingProposals}
        />
      }
    >
      <ActivityDetailView
        activity={activity}
        viewerId={user.id}
        viewerRole={club.viewerRole}
        clubSlug={slug}
        clubName={club.name}
      />
    </ClubShell>
  );
}
