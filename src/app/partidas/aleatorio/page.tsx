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
  // key: si la sesión cambia en caliente (login/logout + refresh), el hook
  // entero se REMONTA — sin esto, el snapshot de la identidad anterior queda
  // en pantalla y el primer emit lo persistiría bajo la clave de la nueva
  // (contaminación entre cuentas del mismo dispositivo, clase #680).
  return <RandomScreen key={identity} identity={identity} />;
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
