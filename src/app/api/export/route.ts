import { createClient } from "@/lib/supabase/server";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { getDiaryEntries } from "@/lib/diary/get-diary-entries";
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

  const rows = await Promise.all(
    items.map(async (item) => {
      // Fechas de pases (diario) → "inicio..fin" separados por ";".
      const diary = await getDiaryEntries(supabase, item.entryId);
      const passes = diary
        .map((d) => (d.startedOn ? `${d.startedOn}..${d.finishedOn}` : d.finishedOn))
        .join(";");
      return [
        ITEM_TYPE_LABEL[item.itemType],
        item.title,
        item.subtitle ?? "",
        item.status,
        item.rating ?? "",
        item.notes ?? "",
        item.rereadCount,
        passes,
      ];
    })
  );

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
