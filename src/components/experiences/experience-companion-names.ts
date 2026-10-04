import type { ExperiencePerson } from "@/lib/experiences/types";

/** The caller chooses whose companions the current view describes. */
export function getExperienceCompanionNames(
  participants: ExperiencePerson[],
  viewerId: string | null,
  anonymousName: string,
): string[] {
  return participants
    .filter(person => person.invitationState === "accepted" && (viewerId === null || person.userId !== viewerId))
    .map(person => person.guestName ?? person.displayName ?? person.username ?? anonymousName);
}
