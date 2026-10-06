"use client";
// Monta el reproductor en /wrap/[kind]. Vive en su propio fichero cliente (no en
// wrap-up-entry.tsx) porque la Task 15 pone ahí componentes async de servidor.
import { useRouter } from "next/navigation";
import type { OwnWrapUp } from "@/lib/wrap-ups/get-own-wrap-ups";
import type { PosterModel } from "@/lib/wrap-ups/view-models";
import { StoryPlayer } from "./story-player";

export function WrapUpPlayerRoute({ wrapUp, models }: { wrapUp: OwnWrapUp; models: PosterModel[] }) {
  const router = useRouter();
  return <StoryPlayer wrapUp={wrapUp} models={models} onClose={() => router.push("/")} />;
}
