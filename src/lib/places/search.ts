import "server-only";
import { cacheLife } from "next/cache";
import photonFixture from "./__fixtures__/photon.json";
import { classifyPhotonFeature } from "./classify";
import type { PlaceData } from "./types";

const PHOTON = "https://photon.komoot.io/api/";
const TIMEOUT_MS = 8000;
const MAX_RESULTS = 6;

export function normalizePlaceQuery(q: string | null): string | null {
  const value = (q ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return value.length >= 3 && value.length <= 100 ? value : null;
}

// Same answer for an anonymous visitor, the owner and a third party: no Supabase, no
// session, no request APIs (#437). Failures THROW so they are never cached as "no results".
async function fetchPhoton(q: string): Promise<PlaceData[]> {
  "use cache";
  cacheLife("days");
  const res = await fetch(`${PHOTON}?q=${encodeURIComponent(q)}&limit=15&lang=default`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": "Biblioshare/1.0 (+https://github.com/borjar20/Biblioshare)" },
  });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const body = await res.json() as { features?: unknown };
  if (!Array.isArray(body.features)) throw new Error("photon body");
  return body.features.map(classifyPhotonFeature).filter((p): p is PlaceData => p !== null);
}

/** Never throws: Photon down or slow means no suggestions, free text still works. */
export async function searchPlaces(q: string): Promise<PlaceData[]> {
  try {
    const places = process.env.MOCK_EXTERNAL_APIS === "true"
      ? photonFixture.features.map(classifyPhotonFeature).filter((p): p is PlaceData => p !== null)
      : await fetchPhoton(q);
    const seen = new Set<string>();
    return places.filter((p) => !seen.has(p.providerRef) && seen.add(p.providerRef)).slice(0, MAX_RESULTS);
  } catch { return []; }
}
