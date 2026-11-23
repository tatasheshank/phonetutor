"use client";

import { useEffect, useState } from "react";
import { fetchMe, type Me } from "../../components/LoginStep";
import { loadProfile } from "../../lib/profile";
import { fill, strings } from "../../lib/strings";

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: () => void) => void };
  }
}

const CHECKOUT_JS = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHECKOUT_JS;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("checkout.js failed to load"));
    document.body.appendChild(s);
  });
}

export default function PayPage() {
  const [lang, setLang] = useState<"te" | "hi" | "en">("te");
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");

  useEffect(() => {
    setLang(loadProfile().tutorLanguage ?? "te");
    void fetchMe().then((m) => {
      if (!m.user) window.location.replace("/");
      else setMe(m);
    });
  }, []);

  const t = strings(lang);
  if (!me?.user) return null;
  const price = `₹${me.priceInr}`;

  async function confirm(body: Record<string, string>) {
    const res = await fetch("/api/pay/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const ok = res.ok && ((await res.json()) as { ok: boolean }).ok;
    setState(ok ? "done" : "failed");
    if (ok) setMe(await fetchMe());
  }

  async function pay() {
    setState("busy");
    try {
      const res = await fetch("/api/pay/order", { method: "POST" });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        order?: { id: string; amountInr: number; provider: "razorpay" | "test"; keyId?: string };
        course?: { name: Record<string, string> };
        prefill?: { contact: string; name?: string };
      };
      if (data.error === "already_paid") {
        setMe(await fetchMe());
        setState("done");
        return;
      }
      if (!data.ok || !data.order) throw new Error(data.error);
      const order = data.order;

      if (order.provider === "test") {
        await confirm({ orderId: order.id });
        return;
      }

      await loadCheckout();
      const rzp = new window.Razorpay!({
        key: order.keyId,
        order_id: order.id,
        amount: order.amountInr * 100,
        currency: "INR",
        name: "Phone Tutor",
        description: data.course?.name[lang] ?? data.course?.name.en,
        prefill: data.prefill,
        theme: { color: "#0f766e" },
        handler: (r: RazorpayResponse) =>
          void confirm({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
        modal: { ondismiss: () => setState("idle") },
      });
      rzp.on("payment.failed", () => setState("failed"));
      rzp.open();
    } catch (err) {
      console.error(err);
      setState("failed");
    }
  }

  return (
    <main lang={lang}>
      <h1>{t.payTitle}</h1>
      {me.paid ? (
        <>
          <p className="success" role="status">
            ✅ {t.paySuccess}
          </p>
          <a className="btn" href="/" style={{ textAlign: "center", textDecoration: "none", lineHeight: "40px" }}>
            {t.start}
          </a>
        </>
      ) : (
        <>
          <div className="card stack">
            <p>{t.payBody}</p>
            <p className="price">{price}</p>
          </div>
          {state === "failed" && <p className="error">{t.payFailed}</p>}
          {state === "busy" && <p className="status">{t.payProcessing}</p>}
          {me.payments.razorpay ? (
            <button className="btn" disabled={state === "busy"} onClick={() => void pay()}>
              {fill(t.payButton, { price })}
            </button>
          ) : me.payments.test ? (
            <>
              <p className="muted">{t.payTestNote}</p>
              <button className="btn" disabled={state === "busy"} onClick={() => void pay()}>
                {fill(t.payTestButton, { price })}
              </button>
            </>
          ) : (
            <p className="error">{t.errGeneric}</p>
          )}
          <a className="btn secondary" href="/" style={{ textAlign: "center", textDecoration: "none", lineHeight: "40px" }}>
            {t.back}
          </a>
        </>
      )}
    </main>
  );
}
