import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { DEFAULT_PREFERENCES, isPushAllowed, type NotificationPreferences } from "./preferences";
import { transportFor } from "./transports";
import type {
  NotificationEvent,
  PushContent,
  PushDeliveryResult,
  PushPlatform,
} from "./types";

// Dispatcher común de push (spec item 6). Recibe una notificación lógica YA
// creada en `notifications` (la fuente de verdad) y la reparte por los
// transportes activos del destinatario. Reglas duras:
//   - Nunca lanza: un fallo de entrega jamás revierte la acción social original.
//   - Consulta preferencias + dispositivos del DESTINATARIO con service_role
//     (el actor que dispara la notificación no tiene RLS sobre ellos).
//   - Desactiva tokens definitivamente inválidos; mantiene activos los que
//     fallan por causas temporales.
//
// Sustituye al bucle canal-ciego anterior (solo web). `sendPushToUser(s)`
// conservan su nombre; ahora reciben PushContent (categoría + tipo + ruta), no
// un {title,body,url} plano, porque el dispatcher necesita la categoría para
// las preferencias y el canal Android.

// Fila de push_devices con lo que el dispatcher necesita.
type DeviceRow = {
  id: string;
  user_id: string;
  platform: PushPlatform;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
  token: string | null;
  failure_count: number;
};

export async function sendPushToUser(
  userId: string,
  content: PushContent,
  notificationId?: string,
): Promise<void> {
  const map = notificationId ? new Map([[userId, notificationId]]) : undefined;
  await sendPushToUsers([userId], content, { notificationIdByUser: map });
}

export async function sendPushToUsers(
  userIds: string[],
  content: PushContent,
  opts?: { notificationIdByUser?: Map<string, string> },
): Promise<void> {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return;

  const supabase = createServiceRoleClient();

  // Preferencias del destinatario (opt-out: sin fila = todo activo).
  const { data: prefRows } = await supabase
    .from("notification_preferences")
    .select(
      "user_id, web_push_enabled, android_push_enabled, category_social, category_clubs, category_progress, category_system",
    )
    .in("user_id", uniqueIds);
  const prefsByUser = new Map<string, NotificationPreferences>(
    (prefRows ?? []).map((r) => [r.user_id, r]),
  );

  // Solo dispositivos ACTIVOS (índice parcial idx_push_devices_user_enabled).
  const { data: devices, error } = await supabase
    .from("push_devices")
    .select("id, user_id, platform, endpoint, p256dh, auth, token, failure_count")
    .in("user_id", uniqueIds)
    .eq("enabled", true);
  if (error) {
    console.error("sendPushToUsers: failed to load devices", error);
    return;
  }
  if (!devices || devices.length === 0) return;

  const outcomes: { device: DeviceRow; result: PushDeliveryResult }[] = [];
  await Promise.all(
    (devices as DeviceRow[]).map(async (device) => {
      const prefs = prefsByUser.get(device.user_id) ?? DEFAULT_PREFERENCES;
      // Preferencia desactivada → no se intenta (spec item 10).
      if (!isPushAllowed(prefs, content.category, device.platform)) return;

      const transport = transportFor(device.platform);
      if (!transport) return; // apns_ios reservado, sin transporte vivo aún

      const event: NotificationEvent = {
        ...content,
        recipientUserId: device.user_id,
        notificationId: opts?.notificationIdByUser?.get(device.user_id),
      };
      const result = await transport.send(
        {
          id: device.id,
          platform: device.platform,
          endpoint: device.endpoint,
          p256dh: device.p256dh,
          auth: device.auth,
          token: device.token,
        },
        event,
      );
      outcomes.push({ device, result });
    }),
  );

  await recordHealth(supabase, outcomes);
}

// Traduce los resultados a salud de push_devices (spec item 10). El camino feliz
// (todo enviado) es UNA sola query; los fallos, raros, son updates individuales.
async function recordHealth(
  supabase: ReturnType<typeof createServiceRoleClient>,
  outcomes: { device: DeviceRow; result: PushDeliveryResult }[],
): Promise<void> {
  const now = new Date().toISOString();
  const sentIds = outcomes.filter((o) => o.result.outcome === "sent").map((o) => o.device.id);
  const invalid = outcomes.filter((o) => o.result.outcome === "invalid_token");
  const temporary = outcomes.filter((o) => o.result.outcome === "temporary_error");

  const ops: PromiseLike<unknown>[] = [];

  if (sentIds.length > 0) {
    ops.push(
      supabase
        .from("push_devices")
        .update({ last_success_at: now, failure_count: 0, last_error: null, last_error_at: null })
        .in("id", sentIds),
    );
  }

  // Token definitivamente inválido → apagar y registrar la causa. No se borra
  // la fila: así el usuario ve «error de registro» en ajustes.
  for (const { device, result } of invalid) {
    ops.push(
      supabase
        .from("push_devices")
        .update({ enabled: false, last_error: result.errorCode ?? "INVALID", last_error_at: now })
        .eq("id", device.id),
    );
  }

  // Error temporal → se mantiene ACTIVO (spec item 10), solo se cuenta el fallo.
  for (const { device, result } of temporary) {
    ops.push(
      supabase
        .from("push_devices")
        .update({
          failure_count: (device.failure_count ?? 0) + 1,
          last_error: result.errorCode ?? "TEMPORARY",
          last_error_at: now,
        })
        .eq("id", device.id),
    );
  }

  if (ops.length === 0) return;
  await Promise.all(ops).then(
    () => {},
    (e) => console.error("sendPushToUsers: health update failed", e),
  );
}
