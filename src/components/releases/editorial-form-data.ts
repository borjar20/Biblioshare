import { normalizeIsbn } from "@/lib/catalog/isbn";
import { parseReleaseDate } from "@/lib/releases/precision";
import type { CulturalRelease, ReleaseEditorialInput } from "@/lib/releases/types";
import { safeReleaseUrl } from "./release-view";

export type EditorialFormErrors = Record<string, "required" | "invalid">;
export type EditorialFormResult = { ok: true; input: ReleaseEditorialInput } | { ok: false; errors: EditorialFormErrors };

export function readEditorialForm(data: FormData, initial?: CulturalRelease): EditorialFormResult {
  const text = (name: string) => typeof data.get(name) === "string" ? (data.get(name) as string).trim() : "";
  const errors: EditorialFormErrors = {};
  const title = text("title");
  const sourceName = text("sourceName");
  const sourceUrl = safeReleaseUrl(text("sourceUrl"));
  const coverUrl = safeReleaseUrl(text("coverUrl"));
  const language = text("language");
  const market = text("market");
  const modality = text("modality");
  const precision = text("datePrecision");
  const dateValue = precision === "unknown" ? null : text("dateValue");
  if (!title) errors.title = "required";
  else if (title.length > 500) errors.title = "invalid";
  if (!sourceName) errors.sourceName = "required";
  else if (sourceName.length > 150) errors.sourceName = "invalid";
  if (!text("sourceUrl")) errors.sourceUrl = "required";
  else if (!sourceUrl) errors.sourceUrl = "invalid";
  if (text("coverUrl") && !coverUrl) errors.coverUrl = "invalid";
  if (!["ES", "INT"].includes(market)) errors.market = "invalid";
  if (!["book", "book_translation"].includes(modality)) errors.modality = "invalid";
  if (!language) errors.language = "required";
  else if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(language) || (modality === "book_translation" && !["es", "es-ES"].includes(language))) errors.language = "invalid";
  if (!["day", "month", "year", "unknown"].includes(precision)) errors.datePrecision = "invalid";
  let date: ReturnType<typeof parseReleaseDate> = { date_value: null, date_precision: "unknown" };
  try {
    date = parseReleaseDate(dateValue);
    if (date.date_precision !== precision) errors.dateValue = dateValue ? "invalid" : "required";
  } catch { errors.dateValue = "invalid"; }
  const isbn = text("isbn");
  if (isbn && !normalizeIsbn(isbn)) errors.isbn = "invalid";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, input: {
    title, author: text("author") || null, publisher: text("publisher") || null, isbn: isbn ? normalizeIsbn(isbn) : null,
    synopsis: text("synopsis") || null, coverUrl, sourceName, sourceUrl: sourceUrl!, language,
    market: market as "ES" | "INT", modality: modality as "book" | "book_translation",
    datePrecision: date.date_precision, dateValue: date.date_value,
    status: initial?.status ?? "draft", subtitle: initial?.subtitle ?? null,
    bookId: initial?.book_id ?? null, bookEditionId: initial?.book_edition_id ?? null,
    ...(initial ? { workKey: initial.work_key } : {}),
  } };
}
