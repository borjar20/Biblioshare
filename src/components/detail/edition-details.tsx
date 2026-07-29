"use client";

import { Suspense, use, type ReactNode } from "react";
import type { ItemType } from "@/lib/catalog/types";
import type { Edition } from "@/lib/editions/types";
import { EditionStrip } from "./edition-strip";

// La tira de ediciones, resuelta por streaming.
//
// Antes esto era un contenedor con estado: la tira y un panel de abajo
// compartían `viewingId` (pulsar una tarjeta cambiaba el panel a los datos de
// esa edición), y por eso la sinopsis y los metadatos tenían que vivir aquí
// dentro como `children` — el orden del mockup los ponía en medio de los dos.
//
// Ese panel se quitó: repetía lo que la tarjeta ya enseña (editorial, año,
// páginas, ISBN) y no existía en ningún frame. Sin él no queda estado que
// compartir, así que esto es solo el <Suspense> de la tira y cada pieza de
// Info vuelve a colocarse donde diga la maqueta, sin depender de las demás.
export function EditionsSection({
  itemType,
  itemId,
  editionsPromise,
  usedEditionIdsPromise,
  selectedEditionId,
  canContribute,
  editionsFallback,
}: {
  itemType: ItemType;
  itemId: string;
  /** Se resuelve con las ediciones (posible sync desde OpenLibrary): llega por
   *  streaming, resuelto con use() dentro del <Suspense>. */
  editionsPromise: Promise<Edition[]>;
  /** Ediciones con pases, que NO se pueden borrar. Se encadena sobre
   *  editionsPromise en la página, así que llega por el mismo streaming y no
   *  retrasa la tira. Es `[]` para quien no puede contribuir. */
  usedEditionIdsPromise: Promise<string[]>;
  /** La edición del pase abierto del que mira, si tiene. */
  selectedEditionId: string | null;
  canContribute: boolean;
  /** Fallback de la tira mientras el promise no resuelve. */
  editionsFallback: ReactNode;
}) {
  return (
    <Suspense fallback={editionsFallback}>
      <ResolvedEditionStrip
        itemType={itemType}
        itemId={itemId}
        editionsPromise={editionsPromise}
        usedEditionIdsPromise={usedEditionIdsPromise}
        selectedEditionId={selectedEditionId}
        canContribute={canContribute}
      />
    </Suspense>
  );
}

// Resuelve el promise con use() (React 19): suspende hasta que las ediciones
// están.
function ResolvedEditionStrip({
  editionsPromise,
  usedEditionIdsPromise,
  ...props
}: {
  itemType: ItemType;
  itemId: string;
  editionsPromise: Promise<Edition[]>;
  usedEditionIdsPromise: Promise<string[]>;
  selectedEditionId: string | null;
  canContribute: boolean;
}) {
  const editions = use(editionsPromise);
  const usedEditionIds = use(usedEditionIdsPromise);
  return (
    <EditionStrip
      editions={editions}
      usedEditionIds={usedEditionIds}
      {...props}
    />
  );
}
