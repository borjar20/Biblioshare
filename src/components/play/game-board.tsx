"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import type { ActiveGame, PlayStore } from "@/lib/play/core/store";
import type { MtgState } from "@/lib/play/mtg/types";
import type { LifeChangedEvent } from "@/lib/play/mtg/events";
import { playTools } from "@/lib/play/tools";
import { defaultLayout, resolveLayout } from "@/lib/play/ui/layout";
import { preferencesStore, DEFAULT_PREFERENCES } from "@/lib/play/ui/preferences";
import { PlayerPanel } from "./player-panel";
import { PanelActions } from "./panel-actions";
import { CenterConsole } from "./center-console";
import { PlayerSheet } from "./player-sheet";
import { GameSheet } from "./game-sheet";
import { useWakeLock } from "./use-wake-lock";

const getServerPreferences = () => DEFAULT_PREFERENCES;

/**
 * Fábrica del evento de vidas, FUERA del componente. El motor exige que el reloj lo
 * ponga quien llama (`makeEvent(type, payload, at)`: nada de `Date.now()` dentro del
 * motor, para que sus tests sean deterministas), y `Date.now()` es impuro: llamarlo
 * en el cuerpo de un componente rompe la regla de pureza de React y el lint lo caza.
 * Aquí, a nivel de módulo, es solo una función que se ejecuta cuando alguien toca.
 */
function lifeEvent(target: string, delta: number): LifeChangedEvent {
  return makeEvent<LifeChangedEvent["type"], LifeChangedEvent["payload"]>(
    "life_changed",
    { target, delta },
    Date.now(),
  );
}

/**
 * El tablero. La rejilla sale entera de `resolveLayout`, que es puro y está probado;
 * aquí solo se pinta.
 *
 * **El orden del DOM es el de asientos, siempre.** La rotación es únicamente
 * `transform`, así que quien navega con teclado o con lector recorre la mesa en el
 * orden real y no en el visual (spec §7).
 */
export function GameBoard({
  game,
  store,
}: {
  game: ActiveGame;
  store: PlayStore;
  identity: string;
}) {
  const t = useTranslations("play");
  const state = game.state as MtgState;
  const [openSheetSeat, setOpenSheetSeat] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const prefs = useSyncExternalStore(
    preferencesStore.subscribe,
    preferencesStore.getSnapshot,
    getServerPreferences,
  );
  useWakeLock(prefs.keepAwake);

  const layout = useMemo(() => {
    const players = state.players.length;
    const family =
      prefs.layout === "auto" ? defaultLayout(players, prefs.orientation) : prefs.layout;
    return resolveLayout(players, prefs.orientation, family);
  }, [state.players.length, prefs.layout, prefs.orientation]);

  // Una sola región que anuncia: la que lee el último movimiento. Una por panel
  // convertiría cada tap en cuatro anuncios.
  const lastEvent = game.log.pending ?? game.log.committed[game.log.committed.length - 1];
  const described = lastEvent ? playTools[state.toolId].describe(lastEvent, state) : null;

  function changeLife(participantId: string, delta: number) {
    // `tap`, no `dispatch`: los ±1 seguidos se funden en un solo evento (ráfaga de
    // 1,5 s), que es lo que hace que deshacer no vaya de uno en uno.
    store.tap(lifeEvent(participantId, delta));
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-play-felt p-1.5">
      <div
        className="grid h-full w-full gap-1.5"
        style={{
          gridTemplateColumns: layout.columns,
          gridTemplateRows: layout.rows,
          gridTemplateAreas: layout.areas,
        }}
      >
        {state.players.map((player, seat) => {
          const placement = layout.seats.find((s) => s.seat === seat);
          if (!placement) return null;
          return (
            <PlayerPanel
              key={player.participant.id}
              player={player}
              seat={seat}
              placement={placement}
              isActive={state.activeSeat === seat}
              isMonarch={state.monarch === player.participant.id}
              hasInitiative={state.initiative === player.participant.id}
              onLife={(delta) => changeLife(player.participant.id, delta)}
              onOpenSheet={() => setOpenSheetSeat(seat)}
            >
              <PanelActions state={state} player={player} store={store} />
            </PlayerPanel>
          );
        })}

        {/* El hueco de la consola. De pie la banda vive DENTRO de la rejilla; tumbado
            el hueco mide cero y la consola flota sobre los paneles, con el sitio ya
            reservado por el padding de las cabeceras (decisión 2026-08-29 (6)). */}
        <div style={{ gridArea: layout.consoleArea }} className="flex items-center">
          {layout.consoleMode === "band" && (
            <CenterConsole game={game} store={store} mode="band" onOpenMenu={() => setMenuOpen(true)} />
          )}
        </div>
      </div>

      {layout.consoleMode === "floating" && (
        <CenterConsole game={game} store={store} mode="floating" onOpenMenu={() => setMenuOpen(true)} />
      )}

      {/* Lo que acaba de pasar, para quien no puede verlo. `polite`: no interrumpe. */}
      <p aria-live="polite" className="sr-only">
        {described ? t(`log.${described.key}`, described.params) : ""}
      </p>

      {/* Las hojas NO giran: salen de abajo y derechas, porque las abre quien tiene
          el móvil en la mano. La que sí gira es el overlay de daño, que vive dentro
          del panel. */}
      {openSheetSeat !== null && (
        <PlayerSheet
          state={state}
          store={store}
          seat={openSheetSeat}
          onClose={() => setOpenSheetSeat(null)}
        />
      )}
      {menuOpen && <GameSheet game={game} store={store} onClose={() => setMenuOpen(false)} />}
    </div>
  );
}
