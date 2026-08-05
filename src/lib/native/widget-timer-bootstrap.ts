"use client";

import { readTimer, writeTimer } from "@/lib/sessions/timer";

// Siembra nativo→app: si el widget dejó un cronómetro corriendo (arrancado
// SIN abrir la app) y la app vuelve a primer plano sin reloj propio para ese
// pase, adopta la hora de arranque nativa. Si la app YA tiene reloj (propio o
// heredado), manda el suyo — nunca lo pisa. Best-effort y no bloqueante.
export async function seedTimerFromWidget(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.getPlatform() !== "android") return;
    const { getRunningTimer } = await import("@/lib/native/android-widgets");
    const running = await getRunningTimer();
    if (!running) return;
    const existing = readTimer(running.passId);
    if (existing.startedAt !== null || existing.accumulatedMs > 0) return; // la app ya tiene reloj: manda el suyo
    writeTimer(running.passId, {
      startedAt: running.startedAt,
      accumulatedMs: 0,
      firstStartedAt: running.startedAt,
    });
  } catch {
    // Best-effort: sin siembra, la app sigue funcionando con su propio estado.
  }
}
