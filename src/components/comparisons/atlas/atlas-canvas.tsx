'use client';
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import { createAtlasEngine, type AtlasEngine, type EngineProps } from './atlas-engine';
import styles from './atlas.module.css';

export type AtlasCanvasHandle = { zoomBy(factor: number): void; fit(): void };
type Props = EngineProps & { label: string; ref?: Ref<AtlasCanvasHandle> };

export function AtlasCanvas({ ref, label, ...props }: Props) {
  const host = useRef<HTMLDivElement>(null); const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props); const engine = useRef<AtlasEngine | null>(null);
  useLayoutEffect(() => { latest.current = props; });
  useEffect(() => {
    const created = createAtlasEngine(canvas.current!, host.current!, () => latest.current);
    engine.current = created;
    return () => { created.dispose(); engine.current = null; };
  }, []);
  useEffect(() => { engine.current?.sync(); }, [props.layout, props.active, props.works]);
  useImperativeHandle(ref, () => ({ zoomBy: factor => engine.current?.zoomBy(factor), fit: () => engine.current?.fitAll() }), []);
  return <div ref={host} className={styles.canvasWrap} data-atlas-moving="false">
    <canvas ref={canvas} className={styles.canvas} role="img" aria-label={label}/>
  </div>;
}
