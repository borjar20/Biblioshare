"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ActiveGame, PlayStore } from "@/lib/play/core/store";
import type { MtgState } from "@/lib/play/mtg/types";
import { finalRanking } from "@/lib/play/mtg/selectors";
import { formatElapsed } from "@/lib/play/ui/clock";
import { seatAccent } from "@/lib/play/ui/seats";
import { buttonVariants } from "@/components/ui/button";

/**
 * Resumen final. Tres decisiones que no se ven en el código pero mandan:
 *
 * 1. **La clasificación sale entera de `finalRanking`**, sin inventar aquí ninguna
 *    regla de empate: ganador 1.º, los vivos no ganadores COMPARTEN posición, y los
 *    eliminados van en orden inverso de eliminación (el último en caer es el 2.º).
 *    Compartir número de turno NO es simultaneidad: eso habría que modelarlo
 *    explícitamente y no está.
 * 2. **Ganar no es solo sobrevivir**: el titular dice «Gana X» con la razón debajo,
 *    porque ganar por una carta que lo declara es condición de primera clase.
 * 3. **Revancha manda sobre descartar** y va primera: cuando una partida acaba, lo
 *    probable es que haya otra. Y NO descarta nada todavía — si te vuelves atrás, el
 *    resumen sigue ahí; la partida vieja se sustituye cuando la nueva arranca de
 *    verdad, que es lo que exige la regla de una sola partida activa.
 *
 * Guardar el historial llega en la fase 5 y NO se pinta deshabilitado: un botón
 * apagado que nadie sabe por qué está apagado es peor que no tenerlo.
 */
export function GameSummary({ game, store }: { game: ActiveGame; store: PlayStore }) {
  const t = useTranslations("play");
  const router = useRouter();
  const state = game.state as MtgState;

  const ranking = finalRanking(state);
  const winner = state.winner
    ? state.players.find((p) => p.participant.id === state.winner)
    : null;

  // Sin celebración por ahora, y no por olvido: `CelebrationEvent` es una unión
  // cerrada de cuatro eventos y los tres alcances que existen (`day`, `milestone`,
  // `ever`) DEDUPLICAN — respaldan una restricción UNIQUE por usuario y clave. Ganar
  // una partida se celebra todas las veces, así que no cabe sin un alcance nuevo o
  // una vía solo-cliente. Es una decisión del sistema de celebraciones, no un
  // detalle de esta pantalla: va como issue.

  const duration = formatElapsed((state.finishedAt ?? state.startedAt) - state.startedAt);

  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-6 bg-play-felt px-5 py-8">
      <div className="w-full max-w-md rounded-[20px] border border-border bg-surface p-5">
        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("summary.title")}
        </p>
        <h1 className="mt-1 font-serif text-[24px] font-semibold">
          {winner ? t("summary.winner", { name: winner.participant.name }) : t("summary.noWinner")}
        </h1>
        {state.finishReason && (
          <p className="text-[13px] text-muted-foreground">
            {t(`summary.reason.${state.finishReason}`)}
          </p>
        )}

        <ol className="mt-4 flex flex-col gap-1">
          {ranking.map((entry) => {
            const seat = state.players.findIndex((p) => p.participant.id === entry.participantId);
            const player = state.players[seat];
            return (
              <li key={entry.participantId} className="flex items-center gap-2.5">
                <span className="w-8 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {t("summary.position", { position: entry.position })}
                </span>
                <span aria-hidden className={`${seatAccent(seat).bar} h-5 w-1 shrink-0 rounded-full`} />
                <span className="min-w-0 flex-1 truncate text-[14px]">
                  {player?.participant.name}
                </span>
                <span className="shrink-0 font-mono text-[13px] tabular-nums">{player?.life}</span>
              </li>
            );
          })}
        </ol>

        <dl className="mt-4 flex gap-6 border-t border-border pt-3 font-mono text-[11px]">
          <div>
            <dt className="uppercase tracking-widest text-muted-foreground">
              {t("summary.duration")}
            </dt>
            <dd className="tabular-nums">{duration}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-widest text-muted-foreground">
              {t("summary.turns")}
            </dt>
            <dd className="tabular-nums">{state.turnCount}</dd>
          </div>
        </dl>
      </div>

      <div className="flex w-full max-w-md flex-col gap-2">
        <button
          type="button"
          onClick={() => router.push(`/partidas/mtg/nueva?modo=${state.setup.mode}&revancha=1`)}
          className={buttonVariants("primary", "w-full justify-center py-3 text-[15px]")}
        >
          {t("summary.rematch")}
        </button>
        <button
          type="button"
          onClick={() => {
            store.discard();
            router.push("/partidas");
          }}
          className={buttonVariants("ghost", "w-full justify-center py-2.5 text-[14px]")}
        >
          {t("summary.discard")}
        </button>
      </div>
    </div>
  );
}
