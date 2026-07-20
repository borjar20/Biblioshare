import { getTranslations } from "next-intl/server";

// Eyebrow «Resultados · N» sobre la rejilla (maqueta A/C y frame 3 de Personas):
// mono 11px uppercase. Lo comparten los dos modos de /buscar, cada uno con su
// propio recuento — en Personas la consulta vive dentro de PeopleResults, así
// que el eyebrow se pinta allí en vez de subir el resultado a la página.
export async function ResultsEyebrow({ count }: { count: number }) {
  const t = await getTranslations("search");

  return (
    <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
      {t("resultsCount", { count })}
    </p>
  );
}
