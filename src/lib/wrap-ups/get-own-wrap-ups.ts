import { createClient } from "@/lib/supabase/server";
import type { WrapUpPayload } from "./types";
import type { WrapUpKind } from "./windows";

export type OwnWrapUp = {
  kind: WrapUpKind; payload: WrapUpPayload; seenAt: string | null;
  refreshedAt: string | null; generatedAt: string; publishedPostId: string | null;
};

type Row = {
  kind: WrapUpKind; payload: unknown; seen_at: string | null; refreshed_at: string | null;
  generated_at: string; published_post_id: string | null;
};
const toOwn = (r: Row): OwnWrapUp => ({
  kind: r.kind, payload: r.payload as WrapUpPayload, seenAt: r.seen_at,
  refreshedAt: r.refreshed_at, generatedAt: r.generated_at, publishedPostId: r.published_post_id,
});
const COLS = "kind, payload, seen_at, refreshed_at, generated_at, published_post_id";

// Sin `use cache`: depende de la sesión (regla #437). RLS limita al dueño.
export async function getOwnWrapUps(): Promise<OwnWrapUp[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("wrap_ups").select(COLS);
  if (error) throw error;
  const order = { year: 0, month: 1, week: 2 } as const;
  return ((data ?? []) as unknown as Row[]).map(toOwn).sort((a, b) => order[a.kind] - order[b.kind]);
}

export async function getOwnWrapUp(kind: WrapUpKind): Promise<OwnWrapUp | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("wrap_ups").select(COLS).eq("kind", kind).maybeSingle();
  if (error) throw error;
  return data ? toOwn(data as unknown as Row) : null;
}
