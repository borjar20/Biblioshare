import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  getUser: vi.fn(), admin: vi.fn(() => "admin"), repository: vi.fn(),
  equip: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser } }) }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: mock.admin }));
vi.mock("@/lib/reactivity/revalidate", () => ({ revalidatePetPage: mock.revalidate }));
vi.mock("./repository", () => ({ lootRepository: mock.repository }));
vi.mock("./service", () => ({ createLootService: () => ({ equip: mock.equip }) }));
import { equipLoot } from "./actions";

beforeEach(() => vi.clearAllMocks());
it("requires a verified session before constructing a privileged repository", async () => {
  mock.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect(await equipLoot("weapon", null)).toEqual({ ok: false, code: "UNAUTHENTICATED" });
  expect(mock.admin).not.toHaveBeenCalled();
  expect(mock.repository).not.toHaveBeenCalled();
});
it("scopes each call to its authenticated user and revalidates only successful writes", async () => {
  const ok = { ok: true, loadout: { weapon: null, amulet: null } };
  mock.equip.mockResolvedValueOnce(ok).mockResolvedValueOnce({ ok: false, code: "NOT_OWNED" });
  for (const id of ["user-a", "user-b"]) {
    mock.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
    await equipLoot("weapon", null);
    expect(mock.repository).toHaveBeenLastCalledWith("admin", expect.anything(), id);
  }
  expect(mock.revalidate).toHaveBeenCalledTimes(1);
});
