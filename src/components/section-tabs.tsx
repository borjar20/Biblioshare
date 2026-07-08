import Link from "next/link";
import { getTranslations } from "next-intl/server";

export type SectionTab = "overview" | "book" | "movie" | "series";

const TABS: SectionTab[] = ["overview", "movie", "series", "book"];

export async function SectionTabs({
  active,
  basePath,
}: {
  active: SectionTab;
  basePath: string;
}) {
  const t = await getTranslations("profile.tabs");

  return (
    <div className="flex gap-6 border-b border-border">
      {TABS.map((tab) => {
        const href = tab === "overview" ? basePath : `${basePath}?tab=${tab}`;
        const isActive = tab === active;
        return (
          <Link
            key={tab}
            href={href}
            className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium tracking-wide uppercase transition-colors ${
              isActive
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(tab)}
          </Link>
        );
      })}
    </div>
  );
}
