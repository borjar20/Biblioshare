"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { MediaStatus } from "@/lib/library/types";
import { StatusBadge } from "@/components/ui/status-badge";

// El estado del pase activo se pinta en DOS sitios que son hermanos, no
// padre/hijo: el badge del hero (statusSlot, fuera del <Suspense> de las
// pestañas) y los pills de StatusSegments (dentro de LogPanel). Hasta ahora
// los pills eran optimistas y el badge no: al pulsar "Viendo" el pill cambiaba
// al instante y el badge seguía diciendo "Pendiente" los 2-6 s que tarda la
// revalidación contra un Supabase remoto. Este contexto es el único estado
// compartido entre ambos: quien muta publica aquí, el badge lee de aquí.
//
// null = sin pase activo (la obra no está en la biblioteca): el badge no se
// pinta. No es un estado más, es la ausencia de todos.
type ItemStatusValue = {
  status: MediaStatus | null;
  setStatus: (next: MediaStatus | null) => void;
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
  const [prevInitial, setPrevInitial] = useState(initialStatus);
  if (initialStatus !== prevInitial) {
    setPrevInitial(initialStatus);
    setStatus(initialStatus);
  }

  return (
    <ItemStatusContext.Provider value={{ status, setStatus }}>
      {children}
    </ItemStatusContext.Provider>
  );
}

// Sin fallback silencioso: los tres consumidores (badge del hero, LogPanel,
// ResumePassSheet) viven siempre dentro de una ficha, y una ficha sin
// provider es un bug de integración que conviene que explote en desarrollo,
// no que degrade a un badge congelado.
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
  const { status } = useItemStatus();
  if (!status) return null;
  return <StatusBadge status={status} label={labels[status]} variant="hero" />;
}
