"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { listMembers, resolveUsername, type ClubMember } from "@/lib/clubs/clubs";
import {
  removeMember,
  inviteMember,
  setMemberRole,
  transferOwnership,
} from "@/lib/clubs/membership";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/social/user-avatar";

// Chips de rol del handoff: el dueño en terracota, la moderación en verde
// (el color de lo social). Clases enteras y literales — Tailwind no ve las
// concatenadas.
const ROLE_CHIP: Record<ClubMember["role"], string> = {
  owner: "bg-accent/15 text-accent",
  moderator: "bg-green/15 text-green",
  member: "bg-surface-muted text-muted-foreground",
};

// Sección de gestión (EPIC-05 Bloque E), moderator+ únicamente -- ver
// club-header.tsx/[slug]/page.tsx para el gateo de quién la ve. La invitación
// se hace por user_id: este componente no incluye un buscador de usuarios
// propio, reutiliza el mismo input libre que search-profiles.ts ya resuelve
// en /usuarios (fuera de alcance de este task añadir un autocomplete nuevo;
// se pega un user_id o username exacto y se resuelve server-side).
export function ManageMembers({
  clubId,
  viewerRole,
  viewerId,
}: {
  clubId: string;
  viewerRole: "moderator" | "owner";
  viewerId: string;
}) {
  const t = useTranslations("club");
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refresh() {
    listMembers(clubId).then(setMembers);
  }

  useEffect(refresh, [clubId]);

  const active = members.filter((m) => m.status === "active");

  function handleRemove(userId: string) {
    startTransition(async () => {
      try {
        await removeMember(clubId, userId);
        refresh();
      } catch {
        setError(t("formError"));
      }
    });
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const userId = await resolveUsername(inviteUsername);
        if (!userId) {
          setError(t("formError"));
          return;
        }
        await inviteMember(clubId, userId);
        setInviteUsername("");
        refresh();
      } catch {
        setError(t("formError"));
      }
    });
  }

  function handlePromote(userId: string, role: "member" | "moderator") {
    startTransition(async () => {
      try {
        await setMemberRole(clubId, userId, role);
        refresh();
      } catch {
        setError(t("formError"));
      }
    });
  }

  function handleTransfer(userId: string) {
    startTransition(async () => {
      try {
        await transferOwnership(clubId, userId);
        refresh();
      } catch {
        setError(t("formError"));
      }
    });
  }

  const compact = "px-3.5 py-1.5 text-xs";

  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface shadow-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("membersCount", { count: active.length })}
        </h2>
        <Button
          type="button"
          variant="secondary"
          className={compact}
          onClick={() => setInviting((v) => !v)}
        >
          + {t("invite")}
        </Button>
      </div>

      {/* El formulario de invitar vive plegado tras el botón, como en el
          handoff: invitar es ocasional, la lista es lo que se viene a ver. */}
      {inviting && (
        <form onSubmit={handleInvite} className="flex items-center gap-2">
          <Input
            value={inviteUsername}
            onChange={(e) => setInviteUsername(e.target.value)}
            placeholder={t("invitePlaceholder")}
            className="min-w-0 flex-1"
          />
          <Button type="submit" className={compact} disabled={isPending || !inviteUsername}>
            {t("invite")}
          </Button>
        </form>
      )}
      {error && <p className="text-xs text-status-dropped">{error}</p>}

      <div className="flex flex-col">
        {active.map((m) => (
          <div
            key={m.userId}
            className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0 last:pb-0"
          >
            <UserAvatar
              name={m.displayName || m.username}
              avatarUrl={m.avatarUrl}
              size={34}
            />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
              {m.displayName || m.username}
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] tracking-wide uppercase ${ROLE_CHIP[m.role]}`}
            >
              {m.role === "owner" ? t("roleOwner") : m.role === "moderator" ? t("roleModerator") : t("roleMember")}
            </span>
            {m.userId !== viewerId && (
              <div className="flex shrink-0 items-center gap-1">
                {viewerRole === "owner" && m.role === "member" && (
                  <Button type="button" variant="ghost" className={compact} disabled={isPending} onClick={() => handlePromote(m.userId, "moderator")}>
                    {t("promote")}
                  </Button>
                )}
                {viewerRole === "owner" && m.role === "moderator" && (
                  <Button type="button" variant="ghost" className={compact} disabled={isPending} onClick={() => handlePromote(m.userId, "member")}>
                    {t("demote")}
                  </Button>
                )}
                {viewerRole === "owner" && m.role !== "owner" && (
                  <Button type="button" variant="ghost" className={compact} disabled={isPending} onClick={() => handleTransfer(m.userId)}>
                    {t("transferOwnership")}
                  </Button>
                )}
                {m.role !== "owner" && (viewerRole === "owner" || m.role === "member") && (
                  <Button type="button" variant="ghost" className={compact} disabled={isPending} onClick={() => handleRemove(m.userId)}>
                    {t("remove")}
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
