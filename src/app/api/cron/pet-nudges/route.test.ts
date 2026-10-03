import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// La ruta y deliverPetNudges/dispatcher son reales. Solo las fronteras externas
// se sustituyen; el traductor determinista evita un contexto Next activo.
vi.mock("@/lib/supabase/service-role", async () => {
  const { createPushClient } = await import("@/lib/push/send-push.fixture");
  return { createServiceRoleClient: createPushClient };
});
vi.mock("@/lib/push/transports", async () => {
  const { transportSend } = await import("@/lib/push/send-push.fixture");
  return { transportFor: (platform: string) => platform === "apns_ios" ? null : { send: transportSend } };
});
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

import { claimRpc, createPushClient, fixtureDevice, pushState, resetPushBoundary, transportSend } from "@/lib/push/send-push.fixture";
import { POST } from "./route";

function request(secret = "fixture-cron-secret") {
  return new Request("http://example.test/api/cron/pet-nudges", { method: "POST", headers: { "x-cron-secret": secret } });
}

beforeEach(() => {
  resetPushBoundary();
  vi.stubEnv("CRON_SECRET", "fixture-cron-secret");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/cron/pet-nudges", () => {
  it("503 sin CRON_SECRET configurado, antes de consultar el claim", async () => {
    vi.stubEnv("CRON_SECRET", undefined);
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(createPushClient).not.toHaveBeenCalled();
    expect(claimRpc).not.toHaveBeenCalled();
  });

  it.each(["nope", "fixture-cron-secrex"])("401 con secreto incorrecto (%s), sin claim ni envíos", async (secret) => {
    const res = await POST(request(secret));
    expect(res.status).toBe(401);
    expect(createPushClient).not.toHaveBeenCalled();
    expect(claimRpc).not.toHaveBeenCalled();
    expect(transportSend).not.toHaveBeenCalled();
  });

  it("200 con barrido vacío y sin log", async () => {
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ claimed: 0, unknownKind: 0, pushRequests: { requested: 0, accepted: 0 }, deviceResults: { total: 0 } });
    expect(claimRpc).toHaveBeenCalledExactlyOnceWith("claim_pet_nudges");
    expect(console.log).not.toHaveBeenCalled();
    expect(transportSend).not.toHaveBeenCalled();
  });

  it("propaga al JSON y al log los resultados reales, con recuentos y sin datos personales", async () => {
    pushState.claims = [
      { user_id: "user-one", name: "SecretPet", kind: "mood_sad", streak: null },
      { user_id: "user-two", name: "SecretPet", kind: "mood_sad", streak: null },
      { user_id: "user-three", name: "SecretPet", kind: "mood_sad", streak: null },
    ];
    pushState.devices = [
      fixtureDevice("accepted-one", "user-one"), fixtureDevice("accepted-two", "user-one", "fcm_android"),
      fixtureDevice("invalid", "user-two"), fixtureDevice("temporary", "user-two", "fcm_android"),
    ];
    transportSend.mockImplementation(async (device) => ({ deviceId: device.id, outcome: device.id === "invalid" ? "invalid_token" : device.id === "temporary" ? "temporary_error" : "sent" }));
    const res = await POST(request());
    const report = await res.json();
    expect(res.status).toBe(200);
    expect(report).toEqual({
      claimed: 3, unknownKind: 0,
      pushRequests: { requested: 3, accepted: 1, noDevices: 1, skipped: 0, failed: 1, lookupFailed: 0 },
      deviceResults: { total: 4, accepted: 2, invalid: 1, temporaryErrors: 1, skipped: 0 },
    });
    expect(console.log).toHaveBeenCalledExactlyOnceWith("pet-nudges", report);
    const logged = JSON.stringify(vi.mocked(console.log).mock.calls);
    expect(logged).not.toMatch(/SecretPet|user-one|user-two|user-three|accepted-one|accepted-two|test-token|test-auth/);
    expect(claimRpc).toHaveBeenCalledExactlyOnceWith("claim_pet_nudges");
  });

  it("una consulta fallida conserva el claim y responde 200 con lookupFailed, sin éxito ficticio", async () => {
    pushState.claims = [{ user_id: "u1", name: "SecretPet", kind: "mood_sad", streak: null }];
    pushState.deviceReadError = { message: "fixture lookup failed" };
    const res = await POST(request());
    const report = await res.json();
    expect(res.status).toBe(200);
    expect(report).toMatchObject({ claimed: 1, pushRequests: { accepted: 0, lookupFailed: 1, noDevices: 0 }, deviceResults: { total: 0 } });
    expect(console.log).toHaveBeenCalledWith("pet-nudges", report);
    expect(claimRpc).toHaveBeenCalledExactlyOnceWith("claim_pet_nudges");
    expect(transportSend).not.toHaveBeenCalled();
  });

  it("500 con sweep_failed cuando falla el claim, sin transporte", async () => {
    pushState.claimError = { message: "fixture claim failed" };
    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "sweep_failed" });
    expect(transportSend).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });
});
