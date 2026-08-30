"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActiveGame } from "@/lib/play/core/use-active-game";
import { seatAccent } from "@/lib/play/ui/seats";

/**
 * La partida se ENSEÑA, no se describe: el banner es una miniatura del tablero de
 * verdad —los mismos asientos, los mismos colores, las mismas vidas, el eliminado ya
 * atenuado— porque reconoces tu partida por su forma antes de leer una palabra. Las
 * dos únicas palabras que quedan son las que la miniatura no puede dibujar: de quién
 * es el turno. Sale gratis: son los datos que el store ya tiene en memoria.
 *
 * Una partida TERMINADA no es «partida en curso», pero tampoco se esconde: sigue
 * habiendo un resumen que leer y una revancha que pulsar, así que el banner cambia
 * de palabra y mantiene el enlace.
 */
export function ActiveGameBanner({ identity }: { identity: string }) {
  const t = useTranslations("play");
  const { game } = useActiveGame(identity);
  if (!game) return null;

  const state = game.state;
  const finished = state.status === "finished";
  const active = state.players[state.activeSeat];

  return (
    <Link
      href="/partida/activa"
      className="mt-5 flex items-center gap-4 rounded-card border border-border bg-surface p-3 transition-colors hover:bg-surface-muted"
    >
      <span aria-hidden className="grid shrink-0 grid-cols-2 gap-1">
        {state.players.map((player, seat) => (
          <span
            key={player.participant.id}
            className={`${seatAccent(seat).tint} grid h-8 w-11 place-items-center rounded-chip font-mono text-[13px] tabular-nums ${
              player.elimination ? "opacity-40" : ""
            }`}
          >
            {player.life}
          </span>
        ))}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {finished ? t("summary.title") : t("activeGame")}
        </span>
        <span className="block truncate font-serif text-[15px] font-semibold">
          {finished
            ? state.winner
              ? t("summary.winner", {
                  name:
                    state.players.find((p) => p.participant.id === state.winner)?.participant.name ??
                    "",
                })
              : t("summary.noWinner")
            : t("turnOf", { round: state.round, name: active.participant.name })}
        </span>
      </span>

      <span className="shrink-0 font-mono text-[11px] text-accent-ink">{t("resume")}</span>
    </Link>
  );
}
