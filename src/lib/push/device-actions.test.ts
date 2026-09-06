import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), service: vi.fn(), dns: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: "reader" } } }) }, rpc: mocks.rpc,
}) }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: mocks.service }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("./safe-endpoint", () => ({ isSafePushEndpoint: () => true, resolvesToPublicHost: mocks.dns }));
import { registerFcmDevice, registerWebDevice } from "./device-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dns.mockResolvedValue(true);
  const chain = { delete: vi.fn(), eq: vi.fn(), insert: vi.fn() };
  chain.delete.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.insert.mockResolvedValue({ error: null });
  mocks.service.mockReturnValue({ from: () => chain });
});

for (const [name, register] of [
  ["FCM", () => registerFcmDevice({ token: "local-fixture" })],
  ["web", () => registerWebDevice({ endpoint: "https://example.invalid/fixture", keys: { p256dh: "fixture", auth: "fixture" } })],
] as const) {
  it(`${name} rejects exhaustion before privileged deletion, insertion or DNS`, async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(register()).rejects.toThrow("quota");
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.dns).not.toHaveBeenCalled();
  });
}
it("charges the authenticated identity before admitted service-role registration", async () => {
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  await registerFcmDevice({ token: "local-fixture" });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("consume_request_quota", { p_operation: "push_devices", p_cost: 1 });
  expect(mocks.service).toHaveBeenCalledOnce();
});
