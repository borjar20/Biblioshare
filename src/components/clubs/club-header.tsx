"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { getClub } from "@/lib/clubs/clubs";
import { joinClub, leaveClub, acceptInvite, declineInvite } from "@/lib/clubs/membership";
import { ClubForm } from "./club-form";
import { ClubCoverBand } from "./club-cover";
import { Button } from "@/components/ui/button";
import {
  LockIcon,
  ChevronLeftIcon,
  EllipsisIcon,
  CheckIcon,
  PencilIcon,
} from "@/components/ui/icons";

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
        />
        <Link
          href="/clubes"
          aria-label={t("back")}
          className="absolute top-3.5 left-4 grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-border bg-surface/80 text-foreground backdrop-blur-sm transition-colors hover:bg-surface"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Link>
        {hasMenu && (
          <ClubHeaderMenu
            label={t("menuLabel")}
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

type MenuItem = {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
};

// Menú ⋯ del banner (P2): agrupa Editar y Salir. Menú ligero y accesible —
// no hay primitiva de dropdown en el proyecto y no merece traerse una
// dependencia por dos items: botón con aria-haspopup, cierre por Escape y
// clic fuera, y foco visible en cada opción.
function ClubHeaderMenu({
  label,
  items,
}: {
  label: string;
  items: (MenuItem | false)[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const visible = items.filter((it): it is MenuItem => Boolean(it));

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="absolute top-3.5 right-4">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-border bg-surface/80 text-foreground backdrop-blur-sm transition-colors hover:bg-surface"
      >
        <EllipsisIcon className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-[42px] right-0 z-10 min-w-[168px] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-card"
        >
          {visible.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-surface-muted disabled:opacity-60 ${
                it.danger ? "text-status-dropped" : "text-foreground"
              }`}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
