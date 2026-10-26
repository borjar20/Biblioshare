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

  // La línea base es una sombra interior y no un border-b: con overflow-x-auto
  // el eje Y también recorta, y el -mb-px que usaban las pestañas para pisar
  // el borde creaba un scroll vertical de 1px.
  return (
    <div className="flex gap-4 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-border)] sm:gap-6">
      {tabs.map((tab) => {
        const isActive = tab === active;
        return (
          <Link
            key={tab}
            href={`${basePath}?tab=${tab}`}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 border-b-2 px-1 pt-2 pb-3 font-serif text-[15.5px] font-semibold transition-colors ${
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
