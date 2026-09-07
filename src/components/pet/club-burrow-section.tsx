import { createClient } from "@/lib/supabase/server";
import { getClubBurrowPets } from "@/lib/pet/get-club-burrow";
import { Burrow } from "./burrow";
import { ClubBurrowError } from "./club-burrow-error";
import { RouteMessages } from "@/components/route-messages";

/** Independent Suspense in the club feed; never cache viewer-specific rows. */
export async function ClubBurrowSection({ clubId, clubName, viewerId }: { clubId: string; clubName: string; viewerId: string }) {
  // Resolve the request context before the transport boundary (Next dynamic APIs may suspend).
  const client = await createClient();
  const result = await getClubBurrowPets(client, clubId, viewerId);
  return <RouteMessages ns={["pet"]}>
    {result.ok
      ? <Burrow own={result.own} neighbors={result.neighbors} total={result.total} club={{ name: clubName, ownOwner: result.own }} />
      : <ClubBurrowError />}
  </RouteMessages>;
}
