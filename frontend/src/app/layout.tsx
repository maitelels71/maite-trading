import type { Metadata } from "next";
import { IBM_Plex_Mono, Source_Sans_3 } from "next/font/google";

import { APP_DOCUMENT_TITLE, APP_ICON_PNG } from "@/lib/app-mode";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

import "./globals.css";

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_DOCUMENT_TITLE,
  description: "Trading Like a Boss — Options, Futures, and Coinbase desks.",
  icons: {
    icon: [{ url: APP_ICON_PNG, type: "image/png" }],
    apple: [{ url: APP_ICON_PNG }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sourceSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
