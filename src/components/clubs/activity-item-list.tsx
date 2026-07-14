"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addOpinion, type ActivityDetail, type ActivityItem } from "@/lib/clubs/activities/core";
import { itemHref } from "@/lib/catalog/item-href";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/social/user-avatar";
import { ChevronDownIcon } from "@/components/ui/icons";

// Lista de ítems del detalle de actividad, de SOLO LECTURA: añadir/quitar vive
// en el panel "Modificar actividad". Cada fila se expande para ver las
// opiniones y dejar la tuya ahí mismo (decisión del usuario: valoración y
// comentario dentro de la ficha de cada ítem, no en una sección aparte).
// Las opiniones siguen gateadas a participantes (RLS, SD-8): a un
// no-participante las filas solo le enlazan a la ficha del ítem.
export function ActivityItemList({
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

  if (activity.items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {activity.items.map((item) => (
        <ItemRow
          key={item.id}
          activityId={activity.id}
          item={item}
          viewerId={viewerId}
          isParticipant={isParticipant}
          opinions={activity.opinions.filter(
            (o) => o.itemId === item.itemId && o.itemType === item.itemType,
          )}
          onChanged={onChanged}
        />
      ))}
      {!isParticipant && <p className="text-xs text-muted-foreground">{t("opinionsLocked")}</p>}
    </div>
  );
}

function ItemRow({
  activityId,
  item,
  viewerId,
  isParticipant,
  opinions,
  onChanged,
}: {
  activityId: string;
  item: ActivityItem;
  viewerId: string;
  isParticipant: boolean;
  opinions: ActivityDetail["opinions"];
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const [open, setOpen] = useState(false);
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
          item.itemType,
          item.itemId,
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
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <div className="flex items-center gap-2.5 px-3 py-2">
        <Link
          href={itemHref(item.itemType, item.itemId)}
          className="flex min-w-0 flex-1 items-center gap-2.5 hover:text-accent"
        >
          {item.itemCoverUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage
            <img
              src={item.itemCoverUrl}
              alt=""
              className="h-12 w-8 shrink-0 rounded-[4px] object-cover"
            />
          )}
          <span className="min-w-0 flex-1 truncate font-serif text-sm font-semibold">
            {item.itemTitle}
          </span>
        </Link>
        {isParticipant && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex shrink-0 items-center gap-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase hover:text-foreground"
          >
            {t("opinionsToggle", { count: opinions.length })}
            <ChevronDownIcon
              aria-hidden
              className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      {open && isParticipant && (
        <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
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
                    <span className="font-medium text-foreground">
                      {o.displayName || o.username}
                    </span>
                    {o.rating != null && <span className="font-mono"> · {o.rating}/10</span>}
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
      )}
    </div>
  );
}
