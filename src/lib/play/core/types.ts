// Tipos del motor de partidas. El core es neutro: no conoce conceptos de MTG
// (spec §2 — la especialización vive en cada herramienta).

// La herramienta es el JUEGO, no el modo: Commander es un modo de Magic, igual
// que Duelo (issue #931, fase 1a). Lo que varía entre modos —vidas iniciales,
// si aplican los 21 de comandante, cuánta gente cabe— es configuración y vive en
// `mtg/modes.ts`; el `ToolId` solo crece cuando entra un juego distinto.
export type ToolId = "mtg" | "score";

// Forma base que TODA herramienta extiende (finding 6 de la revisión final): la
// pantalla instrumento compartida y el banner "partida en curso" necesitan leer
// toolId/status sin conocer la herramienta concreta. Parametrizado por T para que
// cada herramienta conserve su literal (p. ej. "commander") en vez de ensanchar a
// ToolId genérico — así el discriminante sigue funcionando cuando PlayGameState
// pase a ser una unión de verdad.
export type ToolGameState<T extends ToolId = ToolId> = {
  toolId: T;
  status: "active" | "finished";
};

// Unión discriminada: un invitado con userId o un usuario sin él no compilan
// (spec §2, revisión: los estados imposibles no viven en comentarios). El
// brazo "regular" referencia un habitual de `play_players` por `playerId`;
// la copia de `name` viaja EMBEBIDA en el evento/summary a propósito —
// renombrar o borrar el habitual en `play_players` no toca logs pasados ni
// resúmenes ya guardados (fase 6).
export type Participant =
  | { id: string; kind: "user"; name: string; userId: string }
  | { id: string; kind: "regular"; name: string; playerId: string }
  | { id: string; kind: "guest"; name: string };

export type PlayEvent<T extends string = string, P = unknown> = {
  id: string; // UUID: idempotencia de la sync futura (Fase 5)
  type: T;
  at: number; // epoch ms, informativo: el orden verdadero es la posición en el log
  payload: P;
};

// Neutro respecto a la herramienta (finding 2 de la revisión final): {key,
// params} es la forma que necesita CUALQUIER describe() del registro de
// tools.ts para etiquetar un evento en la pantalla instrumento, no un
// concepto propio de Commander. Vivía en commander/selectors.ts y una
// segunda herramienta habría tenido que importar de `commander/` solo para
// nombrar el tipo de su propio describe() — exactamente lo que el registro
// existe para evitar.
export type EventDescription = { key: string; params: Record<string, string | number> };

// Fuente de verdad histórica = committed. Estado vivo = committed + pending.
// pending es la ráfaga de coalescing: todavía NO forma parte del log canónico (spec §2-3).
export type EventLog = {
  committed: PlayEvent[];
  pending: PlayEvent | null;
};

// Lo que se persiste en localStorage. Sin toolId: se deriva de
// committed[0].payload.toolId durante el replay de rehidratación (spec §2).
export type ActiveGameSnapshot = {
  v: 1;
  committed: PlayEvent[];
  pending: PlayEvent | null;
};

// Resumen sellado al guardar (fase 5): la lista y el detalle del historial
// renderizan SOLO esto — nunca replay. Es el MISMO objeto que sube a
// play_games.summary, así que cambiarlo es cambiar el contrato con el servidor.
export type SavedParticipant = {
  kind: "user" | "regular" | "guest";
  name: string;
  userId?: string;
  playerId?: string; // solo kind regular
};

export type SavedGameSummary = {
  toolId: ToolId;
  participants: SavedParticipant[]; // orden = asientos
  winners: number[]; // asientos con position 1 (empate posible en score)
  ranking: { seat: number; position: number }[];
  durationMs: number;
  tool: Record<string, unknown>; // extensión por herramienta (mtg: mode/turns/commanders; score: rounds/direction/totals/target)
};
