"use client";

import { useTranslations } from "next-intl";
import { commanderOwners, type MtgState } from "@/lib/play/mtg/types";
import { seatAccent } from "@/lib/play/ui/seats";

export type DamageTarget = {
  commanderId: string;
  label: string;
  ownerName: string;
  seat: number;
  amount: number;
};

/**
 * Reparto de daño de comandante, DENTRO del panel: hereda su rotación, así que quien
 * está sentado ahí lo ve derecho.
 *
 * Una fila por comandante rival, **no por jugador**: con partner, Tymna y Thrasios
 * son dos cuentas de 21 distintas y sumarlas mataría antes de tiempo. Por eso la
 * lista se ordena por comandante y el nombre de quien lo lleva va detrás, en gris:
 * lo que hace el daño es la criatura.
 *
 * `+1` y `+5` por fila: tres toques para «Carlos → Atraxa → +5», y sale UN solo
 * evento porque la ráfaga los funde.
 */
export function DamageOverlay({
  state,
  victimId,
  onDamage,
  onClose,
}: {
  state: MtgState;
  victimId: string;
  onDamage: (commanderId: string, delta: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("play");
  const victim = state.players.find((p) => p.participant.id === victimId);
  if (!victim) return null;

  const owners = commanderOwners(state);
  const targets: DamageTarget[] = [];
  state.players.forEach((player, seat) => {
    if (player.participant.id === victimId) return;
    for (const commander of player.participant.commanders) {
      targets.push({
        commanderId: commander.id,
        label: commander.name?.trim() || player.participant.name,
        ownerName: player.participant.name,
        seat,
        amount: victim.commanderDamage[commander.id] ?? 0,
      });
    }
  });

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-surface">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("board.damageTitle")}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("board.close")}
          className="grid h-8 w-8 place-items-center rounded-chip border border-border text-[12px]"
        >
          ✕
        </button>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        {targets.map((target) => {
          const accent = seatAccent(target.seat);
          // El nombre del comandante manda; el del jugador va detrás y solo si son
          // distintos (sin comandante escrito, ya se está enseñando su nombre).
          const owner = owners.get(target.commanderId);
          const showOwner = target.label !== target.ownerName && owner !== undefined;
          return (
            <li key={target.commanderId} className="flex items-center gap-2">
              <span aria-hidden className={`${accent.bar} h-6 w-1 shrink-0 rounded-full`} />
              <span className="min-w-0 flex-1 truncate text-[12px]">
                <span className="font-semibold">{target.label}</span>
                {showOwner && (
                  <span className="text-muted-foreground"> · {target.ownerName}</span>
                )}
              </span>
              <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                {target.amount}
              </span>
              {[1, 5].map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => onDamage(target.commanderId, delta)}
                  aria-label={`${target.label} +${delta}`}
                  className="h-9 w-9 shrink-0 rounded-chip border border-border font-mono text-[12px]"
                >
                  +{delta}
                </button>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
