import { SkeletonCard, SkeletonLine } from "@/components/ui/skeleton";
import { SHELL_READ } from "@/lib/ui/layout";

// La frontera de loading deja las lecturas de sesión de page detrás de
// Suspense. Este shell es idéntico para todos y no consulta datos de cuenta.
export default function Loading() {
  return (
    <div
      aria-hidden
      className={`mx-auto flex w-full ${SHELL_READ} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}
    >
      <SkeletonLine className="h-8 w-36" />
      {Array.from({ length: 5 }, (_, index) => (
        <SkeletonCard key={index} className="flex flex-col gap-4 sm:p-5">
          <SkeletonLine className="h-5 w-32" />
          <SkeletonLine className="w-3/4" />
          <SkeletonLine className="w-1/2" />
        </SkeletonCard>
      ))}
    </div>
  );
}
