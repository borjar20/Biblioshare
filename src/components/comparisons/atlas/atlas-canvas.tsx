'use client';
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import { createAtlasEngine, type AtlasEngine, type EngineProps, type LensCamera } from './atlas-engine';
import styles from './atlas.module.css';

export type AtlasCanvasHandle = { zoomBy(factor: number): void; fit(): void; panBy(dx: number, dy: number): void;
  /** The current camera with its lens; null only once the canvas is gone. */
  camera(): LensCamera | null; focus(): void };
type Props = EngineProps & { label: string; ref?: Ref<AtlasCanvasHandle> };
export const ATLAS_SHORTCUTS = '+ - 0 F ArrowUp ArrowDown ArrowLeft ArrowRight 1 2 3 4';

export function AtlasCanvas({ ref, label, ...props }: Props) {
  const host = useRef<HTMLDivElement>(null); const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props); const engine = useRef<AtlasEngine | null>(null);
  useLayoutEffect(() => { latest.current = props; });
  useEffect(() => {
    const created = createAtlasEngine(canvas.current!, host.current!, () => latest.current);
    engine.current = created;
    return () => { created.dispose(); engine.current = null; };
  }, []);
  // `people` too: the engine keeps their colours from the last sync, and sync redraws.
  useEffect(() => { engine.current?.sync(); }, [props.scene, props.active, props.works, props.people, props.insets?.top, props.insets?.bottom]);
  useImperativeHandle(ref, () => ({ zoomBy: factor => engine.current?.zoomBy(factor), fit: () => engine.current?.fitAll(),
    panBy: (dx, dy) => engine.current?.panBy(dx, dy), camera: () => engine.current?.camera() ?? null,
    focus: () => canvas.current?.focus({ preventScroll: true }) }), []);
  return <div ref={host} className={styles.canvasWrap} data-atlas-moving="false">
    {/* In the tab order: the stage's shortcuts (see AtlasView) act while focus is here. The ring shows only for keyboard focus. */}
    <canvas ref={canvas} className={styles.canvas} role="img" aria-label={label} tabIndex={0} aria-keyshortcuts={ATLAS_SHORTCUTS}/>
  </div>;
}
