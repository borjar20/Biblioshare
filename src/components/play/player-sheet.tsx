"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import type { PlayStore } from "@/lib/play/core/store";
import type {
  GameFinishedEvent,
  InitiativeChangedEvent,
  LifeChangedEvent,
  MonarchChangedEvent,
  PlayerEliminatedEvent,
  PlayerRestoredEvent,
} from "@/lib/play/mtg/events";
import type { MtgState } from "@/lib/play/mtg/types";
import { PlaySheet, SheetGroup, SheetRow } from "./play-sheet";

// Fábricas fuera del componente: `Date.now()` es impuro y no puede vivir en el render.
const at = () => Date.now();

/**
 * Hoja de acciones de UNA persona. La regla del reparto: **si la acción necesita
 * responder «¿a quién?», vive en la hoja de esa persona; si no, en la de la
 * partida.** Por eso «Gana la partida» y «Marcar como eliminado» están aquí y
 * «Finalizar» está en la otra, aunque las tres acaben la partida.
 *
 * Se abre tocando la cabecera del panel — un toque, no una pulsación larga: esa no
 * se descubre, no tiene equivalente con teclado y compite con los gestos nativos del
 * navegador.
 *
 * **Editar nombre y comandantes NO está**: no existe el evento. Cambiar los datos de
 * un participante con la partida empezada necesita uno nuevo, y añadir o quitar un
 * comandante cambia las claves de `commanderDamage` (issue #943).
 */
export function PlayerSheet({
  state,
  store,
  seat,
  onClose,
}: {
  state: MtgState;
  store: PlayStore;
  seat: number;
  onClose: () => void;
}) {
  const t = useTranslations("play");
  const player = state.players[seat];
  const [exactLife, setExactLife] = useState(String(player.life));
  const participantId = player.participant.id;
  const name = player.participant.name;

  function setLife() {
    const target = Number(exactLife);
    if (!Number.isFinite(target)) return;
    // No hay evento de «fijar vidas»: se expresa como el delta que hace falta, que es
    // exactamente lo que el log tiene que contar para que el replay lo reconstruya.
    const delta = target - player.life;
    if (delta === 0) return;
    store.dispatch(
      makeEvent<LifeChangedEvent["type"], LifeChangedEvent["payload"]>(
        "life_changed",
        { target: participantId, delta },
        at(),
      ),
    );
    onClose();
  }

  function give(kind: "monarch" | "initiative") {
    const holder = kind === "monarch" ? state.monarch : state.initiative;
    const next = holder === participantId ? null : participantId;
    store.dispatch(
      kind === "monarch"
        ? makeEvent<MonarchChangedEvent["type"], MonarchChangedEvent["payload"]>(
            "monarch_changed",
            { holder: next },
            at(),
          )
        : makeEvent<InitiativeChangedEvent["type"], InitiativeChangedEvent["payload"]>(
            "initiative_changed",
            { holder: next },
            at(),
          ),
    );
    onClose();
  }

  function toggleElimination() {
    store.dispatch(
      player.elimination
        ? makeEvent<PlayerRestoredEvent["type"], PlayerRestoredEvent["payload"]>(
            "player_restored",
            { target: participantId },
            at(),
          )
        : makeEvent<PlayerEliminatedEvent["type"], PlayerEliminatedEvent["payload"]>(
            "player_eliminated",
            { target: participantId },
            at(),
          ),
    );
    onClose();
  }

  function declareWinner() {
    // Ganar por una carta que lo declara es condición de primera clase, no una nota
    // al pie de «último en pie».
    store.dispatch(
      makeEvent<GameFinishedEvent["type"], GameFinishedEvent["payload"]>(
        "game_finished",
        { winner: participantId, reason: "card" },
        at(),
      ),
    );
    onClose();
  }

  const holderName = (id: string | null) =>
    id === null
      ? t("playerSheet.nobody")
      : (state.players.find((p) => p.participant.id === id)?.participant.name ?? id);

  return (
    <PlaySheet
      title={name}
      caption={t("playerSheet.caption", { seat: seat + 1, life: player.life })}
      onClose={onClose}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 px-3">
          <input
            value={exactLife}
            onChange={(e) => setExactLife(e.target.value)}
            inputMode="numeric"
            aria-label={t("board.setLife", { name })}
            className="w-24 rounded-chip border border-border bg-background px-2.5 py-2 text-right font-mono tabular-nums"
          />
          <button
            type="button"
            onClick={setLife}
            className="min-h-11 flex-1 rounded-chip border border-border px-3 text-[14px]"
          >
            {t("playerSheet.setLife")}
          </button>
        </div>

        <SheetGroup>
          <SheetRow
            label={t("playerSheet.giveMonarch")}
            value={holderName(state.monarch)}
            onClick={() => give("monarch")}
          />
          <SheetRow
            label={t("playerSheet.giveInitiative")}
            value={holderName(state.initiative)}
            onClick={() => give("initiative")}
          />
        </SheetGroup>

        {/* El fondo de la tarjeta NO está aquí, aunque el canvas lo pusiera: viaja
            dentro de `game_started` y no hay evento que lo cambie con la partida
            empezada (issue #943). Se elige en la configuración, que es donde se
            puede expresar. Un control apagado que nadie sabe por qué está apagado es
            peor que no tenerlo. */}

        {/* Las que sacan a alguien de la partida, en su propia caja. */}
        <SheetGroup>
          <SheetRow label={t("playerSheet.declareWinner")} onClick={declareWinner} />
          <SheetRow
            label={
              player.elimination ? t("playerSheet.restore") : t("playerSheet.markEliminated")
            }
            onClick={toggleElimination}
            danger={!player.elimination}
          />
        </SheetGroup>
      </div>
    </PlaySheet>
  );
}

