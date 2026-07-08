import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ItemLibraryButton } from "@/components/item-library-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: series } = await supabase
    .from("series")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  return { title: series ? `${series.title} — Biblioshare` : "Biblioshare" };
}

export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("item");
  const supabase = await createClient();

  const [{ data: series }, { data: { user } }] = await Promise.all([
    supabase
      .from("series")
      .select(
        "id, title, creator, cover_url, synopsis, release_year, total_seasons, total_episodes, genres"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!series) notFound();

  let alreadyAdded = false;
  if (user) {
    const { data: entry } = await supabase
      .from("library_entries")
      .select("id")
      .eq("user_id", user.id)
      .eq("item_type", "series")
      .eq("item_id", series.id)
      .maybeSingle();
    alreadyAdded = entry !== null;
  }

  const metaLines = [
    [series.creator, series.release_year].filter(Boolean).join(" · "),
    [
      series.total_seasons ? `${series.total_seasons} ${t("seasons")}` : null,
      series.total_episodes ? `${series.total_episodes} ${t("episodes")}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    series.genres && series.genres.length > 0 ? series.genres.join(", ") : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:flex-row sm:px-6">
      <div className="relative aspect-[2/3] w-full max-w-xs shrink-0 overflow-hidden rounded-lg bg-surface-muted sm:w-56">
        {series.cover_url ? (
          <Image
            src={series.cover_url}
            alt={series.title}
            fill
            sizes="(max-width: 768px) 80vw, 224px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
            {series.title}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{series.title}</h1>

        {metaLines.map((line, i) => (
          <p key={i} className="text-sm text-muted-foreground">
            {line}
          </p>
        ))}

        {series.synopsis && (
          <p className="text-sm text-foreground">{series.synopsis}</p>
        )}

        <div>
          <ItemLibraryButton
            itemType="series"
            itemId={series.id}
            initiallyAdded={alreadyAdded}
          />
        </div>
      </div>
    </div>
  );
}
