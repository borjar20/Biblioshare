"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { confirmCheckpoint, unconfirmCheckpoint, type CheckpointViewModel } from "@/lib/clubs/activities/checkpoints";
import { unconfirmImpact } from "@/lib/clubs/activities/unconfirm-impact";
import { formatPosition } from "@/lib/library/position";
import type { ItemType } from "@/lib/catalog/types";
import { CheckpointChat } from "./checkpoint-chat";
import { Button } from "@/components/ui/button";
import { CheckIcon, LockIcon } from "@/components/ui/icons";

// Lista de checkpoints con estado por viewer + chat (EPIC-05, Bloque H1).
// Visible para cualquier miembro del club (decisión 7 del diseño) -- el
// componente padre (BuddyReadCheckpoints) no la gatea a isParticipant; el
// botón "confirmar" y el chat gestionan su propio acceso vía RLS.
// El chat asume viewer logueado -- toda la ruta /club/[slug] requiere auth
// (SD-4, sin lectura anónima de contenido de club), mismo supuesto que
// ActivityChat/ActivityItemPool ya hacen en este árbol.
//
// Layout del mockup (Paper · Clubes, frame 4): el chat solo se despliega en
// los hitos que el viewer ya confirmó; los demás muestran la banda rayada
// anti-spoiler. No cambia la lógica: RLS y confirm_checkpoint ya gobiernan
// el acceso real, esto solo deja de invitar a mirar donde aún no llegaste.

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// date de Postgres: split manual, nunca new Date() (el UTC parse resta un día).
function formatDueShort(dueOn: string): string {
  const [, month, day] = dueOn.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ""}`;
}

export function CheckpointList({
  itemType,
  checkpoints,
  groupSafeOrder,
  onChanged,
  clubId,
  knownUsernames,
  viewerIsParticipant,
}: {
  itemType: ItemType;
  checkpoints: CheckpointViewModel[];
  groupSafeOrder: number | null;
  onChanged: () => void;
  /** Club de la actividad -- acota el autocompletar de @menciones a sus miembros. */
  clubId: string;
  /** Usernames @mencionados que existen de verdad, resueltos server-side (resolveKnownMentions). */
  knownUsernames: string[];
  /** Confirmar es autodeclarado (#471) pero solo para participantes: a un no
      participante el botón siempre le fallaría ('forbidden' en la RPC). */
  viewerIsParticipant: boolean;
}) {
  const t = useTranslations("activity");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Qué hito tiene su pregunta abierta, y para qué. Uno como mucho: abrir la de
  // un hito cierra cualquier otra, para no dejar dos preguntas a la vez en la
  // misma lista.
  const [asking, setAsking] = useState<{ id: string; action: "confirm" | "unconfirm" } | null>(null);

  function handleConfirm(checkpointId: string) {
    setError(null);
    setAsking(null);
    startTransition(async () => {
      try {
        await confirmCheckpoint(checkpointId);
        onChanged();
      } catch {
        setError(t("confirmCheckpointError"));
      }
    });
  }

  function handleUnconfirm(checkpointId: string) {
    setError(null);
    setAsking(null);
    startTransition(async () => {
      try {
        await unconfirmCheckpoint(checkpointId);
        onChanged();
      } catch {
        setError(t("unconfirmCheckpointError"));
      }
    });
  }

  // El aviso nombra SOLO lo que aplica: los posteriores si los hay, el chat si
  // escribiste en él. Un aviso que no aplica enseña a ignorar los avisos.
  function unconfirmMessage(c: CheckpointViewModel): string {
    const impacto = unconfirmImpact(c, checkpoints);
    const partes = [t("unconfirmAsk")];

    if (impacto.alsoFalling.length > 0) {
      const labels = impacto.alsoFalling.join(", ");
      partes.push(
        impacto.extraCount > 0
          ? t("unconfirmAlsoFallingMore", { labels, count: impacto.extraCount })
          : t("unconfirmAlsoFalling", { labels }),
      );
    }

    if (impacto.chat) {
      partes.push(
        impacto.chat.count !== null
          ? t("unconfirmChatCount", { count: impacto.chat.count })
          : t("unconfirmChat"),
      );
    }

    return partes.join(" ");
  }

  if (checkpoints.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("checkpointsEmpty")}</p>;
  }

  const safeCheckpoint =
    groupSafeOrder != null ? checkpoints.find((c) => c.order === groupSafeOrder) : null;

  return (
    <div className="flex flex-col gap-3">
      {safeCheckpoint && (
        <p className="text-xs text-muted-foreground">
          {t("groupSafeCheckpoint", { label: safeCheckpoint.label })}
        </p>
      )}
      {error && <p className="text-xs text-status-dropped">{error}</p>}
      <div className="flex flex-col gap-3">
        {checkpoints.map((c) => {
          const confirmed = c.status === "confirmed";
          const positionLabel = formatPosition(itemType, c.position);
          const meta = [
            positionLabel,
            t("checkpointReachedByShort", { count: c.reachedByCount }),
            c.dueOn ? formatDueShort(c.dueOn) : null,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <div
              key={c.id}
              className="overflow-hidden rounded-card border border-border bg-surface shadow-card"
            >
              <div className="flex items-center gap-3 px-[15px] py-[13px]">
                <span
                  aria-hidden
                  className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-2 ${
                    confirmed ? "border-accent bg-accent" : "border-border"
                  }`}
                >
                  {confirmed && <CheckIcon className="h-3.5 w-3.5 text-accent-foreground" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-foreground">{c.label}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{meta}</p>
                </div>
                {confirmed && viewerIsParticipant ? (
                  asking?.id === c.id && asking.action === "unconfirm" ? (
                    <Ask
                      message={unconfirmMessage(c)}
                      onYes={() => handleUnconfirm(c.id)}
                      onNo={() => setAsking(null)}
                      disabled={isPending}
                      yesLabel={t("askYes")}
                      noLabel={t("askNo")}
                    />
                  ) : (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[10px] text-green">{t("chatOpen")}</span>
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-3 py-1 text-xs"
                        disabled={isPending}
                        onClick={() => setAsking({ id: c.id, action: "unconfirm" })}
                      >
                        {t("unconfirmCheckpoint")}
                      </Button>
                    </div>
                  )
                ) : confirmed ? (
                  <span className="shrink-0 font-mono text-[10px] text-green">{t("chatOpen")}</span>
                ) : viewerIsParticipant ? (
                  asking?.id === c.id && asking.action === "confirm" ? (
                    <Ask
                      message={t("confirmCheckpointAsk")}
                      onYes={() => handleConfirm(c.id)}
                      onNo={() => setAsking(null)}
                      disabled={isPending}
                      yesLabel={t("askYes")}
                      noLabel={t("askNo")}
                    />
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0 px-3.5 py-1.5 text-xs"
                      disabled={isPending}
                      onClick={() => setAsking({ id: c.id, action: "confirm" })}
                    >
                      {t("confirmCheckpoint")}
                    </Button>
                  )
                ) : (
                  <LockIcon
                    aria-label={t("checkpointStatus_locked")}
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                  />
                )}
              </div>

              {confirmed && c.chat ? (
                <div className="border-t border-border bg-surface-muted px-[15px] py-3">
                  <p className="mb-2 font-mono text-[9.5px] font-medium tracking-wider text-green uppercase">
                    {positionLabel
                      ? t("checkpointChatLabel", { label: c.label, position: positionLabel })
                      : c.label}
                  </p>
                  <CheckpointChat
                    summary={c.chat}
                    viewerLoggedIn
                    clubId={clubId}
                    knownUsernames={knownUsernames}
                  />
                </div>
              ) : (
                <div
                  className="border-t border-border px-[15px] py-3 text-[11.5px] text-muted-foreground"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(135deg, var(--surface) 0 8px, var(--surface-muted) 8px 16px)",
                  }}
                >
                  {t("checkpointLockedHint", { position: positionLabel ?? c.label })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// La pregunta en el sitio: el botón se convierte en su propia confirmación, sin
// abrir un diálogo encima. Dos pulsaciones deliberadas -- marcar un hito es
// autodeclarativo desde #471 y ya no hay ninguna comprobación de página que
// respalde el gesto, así que un clic accidental te declara donde no estás.
//
// Recibe yesLabel/noLabel ya traducidos en vez de `t`: el tipo genérico de
// ReturnType<typeof useTranslations<"activity">> no hace falta aquí y evita
// prestar una firma que no le pertenece a este subcomponente.
function Ask({
  message,
  onYes,
  onNo,
  disabled,
  yesLabel,
  noLabel,
}: {
  message: string;
  onYes: () => void;
  onNo: () => void;
  disabled: boolean;
  yesLabel: string;
  noLabel: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="max-w-[220px] text-right text-[11px] text-muted-foreground">
        {message}
      </span>
      <Button type="button" className="px-3 py-1 text-xs" disabled={disabled} onClick={onYes}>
        {yesLabel}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="px-3 py-1 text-xs"
        disabled={disabled}
        onClick={onNo}
      >
        {noLabel}
      </Button>
    </div>
  );
}
