import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getCurrentUserRole: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/roles", () => ({ getCurrentUserRole: mocks.getCurrentUserRole }));

import { getSagaIndexData } from "./get-saga-index";

describe("getSagaIndexData (#895)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "owner-1" });
    mocks.getCurrentUserRole.mockResolvedValue("reader");
  });

  it("uses the request-time user and preserves owner filters for private saga data", async () => {
    const ownerFilters: Array<[string, unknown]> = [];
    const supabase = {
      from(table: string) {
        const builder = {
          select: () => builder,
          eq: (column: string, value: unknown) => {
            if (["saga_follows", "passes", "saga_route_choices"].includes(table) && column === "user_id") {
              ownerFilters.push([table, value]);
            }
            return builder;
          },
          in: () => builder,
          then(resolve: (value: { data: unknown[] }) => unknown) {
            return Promise.resolve({ data: [] }).then(resolve);
          },
        };
        return builder;
      },
    } as never;

    await getSagaIndexData(supabase, "");

    expect(mocks.getCurrentUser).toHaveBeenCalledOnce();
    expect(ownerFilters).toEqual([
      ["saga_follows", "owner-1"],
      ["passes", "owner-1"],
      ["saga_route_choices", "owner-1"],
    ]);
  });
});
