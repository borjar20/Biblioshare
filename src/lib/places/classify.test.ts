import { describe, expect, it } from "vitest";
import photon from "./__fixtures__/photon.json";
import { classifyPhotonFeature, isPlaceData, placeSubtitle } from "./classify";
const [museum, lisbon, asturias, spain, street, house, building, unnamed] = photon.features;

describe("classifyPhotonFeature", () => {
  it("accepts a named POI with its wikidata id", () => {
    expect(classifyPhotonFeature(museum)).toEqual({ provider: "osm", providerRef: "W28118138", name: "Museo Nacional del Prado", category: "tourism:museum", layer: "poi", lat: 40.4138, lng: -3.6921, city: "Madrid", region: "Comunidad de Madrid", country: "España", countryCode: "ES", wikidataQid: "Q160112" });
  });
  it("maps cities, administrative regions and countries to their layer", () => {
    expect(classifyPhotonFeature(lisbon)?.layer).toBe("city");
    expect(classifyPhotonFeature(asturias)?.layer).toBe("region");
    expect(classifyPhotonFeature(spain)?.layer).toBe("country");
  });
  it.each([["street", street], ["house", house], ["building", building], ["unnamed POI", unnamed]])("rejects %s", (_label, feature) => {
    expect(classifyPhotonFeature(feature)).toBeNull();
  });
  it.each([null, "x", { properties: {} }, { ...museum, geometry: { type: "Point", coordinates: [200, 0] } }, { ...museum, properties: { ...museum.properties, osm_type: "X" } }])("rejects malformed input %#", (feature) => {
    expect(classifyPhotonFeature(feature)).toBeNull();
  });
  it("drops a malformed wikidata id instead of the place", () => {
    expect(classifyPhotonFeature({ ...museum, properties: { ...museum.properties, extra: { wikidata: "nope" } } })?.wikidataQid).toBeNull();
  });
});

describe("placeSubtitle", () => {
  it("shows city and country for a POI, region and country for a city, country for a region", () => {
    expect(placeSubtitle(classifyPhotonFeature(museum)!)).toBe("Madrid, España");
    expect(placeSubtitle(classifyPhotonFeature(lisbon)!)).toBe("Portugal");
    expect(placeSubtitle(classifyPhotonFeature(asturias)!)).toBe("España");
    expect(placeSubtitle(classifyPhotonFeature(spain)!)).toBeNull();
  });
});

describe("isPlaceData", () => {
  it("round-trips a classified place and rejects tampered shapes", () => {
    const place = classifyPhotonFeature(museum)!;
    expect(isPlaceData(place)).toBe(true);
    expect(isPlaceData({ ...place, layer: "street" })).toBe(false);
    expect(isPlaceData({ ...place, extra: 1 })).toBe(false);
  });
});
