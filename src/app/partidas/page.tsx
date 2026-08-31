import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { PlayFrame } from "@/components/play/play-frame";
import { ToolGrid } from "@/components/play/tool-grid";
import { ActiveGameBanner } from "@/components/play/active-game-banner";
import { SavedGames } from "@/components/play/saved-games";
import { HowItWorks } from "@/components/play/how-it-works";

export const metadata: Metadata = { title: "Partidas — Biblioshare" };

// No hace falta cuenta para jugar (decisión 2026-08-29 (3)): esta página NO redirige
// a /login. La identidad solo decide bajo qué clave de localStorage vive la partida
// — `anon` para quien no ha entrado —, y por eso se lee aquí y se pasa hacia abajo:
// el store se aísla por identidad para no filtrar la partida entre cuentas del mismo
// dispositivo (misma clase de fuga que el arreglo #680).
//
// `await connection()`: este boundary declara por su cuenta que es de PETICIÓN, en vez
// de confiar en que lo haga el armazón. Leer la sesión durante el prerender aborta la
// ruta («unstable value Date.now()», por el chequeo de expiración del token de
// Supabase) — ver el mismo comentario en `app-shell.tsx`.
async function Banner() {
  await connection();
  const user = await getCurrentUser();
  return <ActiveGameBanner identity={user?.id ?? "anon"} />;
}

// Mismo boundary de petición que Banner, y por la misma razón (#435): la
// identidad depende de la sesión, que no se puede leer durante el prerender.
async function Saved() {
  await connection();
  const user = await getCurrentUser();
  return <SavedGames identity={user?.id ?? "anon"} />;
}

export default async function PlayHubPage() {
  const t = await getTranslations("play");

  return (
    <PlayFrame>
      <h1 className="font-serif text-[26px] font-semibold">{t("hubTitle")}</h1>
      <p className="mt-1 text-[14px] text-muted-foreground">{t("hubSubtitle")}</p>

      {/* La sesión se lee bajo su propio boundary: así el armazón de la página no
          espera a las cookies y la ruta sigue produciendo shell estático (#435). */}
      <Suspense fallback={null}>
        <Banner />
      </Suspense>

      <ToolGrid />

      <div className="mt-8">
        <Suspense fallback={null}>
          <Saved />
        </Suspense>
      </div>

      {/* En tres columnas a lo ancho: es lo que llena el hub en escritorio con
          información en vez de con aire (revisión UX 2026-08-30). */}
      <div className="mt-8">
        <HowItWorks columns />
      </div>
    </PlayFrame>
  );
}
