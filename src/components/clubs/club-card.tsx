"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ClubWithCount, ClubMembershipStatus } from "@/lib/clubs/clubs";
import { joinClub } from "@/lib/clubs/membership";
import { requestJoinClub } from "@/lib/clubs/join-requests";
import { Button, buttonVariants } from "@/components/ui/button";
import { LockIcon } from "@/components/ui/icons";
import { ClubCoverBand } from "./club-cover";

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

  const compact = "px-3.5 py-1.5 text-xs";

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <Link href={`/club/${club.slug}`} className="block">
        <ClubCoverBand coverUrl={club.coverUrl} seed={club.id} className="h-[74px]">
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full border border-border bg-surface/85 px-2 py-0.5 font-mono text-[9px] tracking-wide text-foreground uppercase backdrop-blur-sm">
            {isPrivate && <LockIcon aria-hidden className="h-2.5 w-2.5" />}
            {isPrivate ? t("chipPrivate") : t("chipPublic")}
          </span>
        </ClubCoverBand>

        <span className="flex flex-col gap-1 px-4 pt-3">
          <span className="truncate font-serif text-base font-semibold text-foreground">
            {club.name}
          </span>
          {club.description && (
            <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {club.description}
            </span>
          )}
        </span>
      </Link>

      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-3.5">
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
          {unread > 0 && (
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-accent" />
          )}
          <span className="truncate">
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

        {status === "active" ? (
          <Link
            href={`/club/${club.slug}`}
            className={buttonVariants("secondary", compact)}
          >
            {t("open")}
          </Link>
        ) : status === "requested" ? (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {t("requestPending")}
          </span>
        ) : status === "none" ? (
          <Button
            type="button"
            variant={isPrivate ? "secondary" : "green"}
            className={compact}
            disabled={isPending}
            onClick={handleJoin}
          >
            {isPrivate ? t("requestJoin") : t("join")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
