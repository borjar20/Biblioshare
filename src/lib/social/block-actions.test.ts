import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  revalidateFeed: vi.fn(),
  revalidateProfilePages: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/reactivity/revalidate", () => ({
  revalidateFeed: mocks.revalidateFeed,
  revalidateProfilePages: mocks.revalidateProfilePages,
}));

import { blockUser, unblockUser } from "./block-actions";

function makeFakeSupabase(userId: string | null) {
  const insert = vi.fn(async () => ({ error: null }));
  const eqCalls: Array<[string, string]> = [];
  const deleteBuilder = {
    eq(column: string, value: string) {
      eqCalls.push([column, value]);
      return deleteBuilder;
    },
    then(resolve: (value: unknown) => void) {
      resolve({ error: null });
    },
  };

  return {
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
      from: vi.fn((table: string) => {
        expect(table).toBe("user_blocks");
        return {
          insert,
          delete: () => deleteBuilder,
        };
      }),
    },
    insert,
    eqCalls,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("blockUser", () => {
  it("crea el bloqueo del usuario autenticado y revalida superficies sociales", async () => {
    const fake = makeFakeSupabase("viewer");
    mocks.createClient.mockResolvedValue(fake.client);

    await blockUser("target");

    expect(fake.insert).toHaveBeenCalledWith({ blocker_id: "viewer", blocked_id: "target" });
    expect(mocks.revalidateProfilePages).toHaveBeenCalledOnce();
    expect(mocks.revalidateFeed).toHaveBeenCalledOnce();
  });

  it("rechaza el autobloqueo sin escribir", async () => {
    const fake = makeFakeSupabase("viewer");
    mocks.createClient.mockResolvedValue(fake.client);

    await expect(blockUser("viewer")).rejects.toThrow("No puedes bloquearte");
    expect(fake.insert).not.toHaveBeenCalled();
  });
});

describe("unblockUser", () => {
  it("solo elimina el bloqueo creado por el usuario autenticado", async () => {
    const fake = makeFakeSupabase("viewer");
    mocks.createClient.mockResolvedValue(fake.client);

    await unblockUser("target");

    expect(fake.eqCalls).toEqual([
      ["blocker_id", "viewer"],
      ["blocked_id", "target"],
    ]);
    expect(mocks.revalidateProfilePages).toHaveBeenCalledOnce();
    expect(mocks.revalidateFeed).toHaveBeenCalledOnce();
  });
});
