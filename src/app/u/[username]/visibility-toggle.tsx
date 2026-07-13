"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { updateProfileVisibility } from "./actions";

export function VisibilityToggle({
  username,
  isPublic,
}: {
  username: string;
  isPublic: boolean;
}) {
  const t = useTranslations("profile");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-surface shadow-card px-4 py-3 text-sm">
      <span className="text-muted-foreground">
        {isPublic ? t("visibilityPublic") : t("visibilityPrivate")}
      </span>
      <Button
        type="button"
        variant="secondary"
        disabled={isPending}
        onClick={() =>
          startTransition(() => updateProfileVisibility(username, !isPublic))
        }
      >
        {isPublic ? t("makePrivate") : t("makePublic")}
      </Button>
    </div>
  );
}
