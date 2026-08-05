import { describe, expect, it, vi } from "vitest";

// transports.ts es server-only e importa web-push y ./fcm; se mockean para poder
// probar la SELECCIÓN de transporte (spec item 13) sin credenciales ni red.
vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));
vi.mock("./fcm", () => ({ sendFcm: vi.fn() }));

import { FcmAndroidTransport, transportFor, WebPushTransport } from "./transports";

describe("transportFor", () => {
  it("routes web_push to the web transport", () => {
    expect(transportFor("web_push")).toBe(WebPushTransport);
  });
  it("routes fcm_android to the FCM transport", () => {
    expect(transportFor("fcm_android")).toBe(FcmAndroidTransport);
  });
  it("has no live transport for apns_ios yet", () => {
    expect(transportFor("apns_ios")).toBeNull();
  });
});
