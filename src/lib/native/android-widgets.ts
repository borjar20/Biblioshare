import { registerPlugin } from "@capacitor/core";

// Adaptador del plugin local BiblioshareWidget (Kotlin). SOLO se carga por
// import dinámico desde los disparadores (android-widget-sync.tsx): nunca entra
// en el bundle web ni corre en SSR.
//
// Tras el giro a arquitectura híbrida (Fase 2) el widget LEE su snapshot de
// Supabase por su cuenta (RPC get_widget_snapshot, con la sesión nativa de la
// Fase 1). La web ya no construye ni empuja el snapshot: solo pide un refresco
// inmediato cuando está en primer plano (syncNow). El refresco con la app
// cerrada lo lleva WorkManager en el lado nativo. Este módulo conserva además
// el puente del cronómetro nativo del widget de registro.

export interface BiblioshareWidgetPlugin {
  /** Refresco inmediato: el nativo pide su snapshot a la RPC (primer plano). */
  syncNow(): Promise<void>;
  getRunningTimer(): Promise<{
    timer: NativeRunningTimer | null;
    // Lápida: el widget descartó/registró una sesión y la app aún puede tener
    // ese reloj sembrado en localStorage (#493). `firstStartedAt` identifica la
    // sesión concreta para no pisar un reloj nuevo iniciado en la app.
    cleared?: { passId: string; firstStartedAt: number } | null;
  }>;
  setRunningTimer(options: { passId: string; startedAt: number; firstStartedAt: number }): Promise<void>;
  clearRunningTimer(options: { passId: string }): Promise<void>;
}

// `startedAt` es el ancla EFECTIVA (descuenta pausas, ver widgetAnchor en
// timer.ts); `firstStartedAt` es la hora real de inicio para "Cuándo lees".
export type NativeRunningTimer = { passId: string; startedAt: number; firstStartedAt: number };
export type NativeClearedTimer = { passId: string; firstStartedAt: number };

const BiblioshareWidget =
  registerPlugin<BiblioshareWidgetPlugin>("BiblioshareWidget");

/** Pide al nativo que refresque el widget tirando de Supabase. Best-effort. */
export async function syncWidgetsNow(): Promise<void> {
  await BiblioshareWidget.syncNow();
}

// ── Cronómetro nativo (widget de registro) ─────────────────────────────────
// Espejo app→nativo (timer.ts) y siembra nativo→app (widget-timer-bootstrap.ts).

export async function setRunningTimer(
  passId: string,
  startedAt: number,
  firstStartedAt: number,
): Promise<void> {
  await BiblioshareWidget.setRunningTimer({ passId, startedAt, firstStartedAt });
}

export async function clearRunningTimer(passId: string): Promise<void> {
  await BiblioshareWidget.clearRunningTimer({ passId });
}

export async function getRunningTimer(): Promise<{
  running: NativeRunningTimer | null;
  cleared: NativeClearedTimer | null;
}> {
  const { timer, cleared } = await BiblioshareWidget.getRunningTimer();
  return { running: timer ?? null, cleared: cleared ?? null };
}
