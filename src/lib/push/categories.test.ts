import { describe, expect, it } from "vitest";
import { NOTIFICATION_TYPE_KEY } from "@/lib/social/notification-types";
import { ANDROID_CHANNEL_BY_CATEGORY, NOTIFICATION_CATEGORY } from "./types";

describe("NOTIFICATION_CATEGORY", () => {
  // El Record ya lo fuerza en compilación, pero un test en runtime evita que un
  // tipo nuevo se cuele sin categoría (NOTIFICATION_TYPE_KEY tiene todos como
  // claves).
  it("assigns a category to every notification type", () => {
    for (const type of Object.keys(NOTIFICATION_TYPE_KEY)) {
      expect(NOTIFICATION_CATEGORY[type as keyof typeof NOTIFICATION_CATEGORY]).toBeDefined();
    }
  });

  it("only uses the four known categories", () => {
    const valid = new Set(["social", "clubs", "progress", "system"]);
    for (const category of Object.values(NOTIFICATION_CATEGORY)) {
      expect(valid.has(category)).toBe(true);
    }
  });

  it("has an Android channel for every category", () => {
    for (const category of new Set(Object.values(NOTIFICATION_CATEGORY))) {
      expect(ANDROID_CHANNEL_BY_CATEGORY[category]).toMatch(/^biblioshare_/);
    }
  });
});
