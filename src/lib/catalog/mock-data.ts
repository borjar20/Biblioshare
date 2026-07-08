import type { SearchResult } from "./types";

// Fixture data for MOCK_EXTERNAL_APIS=true (see search.ts). Covers are
// inline SVG data URIs so they render with zero network dependency —
// no external image host to be unreachable or rate-limited.
function cover(color: string, text: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450">
    <rect width="300" height="450" fill="#${color}" />
    <text x="150" y="225" fill="#ffffff" font-family="sans-serif" font-size="24"
      text-anchor="middle" dominant-baseline="middle">${text}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export const MOCK_BOOKS: SearchResult[] = [
  {
    itemType: "book",
    externalId: "mock-book-001",
    title: "Cien años de soledad",
    subtitle: "Gabriel García Márquez",
    coverUrl: cover("6366f1", "Cien años"),
    year: 1967,
    publisher: "Editorial Sudamericana",
    pageCount: 471,
    isbn: null,
  },
  {
    itemType: "book",
    externalId: "mock-book-002",
    title: "El Quijote",
    subtitle: "Miguel de Cervantes",
    coverUrl: cover("f59e0b", "El Quijote"),
    year: 1605,
    publisher: "Francisco de Robles",
    pageCount: 863,
    isbn: null,
  },
  {
    itemType: "book",
    externalId: "mock-book-003",
    title: "Harry Potter y la piedra filosofal",
    subtitle: "J. K. Rowling",
    coverUrl: cover("10b981", "Harry Potter"),
    year: 1997,
    publisher: "Bloomsbury",
    pageCount: 223,
    isbn: null,
  },
  {
    itemType: "book",
    externalId: "mock-book-004",
    title: "1984",
    subtitle: "George Orwell",
    coverUrl: cover("ef4444", "1984"),
    year: 1949,
    publisher: "Secker & Warburg",
    pageCount: 328,
    isbn: "9780451524935",
  },
  {
    itemType: "book",
    externalId: "mock-book-005",
    title: "Fahrenheit 451",
    subtitle: "Ray Bradbury",
    coverUrl: cover("f97316", "Fahrenheit 451"),
    year: 1953,
    publisher: "Ballantine Books",
    pageCount: 194,
    isbn: null,
  },
];

export const MOCK_MOVIES: SearchResult[] = [
  {
    itemType: "movie",
    externalId: "900001",
    title: "Matrix",
    subtitle: null,
    coverUrl: cover("18181b", "Matrix"),
    year: 1999,
    publisher: null,
    pageCount: null,
    isbn: null,
  },
  {
    itemType: "movie",
    externalId: "900002",
    title: "Origen",
    subtitle: null,
    coverUrl: cover("0ea5e9", "Origen"),
    year: 2010,
    publisher: null,
    pageCount: null,
    isbn: null,
  },
  {
    itemType: "movie",
    externalId: "900003",
    title: "Interestelar",
    subtitle: null,
    coverUrl: cover("6366f1", "Interestelar"),
    year: 2014,
    publisher: null,
    pageCount: null,
    isbn: null,
  },
  {
    itemType: "movie",
    externalId: "900004",
    title: "Star Wars: Una nueva esperanza",
    subtitle: null,
    coverUrl: cover("eab308", "Star Wars"),
    year: 1977,
    publisher: null,
    pageCount: null,
    isbn: null,
  },
];

export const MOCK_SERIES: SearchResult[] = [
  {
    itemType: "series",
    externalId: "910001",
    title: "Breaking Bad",
    subtitle: null,
    coverUrl: cover("22c55e", "Breaking Bad"),
    year: 2008,
    publisher: null,
    pageCount: null,
    isbn: null,
  },
  {
    itemType: "series",
    externalId: "910002",
    title: "El juego del calamar",
    subtitle: null,
    coverUrl: cover("ec4899", "Squid Game"),
    year: 2021,
    publisher: null,
    pageCount: null,
    isbn: null,
  },
  {
    itemType: "series",
    externalId: "910003",
    title: "Stranger Things",
    subtitle: null,
    coverUrl: cover("dc2626", "Stranger Things"),
    year: 2016,
    publisher: null,
    pageCount: null,
    isbn: null,
  },
];
