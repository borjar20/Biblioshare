"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Cáscara del modal de sesión. <dialog> nativo con showModal(): atrapa el foco
// y cierra con Escape sin código propio, igual que ClosePassSheet.
//
// Pantalla completa en móvil, tarjeta centrada en pc (D2 de la spec).
//
// El evento nativo "close" NO es la única vía de salida, aunque lo parezca:
// se ha comprobado en el navegador que, cuando ClosePassSheet (un <dialog>
// anidado dentro de SessionSheet, ver session-sheet.tsx) se cierra y navega,
// este <dialog> exterior también termina emitiendo su propio "close" al
// desmontarse la ruta interceptada — dos disparos para un solo gesto de
// usuario, y por tanto dos router.back(). No merece la pena perseguir cuál
// de los dos dispara primero (depende del navegador y del orden exacto de
// desmontaje, no es algo que el código controle): en vez de eso, el salto de
// historial vive en UN SOLO sitio (closeOnce, más abajo) protegido por un
// ref, y tanto el "close" nativo de este <dialog> como cualquier llamada de
// SessionSheet (vía useModalClose) pasan por ahí. El primero que llega gana;
// el resto son operaciones nulas.
const ModalCloseContext = createContext<(() => void) | null>(null);

// SessionSheet lo usa para que "Ahora no"/"Guardar" de ClosePassSheet, y el
// guardado de una sesión normal, salgan por la misma puerta que Escape y el
// clic en el backdrop — en vez de llamar a router.back() por su cuenta y
// arriesgar un segundo salto. En modo página (deep link a /sesion/[passId],
// sin este componente de por medio) el contexto no tiene proveedor y esta
// función devuelve null; SessionSheet no debe usarla en ese modo.
export function useModalClose(): (() => void) | null {
  return useContext(ModalCloseContext);
}

export function SessionModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closedRef = useRef(false);

  // Único punto de salida del modal: da igual cuántas veces se llame (native
  // "close" de este <dialog>, o una llamada explícita vía contexto desde
  // SessionSheet) — solo la primera ejecuta router.back().
  const closeOnce = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    router.back();
  }, [router]);

  // showModal() es una llamada imperativa al DOM, no setState: no choca con
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onClose={closeOnce}
      // El backdrop no es un elemento propio: un clic sobre él llega con
      // e.target === el <dialog>. Un clic en el contenido llega con el hijo.
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
      className="m-0 h-full max-h-none w-full max-w-none overflow-hidden border-0 bg-background p-0 text-foreground backdrop:bg-black/50 sm:m-auto sm:h-auto sm:max-h-[90dvh] sm:w-[min(30rem,calc(100vw-2rem))] sm:rounded-2xl sm:shadow-xl"
    >
      <ModalCloseContext.Provider value={closeOnce}>
        {children}
      </ModalCloseContext.Provider>
    </dialog>
  );
}
