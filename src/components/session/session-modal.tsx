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
// usuario, y por tanto dos salidas. No merece la pena perseguir cuál de los
// dos dispara primero (depende del navegador y del orden exacto de
// desmontaje, no es algo que el código controle): en vez de eso, la salida
// vive en UN SOLO sitio (closeOnce, más abajo) protegido por un ref, y tanto
// el "close" nativo de este <dialog> como cualquier llamada de SessionSheet
// (vía useModalClose) pasan por ahí. El primero que llega gana; el resto son
// operaciones nulas.
//
// La salida NO puede ser siempre `router.back()` (issue #117): la entrada de
// historial de la ficha PUEDE NO EXISTIR cuando llegamos aquí, así que
// "atrás" no es un destino fiable:
//
//   Next solo crea entrada nueva al navegar si su `pushRef.pendingPush`
//   sobrevive hasta el efecto que sincroniza el historial (ver
//   AppRouter en next/dist/client). Si cuando el usuario pulsa "Registrar
//   sesión" hay una actualización del router en vuelo —y en la ficha la hay
//   muy a menudo: cambiar de estado dispara una server action que revalida—
//   ese `pendingPush` se pierde y la navegación al modal degrada de `push` a
//   `replace`, comiéndose la entrada de la ficha. Medido con la Navigation
//   API: `navigate type=replace -> /sesion/...`, y `entries()` pasa de
//   [..., /libro/X] a [..., /sesion/Y] sin rastro de la ficha.
//
// Consecuencia: un `back()` saltaba a lo que hubiera ANTES de la ficha (en el
// e2e, el inicio), y el usuario terminaba fuera de la obra que acababa de
// cerrar.
//
// Pero `replace` A SECAS tampoco vale, y esto costó una corrida entera de la
// suite descubrirlo: en una navegación SOFT, Next conserva el slot paralelo
// `@modal` (su `default.tsx` solo entra en navegación dura), así que la ruta
// interceptada NO se desmonta y el <dialog> se queda abierto encima de la
// ficha. `back()` sí la desmonta — de ahí que funcionara. Por eso:
//
//   1. Se cierra el <dialog> a mano, siempre. No depende de que la ruta se
//      desmonte, que es justo lo que no podemos dar por hecho.
//   2. Se vuelve con `back()` cuando la entrada anterior ES la ficha (caso
//      sano: desmonta la ruta y conserva el scroll), y con `replace(exitHref)`
//      solo cuando NO lo es — el caso degradado, donde back() nos echaría
//      fuera de la obra.
//
// No se arregla quitando el `router.refresh()` del cambio de estado
// (probado: sigue fallando) — la propia revalidación de la server action basta
// para pisar `pendingPush`. Tampoco es cosa del auto-cierre: cualquiera que
// entre a registrar una sesión pierde la entrada de la ficha.

// ¿La entrada anterior del historial es la ficha a la que queremos volver?
// Solo la Navigation API lo sabe (Chromium); donde no exista se responde que
// sí, que es el comportamiento de siempre — este helper solo puede MEJORAR el
// destino, nunca empeorarlo respecto a lo que había antes de la issue #117.
//
// NO relajar esto a "¿hay CUALQUIER entrada anterior? -> back()" para que
// quien entre desde el inicio vuelva al inicio (issue #161): está probado que
// rompe la Regla 2 de pase-hub.spec.ts, o sea la regresión de #117. Cuando el
// push a /sesion degrada a replace —lo dispara, por ejemplo, pulsar "Leyendo"
// justo antes: su server action revalida y se come el `pendingPush`— la
// entrada de la ficha desaparece, y entonces "hay una entrada anterior" y "el
// usuario venía de ahí" dejan de ser lo mismo. Los dos casos son
// INDISTINGUIBLES desde aquí: cuando el modal se monta, el dato que hace falta
// ya se ha perdido. Arreglarlo pide capturar el origen ANTES de navegar.
function previousEntryIs(exitHref: string): boolean {
  const nav = (
    window as unknown as {
      navigation?: { currentEntry?: { index: number }; entries(): { url: string }[] };
    }
  ).navigation;
  if (!nav?.currentEntry) return true;
  const previous = nav.entries()[nav.currentEntry.index - 1];
  if (!previous) return false;
  return (
    new URL(previous.url).pathname ===
    new URL(exitHref, window.location.origin).pathname
  );
}
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

export function SessionModal({
  children,
  exitHref,
}: {
  children: React.ReactNode;
  /** Ficha de la obra del pase: destino fijo al cerrar. Lo calcula el server
   *  component de la ruta interceptada, que ya tiene el contexto del pase. */
  exitHref: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closedRef = useRef(false);

  // Único punto de salida del modal: da igual cuántas veces se llame (native
  // "close" de este <dialog>, o una llamada explícita vía contexto desde
  // SessionSheet) — solo la primera navega.
  const closeOnce = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    // Idempotente: si llegamos aquí DESDE el "close" nativo, ya está cerrado;
    // si llegamos por SessionSheet (vía contexto), lo cerramos nosotros. El
    // close() reentrante vuelve a este callback y sale por el guard de arriba.
    dialogRef.current?.close();
    if (previousEntryIs(exitHref)) router.back();
    else router.replace(exitHref);
  }, [router, exitHref]);

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
      // `hidden open:flex`, NUNCA `flex` a secas. El navegador oculta un
      // <dialog> cerrado con `dialog:not([open]) { display: none }`, que es
      // una regla de su hoja de estilos por defecto: CUALQUIER `display` de
      // autor la pisa. Con `flex` a secas, un close() dejaba el diálogo
      // medido y PINTADO — fuera del top layer y sin backdrop, o sea en flujo
      // normal— encima de la página, con la barra de pestañas de la ficha
      // atravesando la hoja. Solo se notaba cuando la ruta interceptada
      // sobrevivía al cierre (rama `replace`, donde la navegación soft
      // conserva el slot @modal): si la ruta se desmontaba, el nodo se iba con
      // ella y tapaba el fallo. Este es el único <dialog> del proyecto con
      // display propio — el resto deja el del navegador y pone el `flex` en un
      // <div> interior, que es la otra forma de no tener este problema.
      //
      // `flex flex-col`: convierte a este <dialog> en contenedor flex para que
      // SessionSheet (su único hijo visible) reciba una altura DEFINIDA vía el
      // algoritmo de flexbox — en vez de depender de que `height: 100%` se
      // resuelva bien contra un ancestro con `height: auto` + `max-height`
      // (ambiguo/frágil entre navegadores). Con esto, el formulario puede usar
      // `flex-1` + `min-h-0` para encajar exactamente en el hueco disponible
      // (100dvh en móvil, hasta 90dvh en pc) y hacer scroll interno en vez de
      // desbordar y que este `overflow-hidden` lo recorte en silencio.
      className="m-0 hidden h-full max-h-none w-full flex-col max-w-none overflow-hidden border-0 bg-background p-0 text-foreground backdrop:bg-black/50 open:flex sm:m-auto sm:h-auto sm:max-h-[90dvh] sm:w-[min(30rem,calc(100vw-2rem))] sm:rounded-2xl sm:shadow-xl"
    >
      <ModalCloseContext.Provider value={closeOnce}>
        {children}
      </ModalCloseContext.Provider>
    </dialog>
  );
}
