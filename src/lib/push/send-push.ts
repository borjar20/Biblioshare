import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { DEFAULT_PREFERENCES, isPushAllowed, type NotificationPreferences } from "./preferences";
import { transportFor } from "./transports";
import type {
  NotificationEvent,
  PushContent,
  PushDeliveryResult,
  PushPlatform,
  PushSendReport,
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
): Promise<PushSendReport> {
  const map = notificationId ? new Map([[userId, notificationId]]) : undefined;
  return sendPushToUsers([userId], content, { notificationIdByUser: map });
}

export function createPushSendReport(requestedUsers = 0): PushSendReport {
  return {
    users: { requested: requestedUsers, accepted: 0, noDevices: 0, skipped: 0, failed: 0, lookupFailed: 0 },
    devices: { total: 0, accepted: 0, invalid: 0, temporaryErrors: 0, skipped: 0 },
  };
}

export async function sendPushToUsers(
  userIds: string[],
  content: PushContent,
  opts?: { notificationIdByUser?: Map<string, string> },
): Promise<PushSendReport> {
  const uniqueIds = [...new Set(userIds)];
  const report = createPushSendReport(uniqueIds.length);
  if (uniqueIds.length === 0) return report;

  let supabase: ReturnType<typeof createServiceRoleClient>;
  let devices: DeviceRow[];
  let prefsByUser: Map<string, NotificationPreferences>;
  try {
    supabase = createServiceRoleClient();
    // Preferencias del destinatario (opt-out: sin fila = todo activo).
    const { data: prefRows } = await supabase
      .from("notification_preferences")
      .select(
        "user_id, web_push_enabled, android_push_enabled, category_social, category_clubs, category_progress, category_system, category_pet",
      )
      .in("user_id", uniqueIds);
    prefsByUser = new Map<string, NotificationPreferences>(
      (prefRows ?? []).map((r) => [r.user_id, r]),
    );

    // Solo dispositivos ACTIVOS (índice parcial idx_push_devices_user_enabled).
    const { data, error } = await supabase
      .from("push_devices")
      .select("id, user_id, platform, endpoint, p256dh, auth, token, failure_count")
      .in("user_id", uniqueIds)
      .eq("enabled", true);
    if (error) throw error;
    devices = (data ?? []) as DeviceRow[];
  } catch (error) {
    // Mantener el contrato silencioso también ante un rechazo del cliente.
    console.error("sendPushToUsers: failed to load devices", error);
    report.users.lookupFailed = uniqueIds.length;
    return report;
  }

  const outcomes: { device: DeviceRow; result: PushDeliveryResult }[] = [];
  await Promise.all(
    devices.map(async (device) => {
      let result: PushDeliveryResult;
      try {
        const prefs = prefsByUser.get(device.user_id) ?? DEFAULT_PREFERENCES;
        // Preferencia desactivada o apns_ios reservado → no se intenta.
        const transport = isPushAllowed(prefs, content.category, device.platform)
          ? transportFor(device.platform)
          : null;
        if (!transport) {
          outcomes.push({ device, result: { deviceId: device.id, outcome: "skipped" } });
          return;
        }
        const event: NotificationEvent = {
          ...content,
          recipientUserId: device.user_id,
          notificationId: opts?.notificationIdByUser?.get(device.user_id),
        };
        result = await transport.send(
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
      } catch (error) {
        // Un rechazo inesperado no elimina los ACK de otros dispositivos ni
        // revierte la acción original. El dispositivo sigue activo.
        console.error("sendPushToUsers: transport failed", error);
        result = { deviceId: device.id, outcome: "temporary_error", errorCode: "TRANSPORT_ERROR" };
      }
      outcomes.push({ device, result });
    }),
  );

  summarizeOutcomes(report, uniqueIds, outcomes);
  try {
    await recordHealth(supabase, outcomes);
  } catch (error) {
    // La salud persistida y la aceptación del proveedor son hechos distintos.
    logHealthUpdateFailure("rejection", error);
  }
  return report;
}

function summarizeOutcomes(
  report: PushSendReport,
  userIds: string[],
  outcomes: { device: DeviceRow; result: PushDeliveryResult }[],
): void {
  const byUser = new Map(userIds.map((id) => [id, { devices: 0, accepted: false, failed: false }]));
  for (const { device, result } of outcomes) {
    report.devices.total += 1;
    const user = byUser.get(device.user_id)!;
    user.devices += 1;
    switch (result.outcome) {
      case "sent":
        report.devices.accepted += 1;
        user.accepted = true;
        break;
      case "invalid_token":
        report.devices.invalid += 1;
        user.failed = true;
        break;
      case "temporary_error":
        report.devices.temporaryErrors += 1;
        user.failed = true;
        break;
      case "skipped":
        report.devices.skipped += 1;
        break;
    }
  }
  for (const user of byUser.values()) {
    if (user.devices === 0) report.users.noDevices += 1;
    else if (user.accepted) report.users.accepted += 1;
    else if (user.failed) report.users.failed += 1;
    else report.users.skipped += 1;
  }
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

  const ops: PromiseLike<{ error: unknown }>[] = [];

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
  // PostgREST resuelve los fallos con { error }; no tienen por qué rechazar.
  // Observar cada escritura también cuando otra rechaza, sin repetir ninguna.
  for (const result of await Promise.allSettled(ops)) {
    if (result.status === "rejected") logHealthUpdateFailure("rejection", result.reason);
    else if (result.value.error) logHealthUpdateFailure("response", result.value.error);
  }
}

function logHealthUpdateFailure(kind: "response" | "rejection", error: unknown): void {
  let code: unknown = null;
  try {
    if (error !== null && typeof error === "object") code = (error as { code?: unknown }).code;
  } catch {
    // Una excepción opaca también puede tener propiedades que lancen al leerlas.
  }
  // Solo códigos SQLSTATE/PostgREST: message/details/hint y excepciones pueden
  // contener ids, endpoints o credenciales. No se imprimen ni el error ni la fila.
  const safeCode = typeof code === "string" && /^(?:(?:[0-9]{2}|F0|HV|P0|XX)[0-9A-Z]{3}|PGRST[0-9]{3})$/.test(code)
    ? code
    : "UNKNOWN";
  try {
    console.error("sendPushToUsers: health update failed", { kind, code: safeCode });
  } catch {
    // Un fallo del diagnóstico no invalida el ACK ni oculta las demás escrituras.
  }
}
