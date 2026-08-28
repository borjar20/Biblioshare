import type { ItemType } from "./types";

// Per-media-type accent, adapted from the reel+shelf reference but expressed in
// Biblioshare's own palette tokens (--type-book / --type-movie / --type-series).
// Class strings are written out in full (never interpolated) so Tailwind's JIT
// can see them. See docs/REQUIREMENTS.md — media colour identities.
export type MediaAccent = {
  /**
   * `text-type-*-ink`, NO `text-type-*`: el color de tipo puro es de gráfico
   * (3:1) y como texto se quedaba en 3,64:1 sobre su propio tinte. El par
   * oscuro vive en globals.css, misma pareja que --accent/--accent-ink.
   */
  text: string;
  /** solid bg-type-x (progress fills, dots) */
  bg: string;
  /** faint tinted background, bg-type-x at 10% */
  bgSoft: string;
  /** border-type-x */
  border: string;
  /** faint border, border-type-x at 30% */
  borderSoft: string;
  /** ring-type-* (focused / current markers) */
  ring: string;
  /**
   * Raw CSS custom property, for gradients / SVG strokes / arbitrary values.
   * Deliberately `--type-*` and not Tailwind's `--color-type-*`: globals.css
   * declares the theme with `@theme inline`, which inlines those names into
   * utilities instead of emitting them, so `var(--color-type-book)` resolves
   * to nothing at runtime.
   */
  varName: string;
};

export const MEDIA_ACCENT: Record<ItemType, MediaAccent> = {
  book: {
    text: "text-type-book-ink",
    bg: "bg-type-book",
    bgSoft: "bg-type-book/10",
    border: "border-type-book",
    borderSoft: "border-type-book/30",
    ring: "ring-type-book",
    varName: "--type-book",
  },
  movie: {
    text: "text-type-movie-ink",
    bg: "bg-type-movie",
    bgSoft: "bg-type-movie/10",
    border: "border-type-movie",
    borderSoft: "border-type-movie/30",
    ring: "ring-type-movie",
    varName: "--type-movie",
  },
  series: {
    text: "text-type-series-ink",
    bg: "bg-type-series",
    bgSoft: "bg-type-series/10",
    border: "border-type-series",
    borderSoft: "border-type-series/30",
    ring: "ring-type-series",
    varName: "--type-series",
  },
};
