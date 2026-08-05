"use client";

import { Capacitor } from "@capacitor/core";

// Punto ÚNICO de sincronización de widgets para toda la app: cualquier código
// cliente llama a requestWidgetSync(reason) y aquí se agrupa (debounce), se
// deduplica (huella en android-widgets.ts) y se decide si procede (solo
// Android nativo; en web y SSR es un no-op y el módulo nativo ni se carga).

const DEBOUNCE_MS = 2000;

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let rerun = false;

export function requestWidgetSync(reason: string): void {
  if (typeof window === "undefined") return;
  if (Capacitor.getPlatform() !== "android") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void run(reason);
  }, DEBOUNCE_MS);
}

async function run(reason: string): Promise<void> {
  if (running) {
    // Llegó otra petición mientras sincronizábamos: una pasada más al acabar.
    rerun = true;
    return;
  }
  running = true;
  try {
    const { syncAndroidWidgets } = await import("@/lib/native/android-widgets");
    await syncAndroidWidgets();
  } catch (e) {
    console.error("widgets: sync failed", reason, e);
  } finally {
    running = false;
    if (rerun) {
      rerun = false;
      requestWidgetSync(reason);
    }
  }
}

/** Cierre de sesión: limpieza inmediata, sin debounce. */
export async function clearWidgetsOnLogout(): Promise<void> {
  if (typeof window === "undefined") return;
  if (Capacitor.getPlatform() !== "android") return;
  try {
    const { clearAndroidWidgets } = await import("@/lib/native/android-widgets");
    await clearAndroidWidgets();
  } catch (e) {
    console.error("widgets: clear failed", e);
  }
}
