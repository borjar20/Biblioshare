"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  approveJoinRequest,
  rejectJoinRequest,
  type JoinRequest,
} from "@/lib/clubs/join-requests";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/social/user-avatar";
import { XIcon } from "@/components/ui/icons";

// Solicitudes de entrada esperando en la puerta de un club privado.
export function JoinRequestList({
  clubId,
  initialRequests,
}: {
  clubId: string;
  initialRequests: JoinRequest[];
}) {
  const t = useTranslations("club");
  // Deriva de props: tras aprobar/rechazar, las acciones revalidan (Fase 1) y
  // la RSC re-ejecuta entregando un initialRequests sin la fila resuelta.
  const requests = initialRequests;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (requests.length === 0) return null;

  function decide(userId: string, decision: "approve" | "reject") {
    setPendingId(userId);
    startTransition(async () => {
      await (decision === "approve"
        ? approveJoinRequest(clubId, userId)
        : rejectJoinRequest(clubId, userId));
      setPendingId(null);
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {t("joinRequests", { count: requests.length })}
      </h2>

      <div className="flex flex-col gap-2">
        {requests.map((request) => {
          const name = request.displayName || request.username;
          return (
            <div
              key={request.userId}
              // El e2e ancla aquí. Sin un testid hay que adivinar la estructura
              // de divs, y el localizador se rompe al menor cambio de maquetado.
              data-testid="join-request"
              data-username={request.username}
              className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 shadow-card"
            >
              <UserAvatar name={name} avatarUrl={request.avatarUrl} size={36} />

              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-serif text-sm font-semibold text-foreground">
                  {name}
                </span>
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {t("wantsToJoin")}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="green"
                  className="px-3.5 py-1.5 text-xs"
                  disabled={pendingId === request.userId}
                  onClick={() => decide(request.userId, "approve")}
                >
                  {t("approveRequest")}
                </Button>
                {/* Rechazar como ✕ iconbtn del frame 6 (aceptar es el acto
                    principal; rechazar, secundario y compacto). */}
                <button
                  type="button"
                  aria-label={t("rejectRequest")}
                  disabled={pendingId === request.userId}
                  onClick={() => decide(request.userId, "reject")}
                  className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-60"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
