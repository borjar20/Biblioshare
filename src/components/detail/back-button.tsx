"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@/components/ui/icons";

// El .ib de la barra superior del hero (mockup "Paper - Ficha de título
// completa"): cuadrado de 34px con blur sobre la portada difuminada. En la
// maqueta el botón es solo el icono, así que "Volver" pasa a aria-label — el
// nombre accesible no se pierde.
export function BackButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label={label}
      title={label}
      className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-border bg-surface/80 text-foreground backdrop-blur-[6px] transition-colors hover:bg-surface"
    >
      <ArrowLeftIcon className="h-4 w-4" />
    </button>
  );
}
