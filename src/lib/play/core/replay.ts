import { PlayEventError } from "./errors";
import type { PlayEvent } from "./types";
import { playTools, type PlayGameState } from "@/lib/play/tools";

// La rehidratación ES este replay: si algo no cuadra, PlayEventError y el
// snapshot se descarta (spec §4). El toolId vive SOLO en game_started (spec §2).
export function replay(committed: PlayEvent[], pending: PlayEvent | null = null): PlayGameState {
  const [first, ...rest] = committed;
  if (!first || first.type !== "game_started") throw new PlayEventError("el log no empieza por game_started");
  const toolId = (first.payload as { toolId?: string }).toolId;
  const tool = toolId !== undefined && toolId in playTools ? playTools[toolId as keyof typeof playTools] : null;
  if (!tool) throw new PlayEventError(`herramienta desconocida: ${String(toolId)}`);
  let state = tool.init(first);
  for (const event of rest) state = tool.reduce(state, event);
  if (pending) state = tool.reduce(state, pending);
  return state;
}
