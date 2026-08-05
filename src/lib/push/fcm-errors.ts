import type { PushDeliveryOutcome } from "./types";

// Clasificación de la respuesta de FCM HTTP v1 (spec item 10). Pura y sin
// dependencias para poder probarla sin credenciales ni red.
//
// Referencia (Google): 200 = ok; 404 UNREGISTERED = quitar token;
// SENDER_ID_MISMATCH = token de otro sender, quitar; 400 INVALID_ARGUMENT =
// revisar payload (NO quitar token a ciegas: un bug de payload apagaría TODOS);
// 401/403 = auth (credencial nuestra, no del dispositivo); 429 = cuota;
// 5xx = temporal → reintentar con backoff.
export function classifyFcmDelivery(
  httpStatus: number,
  fcmStatus?: string | null,
): PushDeliveryOutcome {
  if (httpStatus >= 200 && httpStatus < 300) return "sent";

  const s = fcmStatus ?? "";
  // Token definitivamente inválido → apagar, no reintentar.
  if (httpStatus === 404 || s === "UNREGISTERED" || s === "NOT_FOUND") {
    return "invalid_token";
  }
  if (s === "SENDER_ID_MISMATCH") return "invalid_token";

  // Todo lo demás es transitorio DESDE EL PUNTO DE VISTA DEL TOKEN: no se apaga
  // el dispositivo. Un INVALID_ARGUMENT casi siempre es el payload/config
  // nuestro; un 401/403 es nuestra credencial OAuth; 429/5xx es carga de FCM.
  return "temporary_error";
}

// El código que se guarda en push_devices.last_error para depurar. Prioriza el
// status semántico de FCM sobre el HTTP.
export function fcmErrorCode(httpStatus: number, fcmStatus?: string | null): string {
  return fcmStatus && fcmStatus.length > 0 ? fcmStatus : `HTTP_${httpStatus}`;
}

// NUNCA se registra un token completo (spec item 10). Huella parcial suficiente
// para correlacionar en logs sin filtrar la credencial.
export function maskToken(token: string): string {
  if (token.length <= 12) return "***";
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}
