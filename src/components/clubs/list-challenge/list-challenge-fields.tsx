"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Json } from "@/lib/supabase/database.types";
import {
  COMPLETION_MODES,
  type CompletionMode,
} from "@/lib/clubs/activities/list-challenge-types";
import { Select } from "@/components/ui/select";

// Campos de configuración del reto por lista en el composer (EPIC-05, Bloque H3b).
// Se enchufan vía ActivityKindDefinition.ConfigFields, igual que los del criterio
// de H4 -- el composer genérico no sabe nada de modalidades, solo pinta lo que el
// kind aporte y manda el config resultante a proposeActivity.
//
// La ayuda bajo el selector no es decorativa: la modalidad decide si a un miembro
// con media lista ya leída le toca revisionar. Sin ella, el selector es un enigma.
export function ListChallengeFields({
  onChange,
}: {
  value: Json | null;
  onChange: (config: Json) => void;
}) {
  const t = useTranslations("activity");
  const [mode, setMode] = useState<CompletionMode>("window");

  // `onChange` es el setState del composer (estable). El config se recompone entero
  // en cada cambio, como en CriteriaChallengeFields.
  useEffect(() => {
    onChange({ completionMode: mode } as unknown as Json);
  }, [mode, onChange]);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-2">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("completionMode")}
        <Select value={mode} onChange={(e) => setMode(e.target.value as CompletionMode)}>
          {COMPLETION_MODES.map((m) => (
            <option key={m} value={m}>
              {t(`completionMode_${m}`)}
            </option>
          ))}
        </Select>
      </label>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t(`completionModeHint_${mode}`)}
      </p>
    </div>
  );
}
