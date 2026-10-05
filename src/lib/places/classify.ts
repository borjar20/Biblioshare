// Photon (OSM) → PlaceData. Whitelist, not blacklist: anything we cannot name as a
// venue, city, region or country is dropped, so private addresses never become places.
// Input is an external body: nothing is trusted, every field is narrowed by type.
import { PLACE_LAYERS, type PlaceData, type PlaceLayer } from "./types";

const POI_KEYS = new Set(["amenity", "tourism", "leisure", "historic", "sport", "natural"]);
const CITY_VALUES = new Set(["city", "town", "village", "hamlet", "island", "suburb"]);
const REGION_VALUES = new Set(["state", "province", "region", "county"]);
const MAX_TEXT = 240;

function str(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function layerOf(key: string, value: string, type: string | null): PlaceLayer | null {
  if (key === "building" || key === "highway" || (key === "place" && value === "house")) return null;
  if ((key === "place" && value === "country") || (key === "boundary" && type === "country")) return "country";
  if ((key === "place" && REGION_VALUES.has(value)) || (key === "boundary" && value === "administrative" && (type === "state" || type === "county"))) return "region";
  if (key === "place" && CITY_VALUES.has(value)) return "city";
  if (POI_KEYS.has(key)) return "poi";
  return null;
}

export function classifyPhotonFeature(feature: unknown): PlaceData | null {
  const f = record(feature), p = record(f?.properties), g = record(f?.geometry);
  if (!p || !g || !Array.isArray(g.coordinates)) return null;
  const [lng, lat] = g.coordinates;
  const name = str(p.name), key = str(p.osm_key, 60), value = str(p.osm_value, 60);
  const osmType = p.osm_type, osmId = p.osm_id;
  if (!name || !key || !value || typeof lng !== "number" || typeof lat !== "number") return null;
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null;
  if ((osmType !== "N" && osmType !== "W" && osmType !== "R") || typeof osmId !== "number" || !Number.isSafeInteger(osmId) || osmId <= 0) return null;
  const layer = layerOf(key, value, str(p.type, 30));
  if (!layer) return null;
  const code = str(p.countrycode, 2)?.toUpperCase() ?? null;
  const qid = str(record(p.extra)?.wikidata, 20);
  return {
    provider: "osm", providerRef: `${osmType}${osmId}`, name, category: `${key}:${value}`, layer, lat, lng,
    city: str(p.city), region: str(p.state), country: str(p.country),
    countryCode: code && /^[A-Z]{2}$/.test(code) ? code : null,
    wikidataQid: qid && /^Q[0-9]+$/.test(qid) ? qid : null,
  };
}

const KEYS = ["provider", "providerRef", "name", "category", "layer", "lat", "lng", "city", "region", "country", "countryCode", "wikidataQid"];
const nullableText = (v: unknown) => v === null || (typeof v === "string" && v.length > 0 && v.length <= MAX_TEXT);
export function isPlaceData(value: unknown): value is PlaceData {
  const v = record(value);
  if (!v || Object.keys(v).length !== KEYS.length || !KEYS.every((k) => k in v)) return false;
  return v.provider === "osm" && typeof v.providerRef === "string" && /^[NWR][0-9]+$/.test(v.providerRef)
    && typeof v.name === "string" && v.name.length > 0 && v.name.length <= MAX_TEXT
    && typeof v.category === "string" && v.category.length >= 3 && v.category.length <= 120
    && PLACE_LAYERS.includes(v.layer as PlaceLayer)
    && typeof v.lat === "number" && v.lat >= -90 && v.lat <= 90 && typeof v.lng === "number" && v.lng >= -180 && v.lng <= 180
    && nullableText(v.city) && nullableText(v.region) && nullableText(v.country)
    && (v.countryCode === null || (typeof v.countryCode === "string" && /^[A-Z]{2}$/.test(v.countryCode)))
    && (v.wikidataQid === null || (typeof v.wikidataQid === "string" && /^Q[0-9]+$/.test(v.wikidataQid)));
}

export function placeSubtitle(place: PlaceData): string | null {
  const parts = place.layer === "poi" ? [place.city ?? place.region, place.country]
    : place.layer === "city" ? [place.region, place.country]
    : place.layer === "region" ? [place.country] : [];
  const shown = parts.filter((part): part is string => Boolean(part) && part !== place.name);
  return shown.length ? [...new Set(shown)].join(", ") : null;
}
