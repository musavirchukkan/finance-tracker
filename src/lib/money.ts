const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatINR(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (Number.isNaN(n)) return inr.format(0);
  return inr.format(n);
}

export function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isNaN(n) ? 0 : n;
}

export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[₹,\s]/g, "");
  const n = Number(cleaned);
  if (Number.isNaN(n) || n < 0) {
    throw new Error("Invalid amount");
  }
  return Math.round(n * 100) / 100;
}
