// Las dos rutas de la imagen 9:16 (Task 16): la del dueño y la del resumen
// publicado. Renderizan la imagen DE VERDAD (Satori + Resvg + sharp sobre los
// sprites reales del repo); solo se simulan la sesión y la BD.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { samplePayload } from "@/components/wrap-ups/__fixtures__/sample-payload";
import type { ShareSummary } from "@/lib/wrap-ups/types";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
const db = vi.hoisted(() => ({ row: null as { summary: unknown } | null, error: null as { code: string } | null, eqs: [] as [string, unknown][] }));
const own = vi.hoisted(() => ({ wrapUp: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => auth.user,
  createClient: async () => ({
    from: (table: string) => {
      expect(table).toBe("wrap_up_shares");
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => { db.eqs.push([col, v]); return q; },
        maybeSingle: async () => ({ data: db.row, error: db.error }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/wrap-ups/get-own-wrap-ups", () => ({ getOwnWrapUp: async () => own.wrapUp }));

const { GET: ownGET } = await import("./[kind]/route");
const { GET: shareGET } = await import("./share/[id]/route");

// Sin portadas remotas: el test no sale a la red (las cartas caen en el título).
const summary: ShareSummary = { ...samplePayload().share, pet: { name: "Bellota", petClass: "bard", stage: "young" } };
const SHARE_ID = "3f1c2b9e-8a41-4d1e-9a8b-2f6e5c4d3b2a";

const ownReq = (kind: string) => ownGET(new Request(`http://x/api/og/wrap-up/${kind}`), { params: Promise.resolve({ kind }) });
const shareReq = (id: string) => shareGET(new Request(`http://x/api/og/wrap-up/share/${id}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  auth.user = null; own.wrapUp = null; db.row = null; db.error = null; db.eqs = [];
});

describe("GET /api/og/wrap-up/[kind]", () => {
  it("401 sin sesión", async () => {
    expect((await ownReq("week")).status).toBe(401);
  });

  it("404 con un kind que no existe", async () => {
    auth.user = { id: "u1" };
    expect((await ownReq("decade")).status).toBe(404);
  });

  it("404 si el usuario no tiene ese wrap-up", async () => {
    auth.user = { id: "u1" };
    expect((await ownReq("week")).status).toBe(404);
  });

  it("200 image/png privada con la fila", async () => {
    auth.user = { id: "u1" };
    own.wrapUp = { kind: "week", payload: samplePayload({ share: summary }) };
    const res = await ownReq("week");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    // Nunca la caché pública e inmutable que pone ImageResponse por defecto.
    expect(res.headers.get("cache-control")).toMatch(/^private/);
    const png = new Uint8Array(await res.arrayBuffer());
    expect([...png.slice(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");
    // 1080×1920: ancho y alto en la cabecera IHDR (bytes 16-23, big-endian).
    const view = new DataView(png.buffer);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1080, 1920]);
  }, 30_000);
});

describe("GET /api/og/wrap-up/share/[id]", () => {
  it("404 si la RLS no devuelve la fila", async () => {
    expect((await shareReq(SHARE_ID)).status).toBe(404);
    expect(db.eqs).toEqual([["id", SHARE_ID]]);
  });

  it("404 con un id que no es uuid, sin consultar", async () => {
    expect((await shareReq("nope")).status).toBe(404);
    expect(db.eqs).toEqual([]);
  });

  it("200 image/png con la fila, también sin sesión (la RLS decide)", async () => {
    db.row = { summary: { ...summary, pet: null, palette: "movie" } };
    const res = await shareReq(SHARE_ID);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toMatch(/^private/);
  }, 30_000);
});
