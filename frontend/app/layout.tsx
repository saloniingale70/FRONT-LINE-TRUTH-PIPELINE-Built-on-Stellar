import type { Metadata } from "next";
import "./globals.css";
import { FreighterProvider } from "./freighter-context";

export const metadata: Metadata = {
  title: "Frontline Truth Pipeline",
  description: "Case Registry, Verification & Court Intake",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <FreighterProvider>{children}</FreighterProvider>
      </body>
    </html>
  );
}