"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActiveGame } from "@/lib/play/core/use-active-game";
import type { ToolId } from "@/lib/play/core/types";
import type { PlayGameState } from "@/lib/play/tools";
import type { MtgState } from "@/lib/play/mtg/types";
import type { ScoreState } from "@/lib/play/score/types";
import { totals, scoreRanking } from "@/lib/play/score/selectors";
import { seatAccent } from "@/lib/play/ui/seats";

type T = ReturnType<typeof useTranslations>;

const CARD_CLASS =
  "mt-5 flex items-center gap-4 rounded-card border border-border bg-surface p-3 transition-colors hover:bg-surface-muted";

/**
 * La partida se ENSEÑA, no se describe: el banner es una miniatura del
 * tablero de verdad —los mismos asientos, los mismos colores— porque
 * reconoces tu partida por su forma antes de leer una palabra.
 *
 * Estrecha por `toolId` con un mapa `Record<ToolId, ...>` (mismo patrón que
 * `playTools`/`toolViews`, spec §6): añadir una herramienta que no rellene su
 * entrada aquí es un error de compilación, no un banner que renderiza mal en
 * silencio. Arregla issue #962 (el banner leía campos de mtg vía `as MtgState`
 * sobre CUALQUIER partida activa; con `score` ya arrancable desde el hub de
 * la task 6, eso rompía /partidas en cuanto había una partida de puntuación).
 */
const BANNER_BY_TOOL: Record<ToolId, (state: PlayGameState, t: T) => ReactNode> = {
  mtg: (state, t) => <MtgBanner state={state as MtgState} t={t} />,
  score: (state, t) => <ScoreBanner state={state as ScoreState} t={t} />,
};

export function ActiveGameBanner({ identity }: { identity: string }) {
  const t = useTranslations("play");
  const { game } = useActiveGame(identity);
  if (!game) return null;
  return BANNER_BY_TOOL[game.state.toolId](game.state, t);
}

/**
 * Una partida TERMINADA no es «partida en curso», pero tampoco se esconde:
 * sigue habiendo un resumen que leer y una revancha que pulsar, así que el
 * banner cambia de palabra y mantiene el enlace. Igual en las dos ramas.
 */
function MtgBanner({ state, t }: { state: MtgState; t: T }) {
  const finished = state.status === "finished";
  const active = state.players[state.activeSeat];

  return (
    <Link href="/partida/activa" className={CARD_CLASS}>
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

/**
 * Miniatura de puntuación: los mismos chips de asiento que mtg, pero con el
 * TOTAL de cada uno en vez de vidas — es lo que hay que reconocer de un
 * vistazo en una tabla de rondas. Sin eliminados que atenuar: puntuación no
 * tiene ese concepto.
 */
function ScoreBanner({ state, t }: { state: ScoreState; t: T }) {
  const finished = state.status === "finished";
  const sums = totals(state);
  const ranking = finished ? scoreRanking(state) : null;
  const tie = ranking !== null && ranking.length > 1 && ranking[0].position === ranking[1].position;

  return (
    <Link href="/partida/activa" className={CARD_CLASS}>
      <span aria-hidden className="grid shrink-0 grid-cols-2 gap-1">
        {state.setup.participants.map((participant, seat) => (
          <span
            key={participant.id}
            className={`${seatAccent(seat).tint} grid h-8 w-11 place-items-center rounded-chip font-mono text-[13px] tabular-nums`}
          >
            {sums[seat]}
          </span>
        ))}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {finished ? t("summary.title") : t("activeGame")}
        </span>
        <span className="block truncate font-serif text-[15px] font-semibold">
          {finished
            ? tie
              ? t("scoreSummary.tie")
              : t("summary.winner", { name: state.setup.participants[ranking![0].seat].name })
            : t("scoreBanner.roundsPlayed", { rounds: state.rounds.length })}
        </span>
      </span>

      <span className="shrink-0 font-mono text-[11px] text-accent-ink">{t("resume")}</span>
    </Link>
  );
}
