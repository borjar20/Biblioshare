"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addOpinion, type ActivityDetail } from "@/lib/clubs/activities/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/social/user-avatar";

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
        <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("opinions")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("opinionsLocked")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {t("opinions")}
      </h2>
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

  const others = opinions.filter((o) => o.userId !== viewerId);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
      <span className="font-serif text-sm font-semibold text-foreground">{itemTitle}</span>

      {others.length > 0 && (
        <div className="flex flex-col gap-2">
          {others.map((o) => (
            <div key={o.userId} className="flex items-start gap-2">
              <UserAvatar
                name={o.displayName || o.username}
                avatarUrl={o.avatarUrl}
                size={24}
              />
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">{o.displayName || o.username}</span>
                {o.rating != null && (
                  <span className="font-mono"> · {o.rating}/10</span>
                )}
                {o.comment && <> — {o.comment}</>}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {t("opinionRating")}
          <Input
            type="number"
            min={1}
            max={10}
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="w-16"
          />
        </label>
        <Input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("opinionCommentPlaceholder")}
          className="min-w-0 flex-1"
        />
        <Button
          type="button"
          className="px-3.5 py-1.5 text-xs whitespace-nowrap"
          disabled={isPending || (!rating && !comment.trim())}
          onClick={submit}
        >
          {t("opinionSubmit")}
        </Button>
      </div>
      {error && <p className="text-xs text-status-dropped">{error}</p>}
    </div>
  );
}
