import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { getFeed } from "@/lib/social/feed";
import { getFollowCounts } from "@/lib/social/follows";
import { FeedFilters } from "@/components/social/feed-filters";
import { FeedList } from "@/components/social/feed-list";
// Sin adornos: la marca dice que el carácter lo ponen la serif y el color, no
// los brillitos — fuera el SparklesIcon que decoraba la landing.
import { AppLogoIcon } from "@/components/ui/icons";
import type { ItemType } from "@/lib/catalog/types";

const ITEM_TYPES: readonly string[] = ["book", "movie", "series"];

// Inicio = el feed (§IA del rediseño Paper). El panel de estadísticas que vivía
// aquí en una pestaña se mudó a Perfil › Panel, que es donde tiene sentido:
// es privado y es tuyo.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    itemType?: string;
    reviewsOnly?: string;
  }>;
}) {
  const { itemType: itemTypeParam, reviewsOnly: reviewsOnlyParam } =
    await searchParams;
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

  const itemType = ITEM_TYPES.includes(itemTypeParam ?? "")
    ? (itemTypeParam as ItemType)
    : undefined;
  const reviewsOnly = reviewsOnlyParam === "1";

  const [feedPage, counts] = await Promise.all([
    getFeed(supabase, user.id, {
      itemType,
      reviewsOnly,
      pageSize: 20,
    }),
    getFollowCounts(supabase, user.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("home.feedTitle")}
        </h1>
        <span className="font-mono text-[11px] text-muted-foreground">
          {t("feed.followingCount", { count: counts.following })}
        </span>
      </div>

      <FeedFilters itemType={itemType} reviewsOnly={reviewsOnly} />

      <FeedList
        key={`${itemType ?? "all"}:${reviewsOnly ? 1 : 0}`}
        initialEvents={feedPage.events}
        initialCursor={feedPage.nextCursor}
        itemType={itemType}
        reviewsOnly={reviewsOnly}
        viewerLoggedIn={true}
      />
    </div>
  );
}
