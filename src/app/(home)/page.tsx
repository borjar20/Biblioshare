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
import { ThoughtComposerTrigger } from "@/components/social/thought-composer-trigger";
import { FeedList } from "@/components/social/feed-list";
import { FeedListSkeleton } from "@/components/social/feed-skeleton";
import { TodayBlockSkeleton } from "@/components/stats/today-skeleton";
// Sin adornos: la marca dice que el carácter lo ponen la serif y el color, no
// los brillitos — fuera el SparklesIcon que decoraba la landing.
import { AppLogoIcon } from "@/components/ui/icons";
import { SHELL_HOME } from "@/lib/ui/layout";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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
    getOwnProfile(user.id),
  ]);

  // Inicio de tres áreas: PERSONAL · FEED · STATS (consumir → socializar →
  // medir). El reflow por breakpoint lo hace `.home-grid` con grid-template-
  // areas (globals.css); aquí solo va el marcado, con `data-area` por columna.
  // El orden del DOM (personal → feed → stats) NO fija el orden visual: en móvil
  // las stats se cuelan entre lo personal y el feed, y en tablet el feed baja a
  // ancho completo. Un solo <h1> visible (el saludo), a todos los tamaños:
  // sustituye al par saludo-escritorio / "Novedades"-móvil de antes.
  return (
    <div className={`mx-auto flex w-full ${SHELL_HOME} flex-1 flex-col px-5 pt-[18px] pb-[22px] lg:px-7 lg:pt-[26px]`}>
      {/* Saludo a ancho completo, sobre las columnas (paso 1 del orden móvil).
          Compacto en móvil, grande en escritorio. */}
      <div className="pb-3.5 md:pb-4">
        <h1 className="font-serif text-2xl font-semibold tracking-tight md:text-[30px] md:leading-none">
          {t("home.greeting", { name: profile?.displayName || profile?.username || "" })}
        </h1>
        {profile?.username && (
          <p className="mt-1 font-mono text-[12px] text-muted-foreground md:mt-[5px] md:text-[12.5px]">
            {`@${profile.username} · ${t("feed.followingPeople", { count: counts.following })}`}
          </p>
        )}
      </div>

      <div className="home-grid">
        {/* PERSONAL: "¿Qué has disfrutado hoy?" + en curso + para más tarde +
            continúa. Detrás de su <Suspense> con fallback que RESERVA su alto:
            con `fallback={null}` empujaba el feed al llegar — 0.51 de CLS en
            móvil, la peor métrica de la app (issue #284). */}
        <div data-area="personal">
          <Suspense fallback={<TodayBlockSkeleton />}>
            <TodayBlock userId={user.id} />
          </Suspense>
        </div>

        {/* FEED: compartir un pensamiento + filtros + actividad de tu gente. */}
        <div data-area="feed">
          {/* Disparador del compositor de «Pensamiento» (Fase 4): fila propia,
              no comparte línea con los chips de filtro -- esos ya van "por los
              pelos" a una fila a 360px (ver feed-filters.tsx) y no hay hueco
              para un tercer elemento sin romperse a una segunda línea. */}
          <div className="pb-3.5">
            <ThoughtComposerTrigger />
          </div>

          {/* Rótulo de sección ("Actividad de tu gente") + chips de filtro en
              una línea. El rótulo es la cabecera del feed en todos los tamaños,
              ya no solo en escritorio: el feed es ahora su propia columna/área. */}
          <div className="mb-4 flex items-baseline justify-between gap-4 lg:mb-3.5">
            <span className="label-section">{t("feed.sectionTitle")}</span>
            <FeedFilters filter={filter} />
          </div>

          <Suspense key={filter ?? "all"} fallback={<FeedListSkeleton count={4} />}>
            <FeedSection filter={filter} userId={user.id} />
          </Suspense>
        </div>

        {/* STATS: resumen semanal / meta anual / racha. En móvil StatsRail pinta
            un resumen compacto (tres cifras); de md para arriba, el detalle. El
            sticky (solo con 3 columnas) lo pone `.home-grid`. */}
        <aside data-area="stats">
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
