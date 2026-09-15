export type ArchiveDecision = "retry" | "dismiss" | "associate" | "fill" | "accept" | "separate" | "catalog";
export type ComparedPass = { finishedOn: string | null; rating: number | null; review: string | null };
export type ArchiveRowReview = {
  ordinal: number; title: string; state: string; message: string | null; attempts: number; version: string;
  catalogIncomplete: boolean; reviewConflicts: unknown[];
  plannedAction: "none" | "keep" | "blocked" | "add";
  comparisons: { incoming: ComparedPass & { sourceKey: string }; current: (ComparedPass & { id: string }) | null; proposed: boolean; linked: boolean; unrepresented: boolean }[];
};
export type ArchiveApprovedRow = { ordinal: number; version: string; decision: ArchiveDecision };
export type ArchiveDecisionResult = { ordinal: number; state: string };

/** Conservative formatting equivalence: preserve emphasis, links and paragraph boundaries. */
export function equivalentArchiveReview(left: string, right: string): boolean {
  const normalize = (value: string) => value.replace(/\r\n/g, "\n").trim()
    .replace(/<(\/?)(b|strong|i|em)>/gi, (_all, close: string, tag: string) => `<${close}${["b", "strong"].includes(tag.toLowerCase()) ? "strong" : "em"}>`)
    .replace(/^<p>([^<>]*)<\/p>$/i, "$1");
  return normalize(left) === normalize(right);
}

export function archiveFieldEffect(local: string | number | null, incoming: string | number | null, overwrite: boolean, review = false) {
  if (incoming === null || incoming === "") return "keep";
  if (local === null || local === "") return "add";
  if (local === incoming || (review && typeof local === "string" && typeof incoming === "string" && equivalentArchiveReview(local, incoming))) return "keep";
  return overwrite ? "replace" : "keepDifferent";
}

export function eligibleArchiveDecision(row: ArchiveRowReview, decision: ArchiveDecision): boolean {
  if (decision === "retry") return row.state === "error" && row.attempts < 3 && !["provider_missing", "provider_configuration", "invalid_metadata"].includes(row.message ?? "");
  if (decision === "dismiss") return ["error", "conflict", "unmatched", "ambiguous"].includes(row.state);
  if (decision === "catalog") return row.state === "imported" && row.catalogIncomplete;
  if (row.state !== "conflict") return false;
  if (decision === "separate") return true;
  return row.comparisons.length > 0 && row.reviewConflicts.length === 0 && row.comparisons.every(c =>
    decision === "accept" ? (c.current || c.unrepresented) : c.current && (c.proposed || c.linked));
}

export function archiveRepairDecision(row: ArchiveRowReview): ArchiveDecision | null {
  return (["catalog", "retry", "associate"] as const).find(action => eligibleArchiveDecision(row, action)) ?? null;
}
