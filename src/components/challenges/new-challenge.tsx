"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ChallengeForm } from "./challenge-form";

// Toggle between a "New challenge" button and the create form. The form's
// server action revalidates /retos, so a successful create re-renders the list
// server-side; we just collapse the form back on cancel.
export function NewChallenge() {
  const t = useTranslations("challenges");
  const [open, setOpen] = useState(false);

  if (open) {
    return <ChallengeForm onDone={() => setOpen(false)} />;
  }

  return (
    <Button
      type="button"
      variant="secondary"
      className="self-start"
      onClick={() => setOpen(true)}
    >
      {t("newChallenge")}
    </Button>
  );
}
