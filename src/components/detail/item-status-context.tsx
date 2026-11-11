"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { MediaStatus } from "@/lib/library/types";
import { StatusBadge } from "@/components/ui/status-badge";

// El estado del pase activo se lee en varias islas de la ficha que son
// hermanas, no padre/hijo: la tarjeta del hero (PassCard y su StickyPassCta,
// fuera del <Suspense> de las pestañas), Mi registro (LogPanel, para «Nuevo
// pase») y la tarjeta de seguimiento de series (SeriesFollowCard). Nació porque
// los pills eran optimistas y el badge del hero no: al pulsar "Viendo" el pill
// cambiaba al instante y el badge seguía diciendo "Pendiente" los 2-6 s que
// tarda la revalidación contra un Supabase remoto. Este contexto es el único
// estado compartido: quien muta publica aquí, los demás leen de aquí.
//
// null = sin pase activo (la obra no está en la biblioteca): la tarjeta ofrece
// las intenciones. No es un estado más, es la ausencia de todos.
//
// `isSaving` existe porque el optimismo se comía su propia señal (issue #106):
// una intención («Quiero leerlo») publica el estado aquí en el MISMO tick en
// que dispara la acción, y la tarjeta cambia entonces los botones —dueños de su
// `isPending`— por el control de estado. Sin él nada en el DOM decía que la
// escritura seguía en vuelo, así que ni el usuario ni un test podían esperarla,
// y quien se iba a /coleccion en ese medio segundo no encontraba la obra. Ahora
// quien muta publica también si está guardando: la tarjeta lo expone como
// `aria-busy` y deshabilita sus controles, también cuando la escritura es de
// otra isla (SeriesFollowCard escribe en su propia transición).
type ItemStatusValue = {
  status: MediaStatus | null;
  setStatus: (next: MediaStatus | null) => void;
  isSaving: boolean;
  setSaving: (next: boolean) => void;
};

const ItemStatusContext = createContext<ItemStatusValue | null>(null);

// Se siembra con el estado que el server component de la ficha ya calcula
// para el hero (activeStatus) y se RESINCRONIZA cuando esa prop cambia tras
// una revalidación: mientras una acción está en vuelo gana el valor optimista
// (la prop aún no ha cambiado); cuando el servidor confirma, gana el servidor.
// Ajuste de estado durante el render, no useEffect — mismo patrón
// derivar-de-props de ManagedLog/EditionStrip, que además es idempotente
// (la doble invocación de StrictMode ya nos rompió una hoja por no serlo,
// ver close-pass-sheet.tsx).
export function ItemStatusProvider({
  initialStatus,
  children,
}: {
  initialStatus: MediaStatus | null;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<MediaStatus | null>(initialStatus);
  const [isSaving, setSaving] = useState(false);
  const [prevInitial, setPrevInitial] = useState(initialStatus);
  if (initialStatus !== prevInitial) {
    setPrevInitial(initialStatus);
    setStatus(initialStatus);
  }

  return (
    <ItemStatusContext.Provider value={{ status, setStatus, isSaving, setSaving }}>
      {children}
    </ItemStatusContext.Provider>
  );
}

// Sin fallback silencioso: todos los consumidores (PassCard, LogPanel,
// PassActionsProvider, las hojas…) viven siempre dentro de una ficha, y una
// ficha sin provider es un bug de integración que conviene que explote en
// desarrollo, no que degrade a una tarjeta congelada.
export function useItemStatus(): ItemStatusValue {
  const value = useContext(ItemStatusContext);
  if (!value) {
    throw new Error("useItemStatus necesita un <ItemStatusProvider> por encima");
  }
  return value;
}

// El badge del hero, ahora vivo. Las etiquetas llegan traducidas desde el
// server component (un record de 4 strings): así esta isla de cliente no
// arrastra nada de i18n y el resto del hero sigue siendo server component.
export function StatusBadgeLive({
  labels,
}: {
  labels: Record<MediaStatus, string>;
}) {
  const { status, isSaving } = useItemStatus();
  if (!status) return null;
  // `aria-busy` mientras la escritura está en vuelo: es la señal que el badge
  // optimista se había llevado por delante (issue #106). Sirve a los lectores
  // de pantalla y le da a los e2e algo determinista que esperar antes de
  // comprobar que la obra ya está en Colección.
  return (
    <StatusBadge status={status} label={labels[status]} variant="hero" busy={isSaving} />
  );
}
