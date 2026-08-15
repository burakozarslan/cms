import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CMS",
  description: "Multi-tenant headless CMS",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-base-200 text-base-content min-h-screen">
        {children}
      </body>
    </html>
  );
}
