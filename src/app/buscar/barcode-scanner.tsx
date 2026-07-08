"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// BarcodeDetector isn't in TypeScript's bundled DOM types yet (still an
// experimental web API). See docs/REQUIREMENTS.md §7.3 for browser support
// caveats (solid on Chrome/Edge Android, historically absent on Safari/iOS).
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => {
      detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
    };
  }
}

export function BarcodeScanner() {
  const t = useTranslations("search.scan");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number>(0);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    cancelAnimationFrame(frameRef.current);
  }

  function close() {
    stopStream();
    setOpen(false);
    setError(null);
  }

  useEffect(() => {
    if (!open || !window.BarcodeDetector) return;

    let cancelled = false;
    const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8"] });

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }

        async function scan() {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              const isbn = codes[0].rawValue;
              stopStream();
              setOpen(false);
              router.push(`/buscar?type=book&q=${encodeURIComponent(isbn)}`);
              return;
            }
          } catch {
            // Transient decode errors are expected between frames; keep scanning.
          }
          frameRef.current = requestAnimationFrame(scan);
        }
        scan();
      })
      .catch(() => {
        if (!cancelled) setError(t("cameraDenied"));
      });

    return () => {
      cancelled = true;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-running on every `t`/`router` identity change would restart the camera stream unnecessarily
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(window.BarcodeDetector ? null : t("unsupported"));
        }}
        className="self-start text-sm text-muted-foreground underline hover:text-foreground"
      >
        {t("button")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4">
          {error ? (
            <p className="max-w-sm text-center text-sm text-white">{error}</p>
          ) : (
            <video
              ref={videoRef}
              muted
              playsInline
              className="max-h-[70vh] w-full max-w-md rounded-lg object-cover"
            />
          )}
          <Button type="button" variant="secondary" onClick={close}>
            {t("close")}
          </Button>
        </div>
      )}
    </>
  );
}
