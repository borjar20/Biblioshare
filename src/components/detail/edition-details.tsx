"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { Edition } from "@/lib/editions/types";
import { MetadataSidebar, type MetaRow } from "./metadata-sidebar";
import { EditionStrip } from "./edition-strip";
import { ArrowLeftIcon } from "@/components/ui/icons";

// Panel de detalles bajo la tira de ediciones. Mismo hueco visual que
// MetadataSidebar (de hecho lo reutiliza tal cual cuando no se está mirando
// ninguna edición: autoría/primera publicación + géneros de la obra). En
// cuanto se pulsa una tarjeta de la tira, este panel pasa a pintar SUS datos
// (editorial/páginas/ISBN en libro, año/duración en película).
//
// OJO: esto es solo "mirar", no "adoptar". viewingId no toca
// selectedEditionId (la edición del pase, marcada con ✓ y "La tuya" en la
// tira) ni nada del registro personal del usuario: es puramente qué pinta
// este panel.
export function EditionDetails({
  itemType,
  editions,
  viewingId,
  onSelect,
  workRows,
  genres,
  genresLabel,
}: {
  itemType: ItemType;
  editions: Edition[];
  /** La edición que se está mirando ahora mismo en este panel (no la del pase). */
  viewingId: string | null;
  onSelect: (id: string | null) => void;
  /** Filas de la OBRA (autoría, primera publicación...), tipo ya usado por MetadataSidebar. */
  workRows: MetaRow[];
  genres: string[];
  genresLabel: string;
}) {
  const tMeta = useTranslations("detail.meta");
  const tDetail = useTranslations("detail");
  const tEditions = useTranslations("editions");
  const t = useTranslations("item");

  const viewing = viewingId
    ? (editions.find((e) => e.id === viewingId) ?? null)
    : null;

  // Sin edición en mira (o la que se miraba ya no existe): el panel de la
  // obra de siempre, sin cambios.
  if (!viewing) {
    return (
      <MetadataSidebar rows={workRows} genres={genres} genresLabel={genresLabel} />
    );
  }

  const isMovie = itemType === "movie";

  const rows: MetaRow[] = [{ label: tEditions("label"), value: viewing.label }];
  if (isMovie) {
    if (viewing.year !== null)
      rows.push({ label: tMeta("year"), value: String(viewing.year) });
    if (viewing.totalUnits !== null)
      rows.push({
        label: tMeta("runtime"),
        value: `${viewing.totalUnits} ${t("minutes")}`,
      });
  } else {
    if (viewing.publisher)
      rows.push({ label: tMeta("publisher"), value: viewing.publisher });
    if (viewing.year !== null)
      rows.push({ label: tMeta("published"), value: String(viewing.year) });
    if (viewing.language)
      rows.push({ label: tEditions("language"), value: viewing.language });
    if (viewing.totalUnits !== null)
      rows.push({
        label: tMeta("pages"),
        value: `${viewing.totalUnits} ${t("pages")}`,
      });
    if (viewing.isbn) rows.push({ label: tMeta("isbn"), value: viewing.isbn });
  }

  return (
    <aside className="flex h-fit flex-col gap-3.5 rounded-card border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          {tDetail("editionInfo")}
        </span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="h-3 w-3" />
          {tDetail("backToWork")}
        </button>
      </div>

      {/* Portada propia de la edición, si tiene una distinta de la obra:
          cover_url en la tirada es null salvo cuando alguien la sobreescribió. */}
      {viewing.coverUrl && (
        <div className="relative aspect-[2/3] w-24 overflow-hidden rounded-cover border border-border bg-surface-muted">
          <Image
            src={viewing.coverUrl}
            alt={viewing.label}
            fill
            sizes="96px"
            className="object-cover"
          />
        </div>
      )}

      {rows.map((row, i) => (
        <div
          key={row.label}
          className={`flex flex-col gap-0.5 ${i > 0 ? "border-t border-border pt-3.5" : ""}`}
        >
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            {row.label}
          </span>
          <span className="text-sm text-foreground">{row.value}</span>
        </div>
      ))}
    </aside>
  );
}

// Contenedor cliente que une tira + panel: comparten `viewingId` (mirar, no
// adoptar), así que necesitan un padre común. El servidor no sabe nada de
// esa selección, solo le pasa `selectedEditionId` (la del pase) y las
// ediciones.
//
// El orden vertical lo manda el mockup (Paper, Ficha de título · Info):
// saga → tira de ediciones → SINOPSIS → panel de metadatos. La sinopsis va
// EN MEDIO de los dos, así que entra como `children` (el <InfoPanel> que
// pinta la página) en vez de renderizarse fuera: así tira y panel siguen
// bajo el mismo useState sin tener que sincronizar dos ramas separadas del
// árbol. Por eso libro/película ya no pasan `sidebar` a InfoPanel: esa caja
// de metadatos es justamente lo que EditionDetails pinta aquí debajo.
export function EditionsSection({
  itemType,
  itemId,
  editions,
  selectedEditionId,
  canContribute,
  workRows,
  genres,
  genresLabel,
  children,
}: {
  itemType: ItemType;
  itemId: string;
  editions: Edition[];
  /** La edición del pase abierto del que mira, si tiene. */
  selectedEditionId: string | null;
  canContribute: boolean;
  workRows: MetaRow[];
  genres: string[];
  genresLabel: string;
  /** La sinopsis (<InfoPanel>), que va entre la tira y el panel de metadatos. */
  children: ReactNode;
}) {
  const [viewingId, setViewingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-10">
      <EditionStrip
        itemType={itemType}
        itemId={itemId}
        editions={editions}
        selectedEditionId={selectedEditionId}
        viewingId={viewingId}
        onSelect={setViewingId}
        canContribute={canContribute}
      />
      {children}
      <EditionDetails
        itemType={itemType}
        editions={editions}
        viewingId={viewingId}
        onSelect={setViewingId}
        workRows={workRows}
        genres={genres}
        genresLabel={genresLabel}
      />
    </div>
  );
}
