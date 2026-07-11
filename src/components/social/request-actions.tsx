"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  acceptFollowRequest,
  rejectFollowRequest,
} from "@/lib/social/actions";

// Aceptar/rechazar una solicitud de seguimiento (perfil privado).
export function RequestActions({ followerId }: { followerId: string }) {
  const t = useTranslations("social");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex shrink-0 gap-2">
      <Button
        type="button"
        variant="primary"
        disabled={isPending}
        onClick={() => startTransition(() => acceptFollowRequest(followerId))}
      >
        {t("accept")}
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={isPending}
        onClick={() => startTransition(() => rejectFollowRequest(followerId))}
      >
        {t("reject")}
      </Button>
    </div>
  );
}
