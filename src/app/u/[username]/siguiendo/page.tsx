import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getProfileIdentity } from "@/lib/profile/get-profile-by-username";
import { getFollowing } from "@/lib/social/follows";
import { UserCard } from "@/components/social/user-card";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { SHELL_READ } from "@/lib/ui/layout";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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
    <div className={`mx-auto flex w-full ${SHELL_READ} flex-col gap-4 px-4 py-8 sm:px-6`}>
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
        <div className="grid gap-2 lg:grid-cols-2">
          {following.map((user) => (
            <UserCard key={user.userId} user={user} />
          ))}
        </div>
      )}
    </div>
  );
}
