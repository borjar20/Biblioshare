"use client";

import { useTranslations } from "next-intl";
import type { JointPerson } from "@/lib/social/joint-viewings";
import { UserAvatar } from "@/components/social/user-avatar";

// Selector de acompañantes de un visionado conjunto (#1220): una ficha por
// seguido mutuo que se enciende al tocarla. Lo comparten la hoja de cierre
// («¿Con quién la viste?», en el mismo gesto de terminar) y la hoja del diario.
// Sin estado propio: quien lo usa guarda la selección y carga la lista.
export function JointCompanionsPicker({
  people,
  selected,
  onToggle,
  loading = false,
}: {
  people: JointPerson[];
  selected: ReadonlySet<string>;
  onToggle: (userId: string) => void;
  loading?: boolean;
}) {
  const t = useTranslations("passes.jointSheet");

  if (loading) return <p className="text-xs text-muted-foreground">{t("loading")}</p>;
  if (people.length === 0) return <p className="text-xs text-muted-foreground">{t("noMutuals")}</p>;

  return (
    <ul className="flex flex-wrap gap-1.5">
      {people.map((p) => {
        const name = p.displayName || p.username;
        const on = selected.has(p.userId);
        return (
          <li key={p.userId}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(p.userId)}
              className={`flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-xs transition-colors ${
                on
                  ? "border-accent bg-accent/15 text-foreground"
                  : "border-border bg-surface-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <UserAvatar name={name} avatarUrl={p.avatarUrl} size={20} />
              <span className="max-w-[9rem] truncate">{name}</span>
              {on && <span aria-hidden>✓</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
