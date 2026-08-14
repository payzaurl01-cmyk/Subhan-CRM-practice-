import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interior Blinds CRM",
  description: "Sales, operations, inventory and finance workspace for Interior Blinds & Shutters.",
  icons: {
    icon: "/logo.jpeg",
    apple: "/logo.jpeg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
