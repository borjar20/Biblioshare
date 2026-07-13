"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { searchSagas } from "@/lib/sagas/search-sagas";

// Selector de una saga EXISTENTE -> devuelve su id (EPIC-05, Bloque H4). Mismo patrón de
// búsqueda con debounce que LibraryItemPicker.
//
// Vive en src/components/ (no bajo clubs/) porque es reutilizable: el reto personal (§7.10)
// soporta el filtro por saga en su motor pero no lo expone en su formulario precisamente
// porque no existía ningún selector -- este lo es. Ojo: saga-assign-form.tsx NO sirve para
// esto, usa texto libre y CREA la saga por nombre.
export function SagaPicker({
  value,
  onChange,
}: {
  value: { id: string; name: string } | null;
  onChange: (saga: { id: string; name: string } | null) => void;
}) {
  const t = useTranslations("sagaPicker");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      searchSagas(search).then(setResults);
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate text-foreground">{value.name}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
        >
          {t("clear")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("placeholder")}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {results.length > 0 && (
        <div className="flex max-h-40 flex-col overflow-y-auto rounded-md border border-border">
          {results.map((saga) => (
            <button
              key={saga.id}
              type="button"
              onClick={() => {
                onChange(saga);
                setSearch("");
                setResults([]);
              }}
              className="px-3 py-2 text-left text-sm hover:bg-surface-muted"
            >
              {saga.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
