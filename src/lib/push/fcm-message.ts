import { ANDROID_CHANNEL_BY_CATEGORY, type NotificationEvent } from "./types";
import { safeInternalPath } from "./safe-path";

// Cuerpo de un mensaje FCM HTTP v1 (spec item 8). Pura y sin dependencias:
// separada del transporte para poder verificar la serialización y la selección
// de canal sin credenciales ni red.
//
// Lleva `notification` (lo pinta el sistema Android incluso con la app cerrada)
// y `data` (lo lee el WebView para navegar). Los valores de `data` DEBEN ser
// strings: FCM rechaza un data payload con no-strings.
export type FcmMessage = {
  message: {
    token: string;
    notification: { title: string; body: string; image?: string };
    data: Record<string, string>;
    android: {
      priority: "HIGH";
      notification: { channel_id: string };
    };
  };
};

export function buildFcmMessage(token: string, event: NotificationEvent): FcmMessage {
  // La ruta viaja en `data` y termina en window.location dentro del WebView: se
  // sanea aquí también (defensa en profundidad; el cliente vuelve a validar).
  const path = safeInternalPath(event.path);

  const data: Record<string, string> = { type: event.type, path };
  if (event.notificationId) data.notificationId = event.notificationId;

  return {
    message: {
      token,
      notification: {
        title: event.title,
        body: event.body,
        ...(event.imageUrl ? { image: event.imageUrl } : {}),
      },
      data,
      android: {
        priority: "HIGH",
        notification: {
          channel_id: ANDROID_CHANNEL_BY_CATEGORY[event.category],
        },
      },
    },
  };
}
