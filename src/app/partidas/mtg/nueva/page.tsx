import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { PlayFrame } from "@/components/play/play-frame";
import { SetupForm } from "@/components/play/setup-form";

export const metadata: Metadata = { title: "Nueva partida — Biblioshare" };

// Aquí la topbar SIGUE puesta, y el corte es deliberado: la pantalla completa llega
// con el tablero, y entrar en él tiene que sentirse como sentarse a la mesa.
//
// `connection()` antes de leer la sesión: mismo motivo que en `app-shell.tsx` — el
// chequeo de expiración del token de Supabase usa `Date.now()` y aborta el prerender.
async function Form() {
  await connection();
  const user = await getCurrentUser();
  return <SetupForm identity={user?.id ?? "anon"} />;
}

export default function NewMtgGamePage() {
  return (
    <PlayFrame>
      <Suspense fallback={null}>
        <Form />
      </Suspense>
    </PlayFrame>
  );
}
