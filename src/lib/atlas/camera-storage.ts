import type { Camera, Orientation } from "./types";

// Cámara de un atlas en sessionStorage: para volver de una ficha al sitio donde estabas.
// Todo acceso va en try/catch: en modo privado, con datos bloqueados o en el servidor, leer
// da null y escribir no hace nada. Junto a la cámara se guardan la lente y la orientación en
// que se movió: unas coordenadas de una lente no significan nada en otra (ni en vertical), así
// que solo se restauran si ambas coinciden. Un valor sin ellas (formato antiguo) se ignora.
// `key` es la clave completa: `saga-atlas:<id>` en el atlas de la saga, `sagas-atlas` en el índice.
export type CameraContext = { lens: string; orientation: Orientation };
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function readCamera(key: string, ctx: CameraContext): Camera | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(key);
    if (!raw) return null;
    const { lens, orientation, x, y, k } = JSON.parse(raw) as Record<string, unknown>;
    if (lens !== ctx.lens || orientation !== ctx.orientation) return null;
    return finite(x) && finite(y) && finite(k) && k > 0 ? { x, y, k } : null;
  } catch {
    return null;
  }
}

export function writeCamera(key: string, cam: Camera, ctx: CameraContext): void {
  try {
    globalThis.sessionStorage?.setItem(
      key,
      JSON.stringify({ lens: ctx.lens, orientation: ctx.orientation, x: cam.x, y: cam.y, k: cam.k }),
    );
  } catch {
    // Sin almacenamiento la cámara simplemente no se recuerda.
  }
}
