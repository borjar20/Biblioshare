export type PlaceLayer = "poi" | "city" | "region" | "country";
export const PLACE_LAYERS: readonly PlaceLayer[] = ["poi", "city", "region", "country"];
export interface PlaceData {
  provider: "osm";
  providerRef: string;
  name: string;
  category: string;
  layer: PlaceLayer;
  lat: number;
  lng: number;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  wikidataQid: string | null;
}
export interface PlaceSuggestion { token: string; name: string; layer: PlaceLayer; subtitle: string | null }
