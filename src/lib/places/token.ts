// Signed place suggestions (spec §3). No "server-only" import on purpose: the e2e
// suite signs fixtures with the same code. The secret only ever lives on the server.
import { createHmac, timingSafeEqual } from "node:crypto";
import { isPlaceData } from "./classify";
import type { PlaceData } from "./types";

export const PLACE_TOKEN_TTL_MS = 60 * 60 * 1000;
export const PLACE_TOKEN_MAX = 2048;
const mac = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function signPlace(place: PlaceData, secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...place, exp: now + PLACE_TOKEN_TTL_MS })).toString("base64url");
  return `${payload}.${mac(payload, secret)}`;
}

export function verifyPlace(token: string, secret: string, now = Date.now()): PlaceData | null {
  if (typeof token !== "string" || token.length > PLACE_TOKEN_MAX) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = Buffer.from(mac(parts[0], secret)), given = Buffer.from(parts[1]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { exp, ...place } = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof exp !== "number" || exp <= now || !isPlaceData(place)) return null;
    return place;
  } catch { return null; }
}
