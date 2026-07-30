import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CollectionSummary } from "@/components/library/collection-summary";
import { getLibrarySummary } from "@/lib/library/get-library-summary";
import { createClient } from "@/lib/supabase/server";
import type { KnownTab } from "@/app/coleccion/collection-tabs";

export async function CollectionDesktopRail({
  userId,
  tab,
}: {
  userId: string;
  tab: KnownTab;
}) {
  const supabase = await createClient();
  const [summary, t] = await Promise.all([
    getLibrarySummary(supabase, userId),
    getTranslations("collection.desktopRail"),
  ]);

  return (
    <div className="grid gap-5">
      <p className="font-mono text-[11px] tracking-[0.12em] uppercase">
        {t("title")}
      </p>
      <CollectionSummary summary={summary} />
      <Link href="/buscar">{t("browse")}</Link>
      {tab !== "colecciones" && (
        <Link href="/coleccion">{t("collections")}</Link>
      )}
    </div>
  );
}
