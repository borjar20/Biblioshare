import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, isPushAllowed, type NotificationPreferences } from "./preferences";

function prefs(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return { ...DEFAULT_PREFERENCES, ...overrides };
}

describe("isPushAllowed", () => {
  it("allows when category and channel are both on (default)", () => {
    expect(isPushAllowed(prefs(), "social", "web_push")).toBe(true);
    expect(isPushAllowed(prefs(), "clubs", "fcm_android")).toBe(true);
  });

  it("blocks when the category is off", () => {
    expect(isPushAllowed(prefs({ category_social: false }), "social", "web_push")).toBe(false);
    // otras categorías siguen pasando
    expect(isPushAllowed(prefs({ category_social: false }), "clubs", "web_push")).toBe(true);
  });

  it("blocks when the channel is off", () => {
    expect(isPushAllowed(prefs({ web_push_enabled: false }), "social", "web_push")).toBe(false);
    // el otro canal sigue pasando
    expect(isPushAllowed(prefs({ web_push_enabled: false }), "social", "fcm_android")).toBe(true);
  });

  it("maps native platforms to the android channel switch", () => {
    const p = prefs({ android_push_enabled: false });
    expect(isPushAllowed(p, "social", "fcm_android")).toBe(false);
    expect(isPushAllowed(p, "social", "apns_ios")).toBe(false);
    expect(isPushAllowed(p, "social", "web_push")).toBe(true);
  });
});

describe("categoría pet (mascota fase 3)", () => {
  it("está activa por defecto y se apaga con category_pet=false", () => {
    expect(isPushAllowed(prefs(), "pet", "web_push")).toBe(true);
    expect(isPushAllowed(prefs({ category_pet: false }), "pet", "web_push")).toBe(false);
    expect(isPushAllowed(prefs({ category_pet: false }), "pet", "fcm_android")).toBe(false);
    // apagar la mascota no toca al resto
    expect(isPushAllowed(prefs({ category_pet: false }), "social", "web_push")).toBe(true);
  });
});
