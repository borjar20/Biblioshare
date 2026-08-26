import { getTranslations } from "next-intl/server";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { SearchIcon } from "@/components/ui/icons";
import type { ItemType } from "@/lib/catalog/types";
import { BarcodeScanner } from "./barcode-scanner";
import { TypePills } from "./type-pills";

export async function SearchForm({
  query,
  itemType,
}: {
  query: string;
  itemType: ItemType;
}) {
  const t = await getTranslations("search");

  return (
    <div className="flex flex-col gap-4">
      <TypePills
        active={itemType}
        href={(type) =>
          `/buscar?type=${type}${query ? `&q=${encodeURIComponent(query)}` : ""}`
        }
      />

      <form action="/buscar" className="flex gap-2">
        <input type="hidden" name="type" value={itemType} />
        {/* `w-full` en el input y `min-w-0` en la celda NO son decoración: sin
            ellos el input conserva su ancho intrínseco (`size=20`, 273px) y la
            celda `flex-1` vale `min-width:auto`, que no encoge por debajo de
            ese contenido — la fila medía 391px en un viewport de 360 y la
            página entera salía con scroll lateral (#721). */}
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            type="search"
            defaultValue={query}
            placeholder={t(
              itemType === "book" ? "placeholderBook" : "placeholder",
            )}
            className="w-full pl-10"
          />
        </div>
        <button
          type="submit"
          className={buttonVariants("primary", "inline-flex items-center")}
        >
          <SearchIcon className="h-4 w-4" />
          {t("submit")}
        </button>
      </form>

      {itemType === "book" && <BarcodeScanner />}
    </div>
  );
}
