import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import { ManualAddForm } from "./manual-add-form";

export const metadata: Metadata = {
  title: "Añadir manualmente — Biblioshare",
};

const TYPES: ItemType[] = ["book", "movie", "series"];

export default async function ManualAddPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = await searchParams;
  const itemType: ItemType = TYPES.includes(params.type as ItemType)
    ? (params.type as ItemType)
    : "book";

  const t = await getTranslations("search");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("manual.title")}
      </h1>

      <div className="flex gap-2">
        {TYPES.map((type) => (
          <Link
            key={type}
            href={`/buscar/manual?type=${type}`}
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

      <ManualAddForm itemType={itemType} />
    </div>
  );
}
