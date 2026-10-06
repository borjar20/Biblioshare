"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserRole } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/supabase/server";
import { cancelEditorialRelease, markEditorialReleaseReviewed, publishEditorialRelease, saveEditorialRelease } from "@/lib/releases/mutations";
import type { ReleaseEditorialInput } from "@/lib/releases/types";
import { isReleaseId, releaseActionFailure, type ReleaseActionResult } from "@/components/releases/action-state";

async function adminIdentity(): Promise<{ userId: string } | { error: "auth" | "forbidden" }> {
  const user = await getCurrentUser();
  if (!user) return { error: "auth" as const };
  if (await getCurrentUserRole() !== "admin") return { error: "forbidden" as const };
  return { userId: user.id };
}

function refreshReleases(id: string) {
  revalidatePath("/admin/novedades");
  revalidatePath(`/admin/novedades/${id}`);
  revalidatePath("/novedades");
  revalidatePath("/");
}

function validEditorialVersion(revision: unknown, updatedAt: unknown): updatedAt is string {
  return typeof revision === "number" && Number.isInteger(revision) && revision >= 1
    && typeof updatedAt === "string" && Number.isFinite(Date.parse(updatedAt));
}

export async function saveBookAnnouncement(input: ReleaseEditorialInput, id?: string, expectedRevision?: number, expectedUpdatedAt?: string): Promise<ReleaseActionResult> {
  try {
    const identity = await adminIdentity();
    if ("error" in identity) return { ok: false, error: identity.error };
    if (id !== undefined && !isReleaseId(id)) return { ok: false, error: "invalid" };
    if (expectedRevision !== undefined && (!Number.isInteger(expectedRevision) || expectedRevision < 1)) return { ok: false, error: "invalid" };
    if (id && !validEditorialVersion(expectedRevision, expectedUpdatedAt)) return { ok: false, error: "invalid" };
    const result = await saveEditorialRelease(identity.userId, id ? input : { ...input, status: "draft" }, id, expectedRevision, expectedUpdatedAt);
    refreshReleases(result.id);
    return { ok: true, id: result.id };
  } catch (error) {
    return releaseActionFailure(error);
  }
}

export async function publishBookAnnouncement(id: string, expectedRevision?: number, expectedUpdatedAt?: string): Promise<ReleaseActionResult> {
  try {
    const identity = await adminIdentity();
    if ("error" in identity) return { ok: false, error: identity.error };
    if (!isReleaseId(id) || !validEditorialVersion(expectedRevision, expectedUpdatedAt)) return { ok: false, error: "invalid" };
    await publishEditorialRelease(identity.userId, id, expectedRevision, expectedUpdatedAt);
    refreshReleases(id);
    return { ok: true };
  } catch (error) {
    return releaseActionFailure(error);
  }
}

export async function reviewBookAnnouncement(id: string, expectedRevision?: number, expectedUpdatedAt?: string): Promise<ReleaseActionResult> {
  try {
    const identity = await adminIdentity();
    if ("error" in identity) return { ok: false, error: identity.error };
    if (!isReleaseId(id) || !validEditorialVersion(expectedRevision, expectedUpdatedAt)) return { ok: false, error: "invalid" };
    await markEditorialReleaseReviewed(identity.userId, id, expectedRevision, expectedUpdatedAt);
    refreshReleases(id);
    return { ok: true };
  } catch (error) {
    return releaseActionFailure(error);
  }
}

export async function cancelBookAnnouncement(id: string, expectedRevision?: number, expectedUpdatedAt?: string): Promise<ReleaseActionResult> {
  try {
    const identity = await adminIdentity();
    if ("error" in identity) return { ok: false, error: identity.error };
    if (!isReleaseId(id) || !validEditorialVersion(expectedRevision, expectedUpdatedAt)) return { ok: false, error: "invalid" };
    await cancelEditorialRelease(identity.userId, id, expectedRevision, expectedUpdatedAt);
    refreshReleases(id);
    return { ok: true };
  } catch (error) {
    return releaseActionFailure(error);
  }
}
