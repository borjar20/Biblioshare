import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { PlayFrame } from "@/components/play/play-frame";
import { RandomScreen } from "@/components/play/random/random-screen";

export const metadata: Metadata = { title: "Aleatorio — Biblioshare" };

// Mismo boundary de petición que el hub (#435): la identidad depende de la
// sesión y no se puede leer durante el prerender. Anónimo funciona entero —
// la identidad solo aísla la clave de IDB, como en el resto de Play.
async function Screen() {
  await connection();
  const identity = (await getCurrentUser())?.id ?? "anon";
  return <RandomScreen identity={identity} />;
}

export default function RandomPage() {
  return (
    <PlayFrame>
      <Suspense fallback={null}>
        <Screen />
      </Suspense>
    </PlayFrame>
  );
}
