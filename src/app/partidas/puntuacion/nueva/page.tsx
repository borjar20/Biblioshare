import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { PlayFrame } from "@/components/play/play-frame";
import { ScoreSetupForm } from "@/components/play/score/score-setup-form";

export const metadata: Metadata = { title: "Nueva partida — Biblioshare" };

// Espejo de src/app/partidas/mtg/nueva/page.tsx — mismo motivo de
// `connection()` antes de leer la sesión (Date.now() del chequeo de expiración
// de Supabase aborta el prerender).
async function Form() {
  await connection();
  const user = await getCurrentUser();
  return <ScoreSetupForm identity={user?.id ?? "anon"} />;
}

export default function NewScoreGamePage() {
  return (
    <PlayFrame>
      <Suspense fallback={null}>
        <Form />
      </Suspense>
    </PlayFrame>
  );
}
