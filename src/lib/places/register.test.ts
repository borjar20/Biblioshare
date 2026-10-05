import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({ rpc: h.rpc }) }));
import photon from "./__fixtures__/photon.json";
import { classifyPhotonFeature } from "./classify";
import { signPlace } from "./token";
import { resolvePlaceToken } from "./register";
const secret = "s".repeat(32), place = classifyPhotonFeature(photon.features[0])!;
const placeId = "11111111-2222-4333-8444-555555555555";

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("PLACES_SIGNING_SECRET", secret); h.rpc.mockResolvedValue({ data: placeId, error: null }); });

describe("resolvePlaceToken", () => {
  it("upserts the verified place with the service client", async () => {
    expect(await resolvePlaceToken(signPlace(place, secret))).toBe(placeId);
    expect(h.rpc).toHaveBeenCalledWith("place_upsert", { p_input: place });
  });
  it.each([[undefined], [null], [""], ["forged.token"]])("ignores %s without touching the database", async (token) => {
    expect(await resolvePlaceToken(token)).toBeNull();
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("degrades to null on a missing secret or an RPC error", async () => {
    const token = signPlace(place, secret);
    h.rpc.mockResolvedValue({ data: null, error: { code: "23514" } });
    expect(await resolvePlaceToken(token)).toBeNull();
    vi.stubEnv("PLACES_SIGNING_SECRET", "");
    expect(await resolvePlaceToken(token)).toBeNull();
  });
});
