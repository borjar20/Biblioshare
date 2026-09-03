import type { PushCategory, PushPlatform } from "./types";

// Preferencias de notificación (spec item 4). Espeja las columnas de
// notification_preferences. Pura y sin dependencias: la usan el dispatcher
// (servidor) y la UI de ajustes.
export type NotificationPreferences = {
  web_push_enabled: boolean;
  android_push_enabled: boolean;
  category_social: boolean;
  category_clubs: boolean;
  category_progress: boolean;
  category_system: boolean;
  category_pet: boolean;
};

// Opt-out: sin fila = todo activo (no cambia el comportamiento previo, donde
// toda notificación intentaba entregarse). Es también el default que ve la UI
// antes de que el usuario guarde nada.
export const DEFAULT_PREFERENCES: NotificationPreferences = {
  web_push_enabled: true,
  android_push_enabled: true,
  category_social: true,
  category_clubs: true,
  category_progress: true,
  category_system: true,
  category_pet: true,
};

const CATEGORY_COLUMN: Record<PushCategory, keyof NotificationPreferences> = {
  social: "category_social",
  clubs: "category_clubs",
  progress: "category_progress",
  system: "category_system",
  pet: "category_pet",
};

// ¿Se entrega este push? Un aviso llega si SU categoría está activa Y SU canal
// está activo (spec item 4). La notificación in-app NO pasa por aquí: es la
// fuente de verdad y se crea siempre.
export function isPushAllowed(
  prefs: NotificationPreferences,
  category: PushCategory,
  platform: PushPlatform,
): boolean {
  const categoryOn = prefs[CATEGORY_COLUMN[category]];
  const channelOn =
    platform === "web_push" ? prefs.web_push_enabled : prefs.android_push_enabled;
  return categoryOn && channelOn;
}
