"use client";

import { useEffect } from "react";

export default function ClientErrorListener() {
  useEffect(() => {
    function onUnhandledRejection(e: PromiseRejectionEvent) {
      try {
        // Log structured info to console so the dev can copy it.
        // Some rejections deliver anything, so guard access.
        const reason = (e && (e.reason ?? e.detail)) || e;
        console.error("UnhandledRejection captured:", {
          message: reason?.message ?? String(reason),
          reason,
        });
      } catch (err) {
        console.error("Error while handling unhandledRejection", err);
      }
    }

    function onError(event: ErrorEvent) {
      try {
        console.error("Window error captured:", {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error,
        });
      } catch (err) {
        console.error("Error while handling window.error", err);
      }
    }

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onError as EventListener);

    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onError as EventListener);
    };
  }, []);

  return null;
}
