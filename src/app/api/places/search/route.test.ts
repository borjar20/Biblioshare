import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ getUser: vi.fn(), searchPlaces: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: h.getUser } }) }));
vi.mock("@/lib/places/search", async (original) => ({ ...(await original<typeof import("@/lib/places/search")>()), searchPlaces: h.searchPlaces }));
import photon from "@/lib/places/__fixtures__/photon.json";
import { classifyPhotonFeature } from "@/lib/places/classify";
import { verifyPlace } from "@/lib/places/token";
import { GET } from "./route";
const secret = "s".repeat(32), museum = classifyPhotonFeature(photon.features[0])!;
const call = (q: string) => GET(new Request(`http://localhost/api/places/search?q=${encodeURIComponent(q)}`));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PLACES_SIGNING_SECRET", secret);
  h.getUser.mockResolvedValue({ data: { user: { id: "u" } } });
  h.searchPlaces.mockResolvedValue([museum]);
});

describe("GET /api/places/search", () => {
  it("rejects anonymous callers before searching", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    expect((await call("prado")).status).toBe(401);
    expect(h.searchPlaces).not.toHaveBeenCalled();
  });
  it("returns signed suggestions that verify back to the place", async () => {
    const res = await call("Prado");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const { items } = await res.json();
    expect(items).toEqual([{ token: expect.any(String), name: "Museo Nacional del Prado", layer: "poi", subtitle: "Madrid, España" }]);
    expect(verifyPlace(items[0].token, secret)).toEqual(museum);
    expect(h.searchPlaces).toHaveBeenCalledWith("prado");
  });
  it("answers empty for short queries or a missing secret", async () => {
    expect((await (await call("pr")).json()).items).toEqual([]);
    vi.stubEnv("PLACES_SIGNING_SECRET", "");
    expect((await (await call("prado")).json()).items).toEqual([]);
    expect(h.searchPlaces).not.toHaveBeenCalled();
  });
});
