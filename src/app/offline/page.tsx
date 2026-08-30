import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { OfflineIcon } from "@/components/ui/icons";
import { OfflineRetry } from "./offline-retry";

// Este documento se sirve también como FALLBACK del SW ante cualquier
// navegación sin red — con la URL original intacta en la barra. OfflineRetry
// aprovecha justo eso: si la URL pendiente es /sesion/… (registro desde el
// widget/notificación), el reintento recarga ESA URL y ofrece la copia
// adaptada. «Ir al inicio» sigue disponible: desde el fix widget→sesión
// offline ya no destruye nada — el cronómetro nativo sigue vivo (pausado) en
// la notificación/widget hasta que el registro se confirma.
export default async function OfflinePage() {
  const t = await getTranslations("offline");

  return (
    <EmptyState
      glyph={<OfflineIcon className="h-7 w-7" />}
      title={t("title")}
      message={t("description")}
      action={
        <OfflineRetry
          retryLabel={t("retry")}
          retrySessionLabel={t("retrySession")}
          sessionSafeText={t("sessionSafe")}
        />
      }
      secondary={
        <Link
          href="/"
          className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {t("backHome")}
        </Link>
      }
    />
  );
}
