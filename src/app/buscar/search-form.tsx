import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import {
  SearchIcon,
  BookIcon,
  FilmIcon,
  SeriesIcon,
} from "@/components/ui/icons";
import type { ItemType } from "@/lib/catalog/types";
import { BarcodeScanner } from "./barcode-scanner";

const TYPES: ItemType[] = ["book", "movie", "series"];

export async function SearchForm({
  query,
  itemType,
}: {
  query: string;
  itemType: ItemType;
}) {
  const t = await getTranslations("search");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {TYPES.map((type) => {
          const Icon =
            type === "book"
              ? BookIcon
              : type === "movie"
                ? FilmIcon
                : SeriesIcon;

          return (
            <Link
              key={type}
              href={`/buscar?type=${type}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                type === itemType
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t(`types.${type}`)}
            </Link>
          );
        })}
      </div>

      <form action="/buscar" className="flex gap-2">
        <input type="hidden" name="type" value={itemType} />
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            type="search"
            defaultValue={query}
            placeholder={t(
              itemType === "book" ? "placeholderBook" : "placeholder",
            )}
            className="pl-10"
          />
        </div>
        <button
          type="submit"
          className={buttonVariants("primary", "inline-flex items-center")}
        >
          <SearchIcon className="h-4 w-4" />
          {t("submit")}
        </button>
      </form>

      {itemType === "book" && <BarcodeScanner />}
    </div>
  );
}
