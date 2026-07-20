import { loadSessionContext } from "@/lib/sessions/load-context";
import { SessionModal } from "@/components/session/session-modal";
import { SessionSheet } from "@/components/session/session-sheet";

function parseMinutes(raw: string | undefined): number | null {
  if (!raw) return null;
  const minutes = Number(raw);
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 24 * 60 ? minutes : null;
}

export default async function SessionModalPage({
  params,
  searchParams,
}: {
  params: Promise<{ passId: string }>;
  searchParams: Promise<{ minutos?: string }>;
}) {
  const { passId } = await params;
  const { minutos } = await searchParams;

  const ctx = await loadSessionContext(passId);

  return (
    <SessionModal>
      <SessionSheet ctx={ctx} initialMinutes={parseMinutes(minutos)} mode="modal" />
    </SessionModal>
  );
}
