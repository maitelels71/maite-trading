import type { Metadata } from "next";
import { DM_Sans, Syne } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["500", "600", "700", "800"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Maite Trading — Strategy Analyzer",
  description:
    "Research and backtest trading strategies. Schwab equities/ETFs. TradeAdvocate futures.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable}`}>
      <body
        style={{
          fontFamily: "var(--font-dm), var(--font-body), sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
