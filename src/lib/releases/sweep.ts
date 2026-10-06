import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { revalidateReleases } from "@/lib/reactivity/revalidate";
import { syncTmdbReleases } from "./sync";
import { deliverReleaseNotices } from "./reminders";

export async function runReleaseSweep() {
  const admin = createServiceRoleClient();
  const now = new Date();
  const sync = await syncTmdbReleases(admin, now);
  const deliveries = await deliverReleaseNotices(admin, 50, now);
  if (sync.imported > 0 || deliveries.accepted > 0) revalidateReleases();
  return { sync, deliveries };
}
