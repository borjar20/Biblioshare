"use client";

import { useTranslations } from "next-intl";
import { UserAvatar } from "@/components/social/user-avatar";

// Fila de clasificación de un participante (mockup "member-rank", frames de
// reto de lista y reto genérico): avatar, nombre, barra corta y contador mono.
const FILL_CLASSES: Record<"accent" | "green", string> = {
  accent: "bg-accent",
  green: "bg-green",
};

export function MemberRankRow({
  name,
  avatarUrl,
  isViewer,
  percent,
  counter,
  fill,
  position,
}: {
  name: string;
  avatarUrl: string | null;
  isViewer: boolean;
  percent: number;
  counter: string;
  fill: "accent" | "green";
  /** Puesto en la clasificación; solo tiene sentido en modo competitivo. */
  position?: number;
}) {
  const t = useTranslations("activity");
  const p = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div className="flex items-center gap-2.5 border-t border-border py-2.5">
      {position !== undefined && (
        <span className="w-5 shrink-0 text-center font-mono text-xs text-muted-foreground">
          {position}
        </span>
      )}
      <UserAvatar name={name} avatarUrl={avatarUrl} size={30} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground">
        {isViewer ? t("you") : name}
      </span>
      <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-surface-muted">
        <span
          className={`block h-full rounded-full ${FILL_CLASSES[fill]}`}
          style={{ width: `${p}%` }}
        />
      </span>
      <span className="min-w-[34px] shrink-0 text-right font-mono text-[10.5px] text-muted-foreground">
        {counter}
      </span>
    </div>
  );
}
