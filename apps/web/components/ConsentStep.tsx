"use client";

import { useState } from "react";
import type { Strings } from "../lib/strings";

/**
 * DPDP consent before the first live turn. Recording for improvement is a separate opt-in.
 * TODO(M2): the tutor reads this aloud using cached audio per language.
 * TODO(M4): store in the consents table with version and language.
 */
export function ConsentStep({ t, onAgree }: { t: Strings; onAgree: (recordingOptIn: boolean) => void }) {
  const [optIn, setOptIn] = useState(false);
  return (
    <>
      <h1>{t.consentTitle}</h1>
      <div className="card">
        <p>{t.consentBody}</p>
      </div>
      <label className="check">
        <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
        <span>{t.consentRecording}</span>
      </label>
      <button className="btn" onClick={() => onAgree(optIn)}>
        ✓ {t.consentAgree}
      </button>
    </>
  );
}
