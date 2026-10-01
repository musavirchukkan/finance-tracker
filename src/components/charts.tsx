"use client";

import { useMemo, type CSSProperties, type ReactElement } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "@/components/theme-provider";
import { formatINR } from "@/lib/money";

export const CHART_COLORS = [
  "#ff5c00",
  "#3b82f6",
  "#a855f7",
  "#14b8a6",
  "#f59e0b",
  "#6366f1",
  "#64748b",
  "#ec4899",
];

type ChartTheme = {
  grid: string;
  tick: string;
  ink: string;
  line: string;
  surface: string;
  track: string;
  success: string;
  danger: string;
  budget: string;
  actual: string;
  violet: string;
  blue: string;
  tooltip: CSSProperties;
  tooltipProps: {
    contentStyle: CSSProperties;
    wrapperStyle: CSSProperties;
    cursor: false;
    itemStyle: CSSProperties;
    labelStyle: CSSProperties;
  };
};

function readChartTheme(): ChartTheme {
  const s = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) =>
    s.getPropertyValue(name).trim() || fallback;

  const grid = get("--chart-grid", "rgba(255,255,255,0.06)");
  const tick = get("--muted", "#8b8b96");
  const ink = get("--ink", "#f4f4f5");
  const line = get("--line", "rgba(255,255,255,0.1)");
  const surface = get("--surface", "#141418");
  const track = get("--track-strong", "rgba(255,255,255,0.12)");
  const success = get("--success", "#34d399");
  const danger = get("--danger", "#f87171");
  const budget = get("--budget", "#6366f1");
  const actual = get("--actual", "#ff5c00");
  const violet = get("--violet", "#a855f7");
  const blue = get("--blue", "#3b82f6");

  const tooltip: CSSProperties = {
    background: surface,
    border: `1px solid ${line}`,
    borderRadius: 12,
    color: ink,
    fontSize: 12,
    padding: "0.65rem 0.75rem",
    boxShadow: get("--shadow-toast", "0 8px 24px rgba(0,0,0,0.45)"),
  };

  return {
    grid,
    tick,
    ink,
    line,
    surface,
    track,
    success,
    danger,
    budget,
    actual,
    violet,
    blue,
    tooltip,
    tooltipProps: {
      contentStyle: tooltip,
      wrapperStyle: { outline: "none" },
      cursor: false,
      itemStyle: { color: ink },
      labelStyle: { color: tick },
    },
  };
}

const FALLBACK_THEME: ChartTheme = {
  grid: "rgba(255,255,255,0.06)",
  tick: "#8b8b96",
  ink: "#f4f4f5",
  line: "rgba(255,255,255,0.1)",
  surface: "#141418",
  track: "rgba(255,255,255,0.12)",
  success: "#34d399",
  danger: "#f87171",
  budget: "#6366f1",
  actual: "#ff5c00",
  violet: "#a855f7",
  blue: "#3b82f6",
  tooltip: {
    background: "#141418",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    color: "#f4f4f5",
    fontSize: 12,
    boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
  },
  tooltipProps: {
    contentStyle: {
      background: "#141418",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 12,
      color: "#f4f4f5",
      fontSize: 12,
      boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
    },
    wrapperStyle: { outline: "none" },
    cursor: false,
    itemStyle: { color: "#f4f4f5" },
    labelStyle: { color: "#8b8b96" },
  },
};

function useChartTheme(): ChartTheme {
  const { resolved } = useTheme();
  return useMemo(() => {
    void resolved;
    if (typeof document === "undefined") return FALLBACK_THEME;
    return readChartTheme();
  }, [resolved]);
}

function ChartFrame({
  height,
  children,
}: {
  height: number;
  children: ReactElement;
}) {
  return (
    <div className="chart-box" style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

type BudgetRow = {
  category: string;
  budget: number;
  actual: number;
};

export function ActualDonut({
  rows,
  showLegend = true,
  height = 280,
  inner = 60,
  outer = 95,
}: {
  rows: BudgetRow[];
  showLegend?: boolean;
  height?: number;
  inner?: number;
  outer?: number;
}) {
  const chart = useChartTheme();
  const data = rows
    .filter((r) => r.actual > 0)
    .map((r) => ({ name: r.category, value: r.actual }));

  if (data.length === 0) {
    return <div className="empty">No spending this month yet.</div>;
  }

  return (
    <ChartFrame height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={inner}
          outerRadius={outer}
          paddingAngle={3}
          stroke="transparent"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          {...chart.tooltipProps}
          formatter={(v) => formatINR(Number(v ?? 0))}
        />
        {showLegend ? null : null}
      </PieChart>
    </ChartFrame>
  );
}

function shortINR(v: number) {
  if (!v) return "";
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (Math.abs(v) >= 1000) return `₹${Math.round(v / 1000)}k`;
  return `₹${Math.round(v)}`;
}

export function BudgetVsActualBars({ rows }: { rows: BudgetRow[] }) {
  const chart = useChartTheme();
  const data = rows
    .filter((r) => r.budget > 0 || r.actual > 0)
    .map((r) => ({
      category: r.category,
      Budget: r.budget,
      Actual: r.actual,
      Left: r.budget - r.actual,
    }));

  if (data.length === 0) {
    return <div className="empty">No budgets or spending yet.</div>;
  }

  return (
    <ChartFrame height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={chart.grid}
          vertical={false}
        />
        <XAxis
          dataKey="category"
          tick={{ fontSize: 11, fill: chart.tick }}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={60}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) =>
            v >= 1000 ? `${Math.round(v / 1000)}K` : `₹${v}`
          }
          width={48}
          tick={{ fontSize: 11, fill: chart.tick }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          {...chart.tooltipProps}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const budget = Number(
              payload.find((p) => p.dataKey === "Budget")?.value ?? 0,
            );
            const actual = Number(
              payload.find((p) => p.dataKey === "Actual")?.value ?? 0,
            );
            const left = budget - actual;
            const pct = budget > 0 ? Math.round((actual / budget) * 100) : null;
            return (
              <div style={chart.tooltip}>
                <div style={{ marginBottom: 6, fontWeight: 700 }}>{label}</div>
                <div style={{ color: chart.budget }}>
                  Budget {formatINR(budget)}
                </div>
                <div style={{ color: chart.actual }}>
                  Actual {formatINR(actual)}
                </div>
                {pct != null ? (
                  <div style={{ color: chart.tick, marginTop: 2 }}>
                    {pct}% used
                  </div>
                ) : null}
                <div
                  style={{
                    marginTop: 6,
                    paddingTop: 6,
                    borderTop: `1px solid ${chart.line}`,
                    color: left >= 0 ? chart.success : chart.danger,
                    fontWeight: 700,
                  }}
                >
                  {left >= 0 ? "Left " : "Over "}
                  {formatINR(Math.abs(left))}
                </div>
              </div>
            );
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, color: chart.tick, paddingTop: 4 }}
          iconType="circle"
        />
        <Bar
          dataKey="Budget"
          fill={chart.budget}
          radius={[6, 6, 0, 0]}
          activeBar={false}
        />
        <Bar
          dataKey="Actual"
          fill={chart.actual}
          radius={[6, 6, 0, 0]}
          activeBar={false}
        />
      </BarChart>
    </ChartFrame>
  );
}

type CurvePoint = {
  label: string;
  projected: number;
  actual: number | null;
};

export function DebtReductionChart({ points }: { points: CurvePoint[] }) {
  const chart = useChartTheme();
  const data = points.map((p) => ({
    label: p.label,
    Projected: p.projected,
    Actual: p.actual,
  }));

  return (
    <ChartFrame height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: chart.tick }}
          interval="preserveStartEnd"
          angle={-25}
          textAnchor="end"
          height={70}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => `₹${v}`}
          width={64}
          tick={{ fontSize: 11, fill: chart.tick }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          {...chart.tooltipProps}
          formatter={(v) => (v == null ? "—" : formatINR(Number(v)))}
        />
        <Line
          type="monotone"
          dataKey="Projected"
          stroke={chart.violet}
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="Actual"
          stroke={chart.actual}
          strokeWidth={2}
          connectNulls={false}
          dot={{ r: 3, fill: chart.actual }}
        />
      </LineChart>
    </ChartFrame>
  );
}

export function CashflowBars({
  income,
  expense,
  showLabels = true,
}: {
  income: number;
  expense: number;
  showLabels?: boolean;
}) {
  const chart = useChartTheme();
  const data = [
    { name: "Income", amount: income, fill: chart.actual },
    { name: "Spent", amount: expense, fill: chart.violet },
    {
      name: "Left",
      amount: Math.max(0, income - expense),
      fill: chart.blue,
    },
  ];

  return (
    <ChartFrame height={240}>
      <BarChart data={data} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={chart.grid}
          vertical={false}
        />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12, fill: chart.tick }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) =>
            v >= 1000 ? `${Math.round(v / 1000)}K` : `₹${v}`
          }
          width={48}
          tick={{ fontSize: 11, fill: chart.tick }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          {...chart.tooltipProps}
          formatter={(v) => formatINR(Number(v ?? 0))}
        />
        <Bar dataKey="amount" radius={[8, 8, 0, 0]} activeBar={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.fill} />
          ))}
          {showLabels ? (
            <LabelList
              dataKey="amount"
              position="top"
              formatter={(v) => shortINR(Number(v ?? 0))}
              style={{ fill: chart.tick, fontSize: 10, fontWeight: 600 }}
            />
          ) : null}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

export function WeeklyCashflowBars({
  weeks,
}: {
  weeks: { label: string; income: number; expense: number }[];
}) {
  const chart = useChartTheme();
  const data = weeks.map((w) => ({
    name: w.label,
    Income: w.income,
    Expenses: w.expense,
  }));

  return (
    <ChartFrame height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={chart.grid}
          vertical={false}
        />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: chart.tick }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) =>
            v >= 1000 ? `${Math.round(v / 1000)}K` : `₹${v}`
          }
          width={48}
          tick={{ fontSize: 11, fill: chart.tick }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          {...chart.tooltipProps}
          formatter={(v) => formatINR(Number(v ?? 0))}
        />
        <Bar
          dataKey="Income"
          fill={chart.actual}
          radius={[8, 8, 0, 0]}
          maxBarSize={28}
          activeBar={false}
        />
        <Bar
          dataKey="Expenses"
          fill={chart.violet}
          radius={[8, 8, 0, 0]}
          maxBarSize={28}
          activeBar={false}
        />
      </BarChart>
    </ChartFrame>
  );
}

export function Sparkline({
  values,
  color = "#ff5c00",
}: {
  values: number[];
  color?: string;
}) {
  const data = values.map((v, i) => ({ i, v }));
  if (data.length < 2) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient
            id={`spark-${color.replace("#", "")}`}
            x1="0"
            y1="0"
            x2="1"
            y2="0"
          >
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={1} />
          </linearGradient>
        </defs>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2.5}
          dot={false}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MiniBars({ values }: { values: number[] }) {
  const chart = useChartTheme();
  const max = Math.max(...values, 1);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 3,
        height: "100%",
        padding: "0 0.5rem 0.35rem",
      }}
      aria-hidden
    >
      {values.map((v, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(12, (v / max) * 100)}%`,
            borderRadius: 3,
            background:
              i === values.length - 1
                ? `linear-gradient(180deg, ${chart.actual}, ${chart.actual})`
                : chart.track,
          }}
        />
      ))}
    </div>
  );
}

export function IncomeDonut({
  rows,
  showLegend = true,
  height = 220,
  inner = 48,
  outer = 80,
}: {
  rows: { name: string; value: number }[];
  showLegend?: boolean;
  height?: number;
  inner?: number;
  outer?: number;
}) {
  const chart = useChartTheme();
  const data = rows.filter((r) => r.value > 0);
  if (data.length === 0) {
    return <div className="empty">No income this month yet.</div>;
  }

  return (
    <ChartFrame height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={inner}
          outerRadius={outer}
          paddingAngle={3}
          stroke="transparent"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          {...chart.tooltipProps}
          formatter={(v) => formatINR(Number(v ?? 0))}
        />
        {showLegend ? null : null}
      </PieChart>
    </ChartFrame>
  );
}
