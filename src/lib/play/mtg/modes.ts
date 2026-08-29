// Modos de Magic. Un modo NO es una herramienta: comparten motor, eventos y
// estado, y solo cambian los números y qué reglas aplican (issue #931, fase 1a).
//
// Añadir un modo es una entrada en esta tabla mientras las reglas quepan aquí.
// El día que un modo necesite algo que esta forma no expresa —Dos cabezas
// comparte vidas por EQUIPO, no por jugador— deja de ser configuración y pasa a
// ser motor: no lo fuerces aquí, se nota en que hay que inventar un campo que
// ningún otro modo usa.

export type MtgMode = "commander" | "duel";

export type MtgModeConfig = {
  /** Vidas por defecto. El setup puede sobreescribirlas («Personalizar partida»). */
  startingLife: number;
  /**
   * Si el modo lleva daño de comandante. En Duelo no hay comandantes, así que el
   * panel no enseña la tira y el evento `commander_damage` no debería llegar —
   * el reducer lo rechaza, que es lo que hace fiable la validación por replay.
   */
  hasCommanderDamage: boolean;
  /** Umbral letal de daño de UN MISMO comandante. Irrelevante si el modo no lo lleva. */
  commanderDamageThreshold: number;
  /** Umbral letal de veneno. Es regla general de Magic, no del formato. */
  poisonThreshold: number;
  minPlayers: number;
  maxPlayers: number;
  /** Cuántos comandantes admite un asiento: 2 habilita partner/background. */
  maxCommanders: number;
};

export const MTG_MODES = {
  commander: {
    startingLife: 40,
    hasCommanderDamage: true,
    commanderDamageThreshold: 21,
    poisonThreshold: 10,
    minPlayers: 2,
    maxPlayers: 6,
    maxCommanders: 2,
  },
  duel: {
    startingLife: 20,
    hasCommanderDamage: false,
    commanderDamageThreshold: 21,
    poisonThreshold: 10,
    minPlayers: 2,
    maxPlayers: 2,
    maxCommanders: 1,
  },
} satisfies Record<MtgMode, MtgModeConfig>;

// Espejo en runtime de la unión, con el mismo mecanismo que
// MTG_EVENT_TYPE_MAP: `satisfies` obliga a que las claves cubran el tipo
// entero, así que añadir un modo sin su fila no compila.
export const MTG_MODE_IDS = Object.keys(MTG_MODES) as MtgMode[];

export function modeConfig(mode: MtgMode): MtgModeConfig {
  return MTG_MODES[mode];
}
