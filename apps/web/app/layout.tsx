import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/layout/TopNav";

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

export const metadata: Metadata = {
  title: {
    default: "JTIverse — Watch. Earn. Flex.",
    template: "%s | JTIverse",
  },
  description:
    "The anime and donghua streaming platform where watching earns you tokens to unlock titles, cosmetics, and status.",
  themeColor: "#0a0a0f",
  openGraph: {
    type: "website",
    siteName: "JTIverse",
    title: "JTIverse — Watch. Earn. Flex.",
    description: "Stream anime and donghua, earn tokens, unlock titles.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-(--color-bg) text-(--color-text) antialiased">
        <ClerkProvider>
          <TopNav />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-(--color-border) mt-auto">
            <div className="mx-auto max-w-7xl px-4 md:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-(--color-muted)">
              <span>
                © {new Date().getFullYear()} JTIverse. All rights reserved.
              </span>
              <div className="flex items-center gap-4">
                <a
                  href="/docs/tos-compliance"
                  className="hover:text-(--color-text-2) transition-colors"
                >
                  Content Policy
                </a>
                <span>•</span>
                <span>Built with 🎌</span>
              </div>
            </div>
          </footer>
        </ClerkProvider>
      </body>
    </html>
  );
}
