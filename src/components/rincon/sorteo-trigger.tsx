"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";

// La partida pesa (mueble, mascota, panel): no viaja con el Inicio hasta que alguien pulsa.
const SorteoStage = dynamic(() => import("./sorteo-stage").then((m) => m.SorteoStage), { ssr: false });

// Abre la partida EN EL SITIO (spec 2026-11-06): al terminar sigues en la misma página.
export function SorteoTrigger({ className, ariaLabel, children }: { className?: string; ariaLabel?: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} aria-label={ariaLabel} onClick={() => { setMounted(true); setOpen(true); }}>
        {children}
      </button>
      {mounted && <SorteoStage open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
