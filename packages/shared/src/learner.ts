/**
 * Learner IDs: short, readable codes like "K7Q2-M9XA", generated once per device.
 * The owner can read one off a learner's screen to match a payment.
 * Until phone login exists (M4), one device = one learner: clearing the browser or
 * switching phones creates a new ID.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

export function newLearnerId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export function isLearnerId(value: unknown): value is string {
  return typeof value === "string" && /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(value);
}

/** Accepts what an owner might type ("k7q2m9xa", "K7Q2 M9XA") and returns the canonical form, or null. */
export function normalizeLearnerId(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length !== 8) return null;
  const id = `${raw.slice(0, 4)}-${raw.slice(4)}`;
  return isLearnerId(id) ? id : null;
}
