import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "../../push/preferences";

vi.mock("@/lib/supabase/service-role", async () => {
  const { createPushClient } = await import("../../push/send-push.fixture");
  return { createServiceRoleClient: createPushClient };
});
vi.mock("@/lib/push/transports", async () => {
  const { transportSend } = await import("../../push/send-push.fixture");
  return { transportFor: (platform: string) => platform === "apns_ios" ? null : { send: transportSend } };
});

import { deliverPetNudges, type ClaimRow } from "./deliver";
import { claimRpc, createPushClient, fixtureDevice, pushState, resetPushBoundary, transportSend } from "../../push/send-push.fixture";

const t = (key: string, values?: Record<string, string | number>) =>
  `${key}${values ? ":" + JSON.stringify(values) : ""}`;

function admin(rows: ClaimRow[] | null, error: { message: string } | null = null) {
  pushState.claims = rows;
  pushState.claimError = error;
  return createPushClient() as unknown as Parameters<typeof deliverPetNudges>[0];
}

beforeEach(() => {
  resetPushBoundary();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("deliverPetNudges", () => {
  it("claim vacío: no envía nada", async () => {
    const report = await deliverPetNudges(admin([]), { t });
    expect(report).toMatchObject({ claimed: 0, unknownKind: 0, pushRequests: { requested: 0, accepted: 0 }, deviceResults: { total: 0 } });
    expect(transportSend).not.toHaveBeenCalled();
  });

  it("una fila por usuario: título = nombre, cuerpo según kind, categoría pet, ruta /mascota", async () => {
    const rows: ClaimRow[] = [
      { user_id: "u1", name: "Nuez", kind: "streak_at_risk", streak: 5 },
      { user_id: "u2", name: "Bellota", kind: "mood_sad", streak: null },
    ];
    pushState.devices = [fixtureDevice("d1", "u1"), fixtureDevice("d2", "u2")];
    const report = await deliverPetNudges(admin(rows), { t });
    expect(report).toMatchObject({ claimed: 2, unknownKind: 0, pushRequests: { requested: 2, accepted: 2 }, deviceResults: { accepted: 2 } });
    expect(transportSend).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }), {
      recipientUserId: "u1",
      notificationId: undefined,
      category: "pet",
      type: "pet_streak_at_risk",
      title: "Nuez",
      body: 'nudges.streakAtRisk:{"n":5}',
      path: "/mascota",
    });
    expect(transportSend).toHaveBeenCalledWith(expect.objectContaining({ id: "d2" }), expect.objectContaining({ recipientUserId: "u2", type: "pet_mood_sad", title: "Bellota", body: "nudges.sad" }));
  });

  it("un kind desconocido se salta y se distingue de la ausencia de dispositivos", async () => {
    const report = await deliverPetNudges(admin([{ user_id: "u1", name: "Nuez", kind: "otro", streak: null }]), { t });
    expect(report).toMatchObject({ claimed: 1, unknownKind: 1, pushRequests: { requested: 0, accepted: 0, noDevices: 0 }, deviceResults: { total: 0 } });
    expect(transportSend).not.toHaveBeenCalled();
  });

  it("si el claim falla, lanza (la ruta responde 500)", async () => {
    await expect(deliverPetNudges(admin(null, { message: "boom" }), { t })).rejects.toBeTruthy();
  });

  it("un envío que revienta no impide los demás", async () => {
    transportSend.mockImplementation(async (device) => {
      if (device.id === "d1") throw new Error("push down");
      return { deviceId: device.id, outcome: "sent" };
    });
    const rows: ClaimRow[] = [
      { user_id: "u1", name: "A", kind: "mood_sleepy", streak: null },
      { user_id: "u2", name: "B", kind: "mood_sleepy", streak: null },
    ];
    pushState.devices = [fixtureDevice("d1", "u1"), fixtureDevice("d2", "u2")];
    const report = await deliverPetNudges(admin(rows), { t });
    expect(report).toMatchObject({ claimed: 2, pushRequests: { requested: 2, accepted: 1, failed: 1 }, deviceResults: { total: 2, accepted: 1, temporaryErrors: 1 } });
    expect(claimRpc).toHaveBeenCalledExactlyOnceWith("claim_pet_nudges");
  });

  it("sin dispositivos no informa de un envío exitoso aunque el sender cumpla su contrato silencioso", async () => {
    const report = await deliverPetNudges(admin([
      { user_id: "u1", name: "Nuez", kind: "mood_sad", streak: null },
    ]), { t });
    expect(report.pushRequests).toMatchObject({ requested: 1, accepted: 0, noDevices: 1, failed: 0 });
    expect(transportSend).not.toHaveBeenCalled();
    expect(claimRpc).toHaveBeenCalledExactlyOnceWith("claim_pet_nudges");
  });

  it("todos los dispositivos inválidos o temporales no informan de un envío exitoso", async () => {
    pushState.devices = [fixtureDevice("invalid", "u1"), fixtureDevice("temporary", "u1", "fcm_android")];
    transportSend.mockImplementation(async (device) => ({
      deviceId: device.id,
      outcome: device.id === "invalid" ? "invalid_token" : "temporary_error",
    }));
    const report = await deliverPetNudges(admin([
      { user_id: "u1", name: "Nuez", kind: "mood_sad", streak: null },
    ]), { t });
    expect(report.pushRequests).toMatchObject({ requested: 1, accepted: 0, failed: 1 });
    expect(report.deviceResults).toMatchObject({ total: 2, accepted: 0, invalid: 1, temporaryErrors: 1 });
    expect(transportSend).toHaveBeenCalledTimes(2);
    expect(claimRpc).toHaveBeenCalledExactlyOnceWith("claim_pet_nudges");
  });

  it("agrega solicitudes y resultados mixtos sin confundir dos dispositivos con dos usuarios", async () => {
    pushState.devices = [
      fixtureDevice("ok-web", "u1"), fixtureDevice("ok-fcm", "u1", "fcm_android"),
      fixtureDevice("invalid", "u2"), fixtureDevice("temporary", "u2", "fcm_android"),
      fixtureDevice("opted-out", "u4"),
    ];
    pushState.preferences = [{ ...DEFAULT_PREFERENCES, user_id: "u4", category_pet: false }];
    transportSend.mockImplementation(async (device) => ({ deviceId: device.id, outcome: device.id === "invalid" ? "invalid_token" : device.id === "temporary" ? "temporary_error" : "sent" }));
    const rows: ClaimRow[] = [
      ...["u1", "u2", "u3", "u4"].map((user_id) => ({ user_id, name: "Nuez", kind: "mood_sad", streak: null })),
      { user_id: "u5", name: "Nuez", kind: "unknown", streak: null },
    ];
    const report = await deliverPetNudges(admin(rows), { t });
    expect(report).toEqual({
      claimed: 5, unknownKind: 1,
      pushRequests: { requested: 4, accepted: 1, noDevices: 1, skipped: 1, failed: 1, lookupFailed: 0 },
      deviceResults: { total: 5, accepted: 2, invalid: 1, temporaryErrors: 1, skipped: 1 },
    });
    expect(claimRpc).toHaveBeenCalledExactlyOnceWith("claim_pet_nudges");
    expect(transportSend).toHaveBeenCalledTimes(4);
  });

  it("dos claims de un usuario siguen siendo dos solicitudes, sin prometer unicidad global ni alterar el claim", async () => {
    pushState.devices = [fixtureDevice("d1", "u1")];
    const report = await deliverPetNudges(admin([
      { user_id: "u1", name: "Nuez", kind: "mood_sad", streak: null },
      { user_id: "u1", name: "Nuez", kind: "streak_at_risk", streak: 5 },
    ]), { t });
    expect(report).toMatchObject({ claimed: 2, pushRequests: { requested: 2, accepted: 2 }, deviceResults: { total: 2, accepted: 2 } });
    expect(transportSend).toHaveBeenCalledTimes(2);
    expect(claimRpc).toHaveBeenCalledExactlyOnceWith("claim_pet_nudges");
  });

  it("un fallo de consulta se reporta y no hace un segundo claim ni un reintento de transporte", async () => {
    pushState.deviceReadError = { message: "fixture devices unavailable" };
    const report = await deliverPetNudges(admin([
      { user_id: "u1", name: "Nuez", kind: "mood_sad", streak: null },
    ]), { t });
    expect(report).toMatchObject({ claimed: 1, pushRequests: { requested: 1, accepted: 0, lookupFailed: 1, noDevices: 0 }, deviceResults: { total: 0 } });
    expect(claimRpc).toHaveBeenCalledExactlyOnceWith("claim_pet_nudges");
    expect(transportSend).not.toHaveBeenCalled();
  });

  it("un segundo claim vacío no repite el intento fallido del primer barrido", async () => {
    pushState.devices = [fixtureDevice("d1", "u1")];
    transportSend.mockResolvedValue({ deviceId: "d1", outcome: "temporary_error" });
    const adminClient = admin([{ user_id: "u1", name: "Nuez", kind: "mood_sad", streak: null }]);
    const first = await deliverPetNudges(adminClient, { t });
    pushState.claims = [];
    const second = await deliverPetNudges(adminClient, { t });
    expect(first.pushRequests).toMatchObject({ accepted: 0, failed: 1 });
    expect(second).toMatchObject({ claimed: 0, pushRequests: { requested: 0 } });
    expect(claimRpc).toHaveBeenCalledTimes(2);
    expect(transportSend).toHaveBeenCalledTimes(1);
  });
});
