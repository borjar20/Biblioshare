import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from: () => ({ insert }) }),
}));

import { reportMarginNote } from "./report-actions";

describe("reportMarginNote", () => {
  beforeEach(() => {
    insert.mockReset().mockResolvedValue({ error: null });
    getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
  });

  it("inserta la denuncia sobre el encuentro", async () => {
    expect(await reportMarginNote("e1", "spam", "  motivo ")).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith({
      reporter_id: "u1", target_type: "margin_encounter", target_id: "e1", snapshot: {}, reason: "spam", details: "motivo",
    });
  });

  it("omite details vacío", async () => {
    await reportMarginNote("e1", "other", "  ");
    expect(insert.mock.calls[0][0]).not.toHaveProperty("details");
  });

  it("rechaza motivo desconocido o detalles largos sin tocar la BD", async () => {
    expect(await reportMarginNote("e1", "nope" as never)).toEqual({ ok: false, error: "invalid" });
    expect(await reportMarginNote("e1", "spam", "x".repeat(2001))).toEqual({ ok: false, error: "invalid" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("exige sesión", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await reportMarginNote("e1", "spam")).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("mapea duplicada y fallos genéricos", async () => {
    insert.mockResolvedValueOnce({ error: { code: "23505" } });
    expect(await reportMarginNote("e1", "spam")).toEqual({ ok: false, error: "duplicate" });
    insert.mockResolvedValueOnce({ error: { code: "42501" } });
    expect(await reportMarginNote("e1", "spam")).toEqual({ ok: false, error: "generic" });
  });
});
