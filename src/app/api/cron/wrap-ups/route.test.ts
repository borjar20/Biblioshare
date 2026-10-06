import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/wrap-ups/generate", () => ({
  sweepWrapUps: vi.fn(async () => ({ candidates: 0, written: 0, deleted: 0, pushed: 0, failed: 0 })),
  adminSweepDeps: vi.fn(() => ({})),
}));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: vi.fn(() => ({})) }));

import { POST } from "./route";
import { sweepWrapUps } from "@/lib/wrap-ups/generate";

const req = (secret: string | null, body: unknown) =>
  new Request("http://x/api/cron/wrap-ups", {
    method: "POST",
    headers: secret === null ? {} : { "x-cron-secret": secret },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/cron/wrap-ups", () => {
  beforeEach(() => { vi.stubEnv("CRON_SECRET", "s3cret"); });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it("503 sin CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await POST(req("s3cret", { kind: "week" }))).status).toBe(503);
  });
  it("401 con secreto erróneo o ausente", async () => {
    expect((await POST(req("nope", { kind: "week" }))).status).toBe(401);
    expect((await POST(req(null, { kind: "week" }))).status).toBe(401);
  });
  it("400 con kind inválido o cuerpo roto", async () => {
    expect((await POST(req("s3cret", { kind: "day" }))).status).toBe(400);
    expect((await POST(req("s3cret", "{no json"))).status).toBe(400);
    expect(sweepWrapUps).not.toHaveBeenCalled();
  });
  it("200 con el informe del barrido", async () => {
    const res = await POST(req("s3cret", { kind: "week" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ candidates: 0, written: 0, deleted: 0, pushed: 0, failed: 0 });
    expect(sweepWrapUps).toHaveBeenCalledWith("week", expect.any(Date), expect.anything());
  });
});
