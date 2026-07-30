"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";

// Oculta su contenido hasta el clic. Solo UI: el body ya vino del servidor (es
// una nota PÚBLICA), pero si está marcada como spoiler no se pinta de entrada.
export function SpoilerGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations("feed");
  const [shown, setShown] = useState(false);
  if (shown) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={() => setShown(true)}
      className="w-full rounded-md border border-dashed border-border bg-surface-muted px-3 py-2 text-left font-mono text-[10px] tracking-[0.06em] uppercase text-muted-foreground hover:text-foreground"
    >
      {t("progress.showSpoiler")}
    </button>
  );
}
