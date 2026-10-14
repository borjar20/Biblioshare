import type { WorkKey } from '@/lib/comparisons/types';
import type { AtlasPerson, AtlasWork, Camera, Point, Viewport } from '@/lib/comparisons/atlas/types';
import type { QuienLayout } from '@/lib/comparisons/atlas/layout';
import type { TiempoLayout } from '@/lib/comparisons/atlas/tiempo';
import type { IslandsLayout } from '@/lib/comparisons/atlas/islands';
import type { Scene } from '@/lib/comparisons/atlas/scene';
import { clamp, fit, panBy, stepCamera, toScreen, toWorld, zoomAt, zoomToward, MAX_ZOOM, MIN_ZOOM } from '@/lib/comparisons/atlas/camera';
import { COVER_ZOOM, readPalette, TITLE_ZOOM, type PaintView } from './atlas-palette';
import { diffMix } from '@/lib/comparisons/atlas/opinion';
import { mixHex } from '@/lib/comparisons/atlas/color';
import { paintOpinionBack, type OpinionLabels } from './paint-opinion';
import { paintQuienBack, paintQuienFront } from './paint-quien';
import { paintLinks } from './paint-links';
import { paintTiempoBack } from './paint-tiempo';
import cdnLoader from '@/lib/images/cdn-loader';
import { createImageCache, type ImageLike } from '@/lib/comparisons/atlas/image-cache';
import { paintIslasBack, type IslandText } from './paint-islas';
import { nearestSprite, probeOf, stepSprites, syncSprites, type Sprite } from './atlas-sprites';

export { COVER_ZOOM, TITLE_ZOOM } from './atlas-palette';
export type AtlasHit = { key: WorkKey; x: number; y: number };
export type EngineProps = { people: AtlasPerson[]; works: AtlasWork[]; active: string[]; scene: Scene; quien: QuienLayout; tiempo: TiempoLayout; islas: IslandsLayout;
  /** Texts of the Islas titles; the painter skips them while absent. */
  islandText?: IslandText;
  /** Texts of the Opinión background; the painter skips them while absent. */
  opinionLabels?: OpinionLabels;
  countLabel: (count: number) => string; onTogglePerson: (id: string) => void;
  onHover: (hit: AtlasHit | null) => void; onActivate: (hit: AtlasHit | null, pointerType: string) => void;
  /** Screen space covered by the overlays (summary + faces on top, lens dock below); fit and fly-to frame the free band. */
  insets?: { top: number; bottom: number } };
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function createAtlasEngine(canvas: HTMLCanvasElement, host: HTMLElement, props: () => EngineProps) {
  const ctx = canvas.getContext('2d');
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let palette = readPalette(host);
  let vp: Viewport = { width: 0, height: 0 }; let dpr = 1;
  let cam: Camera = { x: 0, y: 0, k: 0.3 }; let target: Camera | null = null; let fitted = false;
  let extentKey = ''; let raf = 0; let disposed = false; let dirtyProbe = true;
  const sprites = new Map<string, Sprite>();
  /** Built in `sync()`, not per frame: the work behind each sprite and each person's colour. */
  let byKey = new Map<WorkKey, AtlasWork>(); let colorOf = new Map<string, string>();
  const linkPoint = (id: string) => sprites.get(id) ?? null;
  const linkGlow = (id: string) => (sprites.get(id)?.hl ?? 0) > 0.5;

  const insets = () => props().insets ?? { top: 75, bottom: 75 };
  /** Shifts a camera so that its focus lands in the middle of the band between the overlays. */
  const framed = (c: Camera): Camera => { const { top, bottom } = insets(); return { ...c, y: c.y - (top - bottom) / 2 / c.k }; };
  const fitCamera = () => { const { top, bottom } = insets(); return framed(fit(props().scene.extent, vp, { x: 32, y: top + bottom + 24 })); };
  let lastFit: Camera | null = null; let insetsKey = ''; let touched = false;
  const refit = () => { lastFit = fitCamera(); target = lastFit; };
  /** Jump straight to the fit, no glide (the user has not seen the previous framing as theirs). */
  const snapFit = () => { cam = lastFit = fitCamera(); target = null; };
  /** The camera still rests on (or heads to) the last fit: nobody has moved it since. */
  const atFit = () => !!lastFit && ((target ?? cam) === lastFit
    || (!target && Math.abs(cam.k / lastFit.k - 1) < 0.002 && Math.hypot(cam.x - lastFit.x, cam.y - lastFit.y) < 0.5));
  const COVER_CAPACITY = 300;
  const covers = createImageCache({ capacity: COVER_CAPACITY, create: () => { const img = new Image(); img.decoding = 'async'; return img as unknown as ImageLike; },
    resolve: src => cdnLoader({ src, width: 96 }), onReady: () => kick() });
  /** New cover requests allowed per frame, so a crowded screen does not fire hundreds of fetches at once. */
  const MAX_REQUESTS = 24; let requests = 0;
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
    const { scene, works, people } = props();
    syncSprites(sprites, scene, reduce);
    byKey = new Map(works.map(work => [work.key, work])); colorOf = new Map(people.map(person => [person.id, person.color]));
    const nextExtent = JSON.stringify(scene.extent);
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
    raf = 0; if (disposed) return; let animating = false;
    if (target) { const step = stepCamera(cam, target, reduce ? 1 : 0.16); cam = step.camera; if (step.done) target = null; else animating = true; }
    if (stepSprites(sprites)) animating = true;
    const starved = draw(); host.dataset.atlasCovers = String(covers.size());
    // A finger on the canvas counts as movement (no probe mid-gesture), but only animations re-schedule the frame:
    // pointer moves kick their own. Covers left out by the per-frame request cap get another frame.
    const moving = animating || pointers.size > 0;
    host.dataset.atlasMoving = String(moving); host.dataset.atlasZoom = cam.k.toFixed(3); host.dataset.atlasSprites = String(sprites.size);
    if (animating || (starved && covers.size() < COVER_CAPACITY)) kick();
    else if (!moving && dirtyProbe) { dirtyProbe = false; host.dataset.atlasProbe = JSON.stringify(probeOf(sprites, cam, vp)); }
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
  /** Paints one frame; true when the request cap left visible covers unrequested. */
  function draw(): boolean {
    if (!ctx) return false;
    const { active, scene, quien, people, countLabel } = props();
    requests = 0; let starved = false;
    const k = cam.k, coverMode = k > COVER_ZOOM, titles = k > TITLE_ZOOM, hw = vp.width / 2, hh = vp.height / 2;
    const view: PaintView = { ctx, cam, vp, palette, text };
    const tint = (s: Sprite) => s.diff === null ? null : mixHex(palette.glow, palette.clash, diffMix(s.diff));
    const quienPaint = { layout: quien, active, people, countLabel };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, vp.width, vp.height);
    switch (scene.lens) {
      case 'quien': paintQuienBack(view, quienPaint); break;
      case 'opinion': paintOpinionBack(view, props().opinionLabels); break;
      case 'tiempo': paintTiempoBack(view, { layout: props().tiempo, people }); break;
      case 'islas': paintIslasBack(view, { layout: props().islas, people, text: props().islandText }); break;
    }
    paintLinks(view, scene.links, linkPoint, linkGlow);
    for (const s of sprites.values()) {
      if (s.a < 0.02) continue;
      const px = (s.x - cam.x) * k + hw, py = (s.y - cam.y) * k + hh;
      if (px < -60 || py < -80 || px > vp.width + 60 || py > vp.height + 80) continue;
      const work = byKey.get(s.key); if (!work) continue;
      ctx.globalAlpha = s.a; const shared = work.owners.length > 1;
      const ink = tint(s);
      if (!coverMode) {
        const r = (ink ? Math.max(3, 4.2 * k * 1.4) : Math.max(1.5, (shared ? 3.4 : 2.4) * k * 1.4)) * (1 + s.hl * 0.45);
        ctx.fillStyle = ink ?? (s.hl > 0.5 ? palette.glow : shared ? palette.cream : colorOf.get(work.owners[0].userId)!);
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); continue;
      }
      const cw = (ink ? 10 : 8.4) * k, ch = (ink ? 14.5 : 12.2) * k, x = px - cw / 2, y = py - ch / 2;
      if (ink || s.hl > 0.3) { ctx.fillStyle = ink ?? palette.glow; roundRect(x - 2, y - 2, cw + 4, ch + 4, 3 + k * 0.3); ctx.fill(); }
      let img: ImageLike | null = null;
      if (work.coverUrl) {
        if (!covers.has(work.coverUrl)) { if (requests < MAX_REQUESTS) { covers.request(work.coverUrl); requests++; } else starved = true; }
        img = covers.get(work.coverUrl);
      }
      if (img) {
        ctx.save(); roundRect(x, y, cw, ch, 1 + k * 0.4); ctx.clip();
        ctx.drawImage(img as unknown as HTMLImageElement, x, y, cw, ch); ctx.restore();
      } else {
        ctx.fillStyle = palette.type[work.itemType]; roundRect(x, y, cw, ch, 1 + k * 0.4); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x, y + ch * 0.7, cw, ch * 0.3);
      }
      for (let i = 0; i < work.owners.length && i < 5; i++) {
        ctx.fillStyle = colorOf.get(work.owners[i].userId)!; ctx.beginPath();
        ctx.arc(x + cw - (1.6 + i * 1.9) * k, y + 1.6 * k, 0.8 * k, 0, Math.PI * 2); ctx.fill();
      }
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
    if (scene.lens === 'quien') paintQuienFront(view, quienPaint);
    return starved;
  }
  function hitWork(s: Point): AtlasHit | null {
    const world = toWorld(cam, vp, s);
    const hit = nearestSprite(sprites, world.x, world.y, Math.max(6, 10 / cam.k));
    return hit && { key: hit.key, x: s.x, y: s.y };
  }
  /** `anchor`: the world point under the fingers' midpoint when the pinch began; it stays under the midpoint. */
  const pointers = new Map<number, Point>(); let pinch: { d: number; k: number; anchor: Point } | null = null;
  /** `travel`: farthest the pointer went from `down`; a tap needs it under 5 px, not just the ends. */
  let down: Point | null = null; let travel = 0; let lastTap: (Point & { t: number }) | null = null;
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const local = (e: { clientX: number; clientY: number }): Point => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const hitPole = (p: Point) => props().scene.lens !== 'quien' ? undefined
    : props().quien.poles.find(item => dist(toScreen(cam, vp, item), p) < 30);
  /** Shared groups are only targets at map zoom; past COVER_ZOOM the covers inside them are. */
  const hitCluster = (p: Point) => props().scene.lens === 'quien' && cam.k <= COVER_ZOOM
    ? props().quien.clusters.find(item => dist(toScreen(cam, vp, item), p) < item.r * cam.k + 6) : undefined;
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
    touched = true; canvas.style.cursor = ''; canvas.setPointerCapture?.(e.pointerId); const p = local(e); pointers.set(e.pointerId, p); target = null; down = p; travel = 0;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.max(dist(a, b), 1), k: cam.k, anchor: toWorld(cam, vp, mid(a, b)) }; down = null; }
    canvas.dataset.dragging = 'true'; kick();
  }
  function onMove(e: PointerEvent) {
    const p = local(e);
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType !== 'mouse') return;
      const hit = hitWork(p); canvas.style.cursor = hit ? 'pointer' : ''; props().onHover(hit); return;
    }
    const prev = pointers.get(e.pointerId)!; pointers.set(e.pointerId, p);
    if (down) travel = Math.max(travel, dist(p, down));
    if (pointers.size === 2 && pinch) {
      // Zoom by the fingers' spread and pan by their midpoint: the anchor stays under the midpoint.
      const [a, b] = [...pointers.values()]; const m = mid(a, b); const k = clamp(pinch.k * dist(a, b) / pinch.d, MIN_ZOOM, MAX_ZOOM);
      cam = { k, x: pinch.anchor.x - (m.x - vp.width / 2) / k, y: pinch.anchor.y - (m.y - vp.height / 2) / k };
    } else cam = panBy(cam, p.x - prev.x, p.y - prev.y);
    props().onHover(null); kick();
  }
  function onUp(e: PointerEvent) {
    const p = local(e); pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
    if (!pointers.size) delete canvas.dataset.dragging;
    if (down && Math.max(travel, dist(p, down)) < 5) tap(p, e.pointerType, e.timeStamp);
    down = null; kick();
  }
  function onCancel(e: PointerEvent) { pointers.delete(e.pointerId); pinch = null; down = null; delete canvas.dataset.dragging; kick(); }
  function onLeave(e: PointerEvent) { if (e.pointerType === 'mouse') props().onHover(null); }
  function onWheel(e: WheelEvent) {
    e.preventDefault(); touched = true; target = null;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vp.height : 1;   // lines / pages to pixels
    cam = zoomAt(cam, vp, local(e), Math.exp(-e.deltaY * unit * 0.0018)); props().onHover(null); kick();
  }
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
