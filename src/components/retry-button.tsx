"use client";

import { Button } from "@/components/ui/button";

export function RetryButton({ children }: { children: React.ReactNode }) {
  return (
    <Button type="button" onClick={() => window.location.reload()}>
      {children}
    </Button>
  );
}
