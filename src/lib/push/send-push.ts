import webpush from "web-push";
import type { createClient } from "@/lib/supabase/server";

// Entrega de push (E5.D4), canal-agnóstica: hoy solo implementa "web"; un
// canal nativo futuro (ios_native, vía Capacitor/APNs) se añadiría como una
// rama más en el bucle de sendPushToUser, sin tocar la firma pública.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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
  supabase: SupabaseServerClient,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureVapidConfigured()) return;

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, channel, credentials")
    .eq("user_id", userId);

  if (error) {
    console.error("sendPushToUser: failed to load subscriptions", error);
    return;
  }

  for (const sub of subs ?? []) {
    if (sub.channel === "web") {
      const { expired } = await sendWebPush(sub.credentials as WebCredentials, payload);
      if (expired) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
    // futuro: else if (sub.channel === "ios_native") await sendNativePush(...)
  }
}
