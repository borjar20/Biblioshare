"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BellIcon } from "@/components/ui/icons";
import { setFollowNotify } from "@/lib/social/notify-actions";
import { NOTIFY_CATEGORIES, type NotifyCategory } from "@/lib/social/notify-categories";

const HINTED: NotifyCategory = "added";

export function NotifyBell({
  targetUserId,
  username,
  initial,
}: {
  targetUserId: string;
  username: string;
  initial: NotifyCategory[];
}) {
  const t = useTranslations("social");
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState<NotifyCategory[]>(initial);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label: Record<NotifyCategory, string> = {
    finished: t("notifyFinished"),
    session: t("notifySession"),
    episode: t("notifyEpisode"),
    added: t("notifyAdded"),
  };

  async function toggle(cat: NotifyCategory) {
    const next = cats.includes(cat) ? cats.filter((c) => c !== cat) : [...cats, cat];
    const prev = cats;
    setCats(next); // optimista
    setFailed(false);
    const res = await setFollowNotify(targetUserId, username, next);
    if (!res.ok) {
      setCats(prev); // revierte
      setFailed(true);
    }
  }

  const active = cats.length > 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={t("notifyBellLabel")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-pressed={active}
        onClick={() => setOpen((v) => !v)}
        className="grid h-[38px] w-[38px] place-items-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground aria-pressed:text-foreground"
      >
        <BellIcon className="h-4 w-4" filled={active} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[44px] z-50 min-w-[248px] rounded-xl border border-border bg-surface p-2 shadow-card"
        >
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {t("notifyMenuTitle")}
          </p>
          {NOTIFY_CATEGORIES.map((cat) => (
            <label
              key={cat}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-sm text-foreground transition-colors hover:bg-surface-muted"
            >
              <input
                type="checkbox"
                checked={cats.includes(cat)}
                onChange={() => toggle(cat)}
                className="mt-0.5"
              />
              <span className="flex flex-col">
                {label[cat]}
                {cat === HINTED && (
                  <span className="text-xs text-muted-foreground">{t("notifyAddedHint")}</span>
                )}
              </span>
            </label>
          ))}
          {failed && (
            <p role="alert" className="px-2 py-1 text-xs text-status-dropped">
              {t("actionError")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
