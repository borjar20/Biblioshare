"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import type { ActiveGame, PlayStore } from "@/lib/play/core/store";
import type { GameFinishedEvent, TurnPassedEvent } from "@/lib/play/mtg/events";
import type { MtgState } from "@/lib/play/mtg/types";
import { playTools } from "@/lib/play/tools";
import { nextAliveSeat } from "@/lib/play/mtg/rules";
import { formatElapsed } from "@/lib/play/ui/clock";
import { preferencesStore, writePreferences, type BoardPreferences } from "@/lib/play/ui/preferences";
import { BoardPresets } from "./board-presets";
import { PlaySheet, SheetGroup, SheetRow } from "./play-sheet";

const at = () => Date.now();

/**
 * Hoja de acciones de LA PARTIDA. La regla del reparto: lo que necesita responder
 * «¿a quién?» vive en la hoja de esa persona; lo que no, aquí.
 *
 * Cada ítem enseña **su estado actual** a la derecha (`vertical`, `en filas`, `sí`):
 * es lo que evita tener que abrir para saber cómo está.
 */
export function GameSheet({
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
  const state = game.state as MtgState;
  const prefs = preferencesStore.getSnapshot();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // El reloj se lee UNA vez al abrir la hoja y se queda quieto mientras está abierta:
  // `Date.now()` en el cuerpo del render es impuro (el lint lo caza) y aquí no hace
  // falta que corra — el crono que avanza vive en la consola, detrás.
  const [openedAt] = useState(() => Date.now());

  const last = game.log.pending ?? game.log.committed[game.log.committed.length - 1];
  const undoable = last !== undefined && last.type !== "game_started";
  const described = last ? playTools[state.toolId].describe(last, state) : null;
  const undoLabel = described ? t(`log.${described.key}`, described.params) : "";

  const nextName = state.players[nextAliveSeat(state)].participant.name;

  function update(patch: Partial<BoardPreferences>) {
    writePreferences({ ...prefs, ...patch });
  }

  return (
    <PlaySheet
      title={t("gameSheet.title")}
      caption={t("gameSheet.caption", {
        mode: t(`tools.mtg.modes.${state.setup.mode}.name`),
        time: formatElapsed((state.finishedAt ?? openedAt) - state.startedAt),
      })}
      onClose={onClose}
    >
      <div className="flex flex-col gap-1">
        <p className="px-3 pb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("gameSheet.sectionTurn")}
        </p>
        <SheetGroup>
          <SheetRow
            label={t("console.undo", { event: undoLabel })}
            onClick={() => {
              store.undo();
              onClose();
            }}
            disabled={!undoable}
          />
          <SheetRow
            label={t("console.passTurn", { name: nextName })}
            onClick={() => {
              store.dispatch(
                makeEvent<TurnPassedEvent["type"], TurnPassedEvent["payload"]>("turn_passed", {}, at()),
              );
              onClose();
            }}
          />
        </SheetGroup>

        <p className="px-3 pb-1 pt-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("gameSheet.sectionGame")}
        </p>
        {/* El reparto de la mesa, por presets VISIBLES: cada miniatura enseña lo que
            saldrá antes de tocarla (era imposible saberlo alternando «girar» y
            «repartir» a ciegas). Vive en el menú y no en el sensor del móvil: girar
            sin querer recolocaría la mesa delante de cuatro personas. */}
        <BoardPresets
          players={state.players.length}
          orientation={prefs.orientation}
          family={prefs.layout}
          onSelect={(orientation, family) => update({ orientation, layout: family })}
        />
        <SheetGroup>
          <SheetRow
            label={t("gameSheet.keepAwake")}
            value={prefs.keepAwake ? t("gameSheet.yes") : t("gameSheet.no")}
            onClick={() => update({ keepAwake: !prefs.keepAwake })}
          />
          {/* La única salida del tablero que CONSERVA la partida. El tablero se come
              el chrome entero, así que sin este ítem la app instalada (PWA/APK, sin
              botón de atrás en iOS) no tiene forma de volver al hub sin descartar. El
              valor lo dice explícito: salir no borra nada. */}
          <SheetRow
            label={t("gameSheet.leave")}
            value={t("gameSheet.leaveValue")}
            onClick={() => router.push("/partidas")}
          />
        </SheetGroup>

        {/* Las que ACABAN la partida, en su propia caja: que terminar o borrar no
            comparta frontera con ajustar el brillo. */}
        <div className="pt-2">
          <SheetGroup>
            <SheetRow
              label={t("gameSheet.finish")}
              onClick={() => {
                // Sin ganador declarado: la mesa puede terminarla sin que nadie gane.
                store.dispatch(
                  makeEvent<GameFinishedEvent["type"], GameFinishedEvent["payload"]>(
                    "game_finished",
                    { reason: "abandoned" },
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
