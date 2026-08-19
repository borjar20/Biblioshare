import { lookup as dnsLookupCb } from "node:dns";
import { Agent } from "node:https";
import webpush from "web-push";
import { sendFcm } from "./fcm";
import { safeInternalPath } from "./safe-path";
import { isPrivateAddress, isSafePushEndpoint } from "./safe-endpoint";
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

// #678, capa 3: la comprobación de IP se repite EN EL MOMENTO DE CONECTAR, no
// solo al registrar. Entre una cosa y otra pasan horas, y el dueño de un dominio
// puede apuntar su registro A a 127.0.0.1 cuando le convenga (DNS rebinding);
// una validación hecha solo al registrar no ve ese cambio. `lookup` es el punto
// exacto donde el nombre se convierte en dirección, así que es el único sitio
// donde la comprobación no se puede esquivar.
//
// El agente se crea una vez: mantiene el keep-alive de las conexiones al push
// service, que es lo que hace barata una tanda de envíos.
let agentSingleton: Agent | undefined;
function safePushAgent(): Agent {
  agentSingleton ??= new Agent({
    keepAlive: true,
    // `any` en los dos parámetros: la firma de `lookup` es variádica (node la
    // llama con o sin `options`) y su tipo en @types/node no se deja satisfacer
    // sin ensuciar el bloque entero. El `-- razón` va aquí y no pegado al
    // directive porque un comentario de varias líneas desplaza el
    // `disable-next-line` a la línea equivocada.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lookup: ((hostname: string, options: any, callback: any) => {
      const cb = typeof options === "function" ? options : callback;
      const opts = typeof options === "function" ? {} : (options ?? {});
      // Siempre `all: true` para poder mirar TODAS las direcciones; luego se
      // responde en la forma que pidió el llamador.
      dnsLookupCb(hostname, { ...opts, all: true }, (err, addresses) => {
        if (err) return cb(err);
        const list = addresses as unknown as Array<{ address: string; family: number }>;
        const blocked = list.find((a) => isPrivateAddress(a.address));
        if (blocked || list.length === 0) {
          console.error("WebPushTransport: destino no público bloqueado al conectar", {
            hostname,
            address: blocked?.address,
          });
          return cb(
            Object.assign(new Error(`blocked non-public push destination: ${hostname}`), {
              code: "EACCES",
            }),
          );
        }
        if (opts.all) return cb(null, list);
        return cb(null, list[0].address, list[0].family);
      });
    }) as never,
  });
  return agentSingleton;
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
    // #678, capa 1 otra vez, y aquí está el porqué: las filas guardadas ANTES
    // de que existiera la validación de registro siguen en la tabla. Sin esta
    // comprobación, el arreglo solo protegería de los registros nuevos.
    // `invalid_token` (no `temporary_error`) a propósito: el dispatcher apaga el
    // dispositivo y deja de reintentar contra ese destino.
    if (!isSafePushEndpoint(device.endpoint)) {
      console.error("WebPushTransport: endpoint no permitido, dispositivo apagado", {
        deviceId: device.id,
        endpoint: device.endpoint.slice(0, 200),
      });
      return { deviceId: device.id, outcome: "invalid_token", errorCode: "ENDPOINT_NOT_ALLOWED" };
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
        { agent: safePushAgent() },
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
