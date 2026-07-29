import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getFeed } from "@/lib/social/feed";
import { ProfileActivityFeed } from "@/components/social/profile-activity-feed";
import { EmptyState } from "@/components/ui/empty-state";
import { UsersIcon } from "@/components/ui/icons";
import { buttonVariants } from "@/components/ui/button";

// Actividad — la cara pública del perfil (frames A/D). Es el mismo feed que ve
// un visitante, sin ramas por rol (plan 05, P5): un no-seguidor de un perfil
// público ve también las sesiones. La privacidad la decide el interruptor de
// perfil privado, que corta antes de llegar aquí.
export async function ActivityTab({
  userId,
  viewerLoggedIn,
  isOwner,
}: {
  userId: string;
  viewerLoggedIn: boolean;
  isOwner: boolean;
}) {
  const supabase = await createClient();
  const t = await getTranslations("profile");
  const user = await getCurrentUser();

  const page = await getFeed(supabase, user?.id ?? userId, { actorId: userId });

  if (page.events.length === 0) {
    return (
      <EmptyState
        glyph={<UsersIcon className="h-7 w-7" />}
        title={t("activityEmptyTitle")}
        message={isOwner ? t("activityEmptyOwn") : t("activityEmpty")}
        action={
          isOwner ? (
            <Link href="/buscar" className={buttonVariants("primary")}>
              {t("activityEmptyCta")}
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <ProfileActivityFeed
      actorId={userId}
      initialEvents={page.events}
      initialCursor={page.nextCursor}
      viewerLoggedIn={viewerLoggedIn}
    />
  );
}
