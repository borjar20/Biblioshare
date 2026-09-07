import type { PetClass, PetStage } from "./classes";

/** Only the public appearance, never the private snapshot or mood. */
export type BurrowPet = { name: string; petClass: PetClass; stage: PetStage; level: number };
export type BurrowNeighbor = BurrowPet & {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

/** The RPC already supplies the daily order; expanding must not reshuffle it. */
export function arrangeBurrow(own: BurrowPet | null, neighbors: readonly BurrowNeighbor[]) {
  const slots = own ? 11 : 12;
  return { own, visible: neighbors.slice(0, slots), hidden: neighbors.slice(slots) };
}
