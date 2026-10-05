import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
import photon from "./__fixtures__/photon.json";
import { normalizePlaceQuery, searchPlaces } from "./search";

beforeEach(() => { vi.stubEnv("MOCK_EXTERNAL_APIS", "false"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("normalizePlaceQuery", () => {
  it.each([[null, null], ["  pr ", null], ["  Museo   del  PRADO ", "museo del prado"], ["x".repeat(101), null]])("%s → %s", (input, output) => {
    expect(normalizePlaceQuery(input)).toBe(output);
  });
});

describe("searchPlaces", () => {
  it("asks Photon and keeps only whitelisted places", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(photon)));
    vi.stubGlobal("fetch", fetchMock);
    const places = await searchPlaces("prado");
    expect(places.map((p) => p.name)).toEqual(["Museo Nacional del Prado", "Lisboa", "Asturias", "España"]);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://photon.komoot.io/api/?q=prado&limit=15&lang=default");
  });
  it("returns no places when Photon fails or answers garbage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await searchPlaces("prado")).toEqual([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));
    expect(await searchPlaces("prado")).toEqual([]);
  });
  it("serves fixtures without network under MOCK_EXTERNAL_APIS", async () => {
    vi.stubEnv("MOCK_EXTERNAL_APIS", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await searchPlaces("prado"))[0]?.name).toBe("Museo Nacional del Prado");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
