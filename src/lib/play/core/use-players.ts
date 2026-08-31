"use client";

import { useCallback, useEffect, useState } from "react";
import { listPlayers, type PlayerRecord } from "./db";
import { PLAYERS_CHANNEL_PREFIX, requestPlayersSync } from "./players-sync";

/**
 * Espejo local-first de `play_players` para la pantalla de configuración
 * (fase 6, Task 6): mismo patrón que `SavedGames` -- estado + efectos,
 * `reload()` relee IDB (barato e idempotente), canal de BroadcastChannel
 * avisa de cambios del sync de fondo, `online` reintenta.
 *
 * `identity === "anon"` NUNCA toca red ni IDB: `players` queda `[]` sin
 * efectos -- un anónimo no tiene habituales que ofrecer (RegularPicker ya
 * se oculta para anon, pero el hook no depende de eso para ser seguro).
 *
 * `loaded` no está en la interfaz que consume `RegularPicker` (solo mira
 * `players`), pero el form SÍ lo necesita para la degradación de prefill del
 * Step 5: sin distinguir «aún no ha respondido el espejo» de «respondió y no
 * hay habituales», un draft con `playerId` se limpiaría en el primer render,
 * antes de que IDB tuviera ocasión de contestar.
 */
export function usePlayers(identity: string): {
  players: PlayerRecord[];
  reload(): void;
  loaded: boolean;
} {
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [loaded, setLoaded] = useState(identity === "anon");

  // `reload` cubre TAMBIÉN el caso anon (players = []): así el efecto de
  // abajo llama a una única función pase lo que pase, igual que
  // `SavedGames.reload`, y anon no necesita su propia rama de setState suelta.
  const reload = useCallback(async () => {
    if (identity === "anon") {
      setPlayers([]);
      setLoaded(true);
      return;
    }
    const own = (await listPlayers(identity)).filter((r) => r.deletedAt === null);
    setPlayers(own);
    setLoaded(true);
  }, [identity]);

  useEffect(() => {
    reload();
    if (identity === "anon") return;
    requestPlayersSync(identity);

    // El sync de fondo (Task 4) avisa por este canal en cada pasada, tenga o
    // no cambios: reload() relee IDB y hace setState -- barato e idempotente.
    const channel = new BroadcastChannel(PLAYERS_CHANNEL_PREFIX + identity);
    channel.onmessage = () => reload();

    function onOnline() {
      requestPlayersSync(identity);
    }
    window.addEventListener("online", onOnline);

    return () => {
      channel.close();
      window.removeEventListener("online", onOnline);
    };
  }, [identity, reload]);

  return { players, reload, loaded };
}
