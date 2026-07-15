"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidateLibrary } from "@/lib/reactivity/revalidate";

export type ReorderQueueState = {
  error?: "generic";
};

// Full renumber of exactly the ids the client sends into `queueId` (drag to any
// position — possibly across queues — shifts every item after the drop point,
// so an append-only counter like pinned_order doesn't fit; §7.22). queueId null
// targets the "Sin cola" bucket. The RPC does it atomically (set queue_id +
// renumber in one statement) and ignores ids that aren't the caller's planned
// items, so a stale client can't corrupt the queue.
export async function reorderQueue(
  queueId: string | null,
  orderedEntryIds: string[]
): Promise<ReorderQueueState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("reorder_queue", {
    target_queue: queueId,
    entry_ids: orderedEntryIds,
  });

  if (error) return { error: "generic" };

  revalidateLibrary();
  return {};
}

export type QueueMutationState = {
  error?: "invalidName" | "duplicateName" | "generic";
};

const MAX_QUEUE_NAME = 60;

function parseQueueName(raw: string): string | null {
  const name = raw.trim();
  if (!name || name.length > MAX_QUEUE_NAME) return null;
  return name;
}

// Appends after the user's existing queues. position isn't unique — it's a
// display hint — so a plain "max + 1" is enough; a collision only affects tie
// ordering, which then falls back to created_at (see getQueues).
export async function createQueue(
  _prevState: QueueMutationState,
  formData: FormData
): Promise<QueueMutationState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = parseQueueName(String(formData.get("name") ?? ""));
  if (!name) return { error: "invalidName" };

  const { data: last } = await supabase
    .from("queues")
    .select("position")
    .eq("user_id", user.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("queues").insert({
    user_id: user.id,
    name,
    position: (last?.position ?? -1) + 1,
  });

  // 23505 = unique (user_id, name): the user already has a queue by this name.
  if (error) return { error: error.code === "23505" ? "duplicateName" : "generic" };

  revalidateLibrary();
  return {};
}

export async function renameQueue(
  queueId: string,
  _prevState: QueueMutationState,
  formData: FormData
): Promise<QueueMutationState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = parseQueueName(String(formData.get("name") ?? ""));
  if (!name) return { error: "invalidName" };

  const { error } = await supabase
    .from("queues")
    .update({ name })
    .eq("id", queueId)
    .eq("user_id", user.id);

  if (error) return { error: error.code === "23505" ? "duplicateName" : "generic" };

  revalidateLibrary();
  return {};
}

// Deleting a queue doesn't delete its items: the FK is `on delete set null`, so
// they fall back to the "Sin cola" bucket. §7.22.
export async function deleteQueue(queueId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("queues")
    .delete()
    .eq("id", queueId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidateLibrary();
}
