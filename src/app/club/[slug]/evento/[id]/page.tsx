import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getClub } from "@/lib/clubs/clubs";
import { listClubActivities } from "@/lib/clubs/activities/core";
import { getClubEvent } from "@/lib/clubs/activities/event-detail";
import { ClubShell, ClubSidebar } from "@/components/clubs/club-shell";
import { ClubHeader } from "@/components/clubs/club-header";
import { EventDetailView } from "@/components/clubs/event/event-detail-view";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// Ficha de un evento de club.
//
// Ruta PROPIA y no `/actividad/[id]`: esa sigue devolviendo 404 para eventos
// (`hasDetailView: false`), y con razón — ActivityDetailView está montado sobre el
// pool de ítems, los participantes y las opiniones, y un evento no tiene ninguna
// de las tres. Reutilizarla habría sido vaciar tres secciones.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { slug, id } = await params;
  const club = await getClub(slug);
  // Sin membresía no se filtra ni el título por el <title> de la pestaña: un club
  // privado no revela los nombres de sus eventos a quien no está dentro.
  if (!club?.viewerRole) return { title: "Evento — Biblioshare" };

  const user = await getCurrentUser();
  const event = user ? await getClubEvent(id, user.id) : null;
  return {
    title:
      event && event.clubId === club.id
        ? `${event.title} · ${club.name} — Biblioshare`
        : "Evento — Biblioshare",
  };
}

export default async function ClubEventPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(`/club/${slug}/evento/${id}`));

  const club = await getClub(slug);
  // Mismo gate que el calendario y la actividad: un club privado no filtra sus
  // fechas por URL, y `viewerRole` es null también para invited/requested, no solo
  // para extraños.
  if (!club || !club.viewerRole) notFound();

  // getClubEvent devuelve null para: no existe, no es un evento, está archivado, o
  // la RLS no lo deja ver. Los cuatro son 404 — distinguirlos en la respuesta
  // diría a un extraño si un id existe o no.
  const event = await getClubEvent(id, user.id);
  if (!event || event.clubId !== club.id) notFound();

  const canModerate = club.viewerRole === "moderator" || club.viewerRole === "owner";
  const activities = canModerate ? await listClubActivities(club.id) : [];
  const pendingProposals = activities.filter((a) => a.status === "proposed").length;

  return (
    <ClubShell
      sidebar={
        <ClubSidebar
          club={club}
          active="calendario"
          canModerate={canModerate}
          pendingProposals={pendingProposals}
        />
      }
      mobileHeader={<ClubHeader club={club} userId={user.id} />}
    >
      <EventDetailView
        event={event}
        viewerId={user.id}
        // Llegar aquí ya exige `viewerRole`, que solo lo tienen los miembros
        // activos: se pasa explícito para que el componente no tenga que deducirlo.
        viewerIsMember
        canModerate={canModerate}
      />
    </ClubShell>
  );
}
