import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  cookies: vi.fn(),
  createServerClient: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

import { createClient, createPublicClient, getAccessToken, getCurrentUser } from "./server";

describe("request-time Supabase client (#895)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.cookies.mockResolvedValue({ getAll: () => [], set: vi.fn() });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "fixture-user" } } });
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "fixture-token" } } });
    mocks.createServerClient.mockReturnValue({
      auth: { getUser: mocks.getUser, getSession: mocks.getSession },
    });
  });

  it("does not read cookies or construct the SSR client before the request boundary", async () => {
    let receiveRequest!: () => void;
    mocks.connection.mockImplementation(() => new Promise<void>((resolve) => {
      receiveRequest = resolve;
    }));

    const pendingClient = createClient();
    expect(mocks.connection).toHaveBeenCalledTimes(1);
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.createServerClient).not.toHaveBeenCalled();

    receiveRequest();
    await pendingClient;
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.cookies.mock.invocationCallOrder[0],
    );
    expect(mocks.cookies.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createServerClient.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ["getCurrentUser", () => getCurrentUser(), { id: "fixture-user" }],
    ["getAccessToken", () => getAccessToken(), "fixture-token"],
  ] as const)("%s crosses the central boundary exactly once", async (_name, read, expected) => {
    await expect(read()).resolves.toEqual(expected);

    expect(mocks.connection).toHaveBeenCalledTimes(1);
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createServerClient.mock.invocationCallOrder[0],
    );
  });

  it("keeps the public client outside request-time APIs", () => {
    createPublicClient();

    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.connection).not.toHaveBeenCalled();
    const options = mocks.createServerClient.mock.calls[0][2];
    expect(options.cookies.getAll()).toEqual([]);
  });
});
