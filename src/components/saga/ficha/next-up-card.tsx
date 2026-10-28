import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { Shelf } from "@/lib/sagas/derive-shelf";

// «Te toca» (spec 2026-10-27 §3). Lleva a la ficha de la obra: empezar un pase
// es cosa de su PassCard, aquí no se duplica esa lógica.
export async function NextUpCard({ shelf }: { shelf: Shelf }) {
  if (shelf.mode === "empty") return null;

  const t = await getTranslations("saga");
  const card = "rounded-[14px] border border-border bg-surface p-4";

  if (shelf.mode === "finished") {
    return (
      <section className={card} data-testid="next-up">
        <p className="font-mono text-[10px] tracking-[0.14em] text-green uppercase">{t("nextUpFinished")}</p>
        <p className="mt-1 text-sm text-foreground-soft">{t("nextUpFinishedText")}</p>
      </section>
    );
  }
  if (shelf.mode === "allOptional") {
    return (
      <section className={card} data-testid="next-up">
        <p className="text-sm text-foreground-soft">{t("allOptional")}</p>
      </section>
    );
  }

  const next = shelf.nextUp;
  if (!next) return null;
  const { work } = next;
  const bold = { b: (chunks: ReactNode) => <b>{chunks}</b> };
  // Sin grupo (saga sin subsagas) ni número (ventana, rama) no hay línea.
  const meta = [next.groupName, work.no !== null && t("orderNo", { n: work.no })].filter(Boolean).join(" · ");

  return (
    <section className={`${card} flex gap-4`} data-testid="next-up">
      <div className="relative h-[90px] w-[60px] shrink-0 overflow-hidden rounded-[4px] bg-surface-muted shadow-cover">
        {work.coverUrl && <Image src={work.coverUrl} alt="" fill sizes="60px" className="object-cover" />}
      </div>
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.14em] text-accent uppercase">
          {shelf.mode === "start" ? t("nextUpStart") : t("nextUpEyebrow")}
        </p>
        <h2 className="mt-0.5 font-serif text-lg leading-tight font-semibold">{work.title}</h2>
        {meta && <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{meta}</p>}
        {next.fitsNow && (
          <p className="mt-1 text-xs text-muted-foreground">
            <Link href={next.fitsNow.href} className="underline-offset-2 hover:underline">
              {t.rich("nextUpFitsNow", { title: next.fitsNow.title, ...bold })}
            </Link>
          </p>
        )}
        <Link
          href={work.href}
          className="mt-3 inline-flex rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent-hover"
        >
          {t("nextUpGo")}
        </Link>
      </div>
    </section>
  );
}
