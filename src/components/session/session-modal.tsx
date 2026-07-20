"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Cáscara del modal de sesión. <dialog> nativo con showModal(): atrapa el foco
// y cierra con Escape sin código propio, igual que ClosePassSheet.
//
// Pantalla completa en móvil, tarjeta centrada en pc (D2 de la spec).
//
// El evento nativo "close" es la ÚNICA vía de salida: lo disparan Escape y
// nuestro propio close(), así que el clic en el backdrop, la tecla y el botón ✕
// acaban todos en el mismo router.back().
export function SessionModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // showModal() es una llamada imperativa al DOM, no setState: no choca con
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onClose={() => router.back()}
      // El backdrop no es un elemento propio: un clic sobre él llega con
      // e.target === el <dialog>. Un clic en el contenido llega con el hijo.
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
      className="m-0 h-full max-h-none w-full max-w-none overflow-hidden border-0 bg-background p-0 text-foreground backdrop:bg-black/50 sm:m-auto sm:h-auto sm:max-h-[90dvh] sm:w-[min(30rem,calc(100vw-2rem))] sm:rounded-2xl sm:shadow-xl"
    >
      {children}
    </dialog>
  );
}
