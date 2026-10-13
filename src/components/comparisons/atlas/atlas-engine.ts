import type { WorkKey } from '@/lib/comparisons/types';
import type { AtlasPerson, AtlasWork, Camera, Point, Viewport } from '@/lib/comparisons/atlas/types';
import { clusterState, workState, type QuienLayout } from '@/lib/comparisons/atlas/layout';
import { approach, clamp, fit, panBy, stepCamera, toScreen, toWorld, zoomAt, zoomToward, MAX_ZOOM, MIN_ZOOM } from '@/lib/comparisons/atlas/camera';
import { nearest } from '@/lib/comparisons/atlas/hit';
import { initials } from '../presentation';

export const COVER_ZOOM = 1.1;
export const TITLE_ZOOM = 3.2;
export type AtlasHit = { key: WorkKey; x: number; y: number };
export type EngineProps = { people: AtlasPerson[]; works: AtlasWork[]; active: string[]; layout: QuienLayout;
  countLabel: (count: number) => string; onTogglePerson: (id: string) => void;
  onHover: (hit: AtlasHit | null) => void; onActivate: (hit: AtlasHit | null, pointerType: string) => void;
  /** Screen space covered by the overlays (summary + faces on top, lens dock below); fit and fly-to frame the free band. */
  insets?: { top: number; bottom: number } };
type Sprite = { x: number; y: number; tx: number; ty: number; a: number; ta: number; hl: number; thl: number };
type Palette = { fg: string; muted: string; line: string; glow: string; cream: string; font: string;
  type: Record<AtlasWork['itemType'], string> };

function readPalette(host: Element): Palette {
  const css = getComputedStyle(host);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return { fg: v('--atlas-fg', '#f1e7dd'), muted: v('--atlas-muted', '#b2a293'), line: v('--atlas-line', '#4a3d34'),
    glow: v('--atlas-glow', '#f2c27b'), cream: v('--atlas-cream', '#e9dccf'), font: css.fontFamily || 'system-ui, sans-serif',
    type: { book: v('--type-book', '#cf8a54'), movie: v('--type-movie', '#6bb0b4'), series: v('--type-series', '#b592bd') } };
}
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function createAtlasEngine(canvas: HTMLCanvasElement, host: HTMLElement, props: () => EngineProps) {
  const ctx = canvas.getContext('2d');
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let palette = readPalette(host);
  let vp: Viewport = { width: 0, height: 0 }; let dpr = 1;
  let cam: Camera = { x: 0, y: 0, k: 0.3 }; let target: Camera | null = null; let fitted = false;
  let extentKey = ''; let raf = 0; let disposed = false; let dirtyProbe = true;
  const sprites = new Map<WorkKey, Sprite>();

  const insets = () => props().insets ?? { top: 75, bottom: 75 };
  /** Shifts a camera so that its focus lands in the middle of the band between the overlays. */
  const framed = (c: Camera): Camera => { const { top, bottom } = insets(); return { ...c, y: c.y - (top - bottom) / 2 / c.k }; };
  const fitCamera = () => { const { top, bottom } = insets(); return framed(fit(props().layout.extent, vp, { x: 32, y: top + bottom + 24 })); };
  let lastFit: Camera | null = null; let insetsKey = ''; let touched = false;
  const refit = () => { lastFit = fitCamera(); target = lastFit; };
  /** Jump straight to the fit, no glide (the user has not seen the previous framing as theirs). */
  const snapFit = () => { cam = lastFit = fitCamera(); target = null; };
  /** The camera still rests on (or heads to) the last fit: nobody has moved it since. */
  const atFit = () => !!lastFit && ((target ?? cam) === lastFit
    || (!target && Math.abs(cam.k / lastFit.k - 1) < 0.002 && Math.hypot(cam.x - lastFit.x, cam.y - lastFit.y) < 0.5));
  function kick() { dirtyProbe = true; if (!raf && !disposed && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame); }
  function resize() {
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const wasAtFit = atFit();
    vp = { width: host.clientWidth, height: host.clientHeight };
    canvas.width = Math.round(vp.width * dpr); canvas.height = Math.round(vp.height * dpr);
    palette = readPalette(host);
    if (vp.width > 0 && vp.height > 0 && (!fitted || wasAtFit)) { snapFit(); fitted = true; }
    kick();
  }
  function sync() {
    const { works, active, layout } = props(); const seen = new Set<WorkKey>();
    for (const work of works) {
      const p = layout.positions.get(work.key); if (!p) continue;
      const state = workState(work, active); seen.add(work.key);
      const sprite = sprites.get(work.key) ?? { x: p.x, y: p.y, tx: p.x, ty: p.y, a: state.alpha, ta: state.alpha, hl: state.glow ? 1 : 0, thl: 0 };
      sprite.tx = p.x; sprite.ty = p.y; sprite.ta = state.alpha; sprite.thl = state.glow ? 1 : 0;
      if (reduce) { sprite.x = p.x; sprite.y = p.y; sprite.a = sprite.ta; sprite.hl = sprite.thl; }
      sprites.set(work.key, sprite);
    }
    for (const key of [...sprites.keys()]) if (!seen.has(key)) sprites.delete(key);
    const nextExtent = JSON.stringify(layout.extent);
    if (nextExtent !== extentKey) { extentKey = nextExtent; if (fitted) refit(); }
    // Overlays measured after the first fit: reframe only while the camera still rests on (or heads to) that fit;
    // before any interaction (initial load) jump there instead of gliding.
    const nextInsets = JSON.stringify(insets());
    if (nextInsets !== insetsKey) {
      insetsKey = nextInsets;
      if (fitted && atFit()) { if (touched) refit(); else snapFit(); }
    }
    kick();
  }
  function frame() {
    raf = 0; if (disposed) return; let moving = false;
    if (target) { const step = stepCamera(cam, target, reduce ? 1 : 0.16); cam = step.camera; if (step.done) target = null; else moving = true; }
    for (const s of sprites.values()) {
      const x = approach(s.x, s.tx, 0.11, 0.15), y = approach(s.y, s.ty, 0.11, 0.15);
      const a = approach(s.a, s.ta, 0.14, 0.01), h = approach(s.hl, s.thl, 0.14, 0.01);
      s.x = x.value; s.y = y.value; s.a = a.value; s.hl = h.value;
      if (!(x.settled && y.settled && a.settled && h.settled)) moving = true;
    }
    draw(); if (pointers.size > 0) moving = true;
    host.dataset.atlasMoving = String(moving); host.dataset.atlasZoom = cam.k.toFixed(3);
    if (moving) { if (!pointers.size) kick(); } else if (dirtyProbe) { dirtyProbe = false; publishProbe(); }
  }
  function visible(p: Point) { return p.x >= -60 && p.y >= -80 && p.x <= vp.width + 60 && p.y <= vp.height + 80; }
  function publishProbe() {
    const probe: AtlasHit[] = [];
    for (const [key, s] of sprites) {
      if (s.a < 0.5) continue; const p = toScreen(cam, vp, s);
      if (p.x >= 0 && p.y >= 0 && p.x <= vp.width && p.y <= vp.height) probe.push({ key, x: Math.round(p.x), y: Math.round(p.y) });
    }
    host.dataset.atlasProbe = JSON.stringify(probe.toSorted((a, b) => a.key < b.key ? -1 : 1).slice(0, 60));
  }
  function text(value: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left') {
    ctx!.font = font; ctx!.fillStyle = color; ctx!.textAlign = align; ctx!.fillText(value, x, y); ctx!.textAlign = 'left';
  }
  /** Word wrap that also breaks words wider than the cover; at most `max` lines, the last one with an ellipsis if cut. */
  function wrap(value: string, maxWidth: number, max = 3): string[] {
    const fits = (t: string) => ctx!.measureText(t).width <= maxWidth;
    const lines: string[] = []; let line = '';
    const push = (t: string) => { lines.push(t); return lines.length < max; };
    outer: for (const word of value.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (fits(next)) { line = next; continue; }
      if (line) { if (!push(line)) { line = ''; lines[lines.length - 1] += ` ${word}`; break; } line = ''; }
      let rest = word;
      while (!fits(rest)) {
        let n = 1; while (n < rest.length && fits(rest.slice(0, n + 1))) n++;
        if (!push(rest.slice(0, n))) { lines[lines.length - 1] += rest.slice(n); line = ''; break outer; }
        rest = rest.slice(n);
      }
      line = rest;
    }
    if (line && lines.length < max) lines.push(line);
    const last = lines.length - 1;
    if (last >= 0 && !fits(lines[last])) {
      let cut = lines[last]; while (cut.length > 1 && !fits(`${cut}…`)) cut = cut.slice(0, -1);
      lines[last] = `${cut}…`;
    }
    return lines;
  }
  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx!.beginPath(); ctx!.roundRect(x, y, w, h, r);
  }
  function draw() {
    if (!ctx) return;
    const { works, active, layout, people, countLabel } = props();
    const k = cam.k, covers = k > COVER_ZOOM, titles = k > TITLE_ZOOM;
    const color = new Map(people.map(person => [person.id, person.color]));
    const poles = new Map(layout.poles.map(pole => [pole.userId, pole]));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, vp.width, vp.height);
    // Threads from each owner to each labelled shared group, and the common glow.
    for (const cluster of layout.clusters) {
      const state = clusterState(cluster, active); if (!state.labelled) continue;
      const c = toScreen(cam, vp, cluster);
      for (const owner of cluster.owners) {
        const p = toScreen(cam, vp, poles.get(owner)!);
        ctx.strokeStyle = state.on ? color.get(owner)! : palette.line; ctx.globalAlpha = state.on ? 0.5 : 0.22;
        ctx.lineWidth = Math.max(1, Math.sqrt(cluster.keys.length) * 0.9);
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo((p.x + c.x) / 2 * 0.9 + vp.width / 2 * 0.1, (p.y + c.y) / 2 * 0.9 + vp.height / 2 * 0.1, c.x, c.y); ctx.stroke();
      }
      if (state.common) {
        const r = cluster.r * k + 34; const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
        g.addColorStop(0, 'rgba(242,194,123,.22)'); g.addColorStop(1, 'rgba(242,194,123,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    const byKey = new Map(works.map(work => [work.key, work]));
    for (const [key, s] of sprites) {
      if (s.a < 0.02) continue; const work = byKey.get(key); if (!work) continue;
      const p = toScreen(cam, vp, s); if (!visible(p)) continue;
      ctx.globalAlpha = s.a; const shared = work.owners.length > 1;
      if (!covers) {
        const r = Math.max(1.5, (shared ? 3.4 : 2.4) * k * 1.4) * (1 + s.hl * 0.45);
        ctx.fillStyle = s.hl > 0.5 ? palette.glow : shared ? palette.cream : color.get(work.owners[0].userId)!;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); continue;
      }
      const cw = 8.4 * k, ch = 12.2 * k, x = p.x - cw / 2, y = p.y - ch / 2;
      if (s.hl > 0.3) { ctx.fillStyle = palette.glow; roundRect(x - 2, y - 2, cw + 4, ch + 4, 3 + k * 0.3); ctx.fill(); }
      ctx.fillStyle = palette.type[work.itemType]; roundRect(x, y, cw, ch, 1 + k * 0.4); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x, y + ch * 0.7, cw, ch * 0.3);
      work.owners.slice(0, 5).forEach((owner, i) => {
        ctx.fillStyle = color.get(owner.userId)!; ctx.beginPath();
        ctx.arc(x + cw - (1.6 + i * 1.9) * k, y + 1.6 * k, 0.8 * k, 0, Math.PI * 2); ctx.fill();
      });
      if (titles && work.title) {
        // Legible size regardless of zoom, wrapped to the cover with a scrim behind it.
        const size = Math.min(14, Math.max(9, 1.5 * k)), step = size * 1.15, pad = Math.max(2, 0.6 * k);
        ctx.font = `600 ${size}px ${palette.font}`;
        const lines = wrap(work.title, cw - pad * 2);
        const band = lines.length * step + pad * 1.4;
        ctx.save(); roundRect(x, y, cw, ch, 1 + k * 0.4); ctx.clip();
        ctx.fillStyle = 'rgba(20,14,10,.72)'; ctx.fillRect(x, y + ch - band, cw, band);
        ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
        lines.forEach((line, i) => ctx.fillText(line, x + pad, y + ch - pad - (lines.length - 1 - i) * step - size * 0.18));
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    if (k > 0.12 && k < TITLE_ZOOM) for (const cluster of layout.clusters) {
      const state = clusterState(cluster, active); if (!state.labelled) continue;
      const c = toScreen(cam, vp, cluster); ctx.globalAlpha = state.on ? 1 : 0.35;
      text(String(cluster.keys.length), c.x, c.y - cluster.r * k - 10, `800 ${Math.min(30, 14 + Math.sqrt(cluster.keys.length))}px ${palette.font}`,
        state.common ? palette.glow : palette.fg, 'center');
    }
    for (const pole of layout.poles) {
      const person = people.find(item => item.id === pole.userId); if (!person) continue;
      const p = toScreen(cam, vp, pole); const on = active.includes(person.id);
      ctx.globalAlpha = on ? 1 : 0.4; ctx.fillStyle = person.color; ctx.beginPath(); ctx.arc(p.x, p.y, 26, 0, Math.PI * 2); ctx.fill();
      if (on) { ctx.strokeStyle = palette.fg; ctx.lineWidth = 3; ctx.stroke(); }
      text(initials(person.name), p.x, p.y + 5, `800 15px ${palette.font}`, '#fff', 'center');
      text(person.name, p.x, p.y + 44, `600 13px ${palette.font}`, palette.fg, 'center');
      text(countLabel(pole.count), p.x, p.y + 59, `500 12px ${palette.font}`, palette.muted, 'center');
    }
    ctx.globalAlpha = 1;
  }
  function hitWork(s: Point): AtlasHit | null {
    const world = toWorld(cam, vp, s); const radius = Math.max(6, 10 / cam.k);
    const candidates = [...sprites].filter(([, sprite]) => sprite.a >= 0.5).map(([key, sprite]) => ({ key, x: sprite.x, y: sprite.y }));
    const hit = nearest(candidates, world, radius);
    return hit && { key: hit.key, x: s.x, y: s.y };
  }
  const pointers = new Map<number, Point>(); let pinch: { d: number; k: number } | null = null;
  let down: Point | null = null; let lastTap: (Point & { t: number }) | null = null;
  const local = (e: { clientX: number; clientY: number }): Point => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const hitPole = (p: Point) => props().layout.poles.find(item => dist(toScreen(cam, vp, item), p) < 30);
  /** Shared groups are only targets at map zoom; past COVER_ZOOM the covers inside them are. */
  const hitCluster = (p: Point) => cam.k <= COVER_ZOOM ? props().layout.clusters.find(item => dist(toScreen(cam, vp, item), p) < item.r * cam.k + 6) : undefined;
  function tap(p: Point, pointerType: string, time: number) {
    const { onTogglePerson, onActivate } = props();
    const pole = hitPole(p);
    if (pole) { onTogglePerson(pole.userId); return; }
    const cluster = hitCluster(p);
    if (cluster) { const band = Math.max(1, vp.height - insets().top - insets().bottom);
      target = framed({ x: cluster.x, y: cluster.y, k: clamp(Math.min(vp.width, band) * 0.38 / cluster.r, 1.6, 2.8) }); kick(); return; }
    const hit = hitWork(p);
    if (hit) { lastTap = null; onActivate(hit, pointerType); return; }
    if (pointerType !== 'mouse' && lastTap && time - lastTap.t < 300 && dist(p, lastTap) < 24) { target = zoomToward(cam, vp, p, 2.6); lastTap = null; kick(); return; }
    lastTap = { ...p, t: time }; onActivate(null, pointerType);
  }
  function onDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    touched = true; canvas.style.cursor = ''; canvas.setPointerCapture?.(e.pointerId); const p = local(e); pointers.set(e.pointerId, p); target = null; down = p;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.max(dist(a, b), 1), k: cam.k }; down = null; }
    canvas.dataset.dragging = 'true';
  }
  function onMove(e: PointerEvent) {
    const p = local(e);
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType !== 'mouse') return;
      const hit = hitWork(p); canvas.style.cursor = hit ? 'pointer' : ''; props().onHover(hit); return;
    }
    const prev = pointers.get(e.pointerId)!; pointers.set(e.pointerId, p);
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      cam = zoomAt(cam, vp, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, pinch.k * dist(a, b) / pinch.d / cam.k);
    } else cam = panBy(cam, p.x - prev.x, p.y - prev.y);
    props().onHover(null); kick();
  }
  function onUp(e: PointerEvent) {
    const p = local(e); pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
    if (!pointers.size) delete canvas.dataset.dragging;
    if (down && dist(p, down) < 5) tap(p, e.pointerType, e.timeStamp);
    down = null; kick();
  }
  function onCancel(e: PointerEvent) { pointers.delete(e.pointerId); pinch = null; down = null; delete canvas.dataset.dragging; kick(); }
  function onLeave(e: PointerEvent) { if (e.pointerType === 'mouse') props().onHover(null); }
  function onWheel(e: WheelEvent) { e.preventDefault(); touched = true; target = null; cam = zoomAt(cam, vp, local(e), Math.exp(-e.deltaY * 0.0018)); props().onHover(null); kick(); }
  /** Same hit order as `tap`: the click already toggled a pole or flew to a group, so only empty space zooms. */
  function onDoubleClick(e: MouseEvent) {
    const p = local(e); touched = true;
    if (hitPole(p) || hitCluster(p) || hitWork(p)) return;
    target = zoomToward(cam, vp, p, 2.6); kick();
  }

  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('pointerleave', onLeave); canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDoubleClick);
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(host); resize();
  document.fonts?.ready.then(kick).catch(() => {});

  return {
    sync,
    zoomBy(factor: number) { touched = true; target = { ...(target ?? cam), k: clamp((target ?? cam).k * factor, MIN_ZOOM, MAX_ZOOM) }; kick(); },
    fitAll() { touched = true; refit(); kick(); },
    dispose() {
      disposed = true; if (raf) cancelAnimationFrame(raf); observer?.disconnect();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave); canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDoubleClick);
    },
  };
}
export type AtlasEngine = ReturnType<typeof createAtlasEngine>;
