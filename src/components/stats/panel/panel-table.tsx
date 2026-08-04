// La tabla: donde se consultan los valores exactos. Es la fuente accesible del
// panel — el gráfico va `aria-hidden` justamente para que ESTA sea la que lea
// el lector de pantalla, sin dobles lecturas que puedan desincronizarse.
//
// Se calcula desde el mismo `PanelSpec` que el resumen y el gráfico, así que no
// puede discrepar de ellos.

import Link from "next/link";
import { defaultColumns, partValue, type PanelDerived } from "@/lib/stats/panel/derive";
import { formatShare, formatValue, NO_DATA } from "@/lib/stats/panel/format";
import type { PanelDatum, PanelSpec } from "@/lib/stats/panel/types";

const TH = "px-2 py-1.5 text-left font-medium text-muted-foreground";
// `text-left` explícito: un `<th>` se centra por defecto, y las etiquetas de
// fila salían centradas en su columna.
const TD = "px-2 py-1.5 text-left align-baseline";
const NUM = "text-right font-mono tabular-nums";

function LabelCell({ datum }: { datum: PanelDatum }) {
  return datum.href ? (
    <Link href={datum.href} className="underline underline-offset-2 hover:text-accent">
      {datum.label}
    </Link>
  ) : (
    <>{datum.label}</>
  );
}

export function PanelTable({
  spec,
  derived,
}: {
  spec: PanelSpec;
  derived: PanelDerived;
}) {
  // Con total 0 la cuota de cada fila es 0/0, o sea indefinida: la columna
  // entera saldría «Sin datos» siete veces y no diría nada. Mejor no existir.
  const cols = defaultColumns(spec).filter(
    (c) => c !== "share" || derived.total > 0,
  );
  // Un apilado añade una columna por serie: sin ellas, el desglose solo existiría
  // en los colores del gráfico.
  const seriesCols = spec.viz === "stacked" ? derived.series : [];
  const valueHeader = spec.valueHeader ?? capitalize(spec.unit.many);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <caption className="sr-only">
          {spec.title}. {contextSentence(spec)}
        </caption>
        <thead>
          <tr className="border-b border-border">
            {cols.includes("label") && (
              <th scope="col" className={TH}>
                {spec.labelHeader ?? "Categoría"}
              </th>
            )}
            {seriesCols.map((s) => (
              <th key={s.key} scope="col" className={`${TH} ${NUM}`}>
                {s.label}
              </th>
            ))}
            {cols.includes("value") && (
              <th scope="col" className={`${TH} ${NUM}`}>
                {valueHeader}
              </th>
            )}
            {cols.includes("share") && (
              <th scope="col" className={`${TH} ${NUM}`}>
                Cuota
              </th>
            )}
            {cols.includes("detail") && (
              <th scope="col" className={TH}>
                Detalle
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {spec.data.map((d) => (
            <tr key={d.key} className="border-b border-border/50 last:border-0">
              {cols.includes("label") && (
                <th scope="row" className={`${TD} font-normal text-foreground`}>
                  <LabelCell datum={d} />
                </th>
              )}
              {seriesCols.map((s) => (
                <td key={s.key} className={`${TD} ${NUM} text-muted-foreground`}>
                  {formatValue(partValue(d, s.key))}
                </td>
              ))}
              {cols.includes("value") && (
                <td
                  className={`${TD} ${NUM} ${
                    d.value === null ? "text-foreground-faint italic" : "text-foreground"
                  }`}
                >
                  {formatValue(d.value, spec.unit)}
                </td>
              )}
              {cols.includes("share") && (
                <td className={`${TD} ${NUM} text-muted-foreground`}>
                  {formatShare(d.value, derived.total)}
                </td>
              )}
              {cols.includes("detail") && (
                <td className={`${TD} text-muted-foreground`}>{d.detail ?? "—"}</td>
              )}
            </tr>
          ))}
        </tbody>
        {showTotal(spec) && (
          <tfoot>
            <tr className="border-t border-border">
              {cols.includes("label") && (
                <th scope="row" className={`${TD} text-foreground`}>
                  Total
                </th>
              )}
              {seriesCols.map((s) => (
                <td key={s.key} className={`${TD} ${NUM} text-foreground`}>
                  {formatValue(
                    derived.known.reduce((sum, d) => sum + (partValue(d, s.key) ?? 0), 0),
                  )}
                </td>
              ))}
              {cols.includes("value") && (
                <td className={`${TD} ${NUM} font-semibold text-foreground`}>
                  {formatValue(derived.total, spec.unit)}
                </td>
              )}
              {cols.includes("share") && <td className={TD} />}
              {cols.includes("detail") && <td className={TD} />}
            </tr>
          </tfoot>
        )}
      </table>
      {derived.missing > 0 && (
        <p className="px-2 pt-2 text-[11px] text-muted-foreground">
          «{NO_DATA}» significa que no se registró medida, no que valga cero. El total
          suma solo lo medido.
        </p>
      )}
    </div>
  );
}

/** Un total solo tiene sentido si la magnitud es sumable. Una media, no. */
function showTotal(spec: PanelSpec): boolean {
  return spec.viz !== "ranking" && spec.viz !== "kpi" && spec.unit.short !== "★";
}

export function contextSentence(spec: PanelSpec): string {
  const bits = [
    spec.context.period,
    ...(spec.context.filter ? [spec.context.filter] : []),
    ...(spec.context.filters ?? []),
  ];
  if (spec.context.scope) bits.push(spec.context.scope);
  return `${bits.join(" · ")}. Valores en ${spec.unit.many}.`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
