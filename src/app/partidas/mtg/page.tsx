import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PlayFrame } from "@/components/play/play-frame";
import { PlayToolHub } from "@/components/play/tool-hub";
import { MtgModeChooser, MtgModeChooserSkeleton } from "@/components/play/mtg-mode-chooser";

export const metadata: Metadata = { title: "Magic — Biblioshare" };

// El hub por herramienta. `?modo=` deja enlazar directo a un modo, pero el parámetro
// lo lee la ISLA con `useSearchParams`, no esta página: un `await searchParams` aquí
// arriba saca la ruta entera del prerender («runtime data during prerendering», con
// Cache Components) y el armazón deja de ser estático para leer una palabra que solo
// afecta a qué botón sale marcado.
export default async function MtgHubPage() {
  const t = await getTranslations("play");

  return (
    <PlayFrame>
      <PlayToolHub
        title={t("tools.mtg.hubTitle")}
        // El CTA viaja DENTRO del selector, no en el hueco `cta` de la plantilla: su
        // texto y su destino dependen del modo elegido, que es estado de cliente. El
        // hueco `cta` se queda para herramientas cuyo botón no depende de nada.
        modes={
          <Suspense fallback={<MtgModeChooserSkeleton />}>
            <MtgModeChooser />
          </Suspense>
        }
        // La regla que sorprende, al pie y en prosa: el motor detecta vida ≤ 0,
        // veneno ≥ 10 y 21 de un comandante, y aun así deja la decisión en la mesa.
        footnote={t("tools.mtg.footnote")}
      />
    </PlayFrame>
  );
}
