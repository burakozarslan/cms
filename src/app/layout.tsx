import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CMS",
  description: "Multi-tenant headless CMS",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`bg-base-200 text-base-content min-h-screen ${inter.className}`}>
        {children}
      </body>
    </html>
  );
}
