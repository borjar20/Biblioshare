import type { Metadata } from "next";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "Elige tu usuario — Biblioshare",
};

export default function OnboardingPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-surface-muted px-4 py-16">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface shadow-card p-8">
        <OnboardingForm />
      </div>
    </div>
  );
}
