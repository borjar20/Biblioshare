"use client";

import { startTransition, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useBindCelebrationActor } from "./celebration-provider";

/** Session identity streamed under Suspense; absence of the bridge is unknown. */
export function CelebrationActorBridge({ actorId, observationId }: { actorId: string | null; observationId: string }) {
  const bindActor = useBindCelebrationActor();
  const router = useRouter();
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);
  const unbind = useRef<(() => void) | null>(null);
  useEffect(() => {
    // A fresh server observation can recover an invalidated binding even when
    // actorId is unchanged. Update without unbinding: same-actor local heads
    // and shown ACK receipts belong to the retained consumer.
    unbind.current = bindActor(actorId, refresh);
  }, [actorId, observationId, bindActor, refresh]);
  useEffect(() => () => {
    // Activity/unmount must invalidate the latest binding, not the initial one.
    unbind.current?.();
    unbind.current = null;
  }, [bindActor]);
  return null;
}
