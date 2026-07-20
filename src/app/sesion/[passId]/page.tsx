import type { Metadata } from "next";
import { loadSessionContext, parseMinutes } from "@/lib/sessions/load-context";
import { SessionSheet } from "@/components/session/session-sheet";

export const metadata: Metadata = {
  title: "Guardar sesión — Biblioshare",
};

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
