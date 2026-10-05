import { describe, expect, it } from "vitest";
import photon from "./__fixtures__/photon.json";
import { classifyPhotonFeature } from "./classify";
import { PLACE_TOKEN_TTL_MS, signPlace, verifyPlace } from "./token";
const secret = "s".repeat(32), place = classifyPhotonFeature(photon.features[0])!, now = 1_700_000_000_000;

describe("place tokens", () => {
  it("verifies its own signature within the TTL", () => {
    expect(verifyPlace(signPlace(place, secret, now), secret, now + PLACE_TOKEN_TTL_MS - 1)).toEqual(place);
  });
  it("rejects expired, foreign-secret and tampered tokens", () => {
    const token = signPlace(place, secret, now);
    expect(verifyPlace(token, secret, now + PLACE_TOKEN_TTL_MS)).toBeNull();
    expect(verifyPlace(token, "t".repeat(32), now)).toBeNull();
    const [payload, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...place, name: "Mi casa", exp: now + 1000 })).toString("base64url");
    expect(verifyPlace(`${forged}.${mac}`, secret, now)).toBeNull();
    expect(verifyPlace(`${payload}.${mac}x`, secret, now)).toBeNull();
  });
  it.each(["", "a", "a.b.c", "x".repeat(2049)])("rejects garbage %#", (token) => {
    expect(verifyPlace(token, secret, now)).toBeNull();
  });
});
