import { beforeEach, describe, expect, it, vi } from "vitest";
import { canRefresh } from "./refresh-policy";

const m = vi.hoisted(() => ({
  row: null as unknown,
  build: vi.fn(),
  update: vi.fn(),
  writes: 0,
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
        const filters: Record<string, unknown> = {};
        const chain = {
          eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
          is: (key: string, value: unknown) => { filters[key] = value; return chain; },
          select: () => chain,
          then: (resolve: (result: unknown) => unknown) => {
            const row = m.row as { payload: { periodStart: string }; generatedAt: string; refreshedAt: string | null; publishedPostId: string | null };
            const current: Record<string, unknown> = { user_id: "u1", kind: "week", period_start: row.payload.periodStart,
              generated_at: row.generatedAt, refreshed_at: row.refreshedAt, published_post_id: row.publishedPostId };
            // El test anual también usa la fila de su tipo.
            current.kind = (m.row as { kind: string }).kind;
            const matches = Object.entries(filters).every(([key, value]) => current[key] === value);
            if (matches) m.writes++;
            return Promise.resolve({ error: null, data: matches ? [{ kind: current.kind }] : [] }).then(resolve);
          },
        };
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


describe("refreshWrapUp: escritura condicionada a la versión leída", () => {
  beforeEach(() => {
    m.writes = 0;
    m.row = { kind: "week", payload: { periodStart: "2026-09-28", periodEnd: "2026-10-04" },
      seenAt: null, refreshedAt: null, generatedAt: "2026-10-05T07:00:00Z", publishedPostId: null };
    m.build.mockReset();
  });
  it("no sobrescribe el periodo siguiente si el cron sustituye la fila durante el cálculo", async () => {
    m.build.mockImplementation(async () => {
      m.row = { ...(m.row as object), payload: { periodStart: "2026-10-05", periodEnd: "2026-10-11" } };
      return { intensity: "full" };
    });
    expect(await refreshWrapUp("week")).toEqual({ ok: false, reason: "not_found" });
    expect(m.writes).toBe(0);
  });
  it("dos actualizaciones concurrentes no eluden los diez minutos", async () => {
    m.build.mockImplementation(async () => {
      m.row = { ...(m.row as object), refreshedAt: new Date().toISOString() };
      return { intensity: "full" };
    });
    expect(await refreshWrapUp("week")).toEqual({ ok: false, reason: "too_soon" });
    expect(m.writes).toBe(0);
  });
  it("no anuncia éxito si la publicación gana la carrera", async () => {
    m.build.mockImplementation(async () => {
      m.row = { ...(m.row as object), publishedPostId: "post-concurrent" };
      return { intensity: "full" };
    });
    expect(await refreshWrapUp("week")).toEqual({ ok: false, reason: "published" });
    expect(m.writes).toBe(0);
  });
  it("no guarda hechos anteriores a una nueva generación del mismo periodo", async () => {
    m.build.mockImplementation(async () => {
      m.row = { ...(m.row as object), generatedAt: new Date().toISOString() };
      return { intensity: "full" };
    });
    expect(await refreshWrapUp("week")).toEqual({ ok: false, reason: "too_soon" });
    expect(m.writes).toBe(0);
  });
});

import { samplePayload } from "@/components/wrap-ups/__fixtures__/sample-payload";
describe("publicar semanales generadas antes del resumen de series", () => {
 beforeEach(() => {
 const p=samplePayload();p.stories=[{id:"series_progress",items:[{type:"series",id:"s1",title:"The Bear",coverUrl:null,times:1,episodes:3}],total:1}];p.share={...p.share,covers:[]};
 m.row={kind:"week",payload:p,seenAt:null,refreshedAt:null,generatedAt:"2026-10-05T07:00:00Z",publishedPostId:null};
 m.update.mockReset();m.rpc.mockClear();m.writes=0;
 });
 it("persiste solo el resumen derivado antes de tomar el snapshot público", async () => {
 expect(await publishWrapUp("week")).toEqual({ok:true,postId:"post-1"});
 expect(m.update).toHaveBeenCalledWith({payload:expect.objectContaining({share:expect.objectContaining({seriesProgress:{count:1,episodes:3}})})});
 expect(m.writes).toBe(1);expect(m.rpc).toHaveBeenCalledOnce();
 });
 it("si cambia la versión, no publica un resumen desfasado", async () => {
 m.update.mockImplementation(() => {m.row={...(m.row as object),refreshedAt:new Date().toISOString()};});
 expect(await publishWrapUp("week")).toEqual({ok:false,reason:"wrap_up_changed"});
 expect(m.writes).toBe(0);expect(m.rpc).not.toHaveBeenCalled();
 });
 it("una publicación existente no se reescribe", async () => {
 m.row={...(m.row as object),publishedPostId:"existing"};
 expect(await publishWrapUp("week")).toEqual({ok:true,postId:"post-1"});
 expect(m.update).not.toHaveBeenCalled();
 });
});
