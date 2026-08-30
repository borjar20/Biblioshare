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
import { layoutOptions, type LayoutFamily } from "@/lib/play/ui/layout";
import { preferencesStore, writePreferences, type BoardPreferences } from "@/lib/play/ui/preferences";
import { PlaySheet, SheetRow } from "./play-sheet";

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
  const options: (LayoutFamily | "auto")[] = [
    "auto",
    ...layoutOptions(state.players.length, prefs.orientation),
  ];

  function update(patch: Partial<BoardPreferences>) {
    writePreferences({ ...prefs, ...patch });
  }

  function cycleLayout() {
    // Un solo ítem que rota entre las opciones VÁLIDAS para este número de jugadores
    // y esta orientación: a 2 no hay cabecera, y a 6 las dos cabeceras solo existen
    // tumbado. Ofrecer una imposible sería ofrecer una mesa que no cabe.
    const current = options.indexOf(prefs.layout);
    update({ layout: options[(current + 1) % options.length] });
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
      <div className="flex flex-col">
        <p className="px-3 pb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("gameSheet.sectionTurn")}
        </p>
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

        <p className="px-3 pb-1 pt-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("gameSheet.sectionGame")}
        </p>
        {/* Girar vive en el menú y no en el sensor del móvil: girar sin querer
            recolocaría la mesa delante de cuatro personas en mitad de un turno. Así
            es una decisión, no un accidente. */}
        <SheetRow
          label={t("gameSheet.rotate")}
          value={t(
            prefs.orientation === "portrait"
              ? "gameSheet.orientationPortrait"
              : "gameSheet.orientationLandscape",
          )}
          onClick={() =>
            update({ orientation: prefs.orientation === "portrait" ? "landscape" : "portrait" })
          }
        />
        <SheetRow
          label={t("gameSheet.layout")}
          value={t(`gameSheet.layout${capitalize(prefs.layout)}`)}
          onClick={cycleLayout}
        />
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
      </div>
    </PlaySheet>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
