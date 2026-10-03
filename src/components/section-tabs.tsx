import Link from "next/link";
import { getTranslations } from "next-intl/server";

export type SectionTab = "actividad" | "coleccion" | "experiencias";

// El perfil reúne lo que comparte la persona. Sus herramientas viven en
// Biblioteca; la biblioteca del dueño se abre directamente desde /coleccion.
const OWNER_TABS: SectionTab[] = ["actividad", "experiencias"];
const VISITOR_TABS: SectionTab[] = ["actividad", "experiencias", "coleccion"];


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
    <div className="flex gap-4 overflow-x-auto border-b border-border sm:gap-6">
      {tabs.map((tab) => {
        const isActive = tab === active;
        return (
          <Link
            key={tab}
            href={`${basePath}?tab=${tab}`}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-1 pt-2 pb-3 font-serif text-[15.5px] font-semibold transition-colors ${
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
