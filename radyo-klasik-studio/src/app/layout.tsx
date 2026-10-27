import type { Metadata } from "next";
import { Questrial } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { BASE_PATH } from "@/lib/basePath";

// Same typeface as the listener website.
const questrial = Questrial({ subsets: ["latin", "latin-ext"], weight: "400" });

export const metadata: Metadata = {
  title: "Radyo Klasik Panel",
  description: "Self-hosted DJ host dashboard & Virtual Studio",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={questrial.className}
        style={{ backgroundImage: `url('${BASE_PATH}/background.svg')` }}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
