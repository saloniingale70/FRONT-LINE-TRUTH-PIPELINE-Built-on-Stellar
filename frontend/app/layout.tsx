import type { Metadata } from "next";
import "./globals.css";
import { FreighterProvider } from "./freighter-context";

export const metadata: Metadata = {
  title: "Buyer dashboard",
  description: "Trade compliance console",
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