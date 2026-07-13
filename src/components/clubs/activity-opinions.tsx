"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addOpinion, type ActivityDetail } from "@/lib/clubs/activities/core";
import { Button } from "@/components/ui/button";

export function ActivityOpinions({
  activity,
  viewerId,
  isParticipant,
  onChanged,
}: {
  activity: ActivityDetail;
  viewerId: string;
  isParticipant: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("activity");

  if (!isParticipant) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("opinions")}</h2>
        <p className="text-xs text-muted-foreground">{t("opinionsLocked")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">{t("opinions")}</h2>
      {activity.items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("noOpinionsYet")}</p>
      ) : (
        activity.items.map((item) => (
          <OpinionItemSection
            key={item.id}
            activityId={activity.id}
            itemId={item.itemId}
            itemType={item.itemType}
            itemTitle={item.itemTitle}
            viewerId={viewerId}
            opinions={activity.opinions.filter((o) => o.itemId === item.itemId && o.itemType === item.itemType)}
            onChanged={onChanged}
          />
        ))
      )}
    </div>
  );
}

function OpinionItemSection({
  activityId,
  itemId,
  itemType,
  itemTitle,
  viewerId,
  opinions,
  onChanged,
}: {
  activityId: string;
  itemId: string;
  itemType: ActivityDetail["items"][number]["itemType"];
  itemTitle: string;
  viewerId: string;
  opinions: ActivityDetail["opinions"];
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const own = opinions.find((o) => o.userId === viewerId);
  const [rating, setRating] = useState(own?.rating?.toString() ?? "");
  const [comment, setComment] = useState(own?.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await addOpinion(
          activityId,
          itemType,
          itemId,
          rating ? Number(rating) : undefined,
          comment || undefined,
        );
        onChanged();
      } catch {
        setError(t("opinionError"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <span className="text-sm font-medium text-foreground">{itemTitle}</span>
      <div className="flex flex-col gap-1">
        {opinions
          .filter((o) => o.userId !== viewerId)
          .map((o) => (
            <p key={o.userId} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{o.displayName || o.username}</span>
              {o.rating != null && <> · {o.rating}/10</>}
              {o.comment && <> — {o.comment}</>}
            </p>
          ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("opinionRating")}
          <input
            type="number"
            min={1}
            max={10}
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("opinionCommentPlaceholder")}
          className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <Button type="button" disabled={isPending || (!rating && !comment.trim())} onClick={submit}>
          {t("opinionSubmit")}
        </Button>
      </div>
      {error && <p className="text-xs text-status-dropped">{error}</p>}
    </div>
  );
}
