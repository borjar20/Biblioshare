import { modeConfig, type MtgMode } from "@/lib/play/mtg/modes";
import type { MtgParticipant, MtgSetup } from "@/lib/play/mtg/types";

/**
 * Borrador de la pantalla de configuración. Vive fuera del componente porque aquí
 * está el criterio —qué pasa al bajar de 6 a 2 jugadores, al cambiar de modo con un
 * partner puesto, al quitar un comandante— y eso se prueba sin montar un formulario.
 *
 * Lo que sale de `toSetup` tiene que ARRANCAR en el motor tal cual: los tests lo
 * comprueban pasándolo por `initialMtgState`, no mirándole la forma.
 */
export type DraftCommander = { id: string; name: string };

export type DraftPlayer = {
  id: string;
  name: string;
  deckName: string;
  commanders: DraftCommander[];
  /** Id de tinte predefinido. REFERENCIA, nunca bytes (issue #942). */
  cardBackground?: string;
  /** Asiento = tu propia cuenta (kind "user", issue #985). Excluyente con playerId. */
  userId?: string;
  /** Habitual asignado a este asiento (fase 6). Editar el nombre lo degrada
   * a invitado -- ver `updatePlayer`. */
  playerId?: string;
};

export type SetupDraft = {
  mode: MtgMode;
  startingLife: number;
  startingSeat: number;
  players: DraftPlayer[];
};

/** Por defecto de la pantalla: cuatro asientos, que es la mesa típica de Commander. */
const DEFAULT_PLAYERS = 4;

// Los ids salen de la POSICIÓN, no de un contador: `p1`, y sus comandantes `p1-c1` y
// `p1-c2`. Así son únicos en toda la mesa —que es lo que valida el reducer, porque
// son las claves del daño de comandante— sin llevar estado extra que mantener.
const playerId = (index: number) => `p${index + 1}`;
const commanderId = (index: number, slot: number) => `${playerId(index)}-c${slot + 1}`;

function emptyPlayer(index: number): DraftPlayer {
  return {
    id: playerId(index),
    name: "",
    deckName: "",
    commanders: [{ id: commanderId(index, 0), name: "" }],
  };
}

export function newDraft(mode: MtgMode, players: number = DEFAULT_PLAYERS): SetupDraft {
  const config = modeConfig(mode);
  const count = Math.min(Math.max(players, config.minPlayers), config.maxPlayers);
  return {
    mode,
    startingLife: config.startingLife,
    startingSeat: 0,
    players: Array.from({ length: count }, (_, i) => emptyPlayer(i)),
  };
}

export function draftFromSetup(setup: MtgSetup): SetupDraft {
  return {
    mode: setup.mode,
    startingLife: setup.startingLife,
    startingSeat: setup.startingSeat,
    players: setup.participants.map((participant, i) => ({
      id: playerId(i),
      name: participant.name,
      deckName: participant.deckName ?? "",
      commanders: participant.commanders.map((commander, slot) => ({
        id: commanderId(i, slot),
        name: commander.name ?? "",
      })),
      cardBackground: participant.cardBackground,
      ...(participant.kind === "regular" ? { playerId: participant.playerId } : {}),
      ...(participant.kind === "user" ? { userId: participant.userId } : {}),
    })),
  };
}

export function updatePlayer(
  draft: SetupDraft,
  index: number,
  patch: Partial<Omit<DraftPlayer, "id" | "commanders">>,
): SetupDraft {
  const players = draft.players.map((player, i) => {
    if (i !== index) return player;
    // Editar el nombre de un asiento asignado lo degrada a invitado: el
    // nombre es lo único que identifica al habitual (o a ti, #985) en
    // pantalla, así que tocarlo rompe esa identificación (spec §6). El mazo,
    // comandantes y fondo NO degradan -- no identifican a nadie.
    if (patch.name !== undefined && (player.playerId !== undefined || player.userId !== undefined)) {
      const { playerId: _playerId, userId: _userId, ...rest } = player;
      return { ...rest, ...patch };
    }
    return { ...player, ...patch };
  });
  return { ...draft, players };
}

/** Asigna un habitual a un asiento: fija nombre y `playerId` (fase 6).
 * Excluyente con `userId`: pisar un asiento «Yo» con un habitual lo limpia. */
export function assignRegular(
  draft: SetupDraft,
  index: number,
  player: { playerId: string; name: string },
): SetupDraft {
  const players = draft.players.map((p, i) =>
    i === index ? { ...p, name: player.name, playerId: player.playerId, userId: undefined } : p,
  );
  return { ...draft, players };
}

/** Asigna TU cuenta a un asiento (kind "user", issue #985). Excluyente con playerId. */
export function assignSelf(
  draft: SetupDraft,
  index: number,
  self: { userId: string; name: string },
): SetupDraft {
  const players = draft.players.map((p, i) =>
    i === index ? { ...p, name: self.name, userId: self.userId, playerId: undefined } : p,
  );
  return { ...draft, players };
}

export function updateCommander(
  draft: SetupDraft,
  playerIndex: number,
  commanderIndex: number,
  name: string,
): SetupDraft {
  const players = draft.players.map((player, i) =>
    i === playerIndex
      ? {
          ...player,
          commanders: player.commanders.map((commander, j) =>
            j === commanderIndex ? { ...commander, name } : commander,
          ),
        }
      : player,
  );
  return { ...draft, players };
}

export function addCommander(draft: SetupDraft, playerIndex: number): SetupDraft {
  const max = modeConfig(draft.mode).maxCommanders;
  const players = draft.players.map((player, i) => {
    if (i !== playerIndex || player.commanders.length >= max) return player;
    return {
      ...player,
      commanders: [...player.commanders, { id: commanderId(i, player.commanders.length), name: "" }],
    };
  });
  return { ...draft, players };
}

export function removeCommander(
  draft: SetupDraft,
  playerIndex: number,
  commanderIndex: number,
): SetupDraft {
  const players = draft.players.map((player, i) => {
    // Nunca se queda un asiento sin comandante: si no existiera, el daño no tendría
    // a qué atribuirse y el reducer necesitaría un caso especial para los asientos
    // sin rellenar (decisión 2026-08-29 (8)).
    if (i !== playerIndex || player.commanders.length <= 1) return player;
    const kept = player.commanders.filter((_, j) => j !== commanderIndex);
    // Se REASIGNAN los ids por posición: quitar el primero de un partner dejaría
    // si no un `-c2` suelto y un hueco en la numeración.
    return { ...player, commanders: kept.map((c, slot) => ({ ...c, id: commanderId(i, slot) })) };
  });
  return { ...draft, players };
}

export function setPlayerCount(draft: SetupDraft, count: number): SetupDraft {
  const config = modeConfig(draft.mode);
  const next = Math.min(Math.max(count, config.minPlayers), config.maxPlayers);
  // Conserva lo escrito en los que siguen: bajar y volver a subir no puede borrar
  // los nombres de quien no se ha movido de la mesa.
  const players =
    next <= draft.players.length
      ? draft.players.slice(0, next)
      : [
          ...draft.players,
          ...Array.from({ length: next - draft.players.length }, (_, i) =>
            emptyPlayer(draft.players.length + i),
          ),
        ];
  return {
    ...draft,
    players,
    // Quien empezaba puede haberse quedado fuera de la mesa.
    startingSeat: Math.min(draft.startingSeat, players.length - 1),
  };
}

/** Primer `p{n}` libre: quitar por el medio y volver a añadir no puede duplicar. */
function nextSeatIndex(players: readonly DraftPlayer[]): number {
  const used = new Set(players.map((p) => p.id));
  let n = 0;
  while (used.has(playerId(n))) n++;
  return n;
}

/** Un asiento vacío más, si el modo lo admite (fichas de la mesa, 2026-09-01). */
export function addPlayer(draft: SetupDraft): SetupDraft {
  if (draft.players.length >= modeConfig(draft.mode).maxPlayers) return draft;
  return { ...draft, players: [...draft.players, emptyPlayer(nextSeatIndex(draft.players))] };
}

/** Quita un asiento y recoloca quién empieza: el quitado pasa al primero, los de detrás bajan uno. */
export function removePlayer(draft: SetupDraft, index: number): SetupDraft {
  if (draft.players.length <= modeConfig(draft.mode).minPlayers) return draft;
  if (index < 0 || index >= draft.players.length) return draft;
  const players = draft.players.filter((_, i) => i !== index);
  const startingSeat =
    draft.startingSeat === index ? 0 : draft.startingSeat > index ? draft.startingSeat - 1 : draft.startingSeat;
  return { ...draft, players, startingSeat };
}

export function setMode(draft: SetupDraft, mode: MtgMode): SetupDraft {
  const config = modeConfig(mode);
  // El modo manda sobre las vidas y sobre cuánta gente y cuántos comandantes caben:
  // pasar de Commander a Duelo con seis asientos y un partner tiene que dejar una
  // mesa que el motor acepte, no un error al pulsar «Empezar».
  const trimmed: SetupDraft = {
    ...draft,
    mode,
    startingLife: config.startingLife,
    players: draft.players.map((player, i) => ({
      ...player,
      commanders: player.commanders
        .slice(0, config.maxCommanders)
        .map((c, slot) => ({ ...c, id: commanderId(i, slot) })),
    })),
  };
  return setPlayerCount(trimmed, trimmed.players.length);
}

/** Texto en blanco -> `undefined`: no se guarda una cadena vacía como si fuera un dato. */
function trimmed(value: string): string | undefined {
  const clean = value.trim();
  return clean === "" ? undefined : clean;
}

/**
 * Convierte el borrador en el `MtgSetup` que viaja dentro de `game_started`.
 *
 * `fallbackName` lo pone la UI (viene traducido): este módulo no importa next-intl
 * — la regla del repo es que `src/lib/play/**` no conoce React ni i18n.
 */
export function toSetup(draft: SetupDraft, fallbackName: (index: number) => string): MtgSetup {
  const participants: MtgParticipant[] = draft.players.map((player, i) => {
    const commanders = player.commanders.map((commander) => ({
      id: commander.id,
      name: trimmed(commander.name),
    }));
    const name = trimmed(player.name) ?? fallbackName(i);
    if (player.userId) {
      return {
        id: player.id,
        kind: "user",
        name,
        userId: player.userId,
        deckName: trimmed(player.deckName),
        commanders,
        cardBackground: player.cardBackground,
      };
    }
    if (player.playerId) {
      return {
        id: player.id,
        kind: "regular",
        name,
        playerId: player.playerId,
        deckName: trimmed(player.deckName),
        commanders,
        cardBackground: player.cardBackground,
      };
    }
    return {
      id: player.id,
      kind: "guest",
      name,
      deckName: trimmed(player.deckName),
      commanders,
      cardBackground: player.cardBackground,
    };
  });

  return {
    mode: draft.mode,
    participants,
    startingLife: draft.startingLife,
    startingSeat: draft.startingSeat,
  };
}
