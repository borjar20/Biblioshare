"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ChallengeProgress } from "@/lib/challenges/types";
import {
  setChallengeArchived,
  deleteChallenge,
} from "@/lib/challenges/actions";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ChallengeForm } from "./challenge-form";

export function ChallengeCard({ progress }: { progress: ChallengeProgress }) {
  const t = useTranslations("challenges");
  const tTypes = useTranslations("search.types");
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const { challenge, completed, rawCompleted } = progress;
  const isArchived = challenge.archivedAt !== null;
  const isDone = rawCompleted >= challenge.targetCount;

  if (editing) {
    return <ChallengeForm challenge={challenge} onDone={() => setEditing(false)} />;
  }

  const accentText = challenge.itemType
    ? MEDIA_ACCENT[challenge.itemType].text
    : "text-accent";

  return (
    <div
      // El e2e ancla aquí. Antes se agarraba a `div.rounded-lg`, y se rompía
      // cada vez que cambiaba el estilo de la tarjeta.
      data-testid="challenge-card"
      className={`flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4 ${
        isArchived ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="truncate font-medium text-foreground">{challenge.name}</h2>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className={accentText}>
              {challenge.itemType ? tTypes(challenge.itemType) : t("anyType")}
            </span>
            {challenge.criteria.genre && <span>· {challenge.criteria.genre}</span>}
            <span>
              · {t("dateRange", { start: challenge.startDate, end: challenge.endDate })}
            </span>
          </div>
        </div>
        <span className={`shrink-0 text-sm font-semibold ${isDone ? "text-status-completed" : "text-foreground"}`}>
          {isDone ? t("completed") : t("progress", { completed, target: challenge.targetCount })}
        </span>
      </div>

      <ProgressBar current={completed} total={challenge.targetCount} />

      <div className="flex gap-3 text-xs text-muted-foreground">
        <button
          type="button"
          className="hover:text-foreground"
          onClick={() => setEditing(true)}
        >
          {t("edit")}
        </button>
        <button
          type="button"
          disabled={isPending}
          className="hover:text-foreground disabled:opacity-60"
          onClick={() =>
            startTransition(() => setChallengeArchived(challenge.id, !isArchived))
          }
        >
          {isArchived ? t("unarchive") : t("archive")}
        </button>
        <button
          type="button"
          disabled={isPending}
          className="hover:text-status-dropped disabled:opacity-60"
          onClick={() => startTransition(() => deleteChallenge(challenge.id))}
        >
          {t("delete")}
        </button>
      </div>
    </div>
  );
}
