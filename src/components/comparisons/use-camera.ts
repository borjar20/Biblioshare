'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Scene } from './geometry';
import { sampleMotion } from './motion';
export function useCamera(scene: Scene, transition: 'group' | 'level', reduced: boolean): Scene {
  const [displayed, setDisplayed] = useState(scene);
  const visible = useRef(scene);
  // Rebase from the frame React actually committed, rather than a pending
  // state update which a concurrent render has not painted yet.
  useLayoutEffect(() => { visible.current = displayed; }, [displayed]);
  useLayoutEffect(() => {
    const from = visible.current;
    if (from === scene) return;
    const duration = reduced ? 0 : transition === 'group' ? 850 : 720;
    if (!duration) {
      visible.current = scene;
      // Applying reduced motion before paint prevents one stale animated frame.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayed(scene);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const next = sampleMotion(from, scene, now - start, duration);
      setDisplayed(next);
      if (next !== scene) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene, transition, reduced]);
  return displayed;
}
