"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { PendingJointInvite } from "@/lib/social/joint-viewings";
import { respondJointViewing, type JointActionError } from "@/lib/social/joint-viewing-actions";
import { itemHref } from "@/lib/catalog/item-href";
import { UserAvatar } from "@/components/social/user-avatar";
import { SpineCover } from "@/components/social/spine-cover";
import { Button, buttonVariants } from "@/components/ui/button";

// Invitaciones a visionados conjuntos sin contestar (#1224), leídas de la tabla
// y no de la campana: se ven aunque el aviso se perdiera. Dos sitios:
//   · `home`: bloque en Inicio, encima del feed, con la portada de cada obra.
//   · `item`: aviso en la ficha de la obra, sin portada (ya estás en ella).
// Contestar se hace aquí mismo cuando no hay nada que elegir; si tienes pases
// terminados de la obra pero ninguno de ese día, «Confirmar» lleva a
// `/juntos/[id]` para elegir cuál es.
export function PendingJointInvites({
  invites,
  variant,
}: {
  invites: PendingJointInvite[];
  variant: "home" | "item";
}) {
  const t = useTranslations("joint");
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const visible = invites.filter((i) => !answered.has(i.viewingId));
  if (visible.length === 0) return null;

  return (
    <section
      aria-label={t("pendingTitle")}
      className={
        variant === "home"
          ? "mb-4 flex flex-col gap-2 rounded-card border border-accent/40 bg-accent/5 p-3.5"
          : "flex flex-col gap-2"
      }
    >
      {variant === "home" && <h2 className="label-section">{t("pendingTitle")}</h2>}
      <ul className="flex flex-col gap-2">
        {visible.map((invite) => (
          <InviteRow
            key={invite.viewingId}
            invite={invite}
            showCover={variant === "home"}
            onAnswered={() => setAnswered((prev) => new Set(prev).add(invite.viewingId))}
          />
        ))}
      </ul>
    </section>
  );
}

function InviteRow({
  invite,
  showCover,
  onAnswered,
}: {
  invite: PendingJointInvite;
  showCover: boolean;
  onAnswered: () => void;
}) {
  const t = useTranslations("joint");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<JointActionError | null>(null);
  const name = invite.inviter ? invite.inviter.displayName || invite.inviter.username : t("someone");

  function respond(accept: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await respondJointViewing(invite.viewingId, accept, accept ? (invite.quickChoice ?? "new") : "new");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onAnswered();
      router.refresh();
    });
  }

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2.5">
      {showCover ? (
        // Mismo destino que el título de la frase: fuera del foco y del árbol
        // accesible para no anunciar dos veces el mismo enlace.
        <Link
          href={itemHref(invite.itemType, invite.itemId)}
          className="w-9 shrink-0"
          aria-hidden
          tabIndex={-1}
        >
          <SpineCover coverUrl={invite.itemCoverUrl} title={invite.itemTitle} className="aspect-[2/3] w-9" />
        </Link>
      ) : (
        invite.inviter && (
          <UserAvatar name={name} avatarUrl={invite.inviter.avatarUrl} size={28} />
        )
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug text-foreground">
          {showCover
            ? t.rich("pendingLine", {
                name,
                itemType: invite.itemType,
                title: () => (
                  <Link href={itemHref(invite.itemType, invite.itemId)} className="font-semibold hover:underline">
                    {invite.itemTitle}
                  </Link>
                ),
              })
            : t("createdBy", { name, itemType: invite.itemType })}
        </p>
        {error && <p className="mt-1 text-xs text-status-dropped">{t(`errors.${error}`)}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {invite.quickChoice === null ? (
            <Link href={`/juntos/${invite.viewingId}`} className={buttonVariants("primary", "px-3 py-1.5 text-xs")}>
              {t("confirm")}
            </Link>
          ) : (
            <Button type="button" className="px-3 py-1.5 text-xs" disabled={pending} onClick={() => respond(true)}>
              {pending ? t("sending") : t("accept")}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() => respond(false)}
          >
            {t("decline")}
          </Button>
        </div>
      </div>
    </li>
  );
}
