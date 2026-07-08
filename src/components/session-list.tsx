"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { formatPosition } from "@/lib/library/position";
import type { ProgressSession } from "@/lib/sessions/types";
import { deleteSession } from "@/lib/sessions/actions";

export function SessionList({
  entryId,
  itemType,
  itemId,
  sessions,
}: {
  entryId: string;
  itemType: ItemType;
  itemId: string;
  sessions: ProgressSession[];
}) {
  const t = useTranslations("item.sessions");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
        <Link
          href={`/sesion/${entryId}`}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          {t("add")}
        </Link>
      </div>

      {sessions.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((session) => {
            const meta = [
              formatPosition(itemType, session.position),
              session.durationMinutes != null
                ? t("duration", { count: session.durationMinutes })
                : null,
            ].filter(Boolean);
            return (
              <li
                key={session.id}
                className="flex flex-col gap-1 border-b border-border pb-2 text-xs last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {session.sessionDate}
                    {meta.length > 0 ? ` · ${meta.join(" · ")}` : ""}
                  </span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(() =>
                        deleteSession(session.id, itemType, itemId)
                      )
                    }
                    className="text-muted-foreground underline hover:text-status-dropped disabled:opacity-60"
                  >
                    {t("delete")}
                  </button>
                </div>
                {session.note && (
                  <p className="text-muted-foreground">{session.note}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
