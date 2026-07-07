import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { searchCatalog } from "@/lib/catalog/search";
import type { ItemType } from "@/lib/catalog/types";
import { SearchForm } from "./search-form";
import { SearchResultCard } from "./search-result-card";

export const metadata: Metadata = {
  title: "Buscar — Biblioshare",
};

const VALID_TYPES: ItemType[] = ["book", "movie", "series"];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const itemType: ItemType = VALID_TYPES.includes(params.type as ItemType)
    ? (params.type as ItemType)
    : "book";

  const t = await getTranslations("search");
  const results = query ? await searchCatalog(itemType, query) : [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <SearchForm query={query} itemType={itemType} />

      {!query && (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}

      {query && results.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("noResults")}</p>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {results.map((result) => (
            <SearchResultCard
              key={`${result.itemType}-${result.externalId}`}
              result={result}
            />
          ))}
        </div>
      )}

      <Link
        href={`/buscar/manual?type=${itemType}`}
        className="self-start text-sm text-muted-foreground underline hover:text-foreground"
      >
        {t("manual.link")}
      </Link>
    </div>
  );
}
