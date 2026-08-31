"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import type { ActiveGame, PlayStore } from "@/lib/play/core/store";
import type { GameLabeledEvent } from "@/lib/play/score/events";
import type { ScoreState } from "@/lib/play/score/types";
import { scoreRanking } from "@/lib/play/score/selectors";
import { formatElapsed } from "@/lib/play/ui/clock";
import { seatAccent } from "@/lib/play/ui/seats";
import { buttonVariants } from "@/components/ui/button";

/**
 * Espejo de `game-summary.tsx`. La clasificación sale entera de `scoreRanking`
 * (mismo criterio de empate que `finalRanking`: comparte posición, la siguiente
 * salta), y aquí SÍ puede haber empate en la cabecera —no hay «último en pie» que
 * lo desempate solo, como en mtg— por eso el titular comprueba si el primero y el
 * segundo comparten posición antes de nombrar un ganador.
 */
export function ScoreSummary({ game, store }: { game: ActiveGame; store: PlayStore }) {
  const t = useTranslations("play");
  const router = useRouter();
  const state = game.state as ScoreState;

  const ranking = scoreRanking(state);
  const tie = ranking.length > 1 && ranking[0].position === ranking[1].position;
  const leader = state.setup.participants[ranking[0].seat];

  const duration = formatElapsed((state.finishedAt ?? state.startedAt) - state.startedAt);

  // Igual que el renombrar de `players-manager.tsx`: `editing` es puramente de
  // esta sesión de edición, no algo que el store necesite conocer.
  const [editingGame, setEditingGame] = useState(false);
  const [gameDraft, setGameDraft] = useState(state.setup.gameName ?? "");

  function startEditingGame() {
    setGameDraft(state.setup.gameName ?? "");
    setEditingGame(true);
  }

  // Vacío confirma también: es la forma de quitar la etiqueta (payload "").
  function confirmGameLabel() {
    store.dispatch(
      makeEvent<GameLabeledEvent["type"], GameLabeledEvent["payload"]>(
        "game_labeled",
        { gameName: gameDraft.trim() },
        Date.now(),
      ),
    );
    setEditingGame(false);
  }

  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-6 bg-play-felt px-5 py-8">
      <div className="w-full max-w-md rounded-[20px] border border-border bg-surface p-5">
        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("summary.title")}
        </p>
        <h1 className="mt-1 font-serif text-[24px] font-semibold">
          {tie ? t("scoreSummary.tie") : t("summary.winner", { name: leader.name })}
        </h1>

        {editingGame ? (
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              value={gameDraft}
              onChange={(e) => setGameDraft(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-[13px]"
            />
            <button
              type="button"
              onClick={confirmGameLabel}
              className="tap-44 shrink-0 px-1 text-[13px] font-semibold text-accent-ink"
            >
              {t("scoreSummary.saveGame")}
            </button>
          </div>
        ) : state.setup.gameName ? (
          <p className="mt-1 flex items-center gap-2 text-[13px] text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">{state.setup.gameName}</span>
            <button
              type="button"
              onClick={startEditingGame}
              className="tap-44 shrink-0 px-1 text-[13px] text-accent-ink"
            >
              {t("scoreSummary.editGame")}
            </button>
          </p>
        ) : (
          <button
            type="button"
            onClick={startEditingGame}
            className="mt-1 text-[13px] text-muted-foreground underline-offset-2 hover:underline"
          >
            {t("scoreSummary.addGame")}
          </button>
        )}

        <ol className="mt-4 flex flex-col gap-1">
          {ranking.map((entry) => {
            const participant = state.setup.participants[entry.seat];
            return (
              <li key={participant.id} className="flex items-center gap-2.5">
                <span className="w-8 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {t("summary.position", { position: entry.position })}
                </span>
                <span
                  aria-hidden
                  className={`${seatAccent(entry.seat).bar} h-5 w-1 shrink-0 rounded-full`}
                />
                <span className="min-w-0 flex-1 truncate text-[14px]">{participant.name}</span>
                <span className="shrink-0 font-mono text-[13px] tabular-nums">{entry.total}</span>
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
              {t("scoreSummary.rounds")}
            </dt>
            <dd className="tabular-nums">{state.rounds.length}</dd>
          </div>
        </dl>
      </div>

      <div className="flex w-full max-w-md flex-col gap-2">
        <button
          type="button"
          onClick={() => router.push("/partidas/puntuacion/nueva?revancha=1")}
          className={buttonVariants("primary", "w-full justify-center py-3 text-[15px]")}
        >
          {t("summary.rematch")}
        </button>
        <button
          type="button"
          onClick={async () => {
            // Igual que game-summary.tsx: si falla el guardado, la activa NO se
            // toca y nos quedamos en el resumen.
            if (await store.save()) router.push("/partidas");
          }}
          className={buttonVariants("secondary", "w-full justify-center py-2.5 text-[14px]")}
        >
          {t("summary.save")}
        </button>
        <p className="text-center text-[11px] text-muted-foreground">{t("summary.saveHint")}</p>
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
