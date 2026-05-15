import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Norfolk AI",
  description: "Norfolk AI application",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
      >
        <body className="min-h-screen bg-background text-foreground font-sans antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
