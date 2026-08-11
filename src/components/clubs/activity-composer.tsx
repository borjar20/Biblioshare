"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ProposeWizard } from "./propose/propose-wizard";

// El botón que abre el asistente. El formulario en sí vive en ProposeWizard.
export function ActivityComposer({
  clubId,
  clubSlug,
  isModerator,
}: {
  clubId: string;
  /** Solo lo necesita la rama de evento del asistente, que navega a la ficha
   *  recién creada (`/club/[slug]/evento/[id]`) porque un evento ya no aparece
   *  en este listado y cerrar el panel sin más no daba ninguna señal. */
  clubSlug: string;
  isModerator: boolean;
}) {
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
  // La excepción es el evento, que ya no aparece en esta lista: esa rama del
  // asistente navega a su ficha además de cerrar (ver ProposeWizard).
  return (
    <ProposeWizard
      clubId={clubId}
      clubSlug={clubSlug}
      isModerator={isModerator}
      onProposed={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    />
  );
}
