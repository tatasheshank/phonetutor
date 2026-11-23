import type { Metadata, Viewport } from "next";
import { Noto_Sans, Noto_Sans_Devanagari, Noto_Sans_Telugu } from "next/font/google";
import "./globals.css";

// next/font self-hosts these, so Telugu renders the same on cheap phones and offline.
const telugu = Noto_Sans_Telugu({ subsets: ["telugu"], weight: ["400", "600"], variable: "--font-te" });
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "600"], variable: "--font-hi" });
const latin = Noto_Sans({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-en" });

export const metadata: Metadata = {
  title: "Phone Tutor",
  description: "Learn to use your smartphone with a patient voice tutor in Telugu, Hindi or English.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="te" className={`${telugu.variable} ${devanagari.variable} ${latin.variable}`}>
      <body>{children}</body>
    </html>
  );
}
