import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getProfileIdentity } from "@/lib/profile/get-profile-by-username";
import { getFollowing } from "@/lib/social/follows";
import { UserCard } from "@/components/social/user-card";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { SHELL_READ } from "@/lib/ui/layout";

// Shell estático = contenedor + título (traducción estática, #475); el enlace de
// vuelta y la lista dependen de `params` y bajan tras el <Suspense> (#476).
export default async function FollowingPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const t = await getTranslations("social");

  return (
    <div className={`mx-auto flex w-full ${SHELL_READ} flex-col gap-4 px-4 py-8 sm:px-6`}>
      <Suspense fallback={<FollowListSkeleton title={t("followingTitle")} />}>
        <FollowingContent params={params} />
      </Suspense>
    </div>
  );
}

// Fantasma: enlace de vuelta + título real + tarjetas. Mismas alturas que el
// contenido (enlace text-sm, tarjetas de UserCard).
function FollowListSkeleton({ title }: { title: string }) {
  return (
    <>
      <SkeletonLine className="h-5 w-28" />
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <div aria-hidden className="grid gap-2 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-card" />
        ))}
      </div>
    </>
  );
}

async function FollowingContent({
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
    <>
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
    </>
  );
}
