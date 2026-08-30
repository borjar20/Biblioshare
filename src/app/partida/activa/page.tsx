import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { GameScreen } from "@/components/play/game-screen";

export const metadata: Metadata = { title: "Partida — Biblioshare" };

// La única pantalla de la app sin topbar ni barra de cinco: la retira `ChromeGate`
// por la ruta (`isFullscreenRoute`). Aquí la página es un shell mínimo; todo lo vivo
// es la isla sobre el store.
//
// `connection()` antes de leer la sesión: el chequeo de expiración del token de
// Supabase usa `Date.now()` y aborta el prerender (mismo caso que `app-shell.tsx`).
async function Screen() {
  await connection();
  const user = await getCurrentUser();
  return <GameScreen identity={user?.id ?? "anon"} />;
}

export default function ActiveGamePage() {
  return (
    // El fallback pinta el fieltro: sin él, el hueco de la partida parpadea en
    // blanco antes de resolverse la sesión.
    <Suspense fallback={<div className="h-dvh w-full bg-play-felt" />}>
      <Screen />
    </Suspense>
  );
}
