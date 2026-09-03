import {
  PushNotifications,
  type ActionPerformed,
  type Token,
} from "@capacitor/push-notifications";
import type { PluginListenerHandle } from "@capacitor/core";
import { registerFcmDevice, unregisterFcmDevice } from "./device-actions";
import { safeInternalPath } from "./safe-path";
import { ANDROID_CHANNEL_BY_CATEGORY, type PushCategory } from "./types";
import type { PushEnableResult, PushPermissionState } from "./platform";

// Registro Android vía @capacitor/push-notifications (spec item 2). Se carga
// SOLO por import dinámico desde platform.ts en nativo — nunca entra en el
// bundle web. Estado a nivel de módulo (singleton del WebView): listeners,
// canales y último token, para poder limpiarlos al cerrar sesión.

let handles: PluginListenerHandle[] = [];
let channelsReady = false;
let lastToken: string | null = null;
let navigateFn: ((path: string) => void) | null = null;

// PermissionState del plugin: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'.
function mapPermission(receive: string): PushPermissionState {
  if (receive === "granted") return "granted";
  if (receive === "denied") return "denied";
  return "prompt";
}

// Los 4 canales Android (spec item 8): cada categoría cae en el suyo. Idempotente
// (createChannel no falla si ya existe).
async function ensureChannels(): Promise<void> {
  if (channelsReady) return;
  const names: Record<PushCategory, string> = {
    social: "Social",
    clubs: "Clubes",
    progress: "Progreso",
    system: "Sistema",
    pet: "Mascota",
  };
  await Promise.all(
    (Object.keys(names) as PushCategory[]).map((cat) =>
      PushNotifications.createChannel({
        id: ANDROID_CHANNEL_BY_CATEGORY[cat],
        name: names[cat],
        importance: 4, // HIGH: banner + sonido
        visibility: 1, // PUBLIC
      }).catch((e) => console.error("push: createChannel failed", cat, e)),
    ),
  );
  channelsReady = true;
}

// Navegación segura al tocar una notificación (spec item 2 y 8): la ruta viene
// del data payload y SIEMPRE se valida antes de navegar.
function navigateTo(path: unknown): void {
  const safe = safeInternalPath(path);
  if (navigateFn) navigateFn(safe);
  else window.location.assign(safe);
}

async function ensureListeners(): Promise<void> {
  if (handles.length > 0) return;
  handles.push(
    await PushNotifications.addListener("registration", async (token: Token) => {
      // Renovación/alta del token (spec item 2): se guarda para poder darlo de
      // baja y se registra en push_devices (idempotente: delete+insert por token).
      lastToken = token.value;
      try {
        await registerFcmDevice({ token: token.value });
      } catch (e) {
        console.error("push: registerFcmDevice failed", e);
      }
    }),
  );
  handles.push(
    await PushNotifications.addListener("registrationError", (err) => {
      console.error("push: registrationError", err.error);
    }),
  );
  handles.push(
    await PushNotifications.addListener("pushNotificationReceived", () => {
      // En foreground el sistema ya la muestra por su canal. No se navega: el
      // usuario no ha tocado nada todavía.
    }),
  );
  handles.push(
    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action: ActionPerformed) => {
        // El usuario tocó la notificación (incluye arranque en frío): navegar a
        // la ruta interna validada.
        navigateTo(action.notification.data?.path);
      },
    ),
  );
}

// Arranque del WebView (AndroidPushInit): deja listeners y canales listos para un
// arranque en frío desde una notificación y, si el permiso YA está concedido,
// refresca el token. NO pide permiso (eso es una acción contextual del usuario).
export async function initAndroidPush(navigate: (path: string) => void): Promise<void> {
  navigateFn = navigate;
  await ensureChannels();
  await ensureListeners();
  const { receive } = await PushNotifications.checkPermissions();
  if (receive === "granted") {
    await PushNotifications.register();
  }
}

export async function getAndroidPushPermission(): Promise<PushPermissionState> {
  const { receive } = await PushNotifications.checkPermissions();
  return mapPermission(receive);
}

// «Activo» en nativo = permiso concedido: al conceder se registra el token. No se
// puede consultar la fila de la BD desde aquí (el token puede no haber llegado
// aún tras register()).
export async function androidIsEnabled(): Promise<boolean> {
  const { receive } = await PushNotifications.checkPermissions();
  return receive === "granted";
}

// Acción contextual: pide permiso (si procede) y registra. Gestiona el permiso
// denegado devolviendo el estado sin lanzar (spec item 2).
export async function enableAndroidPush(): Promise<PushEnableResult> {
  let status = await PushNotifications.checkPermissions();
  if (status.receive === "prompt" || status.receive === "prompt-with-rationale") {
    status = await PushNotifications.requestPermissions();
  }
  if (status.receive !== "granted") {
    return { ok: false, state: status.receive === "denied" ? "denied" : "prompt" };
  }
  await ensureChannels();
  await ensureListeners();
  await PushNotifications.register(); // dispara 'registration' → registerFcmDevice
  return { ok: true, state: "granted" };
}

export async function disableAndroidPush(): Promise<void> {
  if (lastToken) {
    try {
      await unregisterFcmDevice(lastToken);
    } catch (e) {
      console.error("push: unregisterFcmDevice failed", e);
    }
  }
  try {
    await PushNotifications.unregister();
  } catch {
    // best-effort: quitar el registro FCM nativo
  }
}

// Cierre de sesión (spec item 2): baja el token del usuario y quita los listeners
// para no arrastrarlos a la siguiente sesión.
export async function teardownAndroidPush(): Promise<void> {
  await disableAndroidPush();
  try {
    await PushNotifications.removeAllListeners();
  } catch {
    // best-effort
  }
  handles = [];
  lastToken = null;
  channelsReady = false;
}
