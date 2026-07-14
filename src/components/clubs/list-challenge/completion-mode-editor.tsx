"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ActivityStatus } from "@/lib/clubs/activities/core";
import { setCompletionMode } from "@/lib/clubs/activities/list-challenge";
import {
  COMPLETION_MODES,
  readCompletionMode,
  type CompletionMode,
} from "@/lib/clubs/activities/list-challenge-types";
import type { Json } from "@/lib/supabase/database.types";
import { Select } from "@/components/ui/select";

// Cambiar la modalidad de compleción de un reto YA CREADO (EPIC-05, Bloque H3b).
// Vive en el panel "Modificar actividad", junto a la curación del pool y los hitos
// de buddy_read.
//
// A diferencia del config de los demás kinds (que update_activity_config congela al
// activar), esta se puede cambiar con el reto en marcha -- decisión explícita: deja
// rescatar un reto que ahuyentó a la gente por exigir revisionado. El precio es que
// el tablero de TODOS se recalcula al instante, y por eso hay confirmación cuando el
// reto ya está 'active'. En 'proposed' no la hay: no hay progreso que mover.
export function CompletionModeEditor({
  activityId,
  config,
  status,
  onChanged,
}: {
  activityId: string;
  config: Json | null;
  status: ActivityStatus;
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const [mode, setMode] = useState<CompletionMode>(readCompletionMode(config));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function change(next: CompletionMode) {
    if (next === mode) return;
    if (status === "active" && !window.confirm(t("completionModeConfirm"))) return;

    const previous = mode;
    setError(null);
    setMode(next); // optimista -- el select no debe quedarse pegado mientras va la RPC
    startTransition(async () => {
      try {
        await setCompletionMode(activityId, next);
        onChanged();
      } catch {
        setMode(previous);
        setError(t("completionModeError"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-2">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("completionMode")}
        <Select
          value={mode}
          disabled={isPending}
          onChange={(e) => change(e.target.value as CompletionMode)}
        >
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
      {error && <p className="text-[11px] text-status-dropped">{error}</p>}
    </div>
  );
}
