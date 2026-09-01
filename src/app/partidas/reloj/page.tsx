import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { PlayFrame } from "@/components/play/play-frame";
import { ClockScreen } from "@/components/play/clock/clock-screen";

export const metadata: Metadata = { title: "Reloj — Biblioshare" };

// Mismo boundary de petición que el Aleatorio (#435): la identidad depende de
// la sesión y no se puede leer durante el prerender. Anónimo funciona entero.
async function Screen() {
  await connection();
  const identity = (await getCurrentUser())?.id ?? "anon";
  // key: si la sesión cambia en caliente, el hook entero se REMONTA (clase #680).
  return <ClockScreen key={identity} identity={identity} />;
}

export default function ClockPage() {
  return (
    <PlayFrame>
      <Suspense fallback={null}>
        <Screen />
      </Suspense>
    </PlayFrame>
  );
}
