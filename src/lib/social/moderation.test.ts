import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  revalidateInteraction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/reactivity/revalidate", () => ({
  revalidateInteraction: mocks.revalidateInteraction,
}));

import { reportComment } from "./moderation-actions";

beforeEach(() => vi.clearAllMocks());

describe("reportComment", () => {
  it("autentica, normaliza detalles y delega la snapshot inmutable a la RPC", async () => {
    const rpc = vi.fn(async () => ({ data: "report-1", error: null }));
    mocks.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "reporter" } } }) },
      rpc,
    });

    await expect(reportComment("comment-1", "spam", "  enlaces repetidos  ")).resolves.toBe(
      "report-1",
    );
    expect(rpc).toHaveBeenCalledWith("report_comment", {
      p_comment_id: "comment-1",
      p_reason: "spam",
      p_details: "enlaces repetidos",
    });
    expect(mocks.revalidateInteraction).toHaveBeenCalledOnce();
  });

  it("rechaza razones fuera del contrato antes de tocar la base", async () => {
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "reporter" } } }) },
      rpc,
    });

    await expect(
      reportComment("comment-1", "invented" as never),
    ).rejects.toThrow("invalid_report_reason");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rechaza detalles de más de 2000 caracteres", async () => {
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "reporter" } } }) },
      rpc,
    });

    await expect(reportComment("comment-1", "other", "x".repeat(2001))).rejects.toThrow(
      "report_details_too_long",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
