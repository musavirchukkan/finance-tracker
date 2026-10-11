import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, transactions } from "@/lib/db/schema";

export type ExportTransactionRow = {
  date: string;
  occurredAt: string;
  description: string;
  category: string;
  type: string;
  amount: string;
};

export async function fetchTransactionsForExport(
  userId: string,
): Promise<ExportTransactionRow[]> {
  const rows = await db
    .select({
      date: transactions.date,
      occurredAt: transactions.occurredAt,
      description: transactions.description,
      category: categories.name,
      type: transactions.type,
      amount: transactions.amount,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(transactions.userId, userId))
    .orderBy(asc(transactions.date), asc(transactions.occurredAt));

  return rows.map((row) => ({
    date: row.date,
    occurredAt:
      row.occurredAt instanceof Date
        ? row.occurredAt.toISOString()
        : String(row.occurredAt),
    description: row.description ?? "",
    category: row.category,
    type: row.type,
    amount: String(row.amount),
  }));
}

function csvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function transactionsToCsv(rows: ExportTransactionRow[]) {
  const header = [
    "date",
    "occurred_at",
    "description",
    "category",
    "type",
    "amount",
  ];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        csvCell(row.date),
        csvCell(row.occurredAt),
        csvCell(row.description),
        csvCell(row.category),
        csvCell(row.type),
        csvCell(row.amount),
      ].join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}
