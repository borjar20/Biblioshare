"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ProposeWizard } from "./propose/propose-wizard";

// El botón que abre el asistente. El formulario en sí vive en ProposeWizard.
export function ActivityComposer({ clubId }: { clubId: string }) {
  const t = useTranslations("activity");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" className="w-full" onClick={() => setOpen(true)}>
        + {t("propose")}
      </Button>
    );
  }

  // Al proponer, solo cerramos el asistente (estado de UI): la propuesta nueva
  // aparece porque proposeActivity revalida (Fase 1) y la lista deriva de props.
  return (
    <ProposeWizard
      clubId={clubId}
      onProposed={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    />
  );
}
