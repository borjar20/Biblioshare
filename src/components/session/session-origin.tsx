"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// De dónde salió el usuario al abrir el modal de registrar sesión.
//
// Existe porque el historial NO puede responder a esa pregunta (issue #161).
// La salida del modal necesita un destino, y deducirlo de la entrada anterior
// falla: Next degrada el `push` a `/sesion/…` en un `replace` cuando hay una
// actualización del router en vuelo —lo dispara, sin ir más lejos, pulsar
// "Leyendo" justo antes: su server action revalida y se come el
// `pendingPush`—, y entonces la entrada de la página de origen desaparece.
// A partir de ahí "hay una entrada anterior" y "el usuario venía de ahí" son
// cosas distintas, e INDISTINGUIBLES desde SessionModal: cuando el modal se
// monta, el dato ya se ha perdido.
//
// Por eso se anota ANTES de navegar. El registro vive en una variable de
// módulo y no en un contexto a propósito: lo escribe un efecto en cada
// navegación y lo lee un manejador de eventos (closeOnce), nunca el render —
// meterlo en un contexto obligaría a re-renderizar todo el árbol en cada
// cambio de ruta para un valor que nadie pinta.
let lastOrigin: string | null = null;

/** URL de la última pantalla que NO era una hoja de sesión, o null si no ha
 *  habido ninguna (entrar por enlace directo a `/sesion/[passId]`). */
export function getSessionOrigin(): string | null {
  return lastOrigin;
}

function OriginRecorder() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Las propias hojas de sesión no son un origen: volver a una sería volver
    // a un modal que el usuario acaba de cerrar.
    if (pathname.startsWith("/sesion/")) return;
    const qs = searchParams.toString();
    lastOrigin = qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);

  return null;
}

// `useSearchParams` obliga a un <Suspense> por encima: sin él, una página
// estática que lo llame **rompe el build de producción** ("Missing Suspense
// boundary with useSearchParams"), y en dev no se nota porque ahí las rutas se
// renderizan bajo demanda (documentado en la versión instalada:
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md).
// El fallback es null porque este componente no pinta nada: solo anota.
//
// Hace falta la query, no solo el pathname: la pestaña de la ficha viaja en
// `?tab=`, así que sin ella se volvería a la obra pero a otra pestaña.
export function SessionOriginTracker() {
  return (
    <Suspense fallback={null}>
      <OriginRecorder />
    </Suspense>
  );
}
