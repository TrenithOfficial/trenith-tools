"use client";

import { openPrivacySettings } from "./consent-manager";

export function PrivacySettingsButton() {
  return <button className="primary-action privacy-choice-button" onClick={openPrivacySettings}>Open privacy settings</button>;
}
