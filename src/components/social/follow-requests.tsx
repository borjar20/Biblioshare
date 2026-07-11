import { getTranslations } from "next-intl/server";
import type { FollowUser } from "@/lib/social/follows";
import { UserCard } from "./user-card";
import { RequestActions } from "./request-actions";

// Bandeja de solicitudes de seguimiento pendientes (solo en el perfil propio y
// solo para perfiles privados). No renderiza nada si no hay solicitudes.
export async function FollowRequests({
  requests,
}: {
  requests: FollowUser[];
}) {
  if (requests.length === 0) return null;
  const t = await getTranslations("social");

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">
        {t("requestsTitle")}
      </h2>
      <div className="flex flex-col gap-2">
        {requests.map((user) => (
          <UserCard
            key={user.userId}
            user={user}
            action={<RequestActions followerId={user.userId} />}
          />
        ))}
      </div>
    </section>
  );
}
