import type { Metadata } from "next";
import { loadSessionContext, parseMinutes } from "@/lib/sessions/load-context";
import { parseStartedAt } from "@/lib/sessions/parse-started-at";
import { SessionSheet } from "@/components/session/session-sheet";

export const metadata: Metadata = {
  title: "Guardar sesión — Biblioshare",
};

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ passId: string }>;
  // `minutos` e `inicio`: los trae el cronómetro de la tarjeta de hoy (plan 01
  // T5) cuando pulsas "Registrar" — llegas con el tiempo y la hora de inicio ya
  // escritos en vez de tener que acordarte de ellos.
  searchParams: Promise<{ minutos?: string; inicio?: string }>;
}) {
  const { passId } = await params;
  const { minutos, inicio } = await searchParams;

  const ctx = await loadSessionContext(passId);

  return (
    <div className="mx-auto w-full max-w-lg">
      <SessionSheet
        ctx={ctx}
        initialMinutes={parseMinutes(minutos)}
        initialStartedAt={parseStartedAt(inicio)}
        mode="page"
      />
    </div>
  );
}
