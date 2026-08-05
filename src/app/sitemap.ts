import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { GENRES } from "@/lib/catalog/genre-vocab";

// Las únicas páginas públicas e indexables que tiene la app son las fichas de
// catálogo (auditoría #445). Este sitemap las lista para que un buscador pueda
// llegar a ellas — hoy solo se descubren por enlaces externos.
//
// URL base desde la petición: ver robots.ts (mismo motivo).

// Tipo de obra → prefijo de ruta. `people` va a /persona.
const CATALOG: {
  table: "books" | "movies" | "series" | "people";
  path: string;
}[] = [
  { table: "books", path: "/libro" },
  { table: "movies", path: "/pelicula" },
  { table: "series", path: "/serie" },
  { table: "people", path: "/persona" },
];

// PostgREST corta las respuestas en `db-max-rows` (~1000) SIN error — el mismo
// fallo silencioso que documenta decisiones.md (#148). `people` ya pasa de 1000
// (1.394 en prod, 2026-08), así que un select plano truncaría el sitemap. Se
// pagina con .range() hasta agotar la tabla; correcto sea cual sea el corte.
// ponytail: un solo fichero de sitemap; el límite de Google es 50.000 URLs por
// fichero y el catálogo entero (~2.000 hoy) va muy por debajo. Si algún día se
// acerca, partirlo con generateSitemaps.
const PAGE = 1000;

async function allRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "books" | "movies" | "series" | "people",
): Promise<{ id: string; created_at: string }[]> {
  const rows: { id: string; created_at: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("id, created_at")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = `${proto}://${host}`;

  const supabase = await createClient();

  const catalogEntries = await Promise.all(
    CATALOG.map(async ({ table, path }) => {
      const rows = await allRows(supabase, table);
      return rows.map((row) => ({
        url: `${base}${path}/${row.id}`,
        lastModified: new Date(row.created_at),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
    }),
  );

  // Géneros: lista cerrada en código (genre-vocab.ts), un slug por página.
  const genreEntries: MetadataRoute.Sitemap = GENRES.map((g) => ({
    url: `${base}/genero/${g.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));

  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    ...genreEntries,
    ...catalogEntries.flat(),
  ];
}
