import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PushContent, PushDeliveryResult } from "./types";

// El dispatcher es server-only y habla con Supabase + transportes. Se mockean
// para probar la lógica de reparto y la SALUD del dispositivo (spec item 10/13)
// sin BD ni red.
vi.mock("server-only", () => ({}));

const transportSend = vi.fn<(device: { id: string }) => Promise<PushDeliveryResult>>();
vi.mock("./transports", () => ({
  transportFor: (platform: string) =>
    platform === "apns_ios" ? null : { send: transportSend },
}));

// db factory configurable por test.
let prefRows: unknown[] = [];
let deviceRows: unknown[] = [];
const updates: { payload: Record<string, unknown>; col: string }[] = [];

function fakeDb() {
  return {
    from(table: string) {
      if (table === "notification_preferences") {
        return { select: () => ({ in: async () => ({ data: prefRows, error: null }) }) };
      }
      // push_devices: lectura (select…in…eq) o escritura (update…in/eq)
      return {
        select: () => ({ in: () => ({ eq: async () => ({ data: deviceRows, error: null }) }) }),
        update: (payload: Record<string, unknown>) => ({
          in: async (col: string) => {
            updates.push({ payload, col });
            return { error: null };
          },
          eq: async (col: string) => {
            updates.push({ payload, col });
            return { error: null };
          },
        }),
      };
    },
  };
}
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => fakeDb(),
}));

import { sendPushToUsers } from "./send-push";

const content: PushContent = {
  category: "social",
  type: "review_commented",
  title: "Biblioshare",
  body: "x",
  path: "/u/ada",
};

function device(id: string, platform: string, failure_count = 0) {
  return {
    id,
    user_id: "u1",
    platform,
    endpoint: platform === "web_push" ? "https://e" : null,
    p256dh: platform === "web_push" ? "p" : null,
    auth: platform === "web_push" ? "a" : null,
    token: platform === "web_push" ? null : "tok",
    failure_count,
  };
}

beforeEach(() => {
  transportSend.mockReset();
  prefRows = [];
  deviceRows = [];
  updates.length = 0;
});

describe("sendPushToUsers dispatcher", () => {
  it("disables a device on invalid_token and marks another as sent", async () => {
    deviceRows = [device("d1", "web_push"), device("d2", "fcm_android")];
    transportSend.mockImplementation(async (d) =>
      d.id === "d1"
        ? { deviceId: "d1", outcome: "sent" }
        : { deviceId: "d2", outcome: "invalid_token", errorCode: "UNREGISTERED" },
    );

    await sendPushToUsers(["u1"], content);

    const sent = updates.find((u) => u.payload.last_success_at != null);
    expect(sent).toBeTruthy();
    expect(sent?.payload.failure_count).toBe(0);

    const disabled = updates.find((u) => u.payload.enabled === false);
    expect(disabled).toBeTruthy();
    expect(disabled?.payload.last_error).toBe("UNREGISTERED");
  });

  it("keeps a device active on temporary_error and increments failure_count", async () => {
    deviceRows = [device("d3", "fcm_android", 2)];
    transportSend.mockResolvedValue({
      deviceId: "d3",
      outcome: "temporary_error",
      errorCode: "UNAVAILABLE",
    });

    await sendPushToUsers(["u1"], content);

    expect(updates).toHaveLength(1);
    const u = updates[0];
    expect(u.payload.enabled).toBeUndefined(); // NUNCA se apaga en temporal
    expect(u.payload.failure_count).toBe(3); // 2 + 1
    expect(u.payload.last_error).toBe("UNAVAILABLE");
  });

  it("respects preferences: does not send when the category is off", async () => {
    deviceRows = [device("d1", "web_push")];
    prefRows = [
      {
        user_id: "u1",
        web_push_enabled: true,
        android_push_enabled: true,
        category_social: false, // social apagado
        category_clubs: true,
        category_progress: true,
        category_system: true,
      },
    ];

    await sendPushToUsers(["u1"], content); // content.category === "social"

    expect(transportSend).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("does nothing when there are no devices", async () => {
    deviceRows = [];
    await sendPushToUsers(["u1"], content);
    expect(transportSend).not.toHaveBeenCalled();
  });
});
