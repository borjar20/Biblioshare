"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ClubWithCount, ClubMembershipStatus } from "@/lib/clubs/clubs";
import { joinClub } from "@/lib/clubs/membership";
import { requestJoinClub } from "@/lib/clubs/join-requests";
import { Button } from "@/components/ui/button";
import { UsersIcon, LockIcon } from "@/components/ui/icons";

// La tarjeta sirve para "Mis clubes" y para "Descubrir". Un club privado puede
// aparecer aquí (te lo pasaron por enlace, o ya eres miembro), así que sí hace
// falta distinguir unirse (público, inmediato) de solicitar (privado, pendiente
// de moderación).
export function ClubCard({
  club,
  unread = 0,
}: {
  club: ClubWithCount & { viewerStatus: ClubMembershipStatus };
  /** Posts y actividades ajenos desde tu última visita. */
  unread?: number;
}) {
  const t = useTranslations("club");
  const [status, setStatus] = useState(club.viewerStatus);
  const [isPending, startTransition] = useTransition();

  // Unirse a un club público es inmediato. A uno privado se SOLICITA, y queda
  // esperando a que un moderador lo resuelva.
  const isPrivate = club.visibility === "private";

  function handleJoin() {
    startTransition(async () => {
      if (isPrivate) {
        await requestJoinClub(club.id);
        setStatus("requested");
        return;
      }
      await joinClub(club.id);
      setStatus("active");
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
      <Link
        href={`/club/${club.slug}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        {/* Lo social es verde en Paper: el club se identifica por este marcador,
            no por el acento terracota (que es de acción). */}
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green/15 text-green"
        >
          <UsersIcon className="h-4 w-4" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            {club.visibility === "private" && (
              <LockIcon
                aria-hidden
                className="h-3 w-3 shrink-0 text-muted-foreground"
              />
            )}
            <span className="truncate font-serif text-sm font-semibold text-foreground">
              {club.name}
            </span>
          </span>
          {club.description && (
            <span className="truncate text-xs text-muted-foreground">
              {club.description}
            </span>
          )}
          <span className="font-mono text-[10px] text-muted-foreground">
            {t("memberCount", { count: club.memberCount })}
            {unread > 0 && (
              <>
                {" · "}
                <span className="text-accent">
                  {t("unreadCount", { count: unread })}
                </span>
              </>
            )}
          </span>
        </span>
      </Link>

      {status === "none" && (
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={handleJoin}
        >
          {isPrivate ? t("requestJoin") : t("join")}
        </Button>
      )}
      {status === "requested" && (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {t("requestPending")}
        </span>
      )}
    </div>
  );
}
