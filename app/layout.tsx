import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TranscriptionProvider } from "@/hooks/useTranscription";
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
  title: "Voice - Transcription & Insights",
  description: "Real-time voice transcription powered by Sarvam AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TranscriptionProvider>
          {children}
        </TranscriptionProvider>
      </body>
    </html>
  );
}
