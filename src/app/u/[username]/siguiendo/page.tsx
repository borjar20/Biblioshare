import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getProfileIdentity } from "@/lib/profile/get-profile-by-username";
import { getFollowing } from "@/lib/social/follows";
import { UserCard } from "@/components/social/user-card";
import { ArrowLeftIcon } from "@/components/ui/icons";

export default async function FollowingPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();

  const identity = await getProfileIdentity(supabase, username);
  if (!identity) notFound();

  const [t, following] = await Promise.all([
    getTranslations("social"),
    getFollowing(supabase, identity.userId),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 sm:px-6">
      <Link
        href={`/u/${username}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {t("backToProfile")}
      </Link>
      <h1 className="text-xl font-semibold tracking-tight">
        {t("followingTitle")}
      </h1>
      {following.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("emptyFollowing")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {following.map((user) => (
            <UserCard key={user.userId} user={user} />
          ))}
        </div>
      )}
    </div>
  );
}
