import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getClub } from "@/lib/clubs/clubs";
import { listClubActivities } from "@/lib/clubs/activities/core";
import { getClubCalendarMarks } from "@/lib/clubs/activities/calendar";
import { todayISO } from "@/lib/stats/dates";
import { ClubShell, ClubSidebar, ClubMainHeader } from "@/components/clubs/club-shell";
import { ClubHeader } from "@/components/clubs/club-header";
import { ClubCalendar } from "@/components/clubs/calendar/club-calendar";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const club = await getClub(slug);
  return { title: club ? `Calendario · ${club.name} — Biblioshare` : "Calendario — Biblioshare" };
}

export default async function ClubCalendarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(`/club/${slug}/calendario`));

  const club = await getClub(slug);
  // Mismo gate que la vista de actividad: un club privado no filtra sus fechas
  // por URL. `viewerRole` es null para invited/requested, no solo para extraños.
  if (!club || !club.viewerRole) notFound();

  const canModerate =
    club.viewerRole === "moderator" || club.viewerRole === "owner";

  // UNA sola lectura de "hoy" por respuesta: se reparte a getClubCalendarMarks y
  // a ClubCalendar (que lo usa para agendaForMonth y parseMonthParam). Leerlo
  // dos veces puede discrepar si la peticion cruza la medianoche.
  const hoy = todayISO();

  const [marks, activities, tt] = await Promise.all([
    getClubCalendarMarks(club.id, club.slug, hoy),
    // El pip de propuestas pendientes en el sidebar solo se ve si eres
    // moderador (club-shell.tsx: `pip: canModerate ? pendingProposals : ...`);
    // para un miembro raso, pedir la lista entera solo para tirarla es dos
    // consultas de balde.
    canModerate ? listClubActivities(club.id) : Promise.resolve([]),
    getTranslations("club.tabs"),
  ]);
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
      mobileHeader={
        // Sin esto, en móvil no había ni nombre/portada del club ni forma de
        // volver salvo el atrás del navegador (el sidebar con esa identidad
        // solo se pinta desde `lg`). ClubHeader trae ambas cosas: identidad
        // del club y el enlace de vuelta a /clubes. NO se añade ClubTabs
        // aquí: el calendario es una decisión de diseño para que NO sea una
        // pestaña más, así que no debe pintar la tabbar de pestañas.
        <ClubHeader club={club} userId={user.id} />
      }
      desktopHeader={<ClubMainHeader title={tt("calendario")} />}
    >
      {/* useSearchParams necesita un boundary de Suspense. */}
      <Suspense fallback={null}>
        <ClubCalendar
          marks={marks}
          today={hoy}
          clubId={club.id}
          canModerate={canModerate}
        />
      </Suspense>
    </ClubShell>
  );
}
