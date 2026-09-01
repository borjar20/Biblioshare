import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { PlayFrame } from "@/components/play/play-frame";
import { ResourcesScreen } from "@/components/play/resources/resources-screen";

export const metadata: Metadata = { title: "Recursos — Biblioshare" };

// Mismo boundary de petición que Aleatorio/Reloj (#435): identidad de sesión
// fuera del prerender; anónimo funciona entero. key: remonta al cambiar (#680).
async function Screen() {
  await connection();
  const identity = (await getCurrentUser())?.id ?? "anon";
  return <ResourcesScreen key={identity} identity={identity} />;
}

export default function ResourcesPage() {
  return (
    <PlayFrame>
      <Suspense fallback={null}>
        <Screen />
      </Suspense>
    </PlayFrame>
  );
}
