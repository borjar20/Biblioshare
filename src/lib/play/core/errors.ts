// El reducer rechaza eventos inválidos lanzando esto; la rehidratación (que ES
// un replay) lo captura y descarta el snapshot (spec §4).
export class PlayEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayEventError";
  }
}
