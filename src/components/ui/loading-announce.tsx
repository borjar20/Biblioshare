import { getTranslations } from "next-intl/server";

// Anuncio accesible del estado de carga. Server component (usa i18n de
// servidor): toma `common.loading`. Vive aparte de `ui/skeleton.tsx` para que
// esos primitivos sigan siendo importables desde client components. Un sync
// parent puede renderizarlo sin ser async él mismo.
export async function LoadingAnnounce() {
  const t = await getTranslations("common");
  return (
    <span role="status" className="sr-only">
      {t("loading")}
    </span>
  );
}
