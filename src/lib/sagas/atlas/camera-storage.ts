import type { Camera } from "@/lib/atlas/types";
import type { Lens, Orientation } from "./layout";

// Cámara del atlas por saga en sessionStorage (spec 2026-10-28 §3): para volver
// de una ficha al sitio donde estabas. Todo acceso va en try/catch: en modo
// privado, con datos bloqueados o en el servidor, leer da null y escribir no hace nada.
// Junto a la cámara se guardan la lente y la orientación en que se movió: unas coordenadas de
// Orden no significan nada en Publicación (ni en vertical), así que solo se restauran si ambas
// coinciden con las actuales. Un valor sin ellas (formato antiguo) se ignora.
export type CameraContext = { lens: Lens; orientation: Orientation };
const keyOf = (sagaId: string) => `saga-atlas:${sagaId}`;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function readCamera(sagaId: string, ctx: CameraContext): Camera | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(keyOf(sagaId));
    if (!raw) return null;
    const { lens, orientation, x, y, k } = JSON.parse(raw) as Record<string, unknown>;
    if (lens !== ctx.lens || orientation !== ctx.orientation) return null;
    return finite(x) && finite(y) && finite(k) && k > 0 ? { x, y, k } : null;
  } catch {
    return null;
  }
}

export function writeCamera(sagaId: string, cam: Camera, ctx: CameraContext): void {
  try {
    globalThis.sessionStorage?.setItem(
      keyOf(sagaId),
      JSON.stringify({ lens: ctx.lens, orientation: ctx.orientation, x: cam.x, y: cam.y, k: cam.k }),
    );
  } catch {
    // Sin almacenamiento la cámara simplemente no se recuerda.
  }
}
