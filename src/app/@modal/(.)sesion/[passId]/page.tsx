import { loadSessionContext, parseMinutes } from "@/lib/sessions/load-context";
import { SessionModal } from "@/components/session/session-modal";
import { SessionSheet } from "@/components/session/session-sheet";

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
