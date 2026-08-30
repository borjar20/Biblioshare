"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

// La URL no cambia mientras este fallback está montado: subscribe vacío.
const subscribeNever = () => () => {};
const isSessionUrl = () => window.location.pathname.startsWith("/sesion/");
const serverSnapshot = () => false;

// Acción del fallback offline, consciente de DÓNDE está. Clave del setup del
// SW (public/sw.js): ante una navegación sin red responde con el DOCUMENTO
// cacheado de /offline, pero la URL de la barra sigue siendo la original — si
// era /sesion/{passId}?minutos=…&inicio=…, esa URL (la única copia del
// registro pendiente) sigue viva aquí. location.reload() la reintenta tal
// cual: no hace falta que el SW guarde nada ni tocar mensajería. Por eso este
// componente lee location.pathname (useSyncExternalStore con snapshot de
// servidor `false`, para no discrepar en la hidratación del HTML cacheado) y,
// si hay una sesión pendiente, cambia la copia: botón «Reintentar el
// registro» + aviso de que los datos no se han perdido (el nativo ya no borra
// el cronómetro hasta que el guardado confirma — fix widget→sesión offline).
export function OfflineRetry({
  retryLabel,
  retrySessionLabel,
  sessionSafeText,
}: {
  retryLabel: string;
  retrySessionLabel: string;
  sessionSafeText: string;
}) {
  const pendingSession = useSyncExternalStore(subscribeNever, isSessionUrl, serverSnapshot);

  return (
    <div className="flex flex-col items-center gap-3">
      {pendingSession && (
        <p className="max-w-xs text-sm text-muted-foreground">{sessionSafeText}</p>
      )}
      <Button type="button" onClick={() => window.location.reload()}>
        {pendingSession ? retrySessionLabel : retryLabel}
      </Button>
    </div>
  );
}
