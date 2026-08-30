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
            // Dos líneas por fila, no una: el overlay vive dentro de un panel de
            // media pantalla y en una sola línea el nombre quedaba en «Juga…» tras
            // ceder sitio a los botones (visto en la primera partida real,
            // 2026-08-30). El nombre manda en su línea; contador y botones en la
            // suya, con 44 px de alto — son EL objetivo del gesto.
            <li
              key={target.commanderId}
              className="flex flex-col gap-1 rounded-[10px] border border-border/60 px-2 py-1.5"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className={`${accent.bar} h-4 w-1 shrink-0 rounded-full`} />
                <span className="min-w-0 flex-1 break-words text-[13px] leading-tight">
                  <span className="font-semibold">{target.label}</span>
                  {showOwner && (
                    <span className="text-muted-foreground"> · {target.ownerName}</span>
                  )}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="flex-1 pl-3 font-mono text-[13px] tabular-nums text-muted-foreground">
                  {target.amount}
                </span>
                {[1, 5].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => onDamage(target.commanderId, delta)}
                    aria-label={`${target.label} +${delta}`}
                    className="tap-44 h-10 w-14 shrink-0 rounded-chip border border-border font-mono text-[13px]"
                  >
                    +{delta}
                  </button>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
