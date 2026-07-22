"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import { isMemberCompleted } from "@/lib/sagas/completion";
import type { ResolvedStep } from "@/lib/sagas/route-types";

// Un bloque-subsaga dentro de una ruta. PLEGADO por defecto a propósito: si
// abres «La Guardia» no quieres que ocho portadas de Rincewind te sepulten el
// paso siguiente. Usa el mismo acento que esa subsaga tiene en el resto de la
// ficha, para que se reconozca de un vistazo.
export function RouteBlock({
  step,
  countLabel,
}: {
  step: Extract<ResolvedStep, { kind: "block" }>;
  countLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const accent = SAGA_ACCENT[step.accent];

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className={`h-8 w-1 shrink-0 rounded-full ${accent.tick}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{step.name}</span>
          <span className="block font-mono text-[9px] text-muted-foreground">{countLabel}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <ol className="divide-y divide-border border-t border-border">
          {step.members.map((m) => (
            <li key={`${m.itemType}-${m.itemId}`}>
              <Link href={m.href} className="flex items-center gap-3 px-3 py-2">
                <span className="relative h-[45px] w-[30px] shrink-0 overflow-hidden rounded">
                  {m.coverUrl && <Image src={m.coverUrl} alt="" fill sizes="30px" className="object-cover" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{m.title}</span>
                {/* Presentación, no cómputo de avance: el predicado único vive en completion.ts (issue #91). */}
                {isMemberCompleted(m) && <span className="shrink-0 text-xs text-success">✓</span>}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
