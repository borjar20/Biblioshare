import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AppShell } from "@/components/nav/app-shell";
import { ThemeScript } from "@/components/theme-script";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { SessionOriginTracker } from "@/components/session/session-origin";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Biblioshare",
  description: "Tu biblioteca de libros, películas y series en un solo lugar.",
};

// Espejo manual de --background (claro/oscuro) de globals.css: aquí no hay
// CSS vars. Si cambia el token, cambia esto.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3ece1" },
    { media: "(prefers-color-scheme: dark)", color: "#1f1a16" },
  ],
};

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ServiceWorkerRegister />
        {/* Anota la pantalla actual en cada navegación para que el modal de
            sesión sepa a dónde volver al cerrarse (issue #161). Va aquí, en la
            raíz, porque tiene que enterarse de TODAS las navegaciones — no
            solo de las que pasan por la ficha. */}
        <SessionOriginTracker />
        <NextIntlClientProvider>
          <AppShell>{children}</AppShell>
          {modal}
        </NextIntlClientProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
