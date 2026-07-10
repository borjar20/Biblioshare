"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { dismissPendingRow } from "../actions";

export function DismissButton({
  pendingId,
  label,
}: {
  pendingId: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={pending}
      onClick={() => startTransition(() => dismissPendingRow(pendingId))}
    >
      {label}
    </Button>
  );
}
