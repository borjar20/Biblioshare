import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { TodayHeader } from "./today-header";

// Estado 4 (usuario nuevo o casi sin contenido): descubrimiento, no error. Un
// solo bloque editorial con dos salidas —Buscar y Colección—; nada de stats ni
// actividad social, que pertenecen a las otras columnas.
export async function EmptyDiscovery() {
  const t = await getTranslations("today");
  return (
    <section className="flex flex-col gap-3">
      <TodayHeader title={t("emptyTitle")} />
      <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-5 shadow-card sm:flex-row sm:items-center">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t("emptyBody")}
        </p>
        <div className="flex flex-wrap gap-2 sm:ml-auto sm:shrink-0">
          <Link href="/buscar" className={buttonVariants("primary")}>
            {t("emptySearch")}
          </Link>
          <Link href="/coleccion" className={buttonVariants("secondary")}>
            {t("emptyExplore")}
          </Link>
        </div>
      </div>
    </section>
  );
}
