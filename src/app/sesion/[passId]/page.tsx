import type { Metadata } from "next";
import { loadSessionContext } from "@/lib/sessions/load-context";
import { SessionSheet } from "@/components/session/session-sheet";

export const metadata: Metadata = {
  title: "Guardar sesión — Biblioshare",
};

// Un parámetro de URL es texto de fuera: se acepta solo si es un entero de
// minutos con sentido. Se topa a 24 h para que un valor absurdo no llegue al
// formulario.
function parseMinutes(raw: string | undefined): number | null {
  if (!raw) return null;
  const minutes = Number(raw);
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 24 * 60 ? minutes : null;
}

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ passId: string }>;
  // `minutos`: lo trae el cronómetro de la tarjeta de hoy (plan 01 T5) cuando
  // pulsas "Registrar" — llegas con el tiempo ya escrito en vez de tener que
  // acordarte de él.
  searchParams: Promise<{ minutos?: string }>;
}) {
  const { passId } = await params;
  const { minutos } = await searchParams;

  const ctx = await loadSessionContext(passId);

  return (
    <div className="mx-auto w-full max-w-lg">
      <SessionSheet ctx={ctx} initialMinutes={parseMinutes(minutos)} mode="page" />
    </div>
  );
}
