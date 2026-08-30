"use client";

import { useTranslations } from "next-intl";
import {
  layoutOptions,
  resolveLayout,
  type BoardLayout,
  type BoardOrientation,
  type LayoutFamily,
} from "@/lib/play/ui/layout";
import { seatAccent } from "@/lib/play/ui/seats";

/**
 * Selector de reparto por PRESETS visibles, no por dos atributos que se alternan a
 * ciegas (petición directa de la primera partida real, 2026-08-30: «girar» y
 * «repartir» por separado obligaban a ciclar sin ver qué salía). Cada opción es una
 * miniatura del tablero DE VERDAD: sale de `resolveLayout`, el mismo módulo que
 * pinta la mesa, así que no puede mentir — y los asientos van con su color, que de
 * paso hace de leyenda.
 *
 * «Automático» va primero: es el valor por defecto y el camino de vuelta después de
 * experimentar. Elegir una miniatura fija orientación Y familia a la vez.
 */
export function BoardPresets({
  players,
  orientation,
  family,
  onSelect,
}: {
  players: number;
  orientation: BoardOrientation;
  family: LayoutFamily | "auto";
  onSelect: (orientation: BoardOrientation, family: LayoutFamily | "auto") => void;
}) {
  const t = useTranslations("play");
  const groups: { orientation: BoardOrientation; labelKey: string }[] = [
    { orientation: "portrait", labelKey: "gameSheet.standing" },
    { orientation: "landscape", labelKey: "gameSheet.lying" },
  ];

  return (
    <div className="px-3 pb-2">
      <button
        type="button"
        aria-pressed={family === "auto"}
        onClick={() => onSelect("portrait", "auto")}
        className={`mb-2 w-full rounded-chip border px-3 py-2 text-left text-[13px] transition-colors ${
          family === "auto" ? "border-accent bg-accent/10" : "border-border"
        }`}
      >
        {t("gameSheet.layoutAuto")}
        <span className="text-muted-foreground"> · {t("gameSheet.autoDetail")}</span>
      </button>

      {groups.map((group) => (
        <div key={group.orientation} className="mt-2 first:mt-0">
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            {t(group.labelKey)}
          </p>
          <div className="flex flex-wrap gap-2">
            {layoutOptions(players, group.orientation).map((option) => {
              const selected = family === option && orientation === group.orientation;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  // El texto visible se repite entre grupos («En filas» sale de pie
                  // y tumbado): el nombre accesible lleva el grupo para distinguir.
                  aria-label={`${t(`gameSheet.layout${capitalize(option)}`)} · ${t(group.labelKey)}`}
                  onClick={() => onSelect(group.orientation, option)}
                  className={`flex flex-col items-center gap-1 rounded-[10px] border p-2 transition-colors ${
                    selected ? "border-accent bg-accent/10" : "border-border"
                  }`}
                >
                  <MiniBoard layout={resolveLayout(players, group.orientation, option)} orientation={group.orientation} />
                  <span className="text-[10px] text-muted-foreground">
                    {t(`gameSheet.layout${capitalize(option)}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * La miniatura: la MISMA rejilla del tablero a escala de pulgar. `aria-hidden`
 * porque el nombre accesible del preset es su etiqueta de texto.
 */
function MiniBoard({ layout, orientation }: { layout: BoardLayout; orientation: BoardOrientation }) {
  const size = orientation === "portrait" ? "h-[72px] w-12" : "h-12 w-[72px]";
  return (
    <span
      aria-hidden
      className={`grid ${size} gap-[2px]`}
      style={{
        gridTemplateColumns: layout.columns,
        gridTemplateRows: layout.rows,
        gridTemplateAreas: layout.areas,
      }}
    >
      {layout.seats.map((placement) => (
        <span
          key={placement.seat}
          style={{ gridArea: placement.area }}
          className={`${seatAccent(placement.seat).bar} rounded-[3px] opacity-70`}
        />
      ))}
      <span style={{ gridArea: layout.consoleArea }} className="h-[3px] self-center rounded-full bg-border" />
    </span>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
