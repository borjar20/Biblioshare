"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Registro/baja de dispositivos push (spec item 3). Escribe en push_devices.
// Sustituye a subscription-actions.ts (que escribía en push_subscriptions).
//
// La identidad SIEMPRE sale de la sesión autenticada, nunca de un user_id del
// cliente (spec item 3). La mutación va con service_role y un user_id derivado
// del servidor: así el registro de un token nativo puede además limpiar filas
// viejas del MISMO token en OTRAS cuentas (RLS self-only no lo permitiría).

type WebSubscriptionJson = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

export async function registerWebDevice(subscription: WebSubscriptionJson): Promise<void> {
  const userId = await requireUserId();
  const db = createServiceRoleClient();
  // Idempotente: re-suscribirse desde el mismo endpoint es delete+insert.
  await db
    .from("push_devices")
    .delete()
    .eq("user_id", userId)
    .eq("platform", "web_push")
    .eq("endpoint", subscription.endpoint);
  const { error } = await db.from("push_devices").insert({
    user_id: userId,
    platform: "web_push",
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  });
  if (error) throw error;
}

export async function unregisterWebDevice(endpoint: string): Promise<void> {
  const userId = await requireUserId();
  const db = createServiceRoleClient();
  const { error } = await db
    .from("push_devices")
    .delete()
    .eq("user_id", userId)
    .eq("platform", "web_push")
    .eq("endpoint", endpoint);
  if (error) throw error;
}

export async function registerFcmDevice(input: {
  token: string;
  appVersion?: string;
  deviceId?: string;
  deviceName?: string;
}): Promise<void> {
  const userId = await requireUserId();
  const db = createServiceRoleClient();
  // Un token FCM identifica UN install. Quien lo registra ahora es su dueño: se
  // borran filas viejas con ese token de CUALQUIER usuario, para que un cierre
  // de sesión sucio (app matada sin llamar a unregister) no deje al dueño
  // anterior recibiendo push en este aparato.
  await db.from("push_devices").delete().eq("platform", "fcm_android").eq("token", input.token);
  const { error } = await db.from("push_devices").insert({
    user_id: userId,
    platform: "fcm_android",
    token: input.token,
    app_version: input.appVersion ?? null,
    device_id: input.deviceId ?? null,
    device_name: input.deviceName ?? null,
  });
  if (error) throw error;
}

export async function unregisterFcmDevice(token: string): Promise<void> {
  const userId = await requireUserId();
  const db = createServiceRoleClient();
  const { error } = await db
    .from("push_devices")
    .delete()
    .eq("user_id", userId)
    .eq("platform", "fcm_android")
    .eq("token", token);
  if (error) throw error;
}
