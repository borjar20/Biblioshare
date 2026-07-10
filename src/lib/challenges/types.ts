import type { ItemType } from "@/lib/catalog/types";

// A reading/watching challenge (docs/REQUIREMENTS.md §7.10): a named target
// over a date window, optionally narrowed to a type and a free-form criterion.
export type ChallengeCriteria = {
  genre?: string;
  sagaId?: string;
};

export type Challenge = {
  id: string;
  name: string;
  itemType: ItemType | null; // null = any type counts
  targetCount: number;
  criteria: ChallengeCriteria;
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  archivedAt: string | null;
};

// A challenge plus its computed progress. `completed` is capped at targetCount
// for the bar, `rawCompleted` is the true count (may exceed the target).
export type ChallengeProgress = {
  challenge: Challenge;
  completed: number;
  rawCompleted: number;
};
