import type { Metadata } from "next";
import { LegalPage } from "../../components/legal-page";
import { alternateUrls } from "../../lib/site";

export const metadata: Metadata = { title: "Accessibility", description: "Accessibility commitment, supported features and feedback contact for Trenith Tools.", alternates: alternateUrls("/accessibility") };

export default function AccessibilityPage() { return <LegalPage title="Tools should work for more people." summary="Accessibility statement · Updated 17 July 2026">
  <h2>Our approach</h2><p>Trenith aims to follow WCAG 2.2 AA principles: semantic landmarks, keyboard operation, visible focus, sufficient contrast, reduced-motion support, text alternatives, clear errors and layouts that reflow on smaller screens.</p>
  <h2>Known constraints</h2><p>Third-party provider output, browser-native media controls, very long file lists and complex generated documents can vary by browser and assistive technology. We continue to test and improve these areas.</p>
  <h2>Ask for help</h2><p>Email <a href="mailto:privacy@trenith.in">privacy@trenith.in</a> with the page, browser, assistive technology and task you could not complete. We will try to offer an accessible alternative or remediation path.</p>
</LegalPage>; }
