"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Capacitor } from "@capacitor/core";

// Only rendered inside the Capacitor native wrapper (Android/iOS) — there is
// no reliable web camera-scanning path, so this is native-only rather than
// a web fallback. See docs/REQUIREMENTS.md §7.3 and §8-F.
export function BarcodeScanner() {
  const t = useTranslations("search.scan");
  const [isNative, setIsNative] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Checking an external platform API on mount, not deriving from props/state
    // — server always renders `false` (no hydration mismatch), client flips to
    // the real value right after. Same justified pattern as theme-toggle.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  if (!isNative) return null;

  async function handleScan() {
    setError(null);
    const { BarcodeScanner: NativeBarcodeScanner, BarcodeFormat } = await import(
      "@capacitor-mlkit/barcode-scanning"
    );

    const { camera } = await NativeBarcodeScanner.requestPermissions();
    if (camera !== "granted" && camera !== "limited") {
      setError(t("cameraDenied"));
      return;
    }

    try {
      const { barcodes } = await NativeBarcodeScanner.scan({
        formats: [BarcodeFormat.Ean13, BarcodeFormat.Ean8],
      });
      const code = barcodes[0]?.rawValue ?? barcodes[0]?.displayValue;
      if (code) {
        // A hard navigation, not router.push: returning from the native
        // scanner activity pauses/resumes MainActivity, and the React
        // router context doesn't reliably survive that round-trip in the
        // WebView — router.push silently no-ops. window.location.href
        // forces a real navigation regardless of that lifecycle jump.
        window.location.href = `/buscar?type=book&q=${encodeURIComponent(code)}`;
      }
    } catch {
      setError(t("cameraDenied"));
    }
  }

  return (
    <div className="flex flex-col gap-1 self-start">
      <button
        type="button"
        onClick={handleScan}
        aria-label={t("button")}
        title={t("button")}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground hover:bg-surface-muted"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </button>
      {error && <p className="text-xs text-status-dropped">{error}</p>}
    </div>
  );
}
