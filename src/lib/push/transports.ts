import webpush from "web-push";
import { sendFcm } from "./fcm";
import { safeInternalPath } from "./safe-path";
import type { NotificationEvent, PushDevice, PushDeliveryResult, PushTransport } from "./types";

// Transportes por canal (spec item 6). Cada uno solo traduce el
// NotificationEvent —ya formateado— al formato de su canal y lo envía; el
// dispatcher decide A QUIÉN y traduce el resultado a salud del dispositivo.

// --- Web Push (VAPID) -------------------------------------------------------

let vapidConfigured: boolean | undefined;
// Configuración perezosa: a nivel de módulo el side effect correría durante
// `next build` (recolección de datos) sin las env vars y tumbaría el build de
// una feature best-effort. Igual que hacía el send-push.ts original.
function ensureVapid(): boolean {
  if (vapidConfigured !== undefined) return vapidConfigured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.error("WebPushTransport: VAPID keys not configured, skipping web push");
    vapidConfigured = false;
    return false;
  }
  webpush.setVapidDetails("mailto:borjar20@gmail.com", publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export const WebPushTransport: PushTransport = {
  async send(device: PushDevice, event: NotificationEvent): Promise<PushDeliveryResult> {
    if (!ensureVapid()) {
      return { deviceId: device.id, outcome: "temporary_error", errorCode: "NOT_CONFIGURED" };
    }
    if (!device.endpoint || !device.p256dh || !device.auth) {
      // Fila web_push corrupta (no debería pasar: la constraint lo impide).
      return { deviceId: device.id, outcome: "invalid_token", errorCode: "MALFORMED" };
    }
    // El service worker (public/sw.js) lee `url` para navegar — se mantiene ese
    // nombre de campo para no obligar a re-desplegar el SW. `type`/`notificationId`
    // se añaden para paridad con el data payload de FCM.
    const payload = JSON.stringify({
      title: event.title,
      body: event.body,
      url: safeInternalPath(event.path),
      type: event.type,
      ...(event.notificationId ? { notificationId: event.notificationId } : {}),
    });
    try {
      await webpush.sendNotification(
        {
          endpoint: device.endpoint,
          keys: { p256dh: device.p256dh, auth: device.auth },
        } as webpush.PushSubscription,
        payload,
      );
      return { deviceId: device.id, outcome: "sent" };
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      // 404/410 = el push service descartó la suscripción (desinstalada, permiso
      // revocado desde el SO): definitivamente inválida → apagar.
      if (statusCode === 404 || statusCode === 410) {
        return { deviceId: device.id, outcome: "invalid_token", errorCode: `HTTP_${statusCode}` };
      }
      console.error("WebPushTransport: send failed", statusCode ?? error);
      return {
        deviceId: device.id,
        outcome: "temporary_error",
        errorCode: statusCode ? `HTTP_${statusCode}` : "UNKNOWN",
      };
    }
  },
};

// --- FCM Android ------------------------------------------------------------

export const FcmAndroidTransport: PushTransport = {
  send(device: PushDevice, event: NotificationEvent): Promise<PushDeliveryResult> {
    if (!device.token) {
      return Promise.resolve({
        deviceId: device.id,
        outcome: "invalid_token",
        errorCode: "MALFORMED",
      });
    }
    return sendFcm(device.id, device.token, event);
  },
};

// Selección de transporte por plataforma (spec item 13). null = sin transporte
// vivo (apns_ios reservado): el dispatcher lo salta.
export function transportFor(platform: PushDevice["platform"]): PushTransport | null {
  switch (platform) {
    case "web_push":
      return WebPushTransport;
    case "fcm_android":
      return FcmAndroidTransport;
    case "apns_ios":
      return null;
  }
}
