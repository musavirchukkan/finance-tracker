/** Suggested emoji palette for category picker */
export const CATEGORY_ICON_CHOICES = [
  "🏠",
  "🍽️",
  "🛒",
  "🚕",
  "✈️",
  "💡",
  "💊",
  "🎬",
  "🛍️",
  "📱",
  "🎓",
  "🏋️",
  "☕",
  "🎉",
  "🐾",
  "👶",
  "💼",
  "💻",
  "💰",
  "📈",
  "🎁",
  "🏦",
  "🤝",
  "📁",
  "✨",
] as const;

const DEFAULT_BY_NAME: Record<string, string> = {
  auto: "🚕",
  entertainment: "🎬",
  food: "🍽️",
  home: "🏠",
  medical: "💊",
  "personal items": "🛍️",
  travel: "✈️",
  utilities: "💡",
  other: "📁",
  salary: "💼",
  freelance: "💻",
  "other income": "💰",
  "debt / emi": "🏦",
  borrowed: "🤝",
};

/** Prefer stored icon; otherwise guess from name. */
export function resolveCategoryIcon(
  name: string,
  icon?: string | null,
): string {
  const trimmed = icon?.trim();
  if (trimmed) return trimmed;

  const key = name.trim().toLowerCase();
  if (DEFAULT_BY_NAME[key]) return DEFAULT_BY_NAME[key];

  if (/food|dining|restaurant|eat/.test(key)) return "🍽️";
  if (/groc/.test(key)) return "🛒";
  if (/travel|flight|trip/.test(key)) return "✈️";
  if (/auto|commute|transport|fuel|cab|uber/.test(key)) return "🚕";
  if (/util|bill|electric|water|internet/.test(key)) return "💡";
  if (/shop|personal|cloth|amazon/.test(key)) return "🛍️";
  if (/medic|health|hospital|pharma/.test(key)) return "💊";
  if (/entertain|movie|game/.test(key)) return "🎬";
  if (/home|rent|hous/.test(key)) return "🏠";
  if (/salary|wage|payroll/.test(key)) return "💼";
  if (/freelance|consult|side/.test(key)) return "💻";
  if (/income/.test(key)) return "💰";
  return "📁";
}

export function defaultIconForCategoryName(name: string): string {
  return resolveCategoryIcon(name, null);
}
