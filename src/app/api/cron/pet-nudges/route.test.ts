import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pet/nudges/deliver", () => ({ deliverPetNudges: vi.fn(async () => ({ claimed: 0, sent: 0 })) }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({}) }));

import { POST } from "./route";

describe("POST /api/cron/pet-nudges", () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
  });
  afterEach(() => {
    process.env.CRON_SECRET = original;
  });

  it("503 sin CRON_SECRET configurado", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(new Request("http://x/api/cron/pet-nudges", { method: "POST" }));
    expect(res.status).toBe(503);
  });

  it("401 con secreto que no casa", async () => {
    const res = await POST(new Request("http://x/api/cron/pet-nudges", { method: "POST", headers: { "x-cron-secret": "nope" } }));
    expect(res.status).toBe(401);
  });

  it("200 con el informe cuando el secreto casa", async () => {
    const res = await POST(new Request("http://x/api/cron/pet-nudges", { method: "POST", headers: { "x-cron-secret": "s3cret" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ claimed: 0, sent: 0 });
  });
});
