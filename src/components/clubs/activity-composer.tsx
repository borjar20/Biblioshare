"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ProposeWizard } from "./propose/propose-wizard";

// El botón que abre el asistente. El formulario en sí vive en ProposeWizard.
export function ActivityComposer({
  clubId,
  onProposed,
}: {
  clubId: string;
  onProposed: () => void;
}) {
  const t = useTranslations("activity");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {t("propose")}
      </Button>
    );
  }

  return (
    <ProposeWizard
      clubId={clubId}
      onProposed={() => {
        setOpen(false);
        onProposed();
      }}
      onCancel={() => setOpen(false)}
    />
  );
}
