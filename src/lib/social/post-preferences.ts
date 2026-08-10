// Preferencias de autopublicación de hitos (Spec 2). Espeja las columnas de
// post_preferences. Pura y sin dependencias: la leen el writer de hitos
// (maybeAutopostMilestone, servidor) y la UI de ajustes. Los defaults son los
// MISMOS que los DEFAULT de columna en 20260845_post_preferences.sql: terminar
// autopublica, empezar y abandonar no (menos ruido; el usuario los activa).
export type PostPreferences = {
  autopost_started: boolean;
  autopost_finished: boolean;
  autopost_dropped: boolean;
};

export const DEFAULT_POST_PREFERENCES: PostPreferences = {
  autopost_started: false,
  autopost_finished: true,
  autopost_dropped: false,
};
