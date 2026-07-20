import Image from "next/image";
import { useTranslations } from "next-intl";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";

// Cabecera de la hoja: portada, título y un tinte degradado del color del
// medio (mockup frames A-D, `.hero .tint`). El tinte usa el acento que ya
// define MEDIA_ACCENT — no se inventan colores por tipo aquí.
export function SessionHero({
  itemType,
  title,
  author,
  coverUrl,
  statusLabel,
}: {
  itemType: "book" | "series";
  title: string;
  author: string | null;
  coverUrl: string | null;
  statusLabel: string;
}) {
  const t = useTranslations("session");
  const accent = MEDIA_ACCENT[itemType];

  return (
    // `shrink-0` es la mitad que falta del fix de scroll de session-sheet.tsx:
    // este div es hijo directo del <form> flex-col que scrollea, y aquí mismo
    // tiene `overflow-hidden` (para recortar el tinte degradado de abajo). Esa
    // combinación es la trampa: por la spec de flexbox, el tamaño mínimo
    // automático de un flex item con contenido (el que normalmente le impide
    // encogerse por debajo de su propia altura de contenido) SOLO se aplica si
    // el item tiene `overflow: visible`. En cuanto el item tiene
    // `overflow-hidden` (como aquí, o `auto`/`scroll`), ese suelo desaparece y
    // pasa a valer 0 — el item queda libre para que flex-shrink lo comprima
    // hasta lo que sobre, aunque su contenido (la portada de 104px) no quepa.
    // Medido sin este `shrink-0`: el hero caía a 93px con la serie de 8
    // temporadas mientras la portada de `h-[104px]` seguía fija y se salía
    // 31px por debajo, encima del campo "Fecha". `shrink-0` saca a este div
    // del reparto de flex-shrink: pase lo que pase con el contenido de más
    // abajo, el hero conserva su altura natural y es el <form> (con su propio
    // `overflow-y-auto`, ver session-sheet.tsx) quien scrollea alrededor.
    <div className="relative shrink-0 overflow-hidden px-4 pt-5 pb-4">
      <div
        className={`absolute inset-0 z-0 bg-gradient-to-br ${accent.bgSoft} to-transparent`}
        aria-hidden
      />
      <div className="relative z-10 flex items-end gap-3.5">
        <div className="relative h-[104px] w-[70px] shrink-0 overflow-hidden rounded-[9px] bg-surface-muted shadow-lg">
          {coverUrl && (
            <Image src={coverUrl} alt={title} fill sizes="70px" className="object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1 pb-0.5">
          <p className="font-mono text-[9.5px] tracking-[0.09em] uppercase text-muted-foreground">
            {itemType === "book" ? t("kickerBook") : t("kickerSeries")}
          </p>
          <p className="mt-1.5 font-serif text-[19px] leading-[1.08] font-semibold text-foreground">
            {title}
          </p>
          {author && <p className="mt-1 text-[12px] text-muted-foreground">{author}</p>}
          <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold">
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
