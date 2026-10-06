"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/supabase/server";
import { addReleaseToPending, setReleaseSubscription } from "@/lib/releases/mutations";
import { isReleaseId, releaseActionFailure, type ReleaseActionResult } from "@/components/releases/action-state";

export async function addNoveltyToPending(releaseId: string): Promise<ReleaseActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth" };
    if (!isReleaseId(releaseId)) return { ok: false, error: "invalid" };
    // Only an ID crosses the browser boundary. The domain re-reads the release
    // and resolves its catalog identity before changing a pass.
    await addReleaseToPending(user.id, releaseId);
    revalidatePath("/novedades");
    revalidatePath("/coleccion");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return releaseActionFailure(error);
  }
}

export async function chooseReleaseNotice(releaseId: string, enabled: boolean): Promise<ReleaseActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth" };
    if (!isReleaseId(releaseId) || typeof enabled !== "boolean") return { ok: false, error: "invalid" };
    await setReleaseSubscription(user.id, releaseId, enabled);
    revalidatePath("/novedades");
    return { ok: true };
  } catch (error) {
    return releaseActionFailure(error);
  }
}
