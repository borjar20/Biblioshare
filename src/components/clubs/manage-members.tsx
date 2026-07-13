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

  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface shadow-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{t("manageMembers")}</h2>

      <form onSubmit={handleInvite} className="flex items-center gap-2">
        <Input
          value={inviteUsername}
          onChange={(e) => setInviteUsername(e.target.value)}
          placeholder={t("invitePlaceholder")}
        />
        <Button type="submit" disabled={isPending || !inviteUsername}>
          {t("invite")}
        </Button>
      </form>
      {error && <p className="text-xs text-status-dropped">{error}</p>}

      <div className="flex flex-col gap-2">
        {active.map((m) => (
          <div key={m.userId} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              {m.displayName || m.username}
              <span className="text-xs text-muted-foreground">
                {m.role === "owner" ? t("roleOwner") : m.role === "moderator" ? t("roleModerator") : t("roleMember")}
              </span>
            </span>
            {m.userId !== viewerId && (
              <div className="flex items-center gap-1">
                {viewerRole === "owner" && m.role === "member" && (
                  <Button type="button" variant="ghost" disabled={isPending} onClick={() => handlePromote(m.userId, "moderator")}>
                    {t("promote")}
                  </Button>
                )}
                {viewerRole === "owner" && m.role === "moderator" && (
                  <Button type="button" variant="ghost" disabled={isPending} onClick={() => handlePromote(m.userId, "member")}>
                    {t("demote")}
                  </Button>
                )}
                {viewerRole === "owner" && m.role !== "owner" && (
                  <Button type="button" variant="ghost" disabled={isPending} onClick={() => handleTransfer(m.userId)}>
                    {t("transferOwnership")}
                  </Button>
                )}
                {m.role !== "owner" && (viewerRole === "owner" || m.role === "member") && (
                  <Button type="button" variant="ghost" disabled={isPending} onClick={() => handleRemove(m.userId)}>
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
