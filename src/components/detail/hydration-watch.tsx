"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// La ficha de una obra RECIÉN creada llega casi siempre antes de que su
// hidratación termine: `openCatalogItem` le da 1200 ms de presupuesto y la
// cadena de fuentes (OpenLibrary + Inventaire/Wikidata + Google Books) rara vez
// cabe ahí, así que el resto corre en after() — DESPUÉS de enviar la respuesta.
// Sin esta isla, nada refrescaba la ficha al terminar: título, portada y
// sinopsis existían en la base segundos después, pero el usuario seguía viendo
// la ficha vacía hasta recargar a mano.
//
// El contrato es mínimo a propósito: sondear `books.hydrated_at` (la RPC
// `hydrate_book` lo estampa al final de la cadena) con esperas crecientes y
// acotadas, y UN `router.refresh()` cuando aparece. Tras el refresh el server
// component ya no renderiza esta isla (la fila viene hidratada), así que no hay
// bucle posible. Si la hidratación falló (proveedor caído: `ensureBookHydrated`
// retorna sin escribir), el sondeo se agota y se rinde en silencio — el curador
// de la propia ficha reintenta en la siguiente visita, y refrescar sin datos
// nuevos no le enseñaría nada a nadie.
//
// Solo se monta con sesión: la hidratación de after() también va detrás de ese
// guardia (es trabajo que se hace para quien usa la app), así que sondear sin
// sesión sería esperar un tren que no sale.
const POLL_DELAYS_MS = [2500, 3500, 5000, 8000, 12000, 15000];

export function HydrationWatch({ bookId }: { bookId: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const supabase = createClient();

    const poll = async (attempt: number) => {
      if (cancelled) return;
      try {
        const { data } = await supabase
          .from("books")
          .select("hydrated_at")
          .eq("id", bookId)
          .maybeSingle();
        if (cancelled) return;
        if (data?.hydrated_at) {
          router.refresh();
          return;
        }
      } catch {
        // Best-effort: un sondeo que falla no es distinto de uno que ve la
        // fila aún sin hidratar — se espera al siguiente.
      }
      const delay = POLL_DELAYS_MS[attempt + 1];
      if (delay !== undefined) timer = setTimeout(() => void poll(attempt + 1), delay);
    };

    timer = setTimeout(() => void poll(0), POLL_DELAYS_MS[0]);
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [bookId, router]);

  return null;
}
