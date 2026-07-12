"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { markAllNotificationsRead } from "@/lib/social/notification-actions";
import { NOTIFICATION_TYPE_KEY, type Notification } from "@/lib/social/notification-types";
import { UserAvatar } from "./user-avatar";
import { BellIcon } from "@/components/ui/icons";
import { PushToggle } from "@/components/push/push-toggle";

function timeAgo(iso: string, t: (key: string, values?: Record<string, number>) => string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { count: hours });
  return t("daysAgo", { count: Math.floor(hours / 24) });
}

// Campana con contador de no leídas + dropdown (EPIC-05, Bloque D, SD-5). Al
// abrir, marca todo como leído (sin selección fila a fila, mismo espíritu
// simple que el resto de toggles de la app).
export function NotificationBell({
  initialUnreadCount,
  initialNotifications,
}: {
  initialUnreadCount: number;
  initialNotifications: Notification[];
}) {
  const t = useTranslations("notifications");
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      setUnreadCount(0);
      startTransition(() => markAllNotificationsRead());
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={t("title")}
        onClick={toggle}
        className="relative inline-flex items-center justify-center rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface shadow-lg">
          <div className="border-b border-border px-4 py-2 text-sm font-semibold text-foreground">
            {t("title")}
          </div>
          {initialNotifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <ul className="flex max-h-96 flex-col overflow-y-auto">
              {initialNotifications.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted"
                  >
                    <UserAvatar
                      name={n.actorDisplayName || n.actorUsername}
                      avatarUrl={n.actorAvatarUrl}
                      size={32}
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm text-foreground">
                        {n.extraActorsCount
                          ? t("reviewLikedGrouped", {
                              name: n.actorDisplayName || n.actorUsername,
                              count: n.extraActorsCount,
                            })
                          : t(NOTIFICATION_TYPE_KEY[n.type], {
                              name: n.actorDisplayName || n.actorUsername,
                            })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(n.createdAt, t)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border">
            <PushToggle />
          </div>
        </div>
      )}
    </div>
  );
}
