"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function ArchiveRefresh({ jobId }: { jobId: string }) {
  const router = useRouter();
  const dispatchedFor = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (dispatchedFor.current !== jobId) {
      dispatchedFor.current = jobId;
      void fetch(`/api/import/archive/${encodeURIComponent(jobId)}/dispatch`, {
        method: "POST",
        credentials: "same-origin",
      }).then((response) => {
        // The cron may finish the job between the server render and this POST.
        // Refresh the visible state, but do not report that expected race.
        if (response.status === 404) {
          if (mounted) router.refresh();
          return;
        }
        if (!response.ok) throw new Error(`archive dispatch failed: ${response.status}`);
        if (mounted) router.refresh();
      }).catch((error: unknown) => {
        // The job remains pending and the cron is its recovery path. Surface the
        // failed dispatch without pretending that background work completed.
        console.error(error);
      });
    }
    const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [jobId, router]);
  return null;
}
