import { Capacitor } from "@capacitor/core";
import { registerWebDevice, unregisterWebDevice } from "./device-actions";

// Detección de plataforma y API común de push (spec item 1). ÚNICO sitio con
// condicionales de plataforma: los componentes llaman a estas funciones y no
// saben si están en web o en el WebView de Capacitor.
//
// - Nativo (android/ios): NUNCA se toca Web Push; se delega en ./android
//   (import dinámico para no meter @capacitor/push-notifications en el bundle web).
// - Web: flujo VAPID existente (service worker + PushManager).

export type NotificationPlatform = "web" | "android" | "ios";

// unsupported: SOLO web real sin soporte de push (nunca en el WebView nativo).
// prompt: aún no se ha pedido permiso. granted/denied: estado del SO/navegador.
export type PushPermissionState = "unsupported" | "prompt" | "granted" | "denied";

export type PushEnableResult = { ok: boolean; state: PushPermissionState; error?: string };

export function getNotificationPlatform(): NotificationPlatform {
  const p = Capacitor.getPlatform(); // 'web' | 'android' | 'ios'
  if (p === "android") return "android";
  if (p === "ios") return "ios";
  return "web";
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

// --- Web (VAPID) ------------------------------------------------------------

function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function webPermissionState(): PushPermissionState {
  if (!isWebPushSupported()) return "unsupported";
  const p = Notification.permission; // 'default' | 'granted' | 'denied'
  if (p === "granted") return "granted";
  if (p === "denied") return "denied";
  return "prompt";
}

async function enableWeb(): Promise<PushEnableResult> {
  if (!isWebPushSupported()) return { ok: false, state: "unsupported" };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, state: permission === "denied" ? "denied" : "prompt" };
  }
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      ) as BufferSource,
    }));
  const json = subscription.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  await registerWebDevice(json);
  return { ok: true, state: "granted" };
}

async function disableWeb(): Promise<void> {
  if (!isWebPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await unregisterWebDevice(subscription.endpoint);
    await subscription.unsubscribe();
  }
}

async function webIsEnabled(): Promise<boolean> {
  if (!isWebPushSupported() || Notification.permission !== "granted") return false;
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) != null;
}

// --- API común --------------------------------------------------------------

export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (isNative()) {
    const { getAndroidPushPermission } = await import("./android");
    return getAndroidPushPermission();
  }
  return webPermissionState();
}

// ¿Está el push activo AHORA (suscrito/registrado)? Distinto de «permiso
// concedido»: en web el permiso puede estar concedido pero sin suscripción.
export async function isPushEnabled(): Promise<boolean> {
  if (isNative()) {
    const { androidIsEnabled } = await import("./android");
    return androidIsEnabled();
  }
  return webIsEnabled();
}

export async function enablePushNotifications(): Promise<PushEnableResult> {
  if (isNative()) {
    const { enableAndroidPush } = await import("./android");
    return enableAndroidPush();
  }
  return enableWeb();
}

export async function disablePushNotifications(): Promise<void> {
  if (isNative()) {
    const { disableAndroidPush } = await import("./android");
    await disableAndroidPush();
    return;
  }
  await disableWeb();
}
