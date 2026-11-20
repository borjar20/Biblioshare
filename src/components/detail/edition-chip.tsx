"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { Pass } from "@/lib/passes/types";
import type { Edition } from "@/lib/editions/types";
import { setPassEdition } from "@/lib/passes/actions";
import { formatEdition } from "@/lib/editions/edition-label";
import { editionAskedStorageKey } from "@/lib/passes/edition-asked";
import { EditionPicker } from "./edition-picker";
import { shouldAskForEdition } from "./edition-question";

// Venían de log-panel.tsx (PassDataPanel). Se lee solo en el inicializador de
// useState: el primer pintado ya sabe si la pregunta toca, sin lecturas impuras.
function readEditionAsked(passId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(editionAskedStorageKey(passId)) === "1";
  } catch {
    return false;
  }
}

function writeEditionAsked(passId: string) {
  try {
    window.localStorage.setItem(editionAskedStorageKey(passId), "1");
  } catch {
    // Cuota llena o almacenamiento inaccesible: la pregunta podrá volver.
  }
}

// La edición del pase abierto, como chip de la cabecera de «Mi registro»
// (spec 2026-11-11-ficha-linea-de-lectura). Sustituye al select y a la pregunta
// del panel «Progreso». La pregunta pendiente se abre sola; si no, el chip la
// abre. El selector cae en su propia línea (`order-last basis-full`) dentro de
// la fila flex-wrap de PassLogHead. El padre lo monta con `key={openPass.id}`.
export function EditionChip({
  itemType,
  itemId,
  openPass,
  passes,
  editions,
  canContribute,
}: {
  itemType: "book" | "movie";
  itemId: string;
  openPass: Pass;
  passes: Pass[];
  editions: Edition[];
  canContribute: boolean;
}) {
  const t = useTranslations("detail.readingStrip");
  const tEditions = useTranslations("editions");
  const [isPending, startTransition] = useTransition();
  const [answered, setAnswered] = useState(() => readEditionAsked(openPass.id));
  const [open, setOpen] = useState(false);
  const pending = shouldAskForEdition({
    itemType,
    editionCount: editions.length,
    passEditionId: openPass.editionId,
    answered,
  });
  const edition = openPass.editionId ? (editions.find((e) => e.id === openPass.editionId) ?? null) : null;
  const showPicker = pending || open;

  function close() {
    setAnswered(true);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={showPicker}
        disabled={isPending}
        onClick={() => setOpen((o) => !o)}
        className="rounded-md px-2 py-0.5 font-mono text-[10px] tracking-[0.06em] uppercase disabled:opacity-60"
        style={{ color: "var(--accent-ink)", background: "color-mix(in oklab, var(--accent) 12%, transparent)" }}
      >
        {edition ? formatEdition(edition, itemType) : t(itemType === "movie" ? "chooseVersion" : "chooseEdition")}
      </button>
      {showPicker && (
        <div className="order-last basis-full rounded-md border border-border p-2.5">
          <EditionPicker
            itemType={itemType}
            itemId={itemId}
            editions={editions}
            passes={passes}
            title={tEditions("whichEditionReading")}
            disabled={isPending}
            canContribute={canContribute}
            passId={openPass.id}
            onPick={(editionId) => {
              close();
              startTransition(() => setPassEdition(openPass.id, itemType, itemId, editionId));
            }}
            onUnknown={() => {
              writeEditionAsked(openPass.id);
              close();
            }}
            onCandidatePicked={close}
          />
        </div>
      )}
    </>
  );
}
