import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TitleMap = Map<string, string>;

export function keyFor(type: ItemType, id: string): string {
  return `${type}:${id}`;
}

// Hidrata títulos de obras de cualquier tipo en una sola pasada (una query por
// tabla no vacía). Devuelve un mapa "tipo:id" → título; los ids sin fila se
// omiten. Reutilizado por la pila y "mejor valoradas".
export async function getItemTitles(
  supabase: SupabaseServerClient,
  ids: Record<ItemType, Set<string>>,
): Promise<TitleMap> {
  const map: TitleMap = new Map();

  const tables: { type: ItemType; table: "books" | "movies" | "series" }[] = [
    { type: "book", table: "books" },
    { type: "movie", table: "movies" },
    { type: "series", table: "series" },
  ];

  await Promise.all(
    tables.map(async ({ type, table }) => {
      const set = ids[type];
      if (!set || set.size === 0) return;
      const { data, error } = await supabase
        .from(table)
        .select("id, title")
        .in("id", [...set]);
      if (error) throw error;
      for (const row of (data ?? []) as { id: string; title: string | null }[]) {
        if (row.title) map.set(keyFor(type, row.id), row.title);
      }
    }),
  );

  return map;
}
