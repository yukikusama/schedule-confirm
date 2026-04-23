import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sukima",
  description: "あなたの心の隙間、お埋めします。",
  openGraph: {
    title: "Sukima",
    description: "あなたの心の隙間、お埋めします。",
    url: "https://schedule-confirm.vercel.app",
    siteName: "Sukima",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Sukima",
    description: "あなたの心の隙間、お埋めします。",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
