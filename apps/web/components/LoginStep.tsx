"use client";

import { useState } from "react";
import type { Strings } from "../lib/strings";

export interface Me {
  user: { id: string; name: string | null; phone: string; isTest: boolean } | null;
  paid: boolean;
  priceInr: number;
  payments: { razorpay: boolean; test: boolean };
  trial: { minutes: number; used: number } | null;
}

export async function fetchMe(): Promise<Me> {
  const res = await fetch("/api/me", { cache: "no-store" });
  return (await res.json()) as Me;
}

/**
 * Phone -> OTP -> (new users) name. One flow for sign-up and sign-in.
 * Big inputs, numeric keyboard, and the code field supports SMS autofill.
 */
export function LoginStep({ t, onDone }: { t: Strings; onDone: (me: Me) => void }) {
  const [stage, setStage] = useState<"phone" | "code" | "name">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const errorText = (e: string) =>
    ({
      invalid_phone: t.errInvalidPhone,
      wrong_code: t.errWrongCode,
      expired: t.errExpired,
      too_many_attempts: t.errTooMany,
      too_soon: t.errTooSoon,
    })[e] ?? t.errGeneric;

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return (await res.json().catch(() => ({ ok: false, error: "network" }))) as { ok: boolean; error?: string; isNew?: boolean };
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    const r = await post("/api/auth/otp", { phone });
    setBusy(false);
    if (r.ok) setStage("code");
    else setError(errorText(r.error ?? ""));
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const r = await post("/api/auth/verify", { phone, code });
    setBusy(false);
    if (!r.ok) {
      setError(errorText(r.error ?? ""));
      return;
    }
    if (r.isNew) setStage("name");
    else onDone(await fetchMe());
  }

  async function saveName(skip: boolean) {
    setBusy(true);
    if (!skip && name.trim()) await post("/api/auth/name", { name });
    onDone(await fetchMe());
  }

  if (stage === "phone") {
    return (
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void sendCode();
        }}
      >
        <h1>{t.signInTitle}</h1>
        <p className="muted">{t.signInHint}</p>
        <label className="field">
          <span>{t.phoneLabel}</span>
          <span className="phone-input">
            <span className="prefix">+91</span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={14}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
              required
            />
          </span>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy || phone.replace(/\D/g, "").length < 10}>
          {t.sendOtp}
        </button>
      </form>
    );
  }

  if (stage === "code") {
    return (
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void verify();
        }}
      >
        <h1>{t.otpLabel}</h1>
        <p className="muted">
          {t.otpSentTo} <strong>+91 {phone}</strong>
        </p>
        <label className="field">
          <span>{t.otpLabel}</span>
          <input
            className="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
            autoFocus
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy || code.length !== 6}>
          {t.verify}
        </button>
        <div className="row">
          <button type="button" className="btn secondary" onClick={() => { setStage("phone"); setCode(""); setError(null); }}>
            {t.changeNumber}
          </button>
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void sendCode()}>
            {t.resendOtp}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void saveName(false);
      }}
    >
      <h1>{t.nameTitle}</h1>
      <label className="field">
        <span>{t.nameLabel}</span>
        <input type="text" autoComplete="given-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <button className="btn" disabled={busy}>
        {t.save}
      </button>
      <button type="button" className="btn secondary" disabled={busy} onClick={() => void saveName(true)}>
        {t.skip}
      </button>
    </form>
  );
}
