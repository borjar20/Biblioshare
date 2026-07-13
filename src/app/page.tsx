import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { getFeed } from "@/lib/social/feed";
import { FeedFilters } from "@/components/social/feed-filters";
import { FeedList } from "@/components/social/feed-list";
import { AppLogoIcon, SparklesIcon } from "@/components/ui/icons";
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
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-border bg-surface shadow-sm">
            <AppLogoIcon className="h-10 w-10 text-accent" />
          </div>
          <SparklesIcon className="absolute -right-2 -top-2 h-6 w-6 text-accent" />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("common.appName")}
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

  const feedPage = await getFeed(supabase, user.id, {
    itemType,
    reviewsOnly,
    pageSize: 20,
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("home.feedTitle")}
      </h1>

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
