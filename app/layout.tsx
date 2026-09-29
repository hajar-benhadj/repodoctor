import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RepoDoctor — GitHub Repository Health Analyzer",
  description:
    "Paste a GitHub repository URL and get an explainable health report: code quality, security, documentation, testing, maintainability, architecture graph and a prioritized action plan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
