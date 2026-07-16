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
        {/* El "+" es decoración de la maqueta, no parte del nombre del botón:
            sin aria-hidden se cuela en el nombre accesible ("+ Proponer
            actividad") y quien use lector de pantalla oye el glifo. */}
        <span aria-hidden>+</span> {t("propose")}
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
