import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { RouteMessages } from "@/components/route-messages";
import { AppShell } from "@/components/nav/app-shell";
import { CelebrationProvider } from "@/components/celebrations/celebration-provider";
import { ThemeScript } from "@/components/theme-script";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { AndroidPushInit } from "@/components/push/android-push-init";
import { AndroidWidgetSync } from "@/components/widgets/android-widget-sync";
import { SessionOriginTracker } from "@/components/session/session-origin";
import "./globals.css";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// `display: "swap"` explícito: es ya el default de next/font, pero fijarlo evita
// depender de un default que puede cambiar entre versiones (auditoría #446).
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
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
        {/* Arranca el push nativo Android (no-op en web): listeners de FCM y
            navegación segura al tocar una notificación. */}
        <AndroidPushInit />
        {/* Sincroniza los widgets nativos Android (no-op en web): arranque,
            foreground/background, mutaciones del bucle diario y auth. */}
        <AndroidWidgetSync />
        {/* Anota la pantalla actual en cada navegación para que el modal de
            sesión sepa a dónde volver al cerrarse (issue #161). Va aquí, en la
            raíz, porque tiene que enterarse de TODAS las navegaciones — no
            solo de las que pasan por la ficha. */}
        <SessionOriginTracker />
        {/* Provider raíz de i18n: manda SOLO el subconjunto BASE (chrome +
            comunes) en el payload de cada ruta. Cada página añade sus namespaces
            con <RouteMessages ns={…}> por debajo (#444). */}
        <RouteMessages>
          {/* Overlay global de microanimaciones: drena las celebraciones ganadas
              en servidor y las anima una vez, sin bloquear la navegación. */}
          <CelebrationProvider>
            <AppShell>{children}</AppShell>
            {modal}
          </CelebrationProvider>
        </RouteMessages>
        <SpeedInsights />
      </body>
    </html>
  );
}
