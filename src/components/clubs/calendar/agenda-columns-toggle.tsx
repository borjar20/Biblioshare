"use client";

import { useTranslations } from "next-intl";
import { OneColumnIcon, TwoColumnsIcon } from "@/components/ui/icons";
import type { AgendaColumns } from "./agenda-columns";

// Control segmentado de una/dos columnas para la agenda. Botones con
// `aria-pressed`, NO `role="tablist"` como el filtro «Sigues»: aquí no hay
// paneles que mostrar y ocultar -- es la misma lista con otra maquetación, y
// anunciar pestañas obligaría a un lector de pantalla a buscar un tabpanel que
// no existe.
//
// Se esconde desde `lg`: ahí la agenda vive en el raíl de 340 px y está forzada
// a una columna pase lo que pase, así que el control no haría nada. Un botón que
// no responde es peor que no tenerlo.
export function AgendaColumnsToggle({
  value,
  onChange,
}: {
  value: AgendaColumns;
  onChange: (valor: AgendaColumns) => void;
}) {
  const t = useTranslations("activity");

  const opciones = [
    { valor: 1 as const, Icon: OneColumnIcon, label: t("agendaColumnsOne") },
    { valor: 2 as const, Icon: TwoColumnsIcon, label: t("agendaColumnsTwo") },
  ];

  return (
    <div
      role="group"
      aria-label={t("agendaColumnsLabel")}
      className="inline-flex w-fit overflow-hidden rounded-lg border border-border bg-surface lg:hidden"
    >
      {opciones.map(({ valor, Icon, label }) => {
        const activo = value === valor;
        return (
          <button
            key={valor}
            type="button"
            aria-pressed={activo}
            aria-label={label}
            onClick={() => onChange(valor)}
            className={`px-3 py-1.5 transition-colors ${
              activo
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
