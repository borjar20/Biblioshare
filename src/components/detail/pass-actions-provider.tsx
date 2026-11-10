"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { unstable_rethrow, usePathname, useRouter } from "next/navigation";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { updateStatus } from "@/lib/library/manage-actions";
import { addExistingItemToLibrary } from "@/lib/library/add-existing-item";
import { ratePass } from "@/lib/passes/actions";
import { loginHref } from "@/lib/auth/safe-next";
import { intentStatus, primaryAction, type Intent } from "@/lib/passes/pass-actions";
import { useItemStatus } from "./item-status-context";
import { ClosePassSheet } from "./close-pass-sheet";
import { NewPassSheet } from "./new-pass-sheet";
import { ResumePassSheet } from "./resume-pass-sheet";

// Las acciones del pase de una obra (spec 2026-11-10-ficha-acciones): añadir
// con una intención, cambiar de estado, la acción principal, nuevo pase y
// puntuar. Antes estaban repartidas entre LogPanel (estado, nuevo pase y las
// tres hojas) y useFollow (el «Seguir» del hero). LogPanel solo existe con su
// pestaña activa, dentro del <Suspense> de las pestañas, así que la tarjeta del
// hero no podía abrir sus hojas: por eso este proveedor envuelve el hero Y las
// pestañas (va dentro de ItemStatusProvider, alrededor de ItemShell) y monta
// las hojas UNA sola vez.
//
// Sin `use cache` en ningún sitio (regla #437): todo depende de quién mira.

export type PassActionsError = "actionError" | "doneButPlanned";

type PassActionsValue = {
  isPending: boolean;
  error: PassActionsError | null;
  addWith: (intent: Intent) => void;
  changeStatus: (next: MediaStatus) => void;
  runPrimary: () => void;
  newPass: () => void;
  rate: (rating: number) => void;
};

const PassActionsContext = createContext<PassActionsValue | null>(null);

export function PassActionsProvider({
  itemType,
  itemId,
  isLoggedIn,
  activePassId,
  activePassOpen,
  sessionHref,
  droppedAtLabel,
  initialClosingPassId,
  children,
}: {
  itemType: ItemType;
  itemId: string;
  isLoggedIn: boolean;
  /** Pase ACTIVO (is_active) de la obra, el que se puntúa. */
  activePassId: string | null;
  /** El pase activo está pendiente o en curso: «Nuevo pase» pregunta antes. */
  activePassOpen: boolean;
  /** A dónde llevan «Registrar sesión» / «Marcar episodio». */
  sessionHref: string | null;
  /** Posición del pase activo ya formateada en el servidor (formatPosition). */
  droppedAtLabel: string | null;
  // Pase a abrir en la hoja de cierre desde el primer pintado (§Tarea 7,
  // hallazgo de revisión): lo calcula el SERVER component de la ficha leyendo
  // `?cerrar` de `searchParams` (que no se retrasa, a diferencia de
  // useSearchParams en cliente) y ya validado contra el pase activo.
  initialClosingPassId: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const { status, setStatus, setSaving } = useItemStatus();
  const [error, setError] = useState<PassActionsError | null>(null);

  // «Ocupado» en un ref, no en estado: dos toques en el mismo tick verían los
  // dos el estado viejo (isPending aún false) y lanzarían dos escrituras.
  const busy = useRef(false);

  // Al marcar "completado" (o "dejado") updateStatus ya cierra el pase en BD
  // (o abre-y-cierra uno si el ítem venía de "planificado") y nos devuelve
  // directamente su id: no hace falta rebuscar entre los pases tras
  // refrescar, basta con encadenar la hoja de cierre con ese passId.
  //
  // El auto-cierre por sesión (§Tarea 7) hace lo mismo por URL: la sesión que
  // alcanza el final redirige a `?cerrar=<passId>`. `initialClosingPassId`
  // lo lee y valida el SERVER component de la ficha (contra el pase ACTIVO —
  // nunca uno archivado; ver los tres `page.tsx` de libro/película/serie), así
  // que llega aquí ya validado. Arreglo de la revisión de la Tarea 7: leer
  // `?cerrar` con useSearchParams (cliente) iba un render por detrás tras el
  // redirect de la server action, así que la hoja no se abría sola al
  // terminar un libro — solo tras recargar a mano. El servidor no sufre ese
  // rezago, pero SÍ hace falta el ajuste "durante el render" de abajo: la ida
  // y vuelta a `/sesion/[passId]` vuelve al MISMO `id` de obra, así que Next
  // reutiliza la instancia ya montada de esta página en vez de remontarla
  // (TRAMPAS #26) — un `useState` inicializado una sola vez con la prop nunca
  // vería el `cerrar` nuevo sin este seguimiento de `prev`. Ya no hace falta
  // `&tab=log`: el proveedor vive por encima de las pestañas, así que la hoja
  // se abre esté en la pestaña que esté.
  const [closingPassId, setClosingPassId] = useState<string | null>(
    initialClosingPassId,
  );
  // El auto-cierre por sesión (initialClosingPassId) solo dispara al
  // terminar un libro: siempre "completed". changeStatus lo pisa con
  // el `next` real cuando el cierre lo dispara marcar un estado a mano.
  const [closingStatus, setClosingStatus] = useState<MediaStatus>("completed");

  // Retomar un abandonado (dropped → in_progress) es la única transición que
  // la máquina no resuelve sola: askResume significa que no se escribió nada
  // en BD todavía (el estado optimista se revierte) y que hace falta
  // preguntar "¿continuar o de cero?" antes de reintentar con `resume`.
  const [resumeOpen, setResumeOpen] = useState(false);

  // "Nuevo pase" con el actual TODAVÍA abierto: hay que saber cómo se cierra
  // el que se deja atrás antes de crear el siguiente (NewPassSheet pregunta).
  const [newPassOpen, setNewPassOpen] = useState(false);

  const [prevInitialClosingPassId, setPrevInitialClosingPassId] =
    useState(initialClosingPassId);
  if (initialClosingPassId !== prevInitialClosingPassId) {
    setPrevInitialClosingPassId(initialClosingPassId);
    if (initialClosingPassId) {
      // Auto-cierre por sesión: siempre "completed" (no existe abandonar vía
      // sesión, solo se abandona a mano). Sin este pisado, `closingStatus`
      // arrastraba el valor de una interacción anterior no relacionada (p. ej.
      // un "dropped" manual descartado sin enviar).
      setClosingStatus("completed");
      setClosingPassId(initialClosingPassId);
      // La instancia sobrevive a la ida y vuelta (TRAMPAS #26): lo que se
      // quedó abierto o avisando ANTES de irse no debe reaparecer encima de la
      // hoja de cierre que trae la vuelta.
      setResumeOpen(false);
      setNewPassOpen(false);
      setError(null);
    }
  }

  // Puerta de toda escritura, ANTES de cualquier optimismo:
  // - Anónimo: a login recordando la ficha para volver tras entrar, sin
  //   escribir. Antes disparaba la acción y el server redirigía a /login pelado
  //   (ida y vuelta inútil y sin retorno) — issue #358.
  // - Con otra escritura en vuelo, la llamada se ignora.
  function canWrite(): boolean {
    if (!isLoggedIn) {
      router.push(loginHref(pathname));
      return false;
    }
    return !busy.current;
  }

  // Envoltorio de toda escritura: limpia el aviso anterior y publica `isSaving`
  // en ItemStatusContext (el badge lo expone como aria-busy, issue #106). El
  // optimismo desmonta a veces el botón que disparó la acción —y con él su
  // `isPending`—, así que sin esto NADA en el DOM diría que la escritura sigue
  // en vuelo.
  //
  // El `setStatus` optimista lo hace SIEMPRE el llamador antes de llamar aquí:
  // un setState dentro de `startTransition(async …)` es parte de la transición
  // y React 19 no lo pinta hasta que la acción entera termina, así que el
  // estado «optimista» llegaría a la vez que el del servidor. Dentro de la
  // tarea solo van las reversiones (tras el await).
  function write(task: () => Promise<void>) {
    busy.current = true;
    setError(null);
    setSaving(true);
    startTransition(async () => {
      try {
        await task();
      } finally {
        busy.current = false;
        setSaving(false);
      }
    });
  }

  // Cada `catch` de las escrituras empieza aquí: con la sesión caducada las
  // server actions hacen `redirect("/login")`, que llega como un error que Next
  // tiene que recibir tal cual (unstable_rethrow, ver la guía de Next). Sin
  // esto el redirect se convertiría en «No se pudo guardar».
  // `revertTo` undefined = no hay estado optimista que deshacer.
  function fail(
    caught: unknown,
    revertTo: MediaStatus | null | undefined,
    code: PassActionsError,
  ) {
    unstable_rethrow(caught);
    if (revertTo !== undefined) setStatus(revertTo);
    setError(code);
  }

  function openClose(passId: string, closing: MediaStatus) {
    setClosingStatus(closing);
    setClosingPassId(passId);
  }

  // Antes de salir de la ficha, se cierra lo que hubiera abierto: la instancia
  // sobrevive a la navegación (TRAMPAS #26) y lo dejaría ahí a la vuelta.
  function leaveTo(href: string) {
    setResumeOpen(false);
    setNewPassOpen(false);
    setClosingPassId(null);
    setError(null);
    router.push(href);
  }

  // Sin puerta: la llaman changeStatus y runPrimary, que ya la han pasado.
  function startStatusChange(next: MediaStatus) {
    const previous = status;
    setStatus(next);
    write(async () => {
      try {
        const outcome = await updateStatus(itemType, itemId, next);
        if (outcome.kind === "askResume") {
          setStatus(previous);
          setResumeOpen(true);
          return;
        }
        router.refresh();
        // Hallazgo de la revisión de la Task 5: en una carrera de doble-submit
        // sin pase activo previo, closed puede llegar true con passId vacío.
        // No abrir la hoja de cierre contra un pase inexistente.
        if (outcome.closed && outcome.passId) {
          openClose(outcome.passId, next);
        }
      } catch (caught) {
        fail(caught, previous, "actionError");
      }
    });
  }

  // Con el pase ya cerrado no hay nada que preguntar: "de cero" sobre un
  // completado/abandonado es exactamente la transición archiveAndCreate que la
  // máquina ya sabe hacer. El `restart` evita el askResume de un abandonado —
  // "Nuevo pase" ya ES la respuesta "de cero". Sin puerta, como la anterior.
  function startNewPass() {
    if (activePassOpen) {
      setNewPassOpen(true);
      return;
    }
    const previous = status;
    // Películas: un revisionado es otro pase "vista" directo, sin pasar por "en
    // curso" (ese estado no existe para pelis, ver StatusSegments). Una sola
    // transición —completed + restart— archiva el anterior y crea el nuevo ya
    // cerrado; encadenamos la hoja de cierre para puntuarlo, igual que marcar
    // "Vista". Antes eran dos (in_progress + restart, luego completed) y la
    // primera publicaba en el feed «ha empezado» una peli que ya estaba vista.
    if (itemType === "movie") {
      setStatus("completed");
      write(async () => {
        try {
          const outcome = await updateStatus(itemType, itemId, "completed", "restart");
          router.refresh();
          if (outcome.kind === "done" && outcome.closed && outcome.passId) {
            openClose(outcome.passId, "completed");
          }
        } catch (caught) {
          fail(caught, previous, "actionError");
        }
      });
      return;
    }
    setStatus("in_progress");
    write(async () => {
      try {
        await updateStatus(itemType, itemId, "in_progress", "restart");
        router.refresh();
      } catch (caught) {
        fail(caught, previous, "actionError");
      }
    });
  }

  function addWith(intent: Intent) {
    if (!canWrite()) return;
    const target = intentStatus(intent);
    setStatus(target);
    write(async () => {
      try {
        await addExistingItemToLibrary(itemType, itemId);
      } catch (caught) {
        fail(caught, null, "actionError");
        return;
      }
      if (intent === "want") {
        router.refresh();
        return;
      }
      // «Lo estoy leyendo» / «Ya lo leí»: la obra ya está como pendiente; la
      // segunda escritura la lleva al estado elegido. Si falla, se queda
      // pendiente (que es lo que hay en BD) y se avisa.
      try {
        const outcome = await updateStatus(itemType, itemId, target);
        router.refresh();
        if (outcome.kind === "done" && outcome.closed && outcome.passId) {
          openClose(outcome.passId, "completed");
        }
      } catch (caught) {
        fail(caught, "planned", "doneButPlanned");
        router.refresh();
      }
    });
  }

  function changeStatus(next: MediaStatus) {
    if (!canWrite()) return;
    startStatusChange(next);
  }

  function newPass() {
    if (!canWrite()) return;
    startNewPass();
  }

  function runPrimary() {
    if (!status || !canWrite()) return;
    switch (primaryAction(itemType, status)) {
      case "start": {
        // «Empezar a leer»: pasa a en curso y abre la hoja de sesión del pase.
        const previous = status;
        setStatus("in_progress");
        write(async () => {
          try {
            const outcome = await updateStatus(itemType, itemId, "in_progress");
            router.refresh();
            if (outcome.kind === "done" && outcome.passId) {
              leaveTo(`/sesion/${outcome.passId}`);
            }
          } catch (caught) {
            fail(caught, previous, "actionError");
          }
        });
        return;
      }
      case "session":
      case "episode":
        if (sessionHref) leaveTo(sessionHref);
        return;
      case "watched":
        startStatusChange("completed");
        return;
      case "again":
        startNewPass();
        return;
      case "resume":
        startStatusChange("in_progress");
        return;
    }
  }

  function rate(rating: number) {
    if (!activePassId || !canWrite()) return;
    const passId = activePassId;
    write(async () => {
      try {
        await ratePass(passId, itemType, itemId, rating);
        router.refresh();
      } catch (caught) {
        fail(caught, undefined, "actionError");
      }
    });
  }

  return (
    <PassActionsContext.Provider
      value={{
        isPending,
        error,
        addWith,
        changeStatus,
        runPrimary,
        newPass,
        rate,
      }}
    >
      {children}

      {closingPassId && (
        <ClosePassSheet
          passId={closingPassId}
          itemType={itemType}
          itemId={itemId}
          status={closingStatus}
          open
          onClose={() => setClosingPassId(null)}
        />
      )}

      {newPassOpen && (
        <NewPassSheet
          itemType={itemType}
          itemId={itemId}
          open
          onClose={() => {
            setNewPassOpen(false);
            router.refresh();
          }}
        />
      )}

      {resumeOpen && (
        <ResumePassSheet
          itemType={itemType}
          itemId={itemId}
          droppedAtLabel={droppedAtLabel}
          open
          onClose={() => {
            setResumeOpen(false);
            router.refresh();
          }}
        />
      )}
    </PassActionsContext.Provider>
  );
}

// Sin fallback silencioso, como useItemStatus: una ficha sin proveedor es un
// bug de integración que conviene que explote en desarrollo.
export function usePassActions(): PassActionsValue {
  const value = useContext(PassActionsContext);
  if (!value) {
    throw new Error("usePassActions necesita un <PassActionsProvider> por encima");
  }
  return value;
}
