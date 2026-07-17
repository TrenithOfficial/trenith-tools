"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

const navigation = [
  ["Home", "/"],
  ["All Tools", "/tools"],
  ["Audio", "/tools?category=Audio"],
  ["Video", "/tools?category=Video"],
  ["PDF", "/tools?category=PDF"],
  ["Images", "/tools?category=Image"],
  ["AI Studio", "/studio"],
];

const themes = [
  ["orbit", "Cobalt", "#2f6bff"],
  ["violet", "Violet", "#8b5cf6"],
  ["cyan", "Cyan", "#16c7e8"],
  ["ember", "Ember", "#ff6b5f"],
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/tools") return pathname === "/tools";
  return pathname.startsWith(href.split("?")[0]) && !href.includes("category=") ? true : false;
}

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [theme, setTheme] = useState("orbit");

  useEffect(() => {
    const saved = localStorage.getItem("trenith-color-theme") || "orbit";
    const frame = requestAnimationFrame(() => setTheme(saved));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("trenith-color-theme", theme);
  }, [theme]);

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="global-header">
        <Link className="header-brand" href="/" aria-label="Trenith Tools home">
          <Image src="/trenith-lockup.png" width={165} height={60} alt="Trenith" priority />
          <span>Tools</span>
        </Link>
        <nav className={menuOpen ? "global-nav is-open" : "global-nav"} aria-label="Primary navigation">
          {navigation.map(([label, href]) => (
            <Link key={`${label}-${href}`} className={isActive(pathname, href) ? "active" : ""} href={href} onClick={() => setMenuOpen(false)}>{label}</Link>
          ))}
        </nav>
        <div className="header-controls">
          <button className="color-trigger" onClick={() => setThemeOpen(!themeOpen)} aria-expanded={themeOpen} aria-label="Change interface color">
            <i />
            <span>Color</span>
          </button>
          <Link className="connection-link" href="/connections"><span className="status-dot" />Connections</Link>
          <button className="nav-trigger" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Toggle navigation">{menuOpen ? "×" : "☰"}</button>
        </div>
        {themeOpen && (
          <div className="color-menu" role="menu">
            <strong>Interface signal</strong>
            {themes.map(([id, label, color]) => (
              <button key={id} className={theme === id ? "selected" : ""} onClick={() => { setTheme(id); setThemeOpen(false); }} role="menuitem">
                <i style={{ background: color }} />{label}<span>✓</span>
              </button>
            ))}
          </div>
        )}
      </header>
      <main id="main-content">{children}</main>
      <footer className="global-footer">
        <div className="footer-main">
          <div>
            <Link className="footer-brand" href="/"><Image src="/trenith-lockup.png" width={150} height={55} alt="Trenith" /><span>Tools</span></Link>
            <p>Free media, document and AI-connected utilities built by Trenith Technologies Pvt Ltd.</p>
          </div>
          <div className="footer-column"><strong>Tools</strong><Link href="/tools?category=Audio">Audio</Link><Link href="/tools?category=Video">Video</Link><Link href="/tools?category=PDF">PDF</Link><Link href="/tools?category=Image">Images</Link></div>
          <div className="footer-column"><strong>Platform</strong><Link href="/studio">AI Studio</Link><Link href="/connections">BYOK Connections</Link><Link href="/about">About Trenith</Link><a href="https://trenith.com" target="_blank" rel="noreferrer">Trenith.com ↗</a></div>
          <div className="footer-column"><strong>Trust</strong><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/sitemap.xml">Sitemap</Link><a href="mailto:contact@trenith.com">Contact</a></div>
        </div>
        <div className="footer-bottom"><span>© 2026 Trenith Technologies Pvt Ltd</span><span>Co-authored by Sai Phanindra Manikanta Yalamanchili</span></div>
      </footer>
    </>
  );
}
