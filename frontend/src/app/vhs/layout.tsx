import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VHS Lots for Sale — Nostalgia Collections",
  description:
    "Four themed VHS lots: Rom-coms 2000s, Kids classics, Fitness vintage, Drama/Thriller. Local pickup.",
};

export default function VhsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
