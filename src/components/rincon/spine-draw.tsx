"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SorteoSheet } from "./sorteo-sheet";
import type { SorteoCollection, SorteoItem } from "./sorteo-logic";

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

// Abre la hoja cuando llega `?sorteo=1` (DRAW_HREF) y quita el parámetro.
// Se lee el parámetro ENTRANTE, no el estado inicial: con `cacheComponents`
// Next conserva las rutas visitadas ocultas con React Activity en vez de
// desmontarlas, así que un `useState(initialOpen)` solo se evaluaría en la
// primera visita y la segunda dejaría la hoja cerrada.
// El parámetro se quita con `history.replaceState`, que Next sincroniza con
// `useSearchParams`: no compite con otras navegaciones (p. ej. «Ver ficha»,
// que cierra la hoja y navega a la vez) ni refetchea el árbol RSC del Rincón.
function DrawFromUrl({ onOpen }: { onOpen: () => void }) {
  const searchParams = useSearchParams();
  const requested = searchParams.get("sorteo") === "1";

  useEffect(() => {
    if (!requested) return;
    // `onOpen` decide si hay algo que sortear; el parámetro se limpia igual.
    onOpen();
    const url = new URL(window.location.href);
    url.searchParams.delete("sorteo");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo reacciona al parámetro
  }, [requested]);

  return null;
}

// "Sacar un lomo": tarjeta-entrada del ritual (spec 2026-07-17). El botón abre
// la hoja del sorteo (estantería animada + filtros). Tarjeta oscura a
// propósito (misma en claro y oscuro). Vacío: invita a añadir pendientes.
export function SpineDraw({
  pool,
  collections = [],
  openFromUrl = false,
}: {
  pool: SorteoItem[];
  collections?: SorteoCollection[];
  // Escucha `?sorteo=1`: abre la hoja (si hay pool) y limpia el parámetro.
  // Solo la usa el Rincón; el Inicio no debe leer la URL.
  openFromUrl?: boolean;
}) {
  const t = useTranslations("rincon");
  const [open, setOpen] = useState(false);
  const hasPool = pool.length > 0;

  const urlListener = openFromUrl ? (
    <Suspense fallback={null}>
      <DrawFromUrl onOpen={() => { if (hasPool) setOpen(true); }} />
    </Suspense>
  ) : null;

  function close() {
    setOpen(false);
  }

  const dark = "rounded-[14px] border p-4";
  const darkStyle = {
    background: "#2a231d",
    borderColor: "rgba(240,232,219,.12)",
    color: "#f0e8db",
  };

  if (!hasPool) {
    return (
      <div className={dark} style={darkStyle}>
        {urlListener}
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
      {urlListener}
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

      <SorteoSheet
        pool={pool}
        collections={collections}
        open={open}
        onClose={close}
      />
    </div>
  );
}
