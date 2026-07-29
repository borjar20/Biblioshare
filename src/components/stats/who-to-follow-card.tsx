import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UserAvatar } from "@/components/social/user-avatar";
import { followUser } from "@/lib/social/actions";
import type { PersonSuggestion } from "@/lib/onboarding/get-social-suggestions";

// "A quién seguir" (sidebar PC). Se degrada a null si no hay sugerencias.
export async function WhoToFollowCard({ suggestions }: { suggestions: PersonSuggestion[] }) {
  if (suggestions.length === 0) return null;
  const t = await getTranslations("whoToFollow");
  const shown = suggestions.slice(0, 3);

  return (
    <div className="rounded-card border border-border bg-surface shadow-card p-4">
      <p className="mb-3 font-serif text-[15px] font-semibold">{t("title")}</p>
      <div className="flex flex-col gap-3">
        {shown.map((p) => (
          <div key={p.userId} className="flex items-center gap-2.5">
            <Link href={`/u/${p.username}`}>
              <UserAvatar name={p.displayName || p.username} avatarUrl={p.avatarUrl} size={34} />
            </Link>
            <Link href={`/u/${p.username}`} className="min-w-0 flex-1 text-sm font-medium hover:underline">
              {p.displayName || p.username}
            </Link>
            <form action={followUser.bind(null, p.userId)}>
              <button
                type="submit"
                className="rounded-lg border border-border px-3 py-1 font-mono text-[10px] tracking-[0.06em] uppercase text-accent hover:bg-surface-muted"
              >
                {t("follow")}
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
