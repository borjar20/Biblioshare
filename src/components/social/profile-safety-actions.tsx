"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { blockUser, unblockUser } from "@/lib/social/block-actions";
import type { BlockState } from "@/lib/social/block-state";

export function ProfileSafetyActions({
  targetUserId,
  initialState,
}: {
  targetUserId: string;
  initialState: BlockState;
}) {
  const t = useTranslations("social");
  const [state, setState] = useState(initialState);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (state === "blocked_by") return null;

  function toggleBlock() {
    if (state === "none" && !window.confirm(t("blockConfirm"))) return;
    setFailed(false);
    startTransition(async () => {
      try {
        if (state === "blocked") {
          await unblockUser(targetUserId);
          setState("none");
        } else {
          await blockUser(targetUserId);
          setState("blocked");
        }
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        disabled={isPending}
        onClick={toggleBlock}
        className={state === "none" ? "text-destructive" : ""}
      >
        {state === "blocked" ? t("unblock") : t("block")}
      </Button>
      {failed && (
        <p role="alert" className="max-w-48 text-right text-xs text-destructive">
          {t("actionError")}
        </p>
      )}
    </div>
  );
}
