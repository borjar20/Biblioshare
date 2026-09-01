import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { PlayFrame } from "@/components/play/play-frame";
import { TurnsScreen } from "@/components/play/turns/turns-screen";

export const metadata: Metadata = { title: "Turnos — Biblioshare" };

// Mismo boundary de petición que el resto de companions (#435): identidad de
// sesión fuera del prerender; anónimo funciona entero. key: remonta (#680).
async function Screen() {
  await connection();
  const identity = (await getCurrentUser())?.id ?? "anon";
  return <TurnsScreen key={identity} identity={identity} />;
}

export default function TurnsPage() {
  return (
    <PlayFrame>
      <Suspense fallback={null}>
        <Screen />
      </Suspense>
    </PlayFrame>
  );
}
