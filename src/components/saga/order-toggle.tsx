import Link from "next/link";
import { getTranslations } from "next-intl/server";

// Toggle Lectura|Publicación (spec §2.4): dos links con searchParam — SSR, sin
// estado cliente. `base` es el path de la ficha; se conserva ?tab=mapa.
export async function OrderToggle({ base, orden }: { base: string; orden: "lectura" | "publicacion" }) {
  const t = await getTranslations("saga");
  const cls = (on: boolean) =>
    `flex-1 rounded-lg px-1 py-2 text-center text-xs font-semibold ${
      on ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground"
    }`;
  return (
    <div className="flex gap-1 rounded-xl bg-surface-muted p-1">
      <Link href={`${base}?tab=mapa`} className={cls(orden === "lectura")} replace scroll={false}>
        {t("orderReading")}
      </Link>
      <Link href={`${base}?tab=mapa&orden=publicacion`} className={cls(orden === "publicacion")} replace scroll={false}>
        {t("orderPublication")}
      </Link>
    </div>
  );
}
