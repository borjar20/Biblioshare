import { beforeEach, describe, expect, it, vi } from "vitest";
import { canRefresh } from "./refresh-policy";

const m = vi.hoisted(() => ({
  row: null as unknown,
  build: vi.fn(),
  update: vi.fn(),
  revalidateWrapUp: vi.fn(),
  rpc: vi.fn(async (name: string) => ({ data: name === "publish_wrap_up" ? "post-1" : null, error: null })),
}));

// Las rutas viven en el módulo central (revalidate-guard): aquí solo se mira QUÉ ámbito se pide.
vi.mock("@/lib/reactivity/revalidate", () => ({ revalidateWrapUp: m.revalidateWrapUp }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: m.rpc })),
  getCurrentUser: vi.fn(async () => ({ id: "u1" })),
}));
vi.mock("./get-own-wrap-ups", () => ({ getOwnWrapUp: vi.fn(async () => m.row) }));
vi.mock("./build", () => ({ buildWrapUp: m.build }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      update: (v: unknown) => {
        m.update(v);
        const chain = { eq: () => chain, is: async () => ({ error: null }) };
        return chain;
      },
    }),
  }),
}));

import { markWrapUpSeen, publishWrapUp, refreshWrapUp, unpublishWrapUp } from "./actions";

const now = new Date("2026-10-05T10:00:00Z");
describe("canRefresh", () => {
  it("publicado no se recalcula", () =>
    expect(canRefresh({ refreshedAt: null, generatedAt: "2026-10-05T07:00:00Z", publishedPostId: "p" }, now)).toBe("published"));
  it("menos de 10 minutos desde el último cálculo", () =>
    expect(canRefresh({ refreshedAt: "2026-10-05T09:55:00Z", generatedAt: "2026-10-05T07:00:00Z", publishedPostId: null }, now)).toBe("too_soon"));
  it("generado hace 5 minutos también cuenta", () =>
    expect(canRefresh({ refreshedAt: null, generatedAt: "2026-10-05T09:55:00Z", publishedPostId: null }, now)).toBe("too_soon"));
  it("pasados 10 minutos, ok", () =>
    expect(canRefresh({ refreshedAt: "2026-10-05T09:49:00Z", generatedAt: "2026-10-05T07:00:00Z", publishedPostId: null }, now)).toBe("ok"));
});

describe("refreshWrapUp: ancla de ventana", () => {
  beforeEach(() => {
    m.build.mockReset();
    m.update.mockReset();
    m.build.mockResolvedValue({ intensity: "normal", periodStart: "x", periodEnd: "y" });
  });
  const base = { seenAt: null, refreshedAt: null, generatedAt: "2026-10-05T07:00:00Z", publishedPostId: null };

  it("semanal recalcula su propia semana aunque hoy sea otra", async () => {
    m.row = { ...base, kind: "week", payload: { periodStart: "2026-09-28", periodEnd: "2026-10-04" } };
    const r = await refreshWrapUp("week");
    expect(r).toEqual({ ok: true });
    const w = m.build.mock.calls[0][2];
    expect(w.start).toBe("2026-09-28");
    expect(w.end).toBe("2026-10-04");
  });

  it("anual recalcula su propio año", async () => {
    m.row = { ...base, kind: "year", payload: { periodStart: "2025-01-01", periodEnd: "2025-12-31" } };
    await refreshWrapUp("year");
    const w = m.build.mock.calls[0][2];
    expect(w.start.slice(0, 4)).toBe("2025");
    expect(w.end.slice(0, 4)).toBe("2025");
  });
});

describe("revalidación a través del módulo central", () => {
  beforeEach(() => m.revalidateWrapUp.mockReset());

  it("ver y actualizar solo tocan las superficies del dueño", async () => {
    await markWrapUpSeen("week");
    expect(m.revalidateWrapUp).toHaveBeenLastCalledWith("week");
    m.build.mockResolvedValue({ intensity: "normal", periodStart: "x", periodEnd: "y" });
    m.row = { seenAt: null, refreshedAt: null, generatedAt: "2026-10-05T07:00:00Z", publishedPostId: null, kind: "week",
      payload: { periodStart: "2026-09-28", periodEnd: "2026-10-04" } };
    await refreshWrapUp("week");
    expect(m.revalidateWrapUp).toHaveBeenLastCalledWith("week");
  });

  it("publicar y despublicar alcanzan el feed, el post y los perfiles", async () => {
    expect(await publishWrapUp("month")).toEqual({ ok: true, postId: "post-1" });
    expect(m.revalidateWrapUp).toHaveBeenLastCalledWith("month", { social: true });
    await unpublishWrapUp("month");
    expect(m.revalidateWrapUp).toHaveBeenLastCalledWith("month", { social: true });
  });
});
