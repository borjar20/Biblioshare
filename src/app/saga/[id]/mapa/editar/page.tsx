import { redirect } from "next/navigation";

// El editor de grafo se retiró en la fase 2a: la curación del orden vive en
// /saga/[id]/editar. Redirect y no 404 a propósito — hay enlaces vivos y gente
// con la URL guardada, y un 404 les diría que la saga no existe.
export default async function EditSagaMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/saga/${id}/editar`);
}
