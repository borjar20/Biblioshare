import { registerPlugin } from "@capacitor/core";
import { getWidgetSnapshot } from "@/lib/widgets/actions";
import { snapshotFingerprint } from "@/lib/widgets/build-widget-snapshot";
import type { WidgetSnapshot } from "@/lib/widgets/types";

// Adaptador del plugin local BiblioshareWidget (Kotlin). SOLO se carga por
// import dinámico desde src/lib/widgets/sync.ts cuando la plataforma es
// Android — mismo patrón que push/android.ts: nunca entra en el bundle web
// ni se ejecuta en SSR.

export interface BiblioshareWidgetPlugin {
  updateSnapshot(options: { snapshot: WidgetSnapshot }): Promise<void>;
  clearSnapshot(): Promise<void>;
  refreshWidgets(): Promise<void>;
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

// Huella del último snapshot entregado, para no despertar a los widgets si el
// contenido visible no cambió. Estado de módulo (vive lo que el WebView).
let lastFingerprint: string | null = null;

/**
 * Pide el snapshot al servidor y lo entrega al plugin. Best-effort:
 * - sin sesión → borra los datos del widget (estado "inicia sesión");
 * - error de red/servidor → conserva el snapshot anterior (útil sin conexión);
 * - contenido idéntico → no escribe nada.
 */
export async function syncAndroidWidgets(): Promise<void> {
  let result: Awaited<ReturnType<typeof getWidgetSnapshot>>;
  try {
    result = await getWidgetSnapshot();
  } catch {
    return; // sin red: el widget sigue mostrando lo último que supo
  }
  if (!result.ok) {
    if (result.reason === "unauthenticated") await clearAndroidWidgets();
    return;
  }
  const fingerprint = snapshotFingerprint(result.snapshot);
  if (fingerprint === lastFingerprint) return;
  await BiblioshareWidget.updateSnapshot({ snapshot: result.snapshot });
  lastFingerprint = fingerprint;
}

/** Cierre de sesión: snapshot, portadas y preferencias fuera. */
export async function clearAndroidWidgets(): Promise<void> {
  lastFingerprint = null;
  await BiblioshareWidget.clearSnapshot();
}

/** Re-render desde el store nativo, sin red (p. ej. tras cambio de tema). */
export async function refreshAndroidWidgets(): Promise<void> {
  await BiblioshareWidget.refreshWidgets();
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
