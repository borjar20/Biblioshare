import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PushContent, PushDeliveryOutcome } from "./types";

const boundary = vi.hoisted(() => {
  type Device = { id: string; user_id: string; platform: "web_push"; endpoint: string; p256dh: string; auth: string; token: null; failure_count: number; outcome: PushDeliveryOutcome };
  const state = {
    devices: [] as Device[], errors: new Map<string, { rejected: boolean; error: unknown }>(),
    writes: [] as { payload: Record<string, unknown>; column: string; value: string | string[] }[],
    buildError: null as Error | null, useSdk: false,
    sdkRequests: [] as { method: string; url: URL; payload: unknown }[],
  };
  const send = vi.fn(async (device: { id: string }) => ({
    deviceId: device.id, outcome: state.devices.find((row) => row.id === device.id)!.outcome, errorCode: "LOCAL_CODE",
  }));
  const health = async (payload: Record<string, unknown>, column: string, value: string | string[]) => {
    state.writes.push({ payload, column, value });
    const failure = state.errors.get(typeof value === "string" ? value : value[0]);
    if (failure?.rejected) throw failure.error;
    await Promise.resolve(); // A resolved failure can finish after a rejection.
    return { data: null, error: failure?.error ?? null };
  };
  const fakeClient = () => ({
    from: (table: string) => table === "notification_preferences"
      ? { select: () => ({ in: async () => ({ data: [], error: null }) }) }
      : {
        select: () => ({ in: () => ({ eq: async () => ({ data: state.devices, error: null }) }) }),
        update: (payload: Record<string, unknown>) => {
          if (state.buildError) throw state.buildError;
          return { in: (column: string, value: string[]) => health(payload, column, value), eq: (column: string, value: string) => health(payload, column, value) };
        },
      },
  });
  const sdkFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    state.sdkRequests.push({ method, url, payload: init?.body ? JSON.parse(String(init.body)) : null });
    if (method === "GET") return Response.json(url.pathname.endsWith("notification_preferences") ? [] : state.devices);
    if (method !== "PATCH" || !url.pathname.endsWith("push_devices")) throw new Error("Unexpected local SDK request");
    const idFilter = url.searchParams.get("id") ?? "";
    const failure = [...state.errors].find(([id]) => idFilter.includes(id))?.[1];
    if (failure?.rejected) throw failure.error;
    return failure ? Response.json(failure.error, { status: 403 }) : new Response(null, { status: 204 });
  });
  return { state, send, fakeClient, sdkFetch };
});

vi.mock("@/lib/supabase/service-role", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    createServiceRoleClient: () => boundary.state.useSdk
      ? createClient("https://sdk-fixture.example.test", "local-publishable-fixture", {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        global: { fetch: boundary.sdkFetch },
      })
      : boundary.fakeClient(),
  };
});
vi.mock("./transports", () => ({ transportFor: () => ({ send: boundary.send }) }));

import { sendPushToUsers } from "./send-push";

const content: PushContent = { category: "social", type: "review_commented", title: "LOCAL_NAME", body: "LOCAL_BODY", path: "/" };
const sensitive = "LOCAL_SECRET_TOKEN";
const device = (id: string, outcome: PushDeliveryOutcome = "sent") => ({
  id, user_id: "LOCAL_USER", platform: "web_push" as const,
  endpoint: `https://push.example.test/${sensitive}`, p256dh: sensitive, auth: sensitive, token: null,
  failure_count: 2, outcome,
});
const expectSafeLogs = () => {
  const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
  expect(logs).not.toMatch(/LOCAL_SECRET_TOKEN|LOCAL_NAME|LOCAL_BODY|LOCAL_USER|push\.example\.test|Bearer/);
};
const expectedLog = (kind: "response" | "rejection", code = "UNKNOWN") => ["sendPushToUsers: health update failed", { kind, code }];

beforeEach(() => {
  boundary.state.devices = []; boundary.state.errors.clear(); boundary.state.writes = [];
  boundary.state.buildError = null; boundary.state.useSdk = false; boundary.state.sdkRequests = [];
  boundary.send.mockClear(); boundary.sdkFetch.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("push health failures (#1329)", () => {
  it.each(["sent", "invalid_token", "temporary_error"] as const)("observa el error resuelto de %s sin repetir envío ni escritura", async (outcome) => {
    boundary.state.devices = [device("d1", outcome)];
    boundary.state.errors.set("d1", { rejected: false, error: { code: "42501", message: sensitive, details: sensitive, hint: sensitive } });
    const report = await sendPushToUsers(["LOCAL_USER"], content);
    expect(boundary.state.writes).toHaveLength(1); expect(boundary.send).toHaveBeenCalledTimes(1);
    expect(report.devices.accepted).toBe(outcome === "sent" ? 1 : 0);
    expect(report.users.accepted).toBe(outcome === "sent" ? 1 : 0);
    expect(vi.mocked(console.error).mock.calls).toEqual([expectedLog("response", "42501")]);
    const payload = boundary.state.writes[0].payload;
    if (outcome === "invalid_token") expect(payload.enabled).toBe(false);
    if (outcome === "temporary_error") { expect(payload.failure_count).toBe(3); expect(payload).not.toHaveProperty("enabled"); }
    expectSafeLogs();
  });

  it("observa todas las escrituras fallidas aunque una rechace antes y conserva el ACK en lote", async () => {
    boundary.state.devices = [device("ok1"), device("ok2"), device("invalid", "invalid_token"), device("temporary", "temporary_error")];
    boundary.state.errors.set("ok1", { rejected: false, error: { code: "42501", message: sensitive } });
    boundary.state.errors.set("invalid", { rejected: true, error: new Error(sensitive) });
    boundary.state.errors.set("temporary", { rejected: false, error: { code: "PGRST204", message: sensitive } });
    const report = await sendPushToUsers(["LOCAL_USER"], content);
    expect(report.devices).toEqual({ total: 4, accepted: 2, invalid: 1, temporaryErrors: 1, skipped: 0 });
    expect(report.users.accepted).toBe(1); expect(boundary.send).toHaveBeenCalledTimes(4);
    expect(boundary.state.writes).toHaveLength(3);
    expect(boundary.state.writes.find((write) => Array.isArray(write.value))?.value).toEqual(["ok1", "ok2"]);
    expect(vi.mocked(console.error).mock.calls).toEqual([
      expectedLog("response", "42501"), expectedLog("rejection"), expectedLog("response", "PGRST204"),
    ]);
    expectSafeLogs();
  });

  it("un getter code que lanza no oculta los diagnósticos de las demás escrituras", async () => {
    boundary.state.devices = [device("accepted"), device("invalid", "invalid_token"), device("temporary", "temporary_error")];
    const unreadable = Object.defineProperty({}, "code", { get() { throw new Error(sensitive); } });
    boundary.state.errors.set("accepted", { rejected: true, error: unreadable });
    boundary.state.errors.set("invalid", { rejected: false, error: { code: "23505", message: sensitive } });
    boundary.state.errors.set("temporary", { rejected: false, error: { code: "PGRST204", message: sensitive } });
    const report = await sendPushToUsers(["LOCAL_USER"], content);
    expect(report.devices).toEqual({ total: 3, accepted: 1, invalid: 1, temporaryErrors: 1, skipped: 0 });
    expect(boundary.send).toHaveBeenCalledTimes(3); expect(boundary.state.writes).toHaveLength(3);
    expect(vi.mocked(console.error).mock.calls).toEqual([
      expectedLog("rejection"), expectedLog("response", "23505"), expectedLog("response", "PGRST204"),
    ]);
    expectSafeLogs();
  });

  it("un logger que lanza tras un PATCH real del SDK conserva el reporte aceptado", async () => {
    boundary.state.useSdk = true; boundary.state.devices = [device("d1")];
    boundary.state.errors.set("d1", { rejected: false, error: { code: "42501", message: sensitive } });
    vi.mocked(console.error).mockImplementation(() => { throw new Error(sensitive); });
    const report = await sendPushToUsers(["LOCAL_USER"], content);
    expect(report.users.accepted).toBe(1); expect(report.devices.accepted).toBe(1);
    expect(boundary.send).toHaveBeenCalledTimes(1);
    expect(boundary.state.sdkRequests.map((request) => request.method)).toEqual(["GET", "GET", "PATCH"]);
    expect(console.error).toHaveBeenCalledTimes(1);
    expectSafeLogs();
  });

  it.each(["42501", "PGRST204", "XX000", "HV000"])("conserva el código reconocido %s sin mensajes libres", async (code) => {
    boundary.state.devices = [device("d1")];
    boundary.state.errors.set("d1", { rejected: false, error: { code, message: sensitive } });
    await sendPushToUsers(["LOCAL_USER"], content);
    expect(vi.mocked(console.error).mock.calls).toEqual([expectedLog("response", code)]); expectSafeLogs();
  });

  it("un código arbitrario no puede introducir credenciales o texto libre en el log", async () => {
    boundary.state.devices = [device("d1")];
    boundary.state.errors.set("d1", { rejected: false, error: { code: `Bearer ${sensitive}`, message: sensitive } });
    const report = await sendPushToUsers(["LOCAL_USER"], content);
    expect(report.devices.accepted).toBe(1);
    expect(vi.mocked(console.error).mock.calls).toEqual([expectedLog("response")]); expectSafeLogs();
  });

  it.each([new Error(sensitive), sensitive, null, undefined])("un rechazo opaco conserva el ACK y solo registra su clase", async (error) => {
    boundary.state.devices = [device("d1")]; boundary.state.errors.set("d1", { rejected: true, error });
    const report = await sendPushToUsers(["LOCAL_USER"], content);
    expect(report.devices.accepted).toBe(1); expect(boundary.send).toHaveBeenCalledTimes(1);
    expect(boundary.state.writes).toHaveLength(1);
    expect(vi.mocked(console.error).mock.calls).toEqual([expectedLog("rejection")]); expectSafeLogs();
  });

  it("un error al construir el UPDATE conserva el ACK y sanea el diagnóstico", async () => {
    boundary.state.devices = [device("d1")]; boundary.state.buildError = new Error(`Bearer ${sensitive}`);
    const report = await sendPushToUsers(["LOCAL_USER"], content);
    expect(report.devices.accepted).toBe(1); expect(boundary.send).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls).toEqual([expectedLog("rejection")]); expectSafeLogs();
  });

  it("las escrituras correctas y los transportes skipped permanecen silenciosos", async () => {
    boundary.state.devices = [device("ok1"), device("ok2"), device("invalid", "invalid_token"), device("temporary", "temporary_error"), device("skipped", "skipped")];
    const report = await sendPushToUsers(["LOCAL_USER"], content);
    expect(report.devices).toEqual({ total: 5, accepted: 2, invalid: 1, temporaryErrors: 1, skipped: 1 });
    expect(boundary.state.writes).toHaveLength(3);
    expect(boundary.state.writes.every((write) => !JSON.stringify(write.value).includes("skipped"))).toBe(true);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("atraviesa el builder real de Supabase/PostgREST con un PATCH local denegado", async () => {
    boundary.state.useSdk = true; boundary.state.devices = [device("ok1"), device("ok2")];
    boundary.state.errors.set("ok1", { rejected: false, error: { code: "42501", message: sensitive, details: sensitive, hint: sensitive } });
    const report = await sendPushToUsers(["LOCAL_USER"], content);
    expect(report.devices.accepted).toBe(2); expect(boundary.send).toHaveBeenCalledTimes(2);
    expect(boundary.state.sdkRequests.map((request) => request.method)).toEqual(["GET", "GET", "PATCH"]);
    expect(vi.mocked(console.error).mock.calls).toEqual([expectedLog("response", "42501")]); expectSafeLogs();
  });

  it("el SDK real resuelve su fallo de fetch como error sin repetir PATCH ni push", async () => {
    boundary.state.useSdk = true; boundary.state.devices = [device("d1")];
    boundary.state.errors.set("d1", { rejected: true, error: new Error(`Bearer ${sensitive}`) });
    const report = await sendPushToUsers(["LOCAL_USER"], content);
    expect(report.devices.accepted).toBe(1); expect(boundary.send).toHaveBeenCalledTimes(1);
    expect(boundary.state.sdkRequests.map((request) => request.method)).toEqual(["GET", "GET", "PATCH"]);
    expect(vi.mocked(console.error).mock.calls).toEqual([expectedLog("response")]); expectSafeLogs();
  });
});
