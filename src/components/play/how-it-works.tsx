import { getTranslations } from "next-intl/server";

/**
 * «Cómo funciona», en tres pasos que SÍ son una secuencia (elegir → empezar → jugar),
 * por eso van numerados. Es la otra mitad del arreglo del vacío en escritorio
 * (revisión UX 2026-08-30): donde no hay contenido real que proyectar, se explica lo
 * que la herramienta hace — que es información, no promesa.
 *
 * `columns` decide si los pasos se tienden en tres columnas (hub de Partidas, ancho
 * completo) o se apilan (columna lateral del hub de Magic).
 */
export async function HowItWorks({ columns = false }: { columns?: boolean }) {
  const t = await getTranslations("play");
  const steps = ["1", "2", "3"] as const;

  return (
    <section>
      <h2 className="mb-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {t("howItWorks.title")}
      </h2>
      <ol className={`grid gap-3 ${columns ? "sm:grid-cols-3" : ""}`}>
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
                {t(`howItWorks.step${step}Title`)}
              </h3>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                {t(`howItWorks.step${step}Detail`)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
