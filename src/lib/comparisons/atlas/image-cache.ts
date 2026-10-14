export type ImageLike = { src: string; onload: (() => void) | null; onerror: (() => void) | null };
type Entry = { img: ImageLike; state: 'loading' | 'ready' | 'error' };

/** LRU of cover images for the atlas canvas (spec §5.2): only ever asked for visible covers at cover zoom. */
export function createImageCache({ capacity = 300, create, resolve, onReady }: {
  capacity?: number; create: () => ImageLike; resolve: (src: string) => string; onReady: () => void;
}) {
  const entries = new Map<string, Entry>();
  const touch = (src: string, entry: Entry) => { entries.delete(src); entries.set(src, entry); };
  return {
    get(src: string): ImageLike | null {
      const entry = entries.get(src); if (!entry) return null;
      touch(src, entry); return entry.state === 'ready' ? entry.img : null;
    },
    request(src: string) {
      const existing = entries.get(src); if (existing) { touch(src, existing); return; }
      const img = create(); const entry: Entry = { img, state: 'loading' };
      img.onload = () => { entry.state = 'ready'; onReady(); };
      img.onerror = () => { entry.state = 'error'; };
      entries.set(src, entry); img.src = resolve(src);
      while (entries.size > capacity) {
        const [oldest, old] = entries.entries().next().value as [string, Entry];
        old.img.onload = null; old.img.onerror = null; old.img.src = ''; entries.delete(oldest);
      }
    },
    has: (src: string) => entries.has(src),
    size: () => entries.size,
  };
}
