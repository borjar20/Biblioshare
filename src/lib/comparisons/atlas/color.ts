/** Linear mix of two `#rrggbb` colours (t in [0, 1]). Anything else returns `a` unchanged. */
export function mixHex(a: string, b: string, t: number): string {
  const parse = (c: string) => /^#[0-9a-f]{6}$/i.test(c) ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : null;
  const from = parse(a), to = parse(b);
  if (!from || !to) return a;
  return `rgb(${from.map((v, i) => Math.round(v + (to[i] - v) * t)).join(',')})`;
}
