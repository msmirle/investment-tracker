import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Net Worth Tracker",
  description: "Track stocks, ETFs, and crypto with live market values.",
};

// Inline script that runs before React hydrates so the correct theme class is
// on <html> on the very first paint (no light-flash on dark, or vice versa).
const themeInitScript = `(function(){try{var s=localStorage.getItem('theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
