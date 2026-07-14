import { createClient } from "@/lib/supabase/server";
import { getLibraryItems } from "@/lib/library/get-library-items";
import type { ItemType } from "@/lib/catalog/types";

const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  book: "libro",
  movie: "pelicula",
  series: "serie",
};

// RFC 4180: entrecomilla si hay coma, comilla, salto de línea o punto y coma
// (este último es el separador interno de la columna de fechas de diario).
function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const COLUMNS = [
  "tipo",
  "titulo",
  "autor",
  "estado",
  "nota",
  "notas",
  "relecturas",
  "pases",
] as const;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const items = await getLibraryItems(supabase, user.id, {});

  // Fechas de pases (diario) de TODA la biblioteca en una sola query, agrupadas
  // por entrada — antes era una query por ítem (N+1: 500 ítems = 500 queries).
  const { data: diaryRows, error: diaryError } = await supabase
    .from("diary_entries")
    .select("library_entry_id, started_on, finished_on")
    .in("library_entry_id", items.map((item) => item.entryId))
    .order("finished_on", { ascending: false });
  if (diaryError) throw diaryError;

  const passesByEntry = new Map<string, string[]>();
  for (const d of diaryRows ?? []) {
    const list = passesByEntry.get(d.library_entry_id) ?? [];
    list.push(d.started_on ? `${d.started_on}..${d.finished_on}` : d.finished_on);
    passesByEntry.set(d.library_entry_id, list);
  }

  const rows = items.map((item) => [
    ITEM_TYPE_LABEL[item.itemType],
    item.title,
    item.subtitle ?? "",
    item.status,
    item.rating ?? "",
    item.notes ?? "",
    item.rereadCount,
    // "inicio..fin" separados por ";".
    (passesByEntry.get(item.entryId) ?? []).join(";"),
  ]);

  const csv = [
    COLUMNS.join(","),
    ...rows.map((r) => r.map(csvCell).join(",")),
  ].join("\r\n");

  const today = new Date().toISOString().slice(0, 10);
  // BOM para que Excel abra el UTF-8 con acentos correctamente.
  return new Response("﻿" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="biblioshare-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
