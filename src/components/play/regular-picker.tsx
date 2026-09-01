"use client";

import { useTranslations } from "next-intl";
import { putPlayer, type PlayerRecord } from "@/lib/play/core/db";
import { requestPlayersSync } from "@/lib/play/core/players-sync";
import { canRemember, chipSuggestions } from "@/lib/play/ui/regular-chips";

// Cuántos chips caben bajo un asiento sin que la fila empuje al resto del
// formulario: descubribilidad sin convertir el setup en una lista de habituales.
const MAX_CHIPS = 6;

/**
 * Chips de habituales + «Recordar», bajo el nombre de un asiento (fase 6,
 * Task 6). Sin estado propio -- todo lo que necesita para decidir qué
 * enseñar llega por props desde el form, que es quien monta `usePlayers`
 * UNA sola vez por pantalla (una sola suscripción, no una por asiento).
 *
 * `null` en tres casos: anónimo (no hay habituales que ofrecer), asiento ya
 * asignado (los chips no tienen sentido sobre un habitual ya puesto) o sin
 * nada que enseñar (ni sugerencias ni «Recordar» disponible).
 */
export function RegularPicker(props: {
  identity: string;
  players: PlayerRecord[];
  takenIds: string[];
  query: string;
  assigned: boolean;
  onPick(player: { playerId: string; name: string }): void;
  onRemembered(player: { playerId: string; name: string }): void;
  /** Tu propia cuenta como asiento (issue #985); undefined = anon o «Yo» ya sentado. */
  self?: { userId: string; name: string };
  onPickSelf?(self: { userId: string; name: string }): void;
  /**
   * Con `false`, los chips de sugerencia solo salen AL ESCRIBIR. Es para la
   * mesa de puntuación, donde la fila de fichas ya enseña a los habituales:
   * repetirlos como chips bajo el campo era la misma gente dos veces. Donde no
   * hay fichas (mtg) se queda en `true` — con la query vacía los chips son lo
   * que hace descubribles a los habituales (spec fase 6 §6).
   */
  suggestOnEmpty?: boolean;
}) {
  const {
    identity,
    players,
    takenIds,
    query,
    assigned,
    onPick,
    onRemembered,
    self,
    onPickSelf,
    suggestOnEmpty = true,
  } = props;
  const t = useTranslations("play");

  if (identity === "anon" || assigned) return null;

  const suggestions = (
    suggestOnEmpty || query.trim() !== "" ? chipSuggestions(players, takenIds, query) : []
  ).slice(0, MAX_CHIPS);
  const remember = canRemember(players, query);
  const showSelf = self !== undefined && onPickSelf !== undefined;
  if (suggestions.length === 0 && !remember && !showSelf) return null;

  async function handleRemember() {
    const playerId = crypto.randomUUID();
    const name = query.trim();
    const saved = await putPlayer({
      playerId,
      identity,
      v: 1,
      name,
      syncStatus: "pending",
      deletedAt: null,
    });
    // Sin BD el put devuelve false: asignar igualmente dejaría el asiento
    // apuntando a un playerId que no existe en ningún sitio y jamás se
    // sincronizará (spec §7: IDB indisponible → el setup sigue con
    // invitados). El asiento se queda como invitado con su texto.
    if (!saved) return;
    requestPlayersSync(identity);
    onRemembered({ playerId, name });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={t("players.chipsLabel")}>
      {showSelf && (
        <button
          type="button"
          onClick={() => onPickSelf(self)}
          className="tap-44 rounded-chip border border-accent-ink/40 bg-surface px-2 py-1 text-[12px] font-semibold text-accent-ink transition-colors hover:bg-surface-muted"
        >
          {t("players.self")}
        </button>
      )}
      {suggestions.map((player) => (
        <button
          key={player.playerId}
          type="button"
          onClick={() => onPick({ playerId: player.playerId, name: player.name })}
          className="tap-44 rounded-chip border border-border bg-surface px-2 py-1 text-[12px] text-foreground transition-colors hover:bg-surface-muted"
        >
          {player.name}
        </button>
      ))}
      {remember && (
        <button
          type="button"
          onClick={handleRemember}
          className="font-mono text-[10px] uppercase tracking-widest text-accent-ink"
        >
          + {t("players.remember")}
        </button>
      )}
    </div>
  );
}
