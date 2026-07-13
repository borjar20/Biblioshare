"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

// Error boundary de la app (Paper - Estados.html, frame 5). Antes no había
// ninguno: un fallo de carga mostraba la pantalla de error cruda de Next.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      glyph={<AlertIcon className="h-7 w-7" />}
      title={t("loadTitle")}
      message={t("loadMessage")}
      action={
        // reset() reintenta el segmento sin recargar la página entera, que es
        // lo que queremos aquí (a diferencia del offline, que sí recarga).
        <Button type="button" onClick={reset}>
          {t("retry")}
        </Button>
      }
    />
  );
}
