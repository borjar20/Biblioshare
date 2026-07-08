import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getProfileByUsername } from "@/lib/profile/get-profile-by-username";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { LibraryFilters } from "@/app/biblioteca/library-filters";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { PublicItemCard } from "./public-item-card";
import { VisibilityToggle } from "./visibility-toggle";

const VALID_TYPES: ItemType[] = ["book", "movie", "series"];
const VALID_STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username} — Biblioshare` };
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const { username } = await params;
  const parsedParams = await searchParams;
  const itemType = VALID_TYPES.includes(parsedParams.type as ItemType)
    ? (parsedParams.type as ItemType)
    : undefined;
  const status = VALID_STATUSES.includes(parsedParams.status as MediaStatus)
    ? (parsedParams.status as MediaStatus)
    : undefined;

  const t = await getTranslations("profile");
  const supabase = await createClient();

  const [profile, {
    data: { user },
  }] = await Promise.all([
    getProfileByUsername(supabase, username),
    supabase.auth.getUser(),
  ]);

  if (!profile) notFound();

  const isOwner = user?.id === profile.userId;
  const items = await getLibraryItems(supabase, profile.userId, {
    itemType,
    status,
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          @{profile.username}
        </h1>
        {isOwner && (
          <VisibilityToggle username={profile.username} isPublic={profile.isPublic} />
        )}
      </div>

      <LibraryFilters
        itemType={itemType}
        status={status}
        basePath={`/u/${profile.username}`}
      />

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <PublicItemCard key={item.entryId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
