"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { CelebrationOverlay } from "./celebration-overlay";
import { pullPendingCelebrations } from "@/lib/celebrations/pull-actions";
import { CELEBRATIONS } from "@/lib/celebrations/registry";
import { logCelebration } from "@/lib/celebrations/analytics";
import {
  onCelebrationCheck,
  readCelebrationPreference,
  subscribeCelebrationPreference,
  writeCelebrationPreference,
} from "@/lib/celebrations/preference";
import type {
  CelebrationPayload,
  CelebrationPreference,
} from "@/lib/celebrations/types";

interface CelebrationContextValue {
  /** Encola una celebración desde el cliente (uso optimista/local). */
  triggerCelebration: (payload: CelebrationPayload) => void;
  /** Fuerza un drenado de las celebraciones ganadas en servidor. */
  pull: () => void;
  preference: CelebrationPreference;
  setPreference: (pref: CelebrationPreference) => void;
}

const CelebrationContext = createContext<CelebrationContextValue | null>(null);

export function useCelebration(): CelebrationContextValue {
  const ctx = useContext(CelebrationContext);
  if (!ctx) {
    throw new Error("useCelebration debe usarse dentro de <CelebrationProvider>");
  }
  return ctx;
}

const serverPreference = (): CelebrationPreference => "full";

export function CelebrationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // La cola completa; la que se anima es siempre la cabeza (queue[0]). Dos
  // eventos simultáneos se muestran en secuencia, nunca solapados. El overlay
  // llama a `dismiss` al terminar y la cabeza avanza.
  const [queue, setQueue] = useState<CelebrationPayload[]>([]);
  const current = queue[0] ?? null;

  // Preferencia por store externo: se lee de localStorage sin useEffect+setState
  // (hidratación segura; el servidor devuelve "full" y el cliente reconcilia).
  const preference = useSyncExternalStore(
    subscribeCelebrationPreference,
    readCelebrationPreference,
    serverPreference,
  );

  const enqueue = useCallback((items: CelebrationPayload[]) => {
    const valid = items.filter((p) => CELEBRATIONS[p.event]);
    if (valid.length) setQueue((q) => [...q, ...valid]);
  }, []);

  const pull = useCallback(async () => {
    // "Desactivada" no drena: deja las celebraciones pendientes en servidor en
    // vez de sellarlas sin mostrarlas. localStorage es la fuente viva de la
    // preferencia, así que se relee tras el await (pudo cambiar).
    if (readCelebrationPreference() === "disabled") return;
    const items = await pullPendingCelebrations();
    if (readCelebrationPreference() === "disabled") return;
    for (const p of items) {
      logCelebration("celebration_triggered", {
        event: p.event,
        reducedMotion: readCelebrationPreference() === "reduced",
      });
    }
    enqueue(items);
  }, [enqueue]);

  const triggerCelebration = useCallback(
    (payload: CelebrationPayload) => {
      if (readCelebrationPreference() === "disabled") {
        logCelebration("celebration_skipped_preference", { event: payload.event });
        return;
      }
      logCelebration("celebration_triggered", {
        event: payload.event,
        reducedMotion: readCelebrationPreference() === "reduced",
      });
      enqueue([payload]);
    },
    [enqueue],
  );

  const setPreference = useCallback((pref: CelebrationPreference) => {
    writeCelebrationPreference(pref); // el store externo lo propaga al render
  }, []);

  // Drena al montar, al volver a la pestaña y cuando el dominio avisa
  // (checkCelebrations() tras una mutación). No hay setState síncrono aquí: pull
  // encola tras el await, no en el cuerpo del efecto.
  useEffect(() => {
    // El drenado inicial va en una macrotarea, no en el cuerpo síncrono del
    // efecto: encola estado y hacerlo síncrono dispararía
    // react-hooks/set-state-in-effect. Los otros drenados ya viven en callbacks.
    const initial = setTimeout(() => void pull(), 0);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    const offCheck = onCelebrationCheck(() => void pull());
    return () => {
      clearTimeout(initial);
      document.removeEventListener("visibilitychange", onVisible);
      offCheck();
    };
  }, [pull]);

  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);

  return (
    <CelebrationContext.Provider
      value={{ triggerCelebration, pull, preference, setPreference }}
    >
      {children}
      <CelebrationOverlay
        payload={current}
        preference={preference}
        onDone={dismiss}
      />
    </CelebrationContext.Provider>
  );
}
