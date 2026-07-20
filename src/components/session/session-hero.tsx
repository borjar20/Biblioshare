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
    // `z-0` NO es decorativo y no sobra por ser "cero": es lo que confina el
    // `z-10` de la fila de dentro. `relative` a secas deja el z-index en `auto`,
    // que NO crea contexto de apilado, así que ese `z-10` interior subía al
    // contexto del <form> y competía de tú a tú con el `z-10` de la cabecera
    // pegajosa (session-sheet.tsx) — mismo número, y a igualdad gana el que va
    // después en el DOM, o sea el hero. Resultado medido: al hacer scroll, la
    // portada y el título se pintaban ENCIMA de "Registrar sesión" y del ✕ en
    // vez de pasar por debajo. Con `z-0` el hero se convierte en su propio
    // contexto de apilado: su `z-10` queda encerrado aquí dentro (sigue
    // ordenando portada+textos sobre el tinte, que es su único cometido) y el
    // bloque entero se sitúa por debajo de la cabecera.
    <div className="relative z-0 shrink-0 overflow-hidden px-4 pt-5 pb-4">
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
