"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SorteoSheet } from "./sorteo-sheet";
import type { SorteoItem } from "./sorteo-logic";

// La estantería decorativa del frame C/H: alturas y colores variados, fijos,
// para que la tarjeta tenga cuerpo. El sorteo real vive en la hoja.
const SPINES = [
  { h: 78, c: "#cf8a54" },
  { h: 100, c: "#6bb0b4" },
  { h: 60, c: "#b592bd" },
  { h: 88, c: "#e0a94a" },
  { h: 70, c: "#8ba57b" },
  { h: 94, c: "#cf8a54" },
  { h: 55, c: "#6bb0b4" },
  { h: 82, c: "#b592bd" },
  { h: 66, c: "#d97a63" },
  { h: 90, c: "#e0a94a" },
];

// "Sacar un lomo": tarjeta-entrada del ritual (spec 2026-07-17). El botón abre
// la hoja del sorteo (estantería animada + filtros). Tarjeta oscura a
// propósito (misma en claro y oscuro). Vacío: invita a añadir pendientes.
export function SpineDraw({ pool }: { pool: SorteoItem[] }) {
  const t = useTranslations("rincon");
  const [open, setOpen] = useState(false);

  const dark = "rounded-[14px] border p-4";
  const darkStyle = {
    background: "#2a231d",
    borderColor: "rgba(240,232,219,.12)",
    color: "#f0e8db",
  };

  if (pool.length === 0) {
    return (
      <div className={dark} style={darkStyle}>
        <h3 className="font-serif text-sm font-semibold">{t("drawEmptyTitle")}</h3>
        <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "#a99e8c" }}>
          {t("drawEmptySub")}
        </p>
        <Link
          href="/buscar"
          className="mt-3 inline-block rounded-full px-4 py-2 text-center text-sm font-semibold"
          style={{ background: "#d98a5c", color: "#1f1409" }}
        >
          {t("drawEmptyCta")}
        </Link>
      </div>
    );
  }

  return (
    <div className={dark} style={darkStyle}>
      <h3 className="font-serif text-sm font-semibold">{t("drawTitle")}</h3>
      <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "#a99e8c" }}>
        {t("drawSub")}
      </p>

      <div className="my-3.5 flex h-16 items-end gap-[5px]">
        {SPINES.map((s, i) => (
          <span
            key={i}
            aria-hidden
            className="w-3.5 rounded-t-[5px] rounded-b-[2px]"
            style={{ height: `${s.h}%`, background: s.c }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-full px-4 py-2 text-center text-sm font-semibold transition-opacity hover:opacity-90"
        style={{ background: "#d98a5c", color: "#1f1409" }}
      >
        {t("drawButton")}
      </button>

      <SorteoSheet pool={pool} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
