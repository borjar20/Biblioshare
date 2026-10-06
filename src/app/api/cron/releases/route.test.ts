import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const sweep = vi.hoisted(() => vi.fn());
vi.mock("@/lib/releases/sweep", () => ({ runReleaseSweep: sweep }));
import { POST } from "./route";

const request = (secret?: string) => new Request("http://example.test/api/cron/releases", { method: "POST", headers: secret ? { "x-cron-secret": secret } : {} });
const report = () => ({ sync: { attempted: false, imported: 0, failed: false }, deliveries: { claimed: 0, accepted: 0, failed: 0 } });
beforeEach(() => { vi.stubEnv("CRON_SECRET", "fixture-cron-secret"); sweep.mockReset(); vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("releases cron authorization and visible failure", () => {
  it("cannot start any work without configured credentials", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await POST(request("fixture-cron-secret"))).status).toBe(503);
    expect(sweep).not.toHaveBeenCalled();
  });
  it.each([undefined, "short", "fixture-cron-secrex"])("rejects missing or incorrect %s before writing", async (secret) => {
    expect((await POST(request(secret))).status).toBe(401);
    expect(sweep).not.toHaveBeenCalled();
  });
  it("reports a successful empty sweep", async () => {
    sweep.mockResolvedValue(report());
    const response = await POST(request("fixture-cron-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(report());
  });
  it("exposes source failures while retaining notice acceptance counts", async () => {
    const value = report(); value.sync.failed = true; value.deliveries.accepted = 1;
    sweep.mockResolvedValue(value);
    const response = await POST(request("fixture-cron-secret"));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual(value);
  });
  it("does not turn database failure into a successful empty calendar", async () => {
    sweep.mockRejectedValue(new Error("db"));
    const response = await POST(request("fixture-cron-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "sweep_failed" });
  });
});
