import webpush from "web-push";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Entrega de push (E5.D4), canal-agnóstica: hoy solo implementa "web"; un
// canal nativo futuro (ios_native, vía Capacitor/APNs) se añadiría como una
// rama más en el bucle de sendPushToUser, sin tocar la firma pública.
//
// Usa un cliente service_role en vez del cliente de la request: notify() se
// llama con el cliente del actor (quien sigue/reacciona/comenta), y la
// política RLS de push_subscriptions es self-only (auth.uid() = user_id) —
// el actor no tiene permiso para leer ni borrar las suscripciones del
// destinatario. Sin esto, la consulta no da error (RLS filtra en silencio),
// simplemente no devuelve filas y el push nunca se envía.

type WebCredentials = { endpoint: string; keys: { p256dh: string; auth: string } };

export type PushPayload = {
  title: string;
  body: string;
  url: string;
};

let vapidConfigured = false;

// Configuración perezosa: si esto corriera a nivel de módulo, el side effect
// se ejecutaría en cuanto Next.js importe este fichero — incluido durante la
// recolección de datos de página en `next build`, mucho antes de que exista
// una petición real. Con claves VAPID ausentes (build sin las env vars, un
// segundo desarrollador sin configurarlas localmente, etc.) eso tira todo el
// build abajo por una feature que es best-effort por diseño.
function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.error("sendPushToUser: VAPID keys not configured, skipping push delivery");
    return false;
  }
  webpush.setVapidDetails("mailto:borjar20@gmail.com", publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

async function sendWebPush(
  credentials: WebCredentials,
  payload: PushPayload,
): Promise<{ expired: boolean }> {
  try {
    await webpush.sendNotification(
      credentials as webpush.PushSubscription,
      JSON.stringify(payload),
    );
    return { expired: false };
  } catch (error) {
    // 404/410 del push service = el navegador descartó esta suscripción
    // (desinstalada, permiso revocado desde el SO, etc.) — limpiar en el
    // llamador. Cualquier otro fallo se registra pero no se relanza: el
    // envío de push es siempre best-effort.
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) return { expired: true };
    console.error("sendWebPush failed", error);
    return { expired: false };
  }
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  await sendPushToUsers([userId], payload);
}

// Entrega en lote a varios destinatarios con el MISMO payload (fan-out de
// club, E5.F/G): una sola query de suscripciones para todos, envíos web-push
// en paralelo, y una sola limpieza de suscripciones caducadas al final — en
// vez de (query + envíos secuenciales + delete) por destinatario.
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (userIds.length === 0) return;
  if (!ensureVapidConfigured()) return;

  const supabase = createServiceRoleClient();
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, channel, credentials")
    .in("user_id", userIds);

  if (error) {
    console.error("sendPushToUsers: failed to load subscriptions", error);
    return;
  }

  const expiredIds: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (sub) => {
      if (sub.channel === "web") {
        const { expired } = await sendWebPush(sub.credentials as WebCredentials, payload);
        if (expired) expiredIds.push(sub.id);
      }
      // futuro: else if (sub.channel === "ios_native") await sendNativePush(...)
    }),
  );

  if (expiredIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", expiredIds);
  }
}
