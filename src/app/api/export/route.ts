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
  // por OBRA — antes era una query por ítem (N+1: 500 ítems = 500 queries).
  // item_type/item_id ya son columnas propias del pase (§Tarea 9): se agrupa
  // por `${item_type}:${item_id}`, no por entryId (que ahora es el id del
  // pase ACTIVO, no el de una library_entries que ya no existe para los
  // ítems nuevos).
  const { data: diaryRows, error: diaryError } = await supabase
    .from("passes")
    .select("item_type, item_id, started_on, finished_on")
    .eq("user_id", user.id)
    .in("item_id", items.map((item) => item.itemId))
    // Un pase abierto todavía no ha terminado: no exportamos "lecturas en
    // curso" como si fueran pases completados.
    .not("finished_on", "is", null)
    .order("finished_on", { ascending: false });
  if (diaryError) throw diaryError;

  // El filtro anterior garantiza finished_on no nulo; se narrowa aquí
  // porque Supabase no infiere el tipo a partir de la query.
  const finishedDiaryRows = (diaryRows ?? []).filter(
    (d): d is typeof d & { finished_on: string } => d.finished_on !== null
  );

  const passesByItem = new Map<string, string[]>();
  for (const d of finishedDiaryRows) {
    const key = `${d.item_type}:${d.item_id}`;
    const list = passesByItem.get(key) ?? [];
    list.push(d.started_on ? `${d.started_on}..${d.finished_on}` : d.finished_on);
    passesByItem.set(key, list);
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
    (passesByItem.get(`${item.itemType}:${item.itemId}`) ?? []).join(";"),
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
