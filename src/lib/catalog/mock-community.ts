// Placeholder community data for item detail pages. Biblioshare has no
// cross-user reviews/ratings backend yet, so these stats are generated
// deterministically from the item id (stable across renders) purely to dress
// the "Comunidad" tab. Swap for real aggregates once the backend exists.

export type MockReview = {
  id: string;
  author: string;
  initials: string;
  date: string;
  rating: number; // 0–5
  text: string;
  likes: number;
};

export type MockCommunity = {
  avgRating: number; // 0–5, one decimal
  ratingCount: number;
  distribution: number[]; // percentages [5★, 4★, 3★, 2★, 1★]
  reviews: MockReview[];
};

// Small deterministic string hash (FNV-1a-ish) → 32-bit unsigned.
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Seeded pseudo-random generator (mulberry32) for stable per-item variation.
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REVIEW_POOL: Array<{ author: string; text: string }> = [
  {
    author: "Elena Marsh",
    text: "Una de esas obras que reordenan por dentro. Volví a las últimas cien páginas dos veces solo para quedarme un poco más.",
  },
  {
    author: "Lucas Ferreira",
    text: "La segunda vez noté cosas que la primera se me escaparon por completo. Mejora con cada relectura, y eso dice mucho.",
  },
  {
    author: "Priya Anand",
    text: "Magnífica, aunque la parte central se me hizo algo lenta. El núcleo justifica de sobra el ritmo.",
  },
  {
    author: "Tomás Herrera",
    text: "No esperaba que me afectara tanto. Hay una escena hacia el final que me dejó sin respiración.",
  },
  {
    author: "Sienna Park",
    text: "Ambiciosa y valiente. No todo funciona, pero cuando acierta, acierta de lleno.",
  },
  {
    author: "Noah Ríos",
    text: "Técnicamente impecable. Lo recomendaría con los ojos cerrados a cualquiera que quiera empezar por aquí.",
  },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export function getMockCommunity(itemId: string): MockCommunity {
  const rand = seeded(hash(itemId));

  const avgRating = Math.round((3.6 + rand() * 1.2) * 10) / 10; // 3.6–4.8
  const ratingCount = Math.floor(1200 + rand() * 88000);

  // Distribution skewed toward the top, scaled around the average.
  const topWeight = 40 + Math.round(avgRating * 8); // higher avg → fatter 5★ bar
  const raw = [topWeight, 30, 16, 8, 6].map((n) => n * (0.6 + rand() * 0.8));
  const sum = raw.reduce((a, b) => a + b, 0);
  const distribution = raw.map((n) => Math.round((n / sum) * 100));

  const count = 3 + Math.floor(rand() * 2); // 3–4 reviews
  const start = Math.floor(rand() * REVIEW_POOL.length);
  const reviews: MockReview[] = Array.from({ length: count }).map((_, i) => {
    const src = REVIEW_POOL[(start + i) % REVIEW_POOL.length];
    const month = Math.floor(rand() * 12);
    const day = 1 + Math.floor(rand() * 27);
    return {
      id: `${itemId}-r${i}`,
      author: src.author,
      initials: initials(src.author),
      date: `${day} ${MONTHS_ES[month]} 2024`,
      rating: 4 + Math.round(rand()), // 4 or 5
      text: src.text,
      likes: Math.floor(20 + rand() * 480),
    };
  });

  return { avgRating, ratingCount, distribution, reviews };
}
