"use client";

import { createClient } from "@/lib/supabase/client";
import { purgeSyncedSavedFor, startSavedSession, type SavedPurgeResult } from "./db";
import { verifiedSavedAuth } from "./saved-auth";
import { SAVED_CHANNEL_PREFIX } from "./sync";

export async function purgePlaySavedOnLogout(): Promise<SavedPurgeResult> {
  const context = await verifiedSavedAuth(createClient());
  if (!context) return { ok: false, reason: "unavailable" };
  const session = await startSavedSession(context.identity, context.sessionId);
  if (!session) return { ok: false, reason: "stale" };
  const result = await purgeSyncedSavedFor(context.identity, context.sessionId);
  if (result.ok) {
    try {
      const channel = new BroadcastChannel(SAVED_CHANNEL_PREFIX + context.identity);
      channel.postMessage({ type: "session-ended", generation: result.generation });
      channel.close();
    } catch {
      // La barrera de IDB ya está confirmada; el canal sólo acelera la cancelación.
    }
  }
  return result;
}
