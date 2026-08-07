import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TargetType =
  | "diary_entry"
  | "episode_watch"
  | "club_post"
  | "comment"
  | "activity_checkpoint"
  | "club_activity"
  | "pass"
  | "progress_session"
  | "club_round"
  | "thought";

export type InteractionTargetRef = {
  id: string;
  kind: TargetType;
  sourceId: string;
};

type InteractionTargetSourceRef = Pick<InteractionTargetRef, "kind" | "sourceId">;

export async function getInteractionTargetRefs(
  supabase: SupabaseServerClient,
  refs: InteractionTargetSourceRef[],
): Promise<Map<string, InteractionTargetRef>> {
  const sourceIdsByKind = new Map<TargetType, Set<string>>();
  for (const ref of refs) {
    const sourceIds = sourceIdsByKind.get(ref.kind) ?? new Set<string>();
    sourceIds.add(ref.sourceId);
    sourceIdsByKind.set(ref.kind, sourceIds);
  }

  const targetRefs = new Map<string, InteractionTargetRef>();
  await Promise.all(
    [...sourceIdsByKind].map(async ([kind, sourceIds]) => {
      const { data, error } = await supabase
        .from("interaction_targets")
        .select("id, kind, source_id")
        .eq("kind", kind)
        .in("source_id", [...sourceIds]);
      if (error) throw error;

      for (const row of data ?? []) {
        targetRefs.set(`${row.kind}:${row.source_id}`, {
          id: row.id,
          kind: row.kind,
          sourceId: row.source_id,
        });
      }
    }),
  );

  return targetRefs;
}
