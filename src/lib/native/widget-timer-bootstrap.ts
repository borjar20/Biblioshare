"use client";

import { clearTimer, readTimer, writeTimer } from "@/lib/sessions/timer";

// Sincroniza nativo→app al volver a primer plano (best-effort, no bloqueante):
//
//  1. Lápida (#493): si el widget descartó/registró la sesión mientras la app
//     estaba cerrada, y la app aún guarda ESE mismo reloj sembrado, apágalo —
//     si no, el reloj fantasma seguiría vivo al reabrir la hoja de sesión.
//  2. Siembra: si el widget dejó un cronómetro corriendo (arrancado SIN abrir
//     la app) y la app no tiene reloj propio para ese pase, adopta el nativo.
//
// La app siempre manda sobre su propio reloj: nunca pisamos uno que el usuario
// haya tocado (mismo pase pero con otra hora de inicio → es otra sesión, suya).
export async function seedTimerFromWidget(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.getPlatform() !== "android") return;
    const { getRunningTimer, clearRunningTimer } = await import("@/lib/native/android-widgets");
    const { running, cleared } = await getRunningTimer();

    if (cleared) {
      const app = readTimer(cleared.passId);
      const appRunning = app.startedAt !== null || app.accumulatedMs > 0;
      const sameSession = (app.firstStartedAt ?? app.startedAt) === cleared.firstStartedAt;
      if (appRunning && sameSession) {
        clearTimer(cleared.passId); // apaga localStorage; el espejo consume la lápida
      } else {
        await clearRunningTimer(cleared.passId); // reloj ajeno o inexistente: solo consume la lápida
      }
      return; // el widget acaba de limpiar: no siembres en la misma vuelta
    }

    if (!running) return;
    const existing = readTimer(running.passId);
    if (existing.startedAt !== null || existing.accumulatedMs > 0) return; // la app ya tiene reloj: manda el suyo
    writeTimer(running.passId, {
      startedAt: running.startedAt,
      accumulatedMs: 0,
      firstStartedAt: running.firstStartedAt,
    });
  } catch {
    // Best-effort: sin sincronización, la app sigue funcionando con su propio estado.
  }
}
