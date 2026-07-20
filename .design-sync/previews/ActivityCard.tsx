import "@/design-sync-shims/process-shim";
import { ActivityCard } from "@/components/clubs/activity-card";
import { PreviewProvider } from "@/design-sync-shims/preview-provider";
import type { ClubActivity } from "@/lib/clubs/activities/core";

function activity(overrides: Partial<ClubActivity>): ClubActivity {
  return {
    id: "act-1",
    clubId: "club-1",
    kind: "buddy_read",
    title: "Lectura conjunta: El nombre del viento",
    description: null,
    status: "active",
    config: null,
    createdBy: "user-1",
    startsOn: "2026-07-01",
    endsOn: null,
    createdAt: "2026-06-20T10:00:00Z",
    viewerIsParticipant: true,
    participantCount: 6,
    spawnedFromActivityId: null,
    spawnedFromItem: null,
    ...overrides,
  };
}

export function BuddyReadActive() {
  return (
    <PreviewProvider>
      <ActivityCard activity={activity({})} clubSlug="club-de-lectura" />
    </PreviewProvider>
  );
}

export function TierlistProposed() {
  return (
    <PreviewProvider>
      <ActivityCard
        activity={activity({
          id: "act-2",
          kind: "tierlist",
          title: "Tierlist: mejores finales de saga",
          status: "proposed",
          participantCount: 2,
        })}
        clubSlug="club-de-lectura"
      />
    </PreviewProvider>
  );
}

export function ListChallengeFinished() {
  return (
    <PreviewProvider>
      <ActivityCard
        activity={activity({
          id: "act-3",
          kind: "list_challenge",
          title: "Reto de verano: 5 libros de fantasía",
          status: "finished",
          participantCount: 11,
        })}
        clubSlug="club-de-lectura"
      />
    </PreviewProvider>
  );
}
