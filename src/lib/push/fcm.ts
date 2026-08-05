import crypto from "node:crypto";
import { buildFcmMessage } from "./fcm-message";
import { classifyFcmDelivery, fcmErrorCode, maskToken } from "./fcm-errors";
import type { NotificationEvent, PushDeliveryResult } from "./types";

// Envío a FCM HTTP v1 (spec item 7). SOLO server-side: firma el JWT OAuth con la
// clave privada de la cuenta de servicio y nunca la expone. Sin dependencias
// nuevas — Node `crypto` firma RS256 y `fetch` es global en Node 22+.
//
// Credenciales desde secretos (nunca NEXT_PUBLIC_*, nunca en el cliente ni en
// google-services.json): FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL,
// FIREBASE_PRIVATE_KEY. Ver docs/push-notifications-android.md.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const JWT_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";

type FcmConfig = { projectId: string; clientEmail: string; privateKey: string };

// undefined = aún no leído; null = ausente/mal configurado (best-effort: se
// omite Android push, igual que send-push.ts omite web push sin VAPID).
let cachedConfig: FcmConfig | null | undefined;

function readConfig(): FcmConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    console.error("FCM: FIREBASE_* env vars not configured, skipping Android push");
    cachedConfig = null;
    return null;
  }
  // Una env var no puede llevar saltos de línea reales, así que la clave se
  // guarda con "\n" literales. Se restauran antes de firmar (spec item 7).
  privateKey = privateKey.replace(/\\n/g, "\n");
  cachedConfig = { projectId, clientEmail, privateKey };
  return cachedConfig;
}

export function isFcmConfigured(): boolean {
  return readConfig() !== null;
}

function base64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

// Access token OAuth cacheado hasta poco antes de expirar (TTL 1h de Google).
let accessToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(config: FcmConfig): Promise<string | null> {
  const now = Date.now();
  if (accessToken && accessToken.expiresAt > now + 60_000) return accessToken.value;

  const iat = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({ iss: config.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }),
  );
  const signingInput = `${header}.${claims}`;

  let signature: string;
  try {
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    signature = signer.sign(config.privateKey).toString("base64url");
  } catch (e) {
    // Clave privada mal formada (p. ej. "\n" sin restaurar). No es del token de
    // ningún dispositivo: es config nuestra. Best-effort, se registra y se omite.
    console.error("FCM: JWT signing failed (check FIREBASE_PRIVATE_KEY format)", e);
    return null;
  }

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: JWT_GRANT, assertion: `${signingInput}.${signature}` }),
    });
  } catch (e) {
    console.error("FCM: token endpoint network error", e);
    return null;
  }
  if (!res.ok) {
    console.error("FCM: token endpoint returned", res.status);
    return null;
  }
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;
  if (!json?.access_token) {
    console.error("FCM: token response missing access_token");
    return null;
  }
  accessToken = { value: json.access_token, expiresAt: now + (json.expires_in ?? 3600) * 1000 };
  return accessToken.value;
}

// Envía UN mensaje a UN token. Nunca lanza: devuelve un resultado clasificado
// que el dispatcher traduce a salud del dispositivo.
export async function sendFcm(
  deviceId: string,
  token: string,
  event: NotificationEvent,
): Promise<PushDeliveryResult> {
  const config = readConfig();
  if (!config) return { deviceId, outcome: "temporary_error", errorCode: "NOT_CONFIGURED" };

  const at = await getAccessToken(config);
  if (!at) return { deviceId, outcome: "temporary_error", errorCode: "NO_ACCESS_TOKEN" };

  const url = `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${at}`, "content-type": "application/json" },
      body: JSON.stringify(buildFcmMessage(token, event)),
    });
  } catch (e) {
    console.error(`FCM: network error sending to ${maskToken(token)}`, e);
    return { deviceId, outcome: "temporary_error", errorCode: "NETWORK" };
  }

  if (res.ok) return { deviceId, outcome: "sent" };

  let fcmStatus: string | null = null;
  try {
    const body = (await res.json()) as { error?: { status?: string } };
    fcmStatus = body.error?.status ?? null;
  } catch {
    // cuerpo de error no-JSON: nos quedamos con el status HTTP
  }
  // Un 401 puede ser el access token caducado antes de tiempo: se descarta la
  // caché para que el próximo envío lo re-emita.
  if (res.status === 401) accessToken = null;

  const outcome = classifyFcmDelivery(res.status, fcmStatus);
  const errorCode = fcmErrorCode(res.status, fcmStatus);
  console.error(`FCM: delivery ${outcome} (${errorCode}) to ${maskToken(token)}`);
  return { deviceId, outcome, errorCode };
}
