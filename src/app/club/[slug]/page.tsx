import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getClub, getViewerIdentity } from "@/lib/clubs/clubs";
import { SkeletonCard, SkeletonLine, Skeleton } from "@/components/ui/skeleton";
import { listClubPosts } from "@/lib/clubs/posts";
import { listClubActivities } from "@/lib/clubs/activities/core";
import { getClubCalendarMarks } from "@/lib/clubs/activities/calendar";
import { proximasMarcas } from "@/lib/clubs/activities/calendar-marks";
import { todayISO } from "@/lib/stats/dates";
import { groupActivities } from "@/lib/clubs/activities/group-activities";
import { getActivitiesProgress } from "@/lib/clubs/activities/progress";
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
import { ActivitiesAside, hasAsideContent } from "@/components/clubs/activities-aside";
import { ProposeActivityLink } from "@/components/clubs/activity-composer";
import { isComposerOpen } from "@/lib/clubs/activities/propose-url";
import {
  ClubShell,
  ClubSidebar,
  ClubMainHeader,
} from "@/components/clubs/club-shell";
import { buttonVariants } from "@/components/ui/button";
import { RoundBlock } from "@/components/clubs/round/round-block";

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
  searchParams: Promise<{ tab?: string; nueva?: string; ronda?: string }>;
}) {
  const { slug } = await params;
  const { tab: tabParam, nueva, ronda } = await searchParams;
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(`/club/${slug}`));

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

  // `calendario` está en CLUB_TABS para que salga como pestaña, pero NO es un
  // estado de esta página: es otra ruta. Quien llegue con ?tab=calendario (un
  // enlace viejo, un marcador) va a la ruta de verdad en vez de ver esta página
  // en blanco.
  if (requested === "calendario") redirect(`/club/${club.slug}/calendario`);

  const tab: Exclude<ClubTab, "calendario"> =
    requested === "gestion" && !canModerate
      ? "feed"
      : ((requested as Exclude<ClubTab, "calendario">) ?? "feed");

  // La cabecera y las pestañas (con su badge) forman el shell: solo necesitan
  // el club y el recuento de actividades. El contenido pesado de cada pestaña
  // —posts del feed, próximos hitos, solicitudes de entrada— llega por
  // streaming detrás de su <Suspense> (Fase B del plan de navegación).
  const activities = isMember ? await listClubActivities(club.id) : [];
  const pendingProposals = activities.filter(
    (a) => a.status === "proposed",
  ).length;

  // Sin ser miembro no hay contenido que enseñar: el club existe, pero su
  // interior es de sus miembros (SD-4). Se queda en la columna centrada; el
  // shell de escritorio (sidebar + main) es para la vida interna del club.
  if (!isMember) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
        <ClubHeader club={club} userId={user.id} />
      </div>
    );
  }

  const tt = await getTranslations("club.tabs");

  return (
    <ClubShell
      sidebar={
        <ClubSidebar
          club={club}
          active={tab}
          canModerate={canModerate}
          pendingProposals={pendingProposals}
        />
      }
      mobileHeader={
        <>
          <ClubHeader club={club} userId={user.id} />
          <ClubTabs
            active={tab}
            basePath={`/club/${club.slug}`}
            canModerate={canModerate}
            activityCount={canModerate ? pendingProposals : 0}
          />
        </>
      }
      desktopHeader={
        <ClubMainHeader
          title={tt(tab)}
          action={
            tab === "actividades" && !isComposerOpen(nueva) ? (
              <ProposeActivityLink clubSlug={club.slug} />
            ) : undefined
          }
        />
      }
    >
      {tab === "feed" && (
        <Suspense fallback={<ClubContentSkeleton />}>
          <ClubFeedSection club={club} userId={user.id} activities={activities} roundPeriodKey={ronda} />
        </Suspense>
      )}

      {tab === "actividades" && (
        <Suspense fallback={<ClubContentSkeleton />}>
          <ClubActivitiesSection
            club={club}
            activities={activities}
            canModerate={canModerate}
            userId={user.id}
            composerOpen={isComposerOpen(nueva)}
          />
        </Suspense>
      )}

      {tab === "gestion" && canModerate && (
        <div className="lg:max-w-3xl">
          <Suspense fallback={<ClubContentSkeleton />}>
            <ClubManagementSection
              club={club}
              userId={user.id}
              activities={activities}
            />
          </Suspense>
        </div>
      )}
    </ClubShell>
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
  roundPeriodKey,
}: {
  club: ClubDetail;
  userId: string;
  activities: ClubActivities;
  /** `?ronda=` de la URL (issue #408). */
  roundPeriodKey?: string;
}) {
  // UNA sola lectura de "hoy" por respuesta (ver Task 2).
  const hoy = todayISO();

  const [initialPage, marks, viewer, t] = await Promise.all([
    listClubPosts(club.id),
    getClubCalendarMarks(club.id, club.slug, hoy, userId),
    getViewerIdentity(),
    getTranslations("club"),
  ]);
  // Abrir el feed es haberlo leído: a partir de aquí, las novedades se cuentan
  // desde ahora.
  await markClubRead(club.id);

  // La tira del feed lista SOLO hitos y eventos, no inicios ni cierres: justo
  // encima está "Actividades activas" hablando de esas mismas actividades.
  const proximas = proximasMarcas(marks, hoy, 3);

  // Frame 10: en escritorio el hilo va a la izquierda y el resumen pasa a un
  // rail derecho sticky. Un solo árbol — el rail se coloca con `order` (el
  // resumen queda ARRIBA en móvil, como el frame 2, y a la derecha en `lg`).
  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-7">
      <aside className="flex flex-col gap-5 lg:order-2 lg:sticky lg:top-[96px]">
        <ClubSummary
          activities={activities}
          upcoming={proximas}
          clubSlug={club.slug}
        />
        <div className="hidden rounded-card border border-border bg-surface p-4 shadow-card lg:block">
          <h2 className="mb-3 label-section">
            {t("directorySectionMembers")} · {club.memberCount}
          </h2>
          <Link
            href={`/club/${club.slug}/miembros`}
            className={buttonVariants("secondary", "w-full justify-center text-xs")}
          >
            {t("seeAllMembers")}
          </Link>
        </div>
      </aside>

      <div className="min-w-0 lg:order-1">
        <div className="mb-5">
          <RoundBlock
            clubId={club.id}
            clubSlug={club.slug}
            viewerId={userId}
            periodKey={roundPeriodKey}
          />
        </div>
        <ClubFeed
          clubId={club.id}
          viewerId={userId}
          viewerRole={club.viewerRole!}
          viewerName={viewer?.name ?? ""}
          viewerAvatarUrl={viewer?.avatarUrl ?? null}
          initialPage={initialPage}
        />
      </div>
    </div>
  );
}

// Pestaña Actividades: el progreso de las que están en curso y las próximas
// fechas del club se consultan aquí, detrás de su boundary, para que la cabecera
// y las pestañas pinten sin esperarlos.
async function ClubActivitiesSection({
  club,
  activities,
  canModerate,
  userId,
  composerOpen,
}: {
  club: ClubDetail;
  activities: ClubActivities;
  canModerate: boolean;
  userId: string;
  composerOpen: boolean;
}) {
  // UNA sola lectura de "hoy" por respuesta.
  const hoy = todayISO();
  const { enCurso, finished } = groupActivities(activities, hoy);

  const [progress, marks] = await Promise.all([
    // Solo las de "En curso": de una próxima el progreso es 0 por definición y
    // de una terminada ya no cambia.
    getActivitiesProgress(enCurso),
    getClubCalendarMarks(club.id, club.slug, hoy, userId),
  ]);

  // A diferencia del feed de Inicio, aquí no hay nada JUSTO ENCIMA que ya
  // enseñe inicios/cierre -- se piden los cuatro tipos de marca, si no un club
  // cuya única fecha próxima es el cierre de un reto nunca la vería.
  const asideMarks = proximasMarcas(marks, hoy, 4, ["hito", "evento", "inicio", "cierre"]);
  // Decidida AQUÍ, no dentro de ActivitiesAside: una pista de grid no
  // desaparece porque su hijo pinte null, así que ActivityList necesita saber
  // de antemano si va a haber rail para reservarle o no la columna de 320px.
  const hasAside = hasAsideContent({
    marksCount: asideMarks.length,
    activeCount: enCurso.length,
    finishedCount: finished.length,
    memberCount: club.memberCount,
  });

  return (
    <ActivityList
      clubId={club.id}
      clubSlug={club.slug}
      initialActivities={activities}
      isModerator={canModerate}
      today={hoy}
      progress={progress}
      composerOpen={composerOpen}
      hasAside={hasAside}
      aside={
        <ActivitiesAside
          marks={asideMarks}
          clubSlug={club.slug}
          activeCount={enCurso.length}
          finishedCount={finished.length}
          memberCount={club.memberCount}
        />
      }
    />
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
      today={todayISO()}
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
