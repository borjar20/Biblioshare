import type { ComponentType } from "react";
import type { ToolId } from "@/lib/play/core/types";
import type { ActiveGame, PlayStore } from "@/lib/play/core/store";
import { MtgTableMark } from "./marks/mtg-table-mark";
import { GameBoard } from "./game-board";
import { GameSummary } from "./game-summary";

/**
 * Registro de UI, hermano del registro de DOMINIO (`src/lib/play/tools.ts`). La
 * separación es por pureza: el motor no conoce React y la UI resuelve por `toolId`
 * (spec §6). Añadir «Puntuación por rondas» en la fase 4 es una entrada en cada
 * registro más su módulo: el hub no se toca.
 *
 * `ToolView` crece con cada pantalla que la herramienta aporta —el tablero y el
 * resumen llegan con ellos—; declarar hoy un campo que apunta a un componente que
 * no existe dejaría el registro roto hasta que exista.
 */
/** Props de toda pantalla de partida: las mismas para tablero y resumen, para que
 *  `game-screen.tsx` elija una u otra por `status` sin cambiar de forma nada. */
export type ToolScreenProps = { game: ActiveGame; store: PlayStore; identity: string };

export type ToolView = {
  /** La marca de la herramienta es el dibujo de su mesa, no un párrafo explicándola. */
  Illustration: ComponentType<{ className?: string }>;
  hubRoute: string;
  Board: ComponentType<ToolScreenProps>;
  Summary: ComponentType<ToolScreenProps>;
};

export const toolViews: Record<ToolId, ToolView> = {
  mtg: {
    Illustration: MtgTableMark,
    hubRoute: "/partidas/mtg",
    Board: GameBoard,
    Summary: GameSummary,
  },
};
