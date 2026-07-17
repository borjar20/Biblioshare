import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LockIcon } from "@/components/ui/icons";

export type SectionTab = "panel" | "coleccion" | "actividad";

// Panel es privado: solo lo ve el dueño. Un visitante ve Colección y Actividad.
const OWNER_TABS: SectionTab[] = ["panel", "coleccion", "actividad"];
const VISITOR_TABS: SectionTab[] = ["coleccion", "actividad"];

export async function SectionTabs({
  active,
  basePath,
  isOwner,
}: {
  active: SectionTab;
  basePath: string;
  isOwner: boolean;
}) {
  const t = await getTranslations("profile.tabs");
  const tabs = isOwner ? OWNER_TABS : VISITOR_TABS;

  return (
    <div className="flex gap-6 border-b border-border">
      {tabs.map((tab) => {
        const isActive = tab === active;
        return (
          <Link
            key={tab}
            href={`${basePath}?tab=${tab}`}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-1 pt-2 pb-3 font-serif text-[15.5px] font-semibold transition-colors ${
              isActive
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "panel" && <LockIcon className="h-3 w-3" />}
            {t(tab)}
          </Link>
        );
      })}
    </div>
  );
}
