import Link from "next/link";
import { ReactNode } from "react";

const trustLinks = [
  ["Privacy", "/privacy"], ["Terms", "/terms"], ["Cookies", "/cookies"],
  ["Privacy choices", "/privacy-choices"], ["Security", "/security"],
  ["Subprocessors", "/sub-processors"], ["Copyright", "/copyright"],
  ["Accessibility", "/accessibility"],
];

export function LegalPage({ eyebrow = "TRENITH TRUST CENTER", title, summary, children }: { eyebrow?: string; title: string; summary: string; children: ReactNode }) {
  return <>
    <section className="legal-hero page-frame"><span className="section-kicker">{eyebrow}</span><h1>{title}</h1><p>{summary}</p><nav className="legal-nav" aria-label="Trust center">{trustLinks.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav></section>
    <article className="legal-document page-frame">{children}</article>
  </>;
}
