import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  fetchTransactionsForExport,
  transactionsToCsv,
} from "@/lib/export-transactions";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "json" ? "json" : "csv";
  const rows = await fetchTransactionsForExport(session.user.id);
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), transactions: rows }, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="ledger-transactions-${stamp}.json"`,
      },
    });
  }

  const csv = transactionsToCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ledger-transactions-${stamp}.csv"`,
    },
  });
}
