"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
}: {
  placeholder: string;
  initialQuery: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const [, startTransition] = useTransition();
  // El primer efecto se salta: value arranca igual que la URL, así que navegar
  // en el montaje sería redundante (y rompería el foco).
  const skip = useRef(true);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    const handle = setTimeout(() => {
      const url = value.trim()
        ? `/clubes?q=${encodeURIComponent(value.trim())}`
        : "/clubes";
      startTransition(() => router.replace(url, { scroll: false }));
    }, 300);
    return () => clearTimeout(handle);
  }, [value, router]);

  return (
    <div className="relative">
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl py-2.5 pl-10"
      />
    </div>
  );
}
