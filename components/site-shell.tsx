"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { openPrivacySettings } from "./consent-manager";

const navigation = [
  ["Home", "/"],
  ["All Tools", "/tools"],
  ["Status", "/status"],
  ["Audio", "/tools?category=Audio"],
  ["Guides", "/guides"],
  ["AI Studio", "/studio"],
];

const themes = [
  ["porcelain", "Porcelain", "#2855ff"],
  ["citrus", "Citrus", "#ee6a30"],
  ["lilac", "Lilac", "#7857d8"],
  ["mint", "Mint", "#008f7a"],
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
  const [theme, setTheme] = useState("porcelain");

  useEffect(() => {
    const stored = localStorage.getItem("trenith-color-theme");
    const saved = themes.some(([id]) => id === stored) ? stored! : "porcelain";
    const frame = requestAnimationFrame(() => setTheme(saved));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
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
            <strong>Accent palette</strong>
            {themes.map(([id, label, color]) => (
              <button key={id} className={theme === id ? "selected" : ""} onClick={() => { setTheme(id); localStorage.setItem("trenith-color-theme", id); setThemeOpen(false); }} role="menuitem">
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
          <div className="footer-column"><strong>Tools</strong><Link href="/tools/metadata-remover">Metadata remover</Link><Link href="/tools?category=Audio">Audio</Link><Link href="/tools?category=Video">Video</Link><Link href="/tools?category=PDF">PDF</Link><Link href="/tools?category=Image">Images</Link></div>
          <div className="footer-column"><strong>Platform</strong><Link href="/status">Tool status</Link><Link href="/changelog">Changelog</Link><Link href="/studio">AI Studio</Link><Link href="/connections">BYOK Connections</Link><Link href="/guides">Guides</Link><Link href="/about">About Trenith</Link><a href="https://www.trenith.com/contact?utm_source=trenith_tools&utm_medium=product&utm_campaign=footer" target="_blank" rel="noreferrer">Build with Trenith ↗</a></div>
          <div className="footer-column"><strong>Trust</strong><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/cookies">Cookies</Link><button className="footer-settings" onClick={openPrivacySettings}>Privacy settings</button><Link href="/privacy-choices">Privacy choices</Link><Link href="/security">Security</Link><Link href="/sub-processors">Subprocessors</Link><Link href="/open-source">Open-source notices</Link><Link href="/copyright">Copyright</Link><Link href="/accessibility">Accessibility</Link></div>
        </div>
        <div className="footer-bottom"><span>© 2026 Trenith Technologies Pvt Ltd</span><span>Co-authored by Sai Phanindra Manikanta Yalamanchili</span></div>
      </footer>
    </>
  );
}
