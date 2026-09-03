import { describe, expect, it } from "vitest";
import { buildFcmMessage } from "./fcm-message";
import type { NotificationEvent, PushCategory } from "./types";

function event(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    recipientUserId: "u1",
    category: "social",
    type: "review_commented",
    title: "Biblioshare",
    body: "Ada comentó tu reseña",
    path: "/u/ada?tab=community",
    ...overrides,
  };
}

describe("buildFcmMessage", () => {
  it("serializes notification + data with the token", () => {
    const msg = buildFcmMessage("tok-123", event({ notificationId: "n1" }));
    expect(msg.message.token).toBe("tok-123");
    expect(msg.message.notification.title).toBe("Biblioshare");
    expect(msg.message.notification.body).toBe("Ada comentó tu reseña");
    // data DEBE ser strings.
    expect(msg.message.data).toEqual({
      type: "review_commented",
      path: "/u/ada?tab=community",
      notificationId: "n1",
    });
  });

  it("omits notificationId from data when absent", () => {
    const msg = buildFcmMessage("tok", event());
    expect(msg.message.data.notificationId).toBeUndefined();
    expect(msg.message.data.type).toBe("review_commented");
  });

  it("maps each category to its Android channel", () => {
    const expected: Record<PushCategory, string> = {
      social: "biblioshare_social",
      clubs: "biblioshare_clubs",
      progress: "biblioshare_progress",
      system: "biblioshare_system",
      pet: "biblioshare_pet",
    };
    for (const [category, channel] of Object.entries(expected) as [PushCategory, string][]) {
      const msg = buildFcmMessage("tok", event({ category }));
      expect(msg.message.android.notification.channel_id).toBe(channel);
    }
  });

  it("sanitizes an unsafe path down to home", () => {
    const msg = buildFcmMessage("tok", event({ path: "//evil.com" }));
    expect(msg.message.data.path).toBe("/");
  });

  it("includes image only when provided", () => {
    expect(buildFcmMessage("tok", event()).message.notification.image).toBeUndefined();
    const withImg = buildFcmMessage("tok", event({ imageUrl: "https://cdn/x.png" }));
    expect(withImg.message.notification.image).toBe("https://cdn/x.png");
  });
});
