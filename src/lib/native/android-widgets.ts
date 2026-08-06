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
  getRunningTimer(): Promise<{ timer: { passId: string; startedAt: number } | null }>;
  setRunningTimer(options: { passId: string; startedAt: number }): Promise<void>;
  clearRunningTimer(options: { passId: string }): Promise<void>;
}

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

export async function setRunningTimer(passId: string, startedAt: number): Promise<void> {
  await BiblioshareWidget.setRunningTimer({ passId, startedAt });
}

export async function clearRunningTimer(passId: string): Promise<void> {
  await BiblioshareWidget.clearRunningTimer({ passId });
}

export async function getRunningTimer(): Promise<{ passId: string; startedAt: number } | null> {
  const { timer } = await BiblioshareWidget.getRunningTimer();
  return timer ?? null;
}
