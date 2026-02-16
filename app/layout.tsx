import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "RiftBuild Coach",
  description: "League of Legends matchup build recommendations",
  icons: {
    icon: "/icon.svg"
  }
};

function BrandIcon({ size }: { size: number }) {
  return (
    <svg
      className="brand-icon"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#090f26" />
          <stop offset="100%" stopColor="#050914" />
        </linearGradient>
        <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8f7bff" />
          <stop offset="100%" stopColor="#30e7c9" />
        </linearGradient>
      </defs>

      <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#bg)" />
      <rect x="4" y="4" width="56" height="56" rx="14" fill="none" stroke="url(#glow)" strokeWidth="2" />
      <path d="M19 24c-3-2-4-6-1-9 4-3 9 0 10 5z" fill="#f3f6ff" />
      <path d="M45 24c3-2 4-6 1-9-4-3-9 0-10 5z" fill="#f3f6ff" />
      <ellipse cx="32" cy="34" rx="17" ry="14" fill="#f7f9ff" />
      <circle cx="26.5" cy="33" r="2.4" fill="#0b1229" />
      <circle cx="37.5" cy="33" r="2.4" fill="#0b1229" />
      <ellipse cx="32" cy="38" rx="2.5" ry="1.8" fill="#ff8d9f" />
      <path d="M22 40c2 2 5 3 8 2" stroke="#d5dbf0" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M42 40c-2 2-5 3-8 2" stroke="#d5dbf0" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="20" cy="17" r="1.2" fill="#7d6cff" />
      <circle cx="44" cy="14" r="1" fill="#32e6c8" />
      <circle cx="49" cy="21" r="0.9" fill="#7d6cff" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <header className="site-header">
            <Link href="/" className="brand">
              <BrandIcon size={18} />
              RiftBuild Coach
            </Link>
            <nav className="site-nav">
              <Link href="/how-it-works">How It Works</Link>
              <Link href="/about">About</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </nav>
          </header>
          {children}
          <footer className="site-footer">
            <span className="footer-brand">
              <BrandIcon size={16} />
              © {new Date().getFullYear()} RiftBuild Coach
            </span>
            <div>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
