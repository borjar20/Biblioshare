import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getClub } from "@/lib/clubs/clubs";
import { getActivity, listClubActivities } from "@/lib/clubs/activities/core";
import { getActivityKindDefinition } from "@/lib/clubs/activities/kinds/registry";
import { ActivityDetailView } from "@/components/clubs/activity-detail";
import { ClubShell, ClubSidebar } from "@/components/clubs/club-shell";
import { resolveKnownMentions } from "@/lib/social/resolve-mentions";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// Puerta compartida por `generateMetadata` y el body. Nacieron con gates
// distintos y el <title> filtraba el título real de una actividad que el body
// va a 404-ear —a un no-miembro, o a un kind sin ficha (evento)— porque Next
// resuelve metadata y componente por separado (issue #131). Un solo sitio que
// devuelve la actividad SOLO si pasa todo, o null. `getCurrentUser` está
// memoizado por petición; getClub/getActivity ya se llamaban en ambos lados.
async function resolveVisibleActivity(slug: string, id: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const club = await getClub(slug);
  if (!club || !club.viewerRole) return null;
  const activity = await getActivity(id);
  if (!activity || activity.clubId !== club.id) return null;
  if (!getActivityKindDefinition(activity.kind).hasDetailView) return null;
  // viewerRole aparte: el narrowing de `!club.viewerRole` no sobrevive al return,
  // y ActivityDetailView lo exige no-nulo.
  return { user, club, activity, viewerRole: club.viewerRole };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { slug, id } = await params;
  const resolved = await resolveVisibleActivity(slug, id);
  return {
    title: resolved ? `${resolved.activity.title} — Biblioshare` : "Actividad — Biblioshare",
  };
}

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();
  // El body sí distingue "no logueado" (a login) de "no permitido" (404), cosa
  // que la puerta compartida colapsa a null a propósito.
  if (!(await getCurrentUser())) redirect(loginHref(`/club/${slug}/actividad/${id}`));

  const resolved = await resolveVisibleActivity(slug, id);
  if (!resolved) notFound();
  const { user, club, activity, viewerRole } = resolved;

  const canModerate =
    club.viewerRole === "moderator" || club.viewerRole === "owner";
  // El sidebar necesita el pip de propuestas pendientes, igual que miembros/page.tsx.
  const activities = canModerate ? await listClubActivities(club.id) : [];
  const pendingProposals = activities.filter((a) => a.status === "proposed").length;

  // Chat general de la actividad (Bloque B): una sola query batched sobre los
  // cuerpos de sus comentarios para linkificar @menciones reales (issue #321).
  const knownUsernames = await resolveKnownMentions(
    supabase,
    activity.chat?.comments.map((c) => c.body) ?? [],
  );

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
        viewerRole={viewerRole}
        clubSlug={slug}
        clubName={club.name}
        knownUsernames={knownUsernames}
      />
    </ClubShell>
  );
}
