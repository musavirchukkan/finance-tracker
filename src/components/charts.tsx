"use client";

import type { ReactElement } from "react";
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

const GRID = "rgba(255,255,255,0.06)";
const TICK = "#8b8b96";

const tooltipStyle = {
  background: "#141418",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  color: "#f4f4f5",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
};

/** Shared tooltip — no white hover band behind bars */
const chartTooltipProps = {
  contentStyle: tooltipStyle,
  wrapperStyle: { outline: "none" },
  cursor: false as const,
  itemStyle: { color: "#f4f4f5" },
  labelStyle: { color: "#8b8b96" },
};

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
          {...chartTooltipProps}
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
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="category"
          tick={{ fontSize: 11, fill: TICK }}
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
          tick={{ fontSize: 11, fill: TICK }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          {...chartTooltipProps}
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
              <div style={tooltipStyle}>
                <div style={{ marginBottom: 6, fontWeight: 700 }}>{label}</div>
                <div style={{ color: "#6366f1" }}>Budget {formatINR(budget)}</div>
                <div style={{ color: "#ff5c00" }}>Actual {formatINR(actual)}</div>
                {pct != null ? (
                  <div style={{ color: TICK, marginTop: 2 }}>{pct}% used</div>
                ) : null}
                <div
                  style={{
                    marginTop: 6,
                    paddingTop: 6,
                    borderTop: "1px solid rgba(255,255,255,0.1)",
                    color: left >= 0 ? "#34d399" : "#f87171",
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
          wrapperStyle={{ fontSize: 12, color: TICK, paddingTop: 4 }}
          iconType="circle"
        />
        <Bar
          dataKey="Budget"
          fill="#6366f1"
          radius={[6, 6, 0, 0]}
          activeBar={false}
        />
        <Bar
          dataKey="Actual"
          fill="#ff5c00"
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
  const data = points.map((p) => ({
    label: p.label,
    Projected: p.projected,
    Actual: p.actual,
  }));

  return (
    <ChartFrame height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: TICK }}
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
          tick={{ fontSize: 11, fill: TICK }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          {...chartTooltipProps}
          formatter={(v) => (v == null ? "—" : formatINR(Number(v)))}
        />
        <Line
          type="monotone"
          dataKey="Projected"
          stroke="#a855f7"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="Actual"
          stroke="#ff5c00"
          strokeWidth={2}
          connectNulls={false}
          dot={{ r: 3, fill: "#ff5c00" }}
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
  const data = [
    { name: "Income", amount: income, fill: "#ff5c00" },
    { name: "Spent", amount: expense, fill: "#a855f7" },
    {
      name: "Left",
      amount: Math.max(0, income - expense),
      fill: "#3b82f6",
    },
  ];

  return (
    <ChartFrame height={240}>
      <BarChart data={data} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12, fill: TICK }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) =>
            v >= 1000 ? `${Math.round(v / 1000)}K` : `₹${v}`
          }
          width={48}
          tick={{ fontSize: 11, fill: TICK }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          {...chartTooltipProps}
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
              style={{ fill: TICK, fontSize: 10, fontWeight: 600 }}
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
  const data = weeks.map((w) => ({
    name: w.label,
    Income: w.income,
    Expenses: w.expense,
  }));

  return (
    <ChartFrame height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: TICK }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) =>
            v >= 1000 ? `${Math.round(v / 1000)}K` : `₹${v}`
          }
          width={48}
          tick={{ fontSize: 11, fill: TICK }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          {...chartTooltipProps}
          formatter={(v) => formatINR(Number(v ?? 0))}
        />
        <Bar
          dataKey="Income"
          fill="#ff5c00"
          radius={[8, 8, 0, 0]}
          maxBarSize={28}
          activeBar={false}
        />
        <Bar
          dataKey="Expenses"
          fill="#a855f7"
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
          <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="1" y2="0">
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
                ? "linear-gradient(180deg, #ff8a3d, #ff5c00)"
                : "rgba(255,255,255,0.12)",
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
          {...chartTooltipProps}
          formatter={(v) => formatINR(Number(v ?? 0))}
        />
        {showLegend ? null : null}
      </PieChart>
    </ChartFrame>
  );
}
