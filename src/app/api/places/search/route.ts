import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { placeSubtitle } from "@/lib/places/classify";
import { placesSecret } from "@/lib/places/register";
import { normalizePlaceQuery, searchPlaces } from "@/lib/places/search";
import { signPlace } from "@/lib/places/token";
import type { PlaceSuggestion } from "@/lib/places/types";

const headers = { "Cache-Control": "private, no-store" };

// Session is required for QUOTA, not privacy: every call may hit Photon from our IP.
// The cached part (searchPlaces) is session-free; tokens carry `exp` and are signed per call.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const q = normalizePlaceQuery(new URL(request.url).searchParams.get("q"));
  const secret = placesSecret();
  if (!q || !secret) return NextResponse.json({ items: [] }, { headers });
  const items: PlaceSuggestion[] = (await searchPlaces(q)).map((place) => ({
    token: signPlace(place, secret), name: place.name, layer: place.layer, subtitle: placeSubtitle(place),
  }));
  return NextResponse.json({ items }, { headers });
}
