"use client";

import { useCallback, useSyncExternalStore } from "react";

// Cuántas columnas quiere la agenda quien mira. Es una preferencia de
// PRESENTACIÓN, así que vive en localStorage y no en la URL ni en la base: nadie
// va a compartir un enlace «la agenda a una columna», y no merece un viaje al
// servidor.
//
// Se lee con useSyncExternalStore y no con un efecto por dos razones:
//   1. `react-hooks/set-state-in-effect` prohíbe el patrón habitual
//      (useState(defecto) + useEffect que lee localStorage y hace setState).
//   2. El servidor no tiene localStorage. `getServerSnapshot` devuelve el
//      predeterminado, así que el HTML del servidor y el primer render del
//      cliente coinciden y no hay error de hidratación.
//
// Precio asumido: quien tenga guardado «1» ve UN fotograma a dos columnas antes
// de que React reconcilie. Evitarlo del todo exigiría una cookie leída en el
// servidor, y eso arrastra `cookies()` a la página del calendario -- que es
// justo lo que la regla #437 pide no hacer a la ligera.

const CLAVE = "biblioshare:agenda-columnas";

export type AgendaColumns = 1 | 2;

/** El predeterminado es 2: es lo que la agenda hacía antes de existir el toggle. */
const POR_DEFECTO: AgendaColumns = 2;

const oyentes = new Set<() => void>();

// `getSnapshot` no puede tocar localStorage en cada llamada sin más: React la
// invoca varias veces por render y un `getItem` es síncrono y bloqueante. Se
// cachea el valor y se invalida cuando cambia -- aquí o en otra pestaña.
let cache: AgendaColumns | null = null;

function leerDelAlmacen(): AgendaColumns {
  try {
    return window.localStorage.getItem(CLAVE) === "1" ? 1 : 2;
  } catch {
    // Safari en privado tira al ESCRIBIR, pero se protege también la lectura:
    // una preferencia de maquetación no puede tumbar el calendario entero.
    return POR_DEFECTO;
  }
}

function avisar() {
  for (const oyente of oyentes) oyente();
}

function alCambiarOtraPestana(evento: StorageEvent) {
  if (evento.key !== null && evento.key !== CLAVE) return;
  cache = null;
  avisar();
}

function suscribir(alCambiar: () => void) {
  oyentes.add(alCambiar);
  // `storage` solo lo reciben las OTRAS pestañas; el cambio propio se propaga
  // con `avisar()` desde `elegir`. Hacen falta los dos.
  window.addEventListener("storage", alCambiarOtraPestana);
  return () => {
    oyentes.delete(alCambiar);
    window.removeEventListener("storage", alCambiarOtraPestana);
  };
}

function instantanea(): AgendaColumns {
  if (cache === null) cache = leerDelAlmacen();
  return cache;
}

function instantaneaDelServidor(): AgendaColumns {
  return POR_DEFECTO;
}

export function useAgendaColumns(): [AgendaColumns, (valor: AgendaColumns) => void] {
  const columnas = useSyncExternalStore(
    suscribir,
    instantanea,
    instantaneaDelServidor,
  );

  const elegir = useCallback((valor: AgendaColumns) => {
    // La caché se actualiza ANTES de tocar localStorage: si el almacén falla
    // (privado, cuota), el control tiene que responder igual. Lo que se pierde
    // entonces es la persistencia, no el toggle.
    cache = valor;
    try {
      window.localStorage.setItem(CLAVE, String(valor));
    } catch {
      // Ver arriba: sin persistencia, pero funcionando.
    }
    avisar();
  }, []);

  return [columnas, elegir];
}
