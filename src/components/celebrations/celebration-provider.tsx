"use client";

import { createContext, startTransition, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { CelebrationOverlay } from "./celebration-overlay";
import { ackCelebration, claimNextCelebration, releaseCelebration } from "@/lib/celebrations/pull-actions";
import { CelebrationConsumer, type CelebrationSnapshot } from "@/lib/celebrations/consumer";
import { logCelebration } from "@/lib/celebrations/analytics";
import { emitCelebrationsShown, onCelebrationCheck, readCelebrationPreference, subscribeCelebrationPreference, writeCelebrationPreference } from "@/lib/celebrations/preference";
import type { CelebrationPayload, CelebrationPreference } from "@/lib/celebrations/types";

interface CelebrationContextValue {
  triggerCelebration: (payload: CelebrationPayload) => void;
  /** Coalesces a request; does not expose an unobserved action rejection. */
  pull: () => void;
  preference: CelebrationPreference;
  setPreference: (preference: CelebrationPreference) => void;
}
const CelebrationContext = createContext<CelebrationContextValue | null>(null);
type BindActor = (actorId: string | null, refresh: () => void) => () => void;
const ActorContext = createContext<BindActor | null>(null);

export function useCelebration(): CelebrationContextValue {
  const context = useContext(CelebrationContext);
  if (!context) throw new Error("useCelebration debe usarse dentro de <CelebrationProvider>");
  return context;
}
export function useBindCelebrationActor(): BindActor {
  const bind = useContext(ActorContext);
  if (!bind) throw new Error("CelebrationActorBridge necesita <CelebrationProvider>");
  return bind;
}

// Imported Server Actions invoked by effects/events use the action transition.
// The returned promise always has a rejection observer in the consumer pump.
function actionTransition<T>(action: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    startTransition(async () => {
      try { resolve(await action()); } catch (error) { reject(error); }
    });
  });
}
const serverSnapshot: CelebrationSnapshot = { current: null, generation: 0 };
const serverPreference = (): CelebrationPreference => "full";

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [consumer] = useState(() => new CelebrationConsumer({
    actions: {
      claimNextCelebration: input => actionTransition(() => claimNextCelebration(input)),
      ackCelebration: input => actionTransition(() => ackCelebration(input)),
      releaseCelebration: input => actionTransition(() => releaseCelebration(input)),
    },
    preference: readCelebrationPreference,
    visible: () => document.visibilityState === "visible",
    now: () => performance.now(),
    log: logCelebration,
    emitShown: emitCelebrationsShown,
  }));
  const snapshot = useSyncExternalStore(consumer.subscribe, consumer.getSnapshot, () => serverSnapshot);
  const preference = useSyncExternalStore(subscribeCelebrationPreference, readCelebrationPreference, serverPreference);
  const bindActor = useCallback<BindActor>((actorId, refresh) => consumer.bindActor(actorId, refresh), [consumer]);
  const setPreference = useCallback((value: CelebrationPreference) => writeCelebrationPreference(value), []);

  useEffect(() => {
    consumer.start();
    const changed = () => consumer.presentationChanged();
    document.addEventListener("visibilitychange", changed);
    const offPreference = subscribeCelebrationPreference(changed);
    const offCheck = onCelebrationCheck(consumer.pull);
    return () => {
      offCheck();
      offPreference();
      document.removeEventListener("visibilitychange", changed);
      consumer.stop();
    };
  }, [consumer]);

  return (
    <CelebrationContext.Provider value={{ triggerCelebration: consumer.trigger, pull: consumer.pull, preference, setPreference }}>
      <ActorContext.Provider value={bindActor}>{children}</ActorContext.Provider>
      <CelebrationOverlay entry={snapshot.current} generation={snapshot.generation} preference={preference} onShown={consumer.shown} onDone={consumer.done} />
    </CelebrationContext.Provider>
  );
}
