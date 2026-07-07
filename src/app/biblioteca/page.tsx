import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { getLibraryItems } from "@/lib/library/get-library-items";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { LibraryFilters } from "./library-filters";
import { LibraryItemCard } from "./library-item-card";

export const metadata: Metadata = {
  title: "Mi biblioteca — Biblioshare",
};

const VALID_TYPES: ItemType[] = ["book", "movie", "series"];
const VALID_STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const params = await searchParams;
  const itemType = VALID_TYPES.includes(params.type as ItemType)
    ? (params.type as ItemType)
    : undefined;
  const status = VALID_STATUSES.includes(params.status as MediaStatus)
    ? (params.status as MediaStatus)
    : undefined;

  const t = await getTranslations("library");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy guarantees a session on this route; this keeps the type narrow.
  if (!user) return null;

  const items = await getLibraryItems(supabase, user.id, { itemType, status });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <LibraryFilters itemType={itemType} status={status} />

      {items.length === 0 && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
          <Link href="/buscar" className={buttonVariants("primary")}>
            {t("emptyCta")}
          </Link>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <LibraryItemCard key={item.entryId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
