import "@/design-sync-shims/process-shim";
import { BackButton } from "@/components/detail/back-button";
import { PreviewProvider } from "@/design-sync-shims/preview-provider";

// PreviewProvider is re-imported (and re-wrapped) here, not just relied on
// from cfg.provider's outer wrapping — this preview card compiles in its own
// esbuild pass, separate from the main bundle, so a Context object created
// in the main bundle's copy of next/navigation isn't the same object this
// component's useRouter() reads. Wrapping within the SAME compile keeps the
// Provider and the consuming hook sharing one Context instance.
export function Default() {
  return (
    <PreviewProvider>
      <BackButton label="Volver" />
    </PreviewProvider>
  );
}
