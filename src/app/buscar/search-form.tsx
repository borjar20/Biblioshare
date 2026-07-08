import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import type { ItemType } from "@/lib/catalog/types";

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
        {TYPES.map((type) => (
          <Link
            key={type}
            href={`/buscar?type=${type}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              type === itemType
                ? "bg-accent text-accent-foreground"
                : "bg-surface-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`types.${type}`)}
          </Link>
        ))}
      </div>

      <form action="/buscar" className="flex gap-2">
        <input type="hidden" name="type" value={itemType} />
        <Input
          name="q"
          type="search"
          defaultValue={query}
          placeholder={t(itemType === "book" ? "placeholderBook" : "placeholder")}
          className="flex-1"
        />
        <button type="submit" className={buttonVariants("primary")}>
          {t("submit")}
        </button>
      </form>
    </div>
  );
}
