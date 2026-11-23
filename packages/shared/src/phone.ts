/**
 * Indian mobile numbers only for now: 10 digits starting 6-9, with or without +91 / 0 / spaces.
 * Returns E.164 ("+919876543210") or null.
 */
export function normalizeIndianMobile(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

/** "+919876543210" -> "98765 43210" for display. */
export function formatIndianMobile(e164: string): string {
  const d = e164.replace(/^\+91/, "");
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : e164;
}

/** "+919876543210" -> "•••••43210", for logs and the admin list. */
export function maskPhone(e164: string): string {
  const d = e164.replace(/^\+91/, "");
  return `•••••${d.slice(-5)}`;
}
