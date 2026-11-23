/** ₹ with paise for small amounts, whole rupees for large. */
export function inr(value: number, digits?: number): string {
  const d = digits ?? (Math.abs(value) < 100 ? 2 : 0);
  return "₹" + value.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function minutes(value: number): string {
  return value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString("en-IN");
}
