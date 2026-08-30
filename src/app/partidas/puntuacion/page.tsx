import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { PlayFrame } from "@/components/play/play-frame";
import { PlayToolHub } from "@/components/play/tool-hub";
import { ScorePresetChooser, ScorePresetChooserSkeleton } from "@/components/play/score/score-preset-chooser";

export const metadata: Metadata = { title: "Puntuación — Biblioshare" };

// Espejo de src/app/partidas/mtg/page.tsx (léela primero — mismo motivo de
// prerender/isla e identidad ahí explicado). `?preset=` lo lee la ISLA con
// `useSearchParams`, no esta página.
async function Chooser() {
  await connection();
  const user = await getCurrentUser();
  return <ScorePresetChooser identity={user?.id ?? "anon"} />;
}

export default async function ScoreHubPage() {
  const t = await getTranslations("play");
  const steps = ["1", "2", "3"] as const;

  return (
    <PlayFrame>
      <PlayToolHub
        title={t("tools.score.hubTitle")}
        // El CTA viaja DENTRO del selector, no en el hueco `cta`: su destino
        // depende del preset elegido, que es estado de cliente.
        modes={
          <Suspense fallback={<ScorePresetChooserSkeleton />}>
            <Chooser />
          </Suspense>
        }
        footnote={t("tools.score.footnote")}
        // Sin mesa habitual: `table-memory` está tipada a mtg y puntuación
        // no tiene la suya propia todavía (nota de la task 6, sin issue
        // abierta por el implementador — la abre el controlador). El «cómo
        // funciona» genérico (`how-it-works.tsx`) menciona vidas de Magic
        // por su copy compartido, así que aquí va una sección propia breve.
        aside={
          <section>
            <h2 className="mb-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              {t("tools.score.howItWorks.title")}
            </h2>
            <ol className="grid gap-3">
              {steps.map((step) => (
                <li
                  key={step}
                  className="flex gap-3 rounded-card border border-border bg-surface p-4"
                >
                  <span
                    aria-hidden
                    className="font-serif text-[24px] font-semibold leading-none text-accent-ink"
                  >
                    {step}
                  </span>
                  <div>
                    <h3 className="font-serif text-[14px] font-semibold">
                      {t(`tools.score.howItWorks.step${step}Title`)}
                    </h3>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                      {t(`tools.score.howItWorks.step${step}Detail`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        }
      />
    </PlayFrame>
  );
}
