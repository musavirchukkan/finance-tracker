"use client";

import {
  useTheme,
  type ThemePreference,
} from "@/components/theme-provider";

const OPTIONS: { value: ThemePreference; label: string; icon: "sun" | "moon" | "system" }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "system" },
];

function ThemeIcon({ name }: { name: "sun" | "moon" | "system" }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "sun") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (name === "moon") {
    return (
      <svg {...common}>
        <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <section className="panel theme-panel">
      <div className="panel-head">
        <div>
          <h2>Appearance</h2>
          <p className="muted page-sub" style={{ margin: "0.25rem 0 0" }}>
            Choose light, dark, or match your device.
          </p>
        </div>
      </div>

      <div
        className="theme-toggle"
        role="radiogroup"
        aria-label="Color theme"
      >
        {OPTIONS.map((opt) => {
          const active = preference === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              className={active ? "theme-option active" : "theme-option"}
              onClick={() => setPreference(opt.value)}
            >
              <ThemeIcon name={opt.icon} />
              {opt.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
