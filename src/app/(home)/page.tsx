import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { getFeed, parseFeedFilter, type FeedFilter } from "@/lib/social/feed";
import { getFollowCounts } from "@/lib/social/follows";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { StatsRail } from "@/components/stats/stats-rail";
import { TodayBlock } from "@/components/stats/today-block";
import { FeedFilters } from "@/components/social/feed-filters";
import { FeedList } from "@/components/social/feed-list";
import { FeedListSkeleton } from "@/components/social/feed-skeleton";
import { TodayBlockSkeleton } from "@/components/stats/today-skeleton";
// Sin adornos: la marca dice que el carácter lo ponen la serif y el color, no
// los brillitos — fuera el SparklesIcon que decoraba la landing.
import { AppLogoIcon } from "@/components/ui/icons";

// Inicio = el feed (§IA del rediseño Paper). El panel de estadísticas que vivía
// aquí en una pestaña se mudó a Perfil › Panel, que es donde tiene sentido:
// es privado y es tuyo.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { filtro } = await searchParams;
  const t = await getTranslations();
  // `getCurrentUser()` está memoizada por petición: AppShell ya la ha llamado
  // al pintar el chrome, así que aquí no hay un segundo viaje de red al
  // servidor de auth (issue #283).
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
        <AppLogoIcon className="h-16 w-16" />
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          Biblio<span className="text-accent">share</span>
        </h1>
        <p className="max-w-md text-lg text-muted-foreground">
          {t("home.tagline")}
        </p>
        <Link href="/signup" className={buttonVariants("primary", "px-6")}>
          {t("home.cta")}
        </Link>
      </div>
    );
  }

  const filter = parseFeedFilter(filtro);
  const supabase = await createClient();

  // Shell inmediato (título + contador + filtros); el feed —la consulta lenta—
  // llega por streaming detrás de su <Suspense> (Fase B). El contador de
  // seguidos y el nombre del saludo son lecturas ligeras, se esperan aquí; el
  // rail hace las suyas por su cuenta, detrás de su propio boundary.
  const [counts, profile] = await Promise.all([
    getFollowCounts(supabase, user.id),
    getOwnProfile(supabase, user.id),
  ]);

  // Dos cabeceras, una por breakpoint (P-T7): en móvil el frame A abre con
  // "Novedades" a secas; en escritorio el frame B saluda, porque ahí el feed
  // comparte pantalla con tus stats y la página deja de ser solo una lista.
  // Duplicados sin estado, así que el patrón de dos árboles es seguro.
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 pt-[18px] pb-[22px] lg:max-w-[1200px] lg:px-7 lg:pt-[26px]">
      <div className="hidden pb-2.5 lg:block">
        <h1 className="font-serif text-[30px] leading-none font-semibold tracking-tight">
          {t("home.greeting", { name: profile?.displayName || profile?.username || "" })}
        </h1>
        {profile?.username && (
          <p className="mt-[5px] font-mono text-[12.5px] text-muted-foreground">
            {`@${profile.username} · ${t("feed.followingPeople", { count: counts.following })}`}
          </p>
        )}
      </div>

      {/* "¿Qué has disfrutado hoy?" (frame G) encabeza el Inicio, sobre el
          feed: primero lo tuyo a medias, después lo de los demás. En escritorio
          cruza las DOS columnas (decisión del usuario) — el frame G solo está
          dibujado para móvil. Detrás de su propio <Suspense> para no retrasar
          el shell, igual que el feed y el rail.

          El fallback RESERVA su alto. Con `fallback={null}` no reservaba nada y,
          como el bloque encabeza la página, al llegar empujaba el feed entero
          hacia abajo: 0.51 de CLS en móvil, la peor métrica de la app
          (issue #284). */}
      <Suspense fallback={<TodayBlockSkeleton />}>
        <TodayBlock userId={user.id} />
      </Suspense>

      <div className="pt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-7">
        <div className="min-w-0">
          {/* En móvil "Novedades" encabeza el FEED, no la página: encima está
              el bloque de hoy, que es quien abre el Inicio (frame G). Es la
              misma estructura que ya tenía el escritorio con "Actividad de tu
              gente" — primero lo tuyo, luego lo de los demás. */}
          <div className="flex items-baseline justify-between gap-3 pb-4 lg:hidden">
            <h1 className="font-serif text-2xl font-semibold tracking-tight">
              {t("home.feedTitle")}
            </h1>
            <span className="font-mono text-[11px] text-muted-foreground">
              {t("feed.followingCount", { count: counts.following })}
            </span>
          </div>

          {/* En PC el rótulo y los chips comparten línea (frame B); en móvil el
              rótulo no está y los chips se quedan solos a la izquierda. */}
          <div className="mb-4 flex items-baseline justify-between gap-4 lg:mb-3.5">
            <span className="hidden font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase lg:block">
              {t("feed.sectionTitle")}
            </span>
            <FeedFilters filter={filter} />
          </div>

          <Suspense key={filter ?? "all"} fallback={<FeedListSkeleton count={4} />}>
            <FeedSection filter={filter} userId={user.id} />
          </Suspense>
        </div>

        {/* El rail se pega bajo la topbar, que mide --topbar-h y también es
            sticky: sin el calc se metería debajo. */}
        <aside className="hidden lg:sticky lg:top-[calc(var(--topbar-h)+16px)] lg:block">
          <Suspense fallback={null}>
            <StatsRail userId={user.id} />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}

// El feed: la consulta pesada, aislada en su propio boundary para que el shell
// pinte sin esperarla.
async function FeedSection({
  filter,
  userId,
}: {
  filter?: FeedFilter;
  userId: string;
}) {
  const supabase = await createClient();
  const feedPage = await getFeed(supabase, userId, { filter, pageSize: 20 });

  return (
    <FeedList
      initialEvents={feedPage.events}
      initialCursor={feedPage.nextCursor}
      initialKnownUsernames={feedPage.knownUsernames}
      filter={filter}
      viewerLoggedIn={true}
    />
  );
}
