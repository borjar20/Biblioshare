import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { PlayFrame } from "@/components/play/play-frame";
import { PlayToolHub } from "@/components/play/tool-hub";
import { MtgModeChooser, MtgModeChooserSkeleton } from "@/components/play/mtg-mode-chooser";
import { RememberedTableCard } from "@/components/play/remembered-table-card";
import { HowItWorks } from "@/components/play/how-it-works";

export const metadata: Metadata = { title: "Magic — Biblioshare" };

// El hub por herramienta. `?modo=` deja enlazar directo a un modo, pero el parámetro
// lo lee la ISLA con `useSearchParams`, no esta página: un `await searchParams` aquí
// arriba saca la ruta entera del prerender («runtime data during prerendering», con
// Cache Components) y el armazón deja de ser estático para leer una palabra que solo
// afecta a qué botón sale marcado.
//
// La identidad se lee bajo su propio boundary (`connection()` antes de la sesión,
// mismo motivo que en `app-shell.tsx`): el chooser arranca partidas él mismo y el
// store se aísla por identidad (#680). La mesa habitual la necesita por lo mismo.
async function Chooser() {
  await connection();
  const user = await getCurrentUser();
  return <MtgModeChooser identity={user?.id ?? "anon"} />;
}

async function Habitual() {
  await connection();
  const user = await getCurrentUser();
  return <RememberedTableCard identity={user?.id ?? "anon"} />;
}

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
            <Chooser />
          </Suspense>
        }
        // La regla que sorprende, al pie y en prosa: el motor detecta vida ≤ 0,
        // veneno ≥ 10 y 21 de un comandante, y aun así deja la decisión en la mesa.
        footnote={t("tools.mtg.footnote")}
        aside={
          <>
            <Suspense fallback={null}>
              <Habitual />
            </Suspense>
            <HowItWorks />
          </>
        }
      />
    </PlayFrame>
  );
}
