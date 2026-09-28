"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

const COLORS = [
  "#0f6b4c",
  "#2f6fed",
  "#c45c26",
  "#7a3e9d",
  "#1a9a6c",
  "#b54708",
  "#2563eb",
  "#0e7490",
  "#64748b",
];

type BudgetRow = {
  category: string;
  budget: number;
  actual: number;
};

export function ActualDonut({ rows }: { rows: BudgetRow[] }) {
  const data = rows
    .filter((r) => r.actual > 0)
    .map((r) => ({ name: r.category, value: r.actual }));

  if (data.length === 0) {
    return <div className="empty">No spending this month yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={60}
          outerRadius={95}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => formatINR(Number(v ?? 0))} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function BudgetVsActualBars({ rows }: { rows: BudgetRow[] }) {
  const data = rows.map((r) => ({
    category: r.category,
    Budget: r.budget,
    Actual: r.actual,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#d5e0da" />
        <XAxis dataKey="category" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
        <YAxis tickFormatter={(v) => `₹${v}`} width={70} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => formatINR(Number(v ?? 0))} />
        <Legend />
        <Bar dataKey="Budget" fill="#2f6fed" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Actual" fill="#1a9a6c" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
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
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#d5e0da" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10 }}
          interval="preserveStartEnd"
          angle={-25}
          textAnchor="end"
          height={70}
        />
        <YAxis tickFormatter={(v) => `₹${v}`} width={64} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => (v == null ? "—" : formatINR(Number(v)))} />
        <Legend />
        <Line
          type="monotone"
          dataKey="Projected"
          stroke="#2f6fed"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="Actual"
          stroke="#1a9a6c"
          strokeWidth={2}
          connectNulls={false}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CashflowBars({
  income,
  expense,
}: {
  income: number;
  expense: number;
}) {
  const data = [
    { name: "Income", amount: income, fill: "#1a9a6c" },
    { name: "Spent", amount: expense, fill: "#b54708" },
    {
      name: "Left",
      amount: Math.max(0, income - expense),
      fill: "#2f6fed",
    },
  ];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#d5e0da" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={(v) => `₹${v}`} width={64} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => formatINR(Number(v ?? 0))} />
        <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function IncomeDonut({
  rows,
}: {
  rows: { name: string; value: number }[];
}) {
  const data = rows.filter((r) => r.value > 0);
  if (data.length === 0) {
    return <div className="empty">No income this month yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={48}
          outerRadius={80}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => formatINR(Number(v ?? 0))} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
