"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { getClub } from "@/lib/clubs/clubs";
import { joinClub, leaveClub, acceptInvite, declineInvite } from "@/lib/clubs/membership";
import { ClubForm } from "./club-form";
import { ClubCoverBand } from "./club-cover";
import { Button } from "@/components/ui/button";
import { LockIcon } from "@/components/ui/icons";

type ClubDetail = NonNullable<Awaited<ReturnType<typeof getClub>>>;

export function ClubHeader({ club, userId }: { club: ClubDetail; userId: string }) {
  const t = useTranslations("club");
  const [status, setStatus] = useState(club.viewerStatus);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleJoin() {
    startTransition(async () => {
      await joinClub(club.id);
      setStatus("active");
    });
  }

  function handleLeave() {
    startTransition(async () => {
      try {
        await leaveClub(club.id);
        setStatus("none");
      } catch {
        setError(t("leaveOwnerError"));
      }
    });
  }

  function handleAccept() {
    startTransition(async () => {
      await acceptInvite(club.id);
      setStatus("active");
    });
  }

  function handleDecline() {
    startTransition(async () => {
      await declineInvite(club.id);
      setStatus("none");
    });
  }

  const canEdit = club.viewerRole === "moderator" || club.viewerRole === "owner";
  const compact = "px-3.5 py-1.5 text-xs";

  // status === "none" solo puede ocurrir aquí para un club PÚBLICO: getClub()
  // devuelve null (404, ver page.tsx) para un club privado visto por un
  // no-miembro, así que ClubHeader nunca llega a renderizar en ese caso -- no
  // hace falta distinguir público/privado en el botón de unirse.
  return (
    <div className="flex flex-col gap-4">
      {/* El banner siempre está: con imagen si el club la tiene, y si no con
          el patrón de rayas determinista — igual que la tarjeta del listado. */}
      <ClubCoverBand
        coverUrl={club.coverUrl}
        seed={club.id}
        className="h-[120px] rounded-card border border-border shadow-card"
      />

      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-serif text-[22px] leading-tight font-semibold text-foreground">
            {club.name}
          </h1>
          <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
            {club.visibility === "private" && (
              <>
                <LockIcon aria-hidden className="h-3 w-3 shrink-0" />
                {t("chipPrivate")}
                {" · "}
              </>
            )}
            {t("memberCount", { count: club.memberCount })}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {status === "none" && (
            <Button type="button" variant="green" className={compact} disabled={isPending} onClick={handleJoin}>
              {t("join")}
            </Button>
          )}
          {status === "invited" && (
            <>
              <Button type="button" variant="green" className={compact} disabled={isPending} onClick={handleAccept}>
                {t("acceptInvite")}
              </Button>
              <Button type="button" variant="ghost" className={compact} disabled={isPending} onClick={handleDecline}>
                {t("declineInvite")}
              </Button>
            </>
          )}
          {status === "active" && club.viewerRole !== "owner" && (
            <Button type="button" variant="secondary" className={compact} disabled={isPending} onClick={handleLeave}>
              {t("leave")}
            </Button>
          )}
          {canEdit && (
            <Button type="button" variant="ghost" className={compact} onClick={() => setEditing((v) => !v)}>
              {t("editToggle")}
            </Button>
          )}
        </div>
      </div>

      {club.description && (
        <p className="-mt-1 max-w-prose text-[13px] leading-relaxed text-muted-foreground">
          {club.description}
        </p>
      )}

      {error && <p className="text-xs text-status-dropped">{error}</p>}

      {editing && (
        <ClubForm
          userId={userId}
          mode="edit"
          club={club}
          onUpdated={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}
