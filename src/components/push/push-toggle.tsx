"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { subscribeToPush, unsubscribeFromPush } from "@/lib/push/subscription-actions";

type PermissionState = "unsupported" | "default" | "denied";

// Toggle de opt-in de notificaciones push (E5.D4). El estado real vive en el
// navegador (Notification.permission + PushManager), no en la app — se
// consulta al montar en vez de guardarse en servidor.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function PushToggle() {
  const t = useTranslations("push");
  const [state, setState] = useState<PermissionState>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Notification.permission/serviceWorker support can only be read
    // client-side (SSR has neither), so this one-time sync after mount is
    // intentional rather than a derivable/subscribable value.
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker.ready.then((registration) =>
      registration.pushManager.getSubscription().then((sub) => setSubscribed(!!sub)),
    );
  }, []);

  function enable() {
    startTransition(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        ) as BufferSource,
      });
      const json = subscription.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      await subscribeToPush(json);
      setSubscribed(true);
    });
  }

  function disable() {
    startTransition(async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeFromPush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    });
  }

  if (state === "unsupported") {
    return <p className="text-sm text-muted-foreground">{t("unsupported")}</p>;
  }

  if (state === "denied") {
    return <p className="text-sm text-muted-foreground">{t("deniedHint")}</p>;
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{t("toggleLabel")}</span>
        <span className="text-xs text-muted-foreground">{t("toggleHint")}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={subscribed}
        aria-label={t("toggleLabel")}
        disabled={isPending}
        onClick={subscribed ? disable : enable}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          subscribed ? "bg-accent" : "bg-surface-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            subscribed ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
