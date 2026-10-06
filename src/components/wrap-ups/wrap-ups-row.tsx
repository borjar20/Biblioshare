// Fila «Tus crónicas» al principio del muro de /estadisticas: TODOS los
// wrap-ups, también los quiet (spec §5). Servidor, sin `use cache` (#437).
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getOwnWrapUps, type OwnWrapUp } from "@/lib/wrap-ups/get-own-wrap-ups";
import { periodLabel } from "@/lib/wrap-ups/view-models";

export async function WrapUpsRow() {
  let all: OwnWrapUp[];
  try {
    all = await getOwnWrapUps();
  } catch (e) {
    // Un fallo aquí (tabla o grant ausente) no debe tumbar /estadisticas.
    console.error("WrapUpsRow: no se pudieron leer los wrap-ups", e instanceof Error ? e.message : "error");
    return null;
  }
  if (all.length === 0) return null;
  const t = await getTranslations("wrapUps.entry");
  return (
    <section aria-labelledby="wrap-ups-row-heading" className="mb-6">
      <h2 id="wrap-ups-row-heading" className="label-section mb-2">
        {t("rowTitle")}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {all.map((w) => (
          <li key={w.kind}>
            <Link
              href={`/wrap/${w.kind}`}
              data-unseen={w.payload.intensity === "full" && w.seenAt === null ? "true" : "false"}
              className="inline-flex min-h-11 items-center rounded-card border border-border bg-surface px-3 text-[13px] text-foreground hover:border-accent data-[unseen=true]:border-accent"
            >
              {periodLabel(w.payload)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
