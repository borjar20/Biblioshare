"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { getClub } from "@/lib/clubs/clubs";
import { joinClub, leaveClub, acceptInvite, declineInvite } from "@/lib/clubs/membership";
import { checkCelebrations } from "@/lib/celebrations/preference";
import { ClubForm } from "./club-form";
import { ClubCoverBand } from "./club-cover";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { LockIcon, ChevronLeftIcon, ChevronRightIcon, CheckIcon, PencilIcon } from "@/components/ui/icons";

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
      checkCelebrations(); // pudo ganar "primera participación en un club"
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
      checkCelebrations(); // pudo ganar "primera participación en un club"
    });
  }

  function handleDecline() {
    startTransition(async () => {
      await declineInvite(club.id);
      setStatus("none");
    });
  }

  const canEdit = club.viewerRole === "moderator" || club.viewerRole === "owner";
  const isMember = status === "active";
  // El dueño no puede salir sin transferir la propiedad antes: "Salir" no le
  // aparece en el menú (leaveClub lo rechazaría igualmente, pero no ofrecerlo
  // evita el error). El menú ⋯ solo existe si tiene algo dentro.
  const canLeave = isMember && club.viewerRole !== "owner";
  const hasMenu = canEdit || canLeave;
  const compact = "px-3.5 py-1.5 text-xs";

  // status === "none" solo puede ocurrir aquí para un club PÚBLICO: getClub()
  // devuelve null (404, ver page.tsx) para un club privado visto por un
  // no-miembro, así que ClubHeader nunca llega a renderizar en ese caso -- no
  // hace falta distinguir público/privado en el botón de unirse.
  return (
    <div className="flex flex-col gap-4">
      {/* El banner siempre está: con imagen si el club la tiene, y si no con
          el patrón de rayas determinista. Los botones flotan por encima como
          hermanos de la banda (no dentro): la banda es overflow-hidden y
          recortaría el panel del menú. */}
      <div className="relative">
        <ClubCoverBand
          coverUrl={club.coverUrl}
          seed={club.id}
          className="h-[120px] rounded-card border border-border shadow-card"
          zoomable
        />
        <Link
          href="/clubes"
          aria-label={t("back")}
          className="absolute top-3.5 left-4 grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-border bg-surface/80 text-foreground backdrop-blur-sm transition-colors hover:bg-surface"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Link>
        {hasMenu && (
          <div className="absolute top-3.5 right-4">
            <ActionMenu
              label={t("menuLabel")}
              triggerClassName="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-border bg-surface/80 text-foreground backdrop-blur-sm transition-colors hover:bg-surface"
              items={[
                canEdit && {
                  key: "edit",
                  label: t("editMenu"),
                  icon: <PencilIcon className="h-4 w-4" />,
                  onSelect: () => setEditing((v) => !v),
                },
                canLeave && {
                  key: "leave",
                  label: t("leaveMenu"),
                  icon: <ChevronLeftIcon className="h-4 w-4" />,
                  onSelect: handleLeave,
                  disabled: isPending,
                  danger: true,
                },
              ]}
            />
          </div>
        )}
      </div>

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
            {/* El recuento enlaza al directorio de miembros (§2.5-bis), pero solo
                para miembros: el roster es members-only (la RLS lo gatea). */}
            {isMember ? (
              <Link
                href={`/club/${club.slug}/miembros`}
                className="inline-flex items-center gap-0.5 text-foreground underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
              >
                {t("memberCount", { count: club.memberCount })}
                <ChevronRightIcon className="h-3 w-3" />
              </Link>
            ) : (
              t("memberCount", { count: club.memberCount })
            )}
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
          {/* Miembro: un chip de estado (no un botón). Salir vive en el menú ⋯
              del banner; aquí solo se confirma la pertenencia, como en el frame 2. */}
          {isMember && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-foreground">
              <CheckIcon className="h-3.5 w-3.5 text-green" />
              {t("memberChip")}
            </span>
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
