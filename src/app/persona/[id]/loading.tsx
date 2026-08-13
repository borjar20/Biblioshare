import { SHELL_PERSON } from "@/lib/ui/layout";
import { PersonSkeleton } from "./person-skeleton";

// MISMA clase `.person-grid`, MISMO shell y MISMO esqueleto que `page.tsx`: si
// el loading monta su propia rejilla, esqueleto y contenido divergen en ancho y
// la página salta al llegar los datos. Fue el fallo de #372/#376.
export default function Loading() {
  return (
    <div className={`mx-auto w-full ${SHELL_PERSON} px-5 pb-10 pt-[26px] lg:px-[30px]`}>
      <div className="person-grid">
        <PersonSkeleton />
      </div>
    </div>
  );
}
