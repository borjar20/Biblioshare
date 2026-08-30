"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import type { ActiveGame, PlayStore } from "@/lib/play/core/store";
import type { GameFinishedEvent } from "@/lib/play/score/events";
import type { ScoreState } from "@/lib/play/score/types";
import { playTools } from "@/lib/play/tools";
import { formatElapsed } from "@/lib/play/ui/clock";
import { preferencesStore, writePreferences } from "@/lib/play/ui/preferences";
import { PlaySheet, SheetGroup, SheetRow } from "../play-sheet";

const at = () => Date.now();

/**
 * Espejo de `game-sheet.tsx` sin lo que no aplica: puntuación no tiene turno que
 * pasar ni presets de mesa (ni asientos que repartir, ni giro que elegir). El
 * grupo TURNO se sustituye por uno con solo deshacer — el resto del reparto
 * («¿a quién?» vive en la hoja de esa persona, lo demás aquí) sigue igual que mtg:
 * apuntar y editar rondas viven en `round-sheet.tsx`, no aquí.
 */
export function ScoreGameSheet({
  game,
  store,
  onClose,
}: {
  game: ActiveGame;
  store: PlayStore;
  onClose: () => void;
}) {
  const t = useTranslations("play");
  const router = useRouter();
  const state = game.state as ScoreState;
  const prefs = preferencesStore.getSnapshot();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Mismo motivo que game-sheet.tsx: el reloj se lee UNA vez al abrir y no se
  // mueve mientras la hoja está abierta (Date.now() en el render viola pureza).
  const [openedAt] = useState(() => Date.now());

  const last = game.log.pending ?? game.log.committed[game.log.committed.length - 1];
  const undoable = last !== undefined && last.type !== "game_started";
  const described = last ? playTools[state.toolId].describe(last, state) : null;
  const undoLabel = described ? t(`log.${described.key}`, described.params) : "";

  function update(keepAwake: boolean) {
    writePreferences({ ...prefs, keepAwake });
  }

  return (
    <PlaySheet
      title={t("gameSheet.title")}
      caption={formatElapsed((state.finishedAt ?? openedAt) - state.startedAt)}
      onClose={onClose}
    >
      <div className="flex flex-col gap-1">
        <SheetGroup>
          <SheetRow
            label={t("console.undo", { event: undoLabel })}
            onClick={() => {
              store.undo();
              onClose();
            }}
            disabled={!undoable}
          />
        </SheetGroup>

        <SheetGroup>
          <SheetRow
            label={t("gameSheet.keepAwake")}
            value={prefs.keepAwake ? t("gameSheet.yes") : t("gameSheet.no")}
            onClick={() => update(!prefs.keepAwake)}
          />
          {/* Misma razón que en mtg: la única salida que CONSERVA la partida. */}
          <SheetRow
            label={t("gameSheet.leave")}
            value={t("gameSheet.leaveValue")}
            onClick={() => router.push("/partidas")}
          />
        </SheetGroup>

        {/* Las que ACABAN la partida, en su propia caja. */}
        <div className="pt-2">
          <SheetGroup>
            <SheetRow
              label={t("gameSheet.finish")}
              onClick={() => {
                store.dispatch(
                  makeEvent<GameFinishedEvent["type"], GameFinishedEvent["payload"]>(
                    "game_finished",
                    { reason: "manual" },
                    at(),
                  ),
                );
                onClose();
              }}
            />
            <SheetRow
              label={confirmDiscard ? t("gameSheet.discardConfirm") : t("gameSheet.discard")}
              onClick={() => {
                // Dos toques: borra la partida entera y no hay deshacer que la traiga.
                if (!confirmDiscard) {
                  setConfirmDiscard(true);
                  return;
                }
                store.discard();
                onClose();
              }}
              danger
            />
          </SheetGroup>
        </div>
      </div>
    </PlaySheet>
  );
}
