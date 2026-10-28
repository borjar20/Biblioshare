import type { Camera } from "@/lib/atlas/types";

// Cámara del atlas por saga en sessionStorage (spec 2026-10-28 §3): para volver
// de una ficha al sitio donde estabas. Todo acceso va en try/catch: en modo
// privado, con datos bloqueados o en el servidor, leer da null y escribir no hace nada.
const keyOf = (sagaId: string) => `saga-atlas:${sagaId}`;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function readCamera(sagaId: string): Camera | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(keyOf(sagaId));
    if (!raw) return null;
    const { x, y, k } = JSON.parse(raw) as Record<string, unknown>;
    return finite(x) && finite(y) && finite(k) && k > 0 ? { x, y, k } : null;
  } catch {
    return null;
  }
}

export function writeCamera(sagaId: string, cam: Camera): void {
  try {
    globalThis.sessionStorage?.setItem(keyOf(sagaId), JSON.stringify({ x: cam.x, y: cam.y, k: cam.k }));
  } catch {
    // Sin almacenamiento la cámara simplemente no se recuerda.
  }
}
