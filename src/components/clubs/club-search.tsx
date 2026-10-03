"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { SearchIcon } from "@/components/ui/icons";

// Buscador de clubes como isla de cliente sobre `searchParams` (mismo patrón que
// /buscar). Antes /clubes era `"use client"` entera y buscaba llamando a la
// server action `discoverPublicClubs` desde el navegador (#438); ahora la lista
// la pinta el servidor filtrando por `?q=`, y esto solo empuja el término a la
// URL con debounce. `router.replace` (no push) para no llenar el historial de
// una entrada por tecla, y `useTransition` mantiene la lista anterior visible
// mientras llega la nueva (sin parpadeo de «Mis clubes», que también re-renderiza).
export function ClubSearch({
  placeholder,
  initialQuery,
  basePath = "/clubes",
}: {
  placeholder: string;
  initialQuery: string;
  basePath?: "/clubes" | "/comunidad";
}) {
  const router = useRouter();
  const [search, setSearch] = useState({
    query: initialQuery,
    value: initialQuery,
    pendingQueries: [] as string[],
  });
  const [, startTransition] = useTransition();

  // La URL manda al volver o cambiar de pestaña. Una respuesta a nuestro propio
  // debounce conserva el borrador: puede haber más teclas escritas mientras llega.
  if (search.query !== initialQuery) {
    const acknowledged = search.pendingQueries.indexOf(initialQuery);
    setSearch({
      query: initialQuery,
      value: acknowledged >= 0 ? search.value : initialQuery,
      pendingQueries: acknowledged >= 0 ? search.pendingQueries.slice(acknowledged + 1) : [],
    });
  }

  useEffect(() => {
    const query = search.value.trim();
    if (query === initialQuery || search.pendingQueries.includes(query)) return;
    const handle = setTimeout(() => {
      const url = query
        ? `${basePath}?q=${encodeURIComponent(query)}`
        : basePath;
      setSearch(current => ({ ...current, pendingQueries: [...current.pendingQueries, query] }));
      startTransition(() => router.replace(url, { scroll: false }));
    }, 300);
    return () => clearTimeout(handle);
  }, [search.value, search.pendingQueries, initialQuery, router, basePath]);

  return (
    <div className="relative">
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={search.value}
        onChange={(e) => {
          const value = e.target.value;
          setSearch(current => ({ ...current, value }));
        }}
        placeholder={placeholder}
        className="w-full rounded-xl py-2.5 pl-10"
      />
    </div>
  );
}
