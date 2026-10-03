import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "./preferences";

vi.mock("@/lib/supabase/service-role", async () => {
  const { createPushClient } = await import("./send-push.fixture");
  return { createServiceRoleClient: createPushClient };
});
vi.mock("./transports", async () => {
  const { transportSend } = await import("./send-push.fixture");
  return { transportFor: (platform: string) => platform === "apns_ios" ? null : { send: transportSend } };
});

import { sendPushToUser, sendPushToUsers } from "./send-push";
import { createPushClient, fixtureDevice, pushState, resetPushBoundary, transportSend } from "./send-push.fixture";
import type { PushContent } from "./types";

const content: PushContent = {
  category: "social", type: "review_commented", title: "Biblioshare", body: "x", path: "/u/ada",
};

beforeEach(() => {
  resetPushBoundary();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("sendPushToUsers dispatcher", () => {
  it("cuenta usuarios únicos y resultados por dispositivo, conservando la salud y los ids de notificación", async () => {
    pushState.devices = [
      fixtureDevice("web-ok", "u1"), fixtureDevice("fcm-ok", "u1", "fcm_android"),
      fixtureDevice("invalid-u1", "u1"), fixtureDevice("temporary", "u2", "fcm_android", 2),
      fixtureDevice("invalid-u3", "u3"), fixtureDevice("opted-out", "u5"),
      fixtureDevice("unsupported", "u6", "apns_ios"),
    ];
    pushState.preferences = [{ ...DEFAULT_PREFERENCES, user_id: "u5", category_social: false }];
    transportSend.mockImplementation(async (device) => ({
      deviceId: device.id,
      outcome: device.id.startsWith("invalid") ? "invalid_token" : device.id === "temporary" ? "temporary_error" : "sent",
      errorCode: device.id.startsWith("invalid") ? "UNREGISTERED" : "UNAVAILABLE",
    }));
    const report = await sendPushToUsers(["u1", "u1", "u2", "u3", "u4", "u5", "u6"], content, {
      notificationIdByUser: new Map([["u1", "n1"], ["u2", "n2"]]),
    });
    expect(report).toEqual({
      users: { requested: 6, accepted: 1, noDevices: 1, skipped: 2, failed: 2, lookupFailed: 0 },
      devices: { total: 7, accepted: 2, invalid: 2, temporaryErrors: 1, skipped: 2 },
    });
    expect(transportSend).toHaveBeenCalledTimes(5);
    expect(transportSend).toHaveBeenCalledWith(expect.objectContaining({ id: "fcm-ok" }), expect.objectContaining({ recipientUserId: "u1", notificationId: "n1" }));
    expect(transportSend).toHaveBeenCalledWith(expect.objectContaining({ id: "temporary" }), expect.objectContaining({ recipientUserId: "u2", notificationId: "n2" }));
    const accepted = pushState.writes.filter((write) => write.payload.last_success_at);
    expect(accepted).toHaveLength(1); // conserva el update feliz en lote
    expect(accepted[0]).toEqual({
      column: "id", value: ["web-ok", "fcm-ok"],
      payload: { last_success_at: expect.any(String), failure_count: 0, last_error: null, last_error_at: null },
    });
    expect(pushState.writes.filter((write) => write.payload.enabled === false).map((write) => write.value).sort()).toEqual(["invalid-u1", "invalid-u3"]);
    expect(pushState.writes.find((write) => write.value === "temporary")?.payload).toEqual({ failure_count: 3, last_error: "UNAVAILABLE", last_error_at: expect.any(String) });
  });

  it("sin destinatarios no consulta BD ni transportes", async () => {
    const report = await sendPushToUsers([], content);
    expect(report.users.requested).toBe(0);
    expect(report.devices.total).toBe(0);
    expect(createPushClient).not.toHaveBeenCalled();
    expect(transportSend).not.toHaveBeenCalled();
  });

  it("sin dispositivos activos distingue una consulta vacía de un fallo", async () => {
    const report = await sendPushToUsers(["u1", "u2", "u1"], content);
    expect(report.users).toEqual({ requested: 2, accepted: 0, noDevices: 2, skipped: 0, failed: 0, lookupFailed: 0 });
    expect(report.devices.total).toBe(0);
    expect(transportSend).not.toHaveBeenCalled();
  });

  it("sendPushToUser devuelve el resumen y mantiene el notificationId", async () => {
    pushState.devices = [fixtureDevice("d1", "u1")];
    const report = await sendPushToUser("u1", content, "n1");
    expect(report.users).toMatchObject({ requested: 1, accepted: 1 });
    expect(report.devices.accepted).toBe(1);
    expect(transportSend).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }), expect.objectContaining({ notificationId: "n1" }));
  });

  it("sin ACK, los resultados inválidos y temporales cuentan como fallo del usuario", async () => {
    pushState.devices = [fixtureDevice("invalid", "u1"), fixtureDevice("temporary", "u1", "fcm_android", 2)];
    transportSend.mockImplementation(async (device) => ({ deviceId: device.id, outcome: device.id === "invalid" ? "invalid_token" : "temporary_error" }));
    const report = await sendPushToUsers(["u1"], content);
    expect(report.users).toMatchObject({ accepted: 0, failed: 1 });
    expect(report.devices).toEqual({ total: 2, accepted: 0, invalid: 1, temporaryErrors: 1, skipped: 0 });
    expect(pushState.writes.find((write) => write.value === "invalid")?.payload).toMatchObject({ enabled: false, last_error: "INVALID" });
    expect(pushState.writes.find((write) => write.value === "temporary")?.payload).toMatchObject({ failure_count: 3, last_error: "TEMPORARY" });
    expect(pushState.writes.find((write) => write.value === "temporary")?.payload).not.toHaveProperty("enabled");
  });

  it("un rechazo de transporte no elimina el ACK de otro dispositivo ni lanza", async () => {
    pushState.devices = [fixtureDevice("reject", "u1"), fixtureDevice("ok", "u1", "fcm_android")];
    transportSend.mockImplementation(async (device) => {
      if (device.id === "reject") throw new Error("fixture transport down");
      return { deviceId: device.id, outcome: "sent" };
    });
    const report = await sendPushToUsers(["u1"], content);
    expect(report.users).toMatchObject({ accepted: 1, failed: 0 });
    expect(report.devices).toMatchObject({ accepted: 1, temporaryErrors: 1 });
    expect(pushState.writes.find((write) => write.value === "reject")?.payload).toMatchObject({ failure_count: 1, last_error: "TRANSPORT_ERROR" });
    expect(pushState.writes.find((write) => write.value === "reject")?.payload).not.toHaveProperty("enabled");
  });

  it.each(["category", "web-channel", "android-channel", "transport-skipped"])("no acepta un descarte por %s", async (reason) => {
    pushState.devices = [fixtureDevice("d1", "u1", reason === "android-channel" ? "fcm_android" : "web_push")];
    pushState.preferences = [{
      ...DEFAULT_PREFERENCES, user_id: "u1", category_social: reason !== "category",
      web_push_enabled: reason !== "web-channel", android_push_enabled: reason !== "android-channel",
    }];
    if (reason === "transport-skipped") transportSend.mockResolvedValue({ deviceId: "d1", outcome: "skipped" });
    const report = await sendPushToUsers(["u1"], content);
    expect(report.users).toMatchObject({ accepted: 0, skipped: 1, failed: 0 });
    expect(report.devices).toMatchObject({ total: 1, accepted: 0, skipped: 1 });
    expect(transportSend).toHaveBeenCalledTimes(reason === "transport-skipped" ? 1 : 0);
    expect(pushState.writes).toHaveLength(0);
  });

  it.each(["resolved-error", "rejected-query", "client-creation"])("contiene %s y no lo confunde con ausencia de dispositivos", async (failure) => {
    if (failure === "resolved-error") pushState.deviceReadError = { message: "fixture query error" };
    if (failure === "rejected-query") pushState.deviceReadRejection = new Error("fixture query rejected");
    if (failure === "client-creation") createPushClient.mockImplementationOnce(() => { throw new Error("fixture client unavailable"); });
    const report = await sendPushToUsers(["u1", "u2"], content);
    expect(report.users).toEqual({ requested: 2, accepted: 0, noDevices: 0, skipped: 0, failed: 0, lookupFailed: 2 });
    expect(report.devices.total).toBe(0);
    expect(transportSend).not.toHaveBeenCalled();
    expect(pushState.writes).toHaveLength(0);
    expect(console.error).toHaveBeenCalled();
  });

  it("un fallo al guardar salud no cambia la aceptación ya observada ni lanza", async () => {
    pushState.devices = [fixtureDevice("d1", "u1")];
    pushState.healthRejection = new Error("fixture health write failed");
    const report = await sendPushToUsers(["u1"], content);
    expect(report.users).toMatchObject({ accepted: 1, failed: 0 });
    expect(report.devices.accepted).toBe(1);
    expect(console.error).toHaveBeenCalledWith("sendPushToUsers: health update failed", pushState.healthRejection);
  });
});
