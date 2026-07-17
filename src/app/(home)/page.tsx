import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { getFeed, parseFeedFilter, type FeedFilter } from "@/lib/social/feed";
import { getFollowCounts } from "@/lib/social/follows";
import { FeedFilters } from "@/components/social/feed-filters";
import { FeedList } from "@/components/social/feed-list";
import { FeedListSkeleton } from "@/components/social/feed-skeleton";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  // Shell inmediato (título + contador + filtros); el feed —la consulta lenta—
  // llega por streaming detrás de su <Suspense> (Fase B). El contador de
  // seguidos es una cuenta ligera, se espera aquí.
  const counts = await getFollowCounts(supabase, user.id);

  // Ritmo del frame A: cabecera 18/20/8, cuerpo 12/20/22 — más apretado arriba
  // que el py-8 anterior, para que el feed empiece antes.
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 pt-[18px] pb-[22px]">
      <div className="flex items-baseline justify-between gap-3 pb-5">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          {t("home.feedTitle")}
        </h1>
        <span className="font-mono text-[11px] text-muted-foreground">
          {t("feed.followingCount", { count: counts.following })}
        </span>
      </div>

      <div className="mb-4">
        <FeedFilters filter={filter} />
      </div>

      <Suspense key={filter ?? "all"} fallback={<FeedListSkeleton count={4} />}>
        <FeedSection filter={filter} userId={user.id} />
      </Suspense>
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
      filter={filter}
      viewerLoggedIn={true}
    />
  );
}
