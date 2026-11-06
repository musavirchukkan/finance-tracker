import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { insertTransactionForUser } from "@/lib/ledger-data";
import { UserFacingError } from "@/lib/safe-error";
import {
  createFixtureUser,
  getBankBalance,
  resetDatabase,
} from "@/test/integration/harness";

describe("insertTransactionForUser (integration)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("debits an owned bank account on expense", async () => {
    const user = await createFixtureUser("Alice", {
      startingBalance: "10000.00",
    });

    const result = await insertTransactionForUser(user.id, {
      date: "2026-11-06",
      description: "Lunch",
      categoryId: user.categoryId,
      type: "expense",
      amount: 250,
      bankAccountId: user.bankAccountId,
      activitySource: "api",
    });

    expect(result.duplicate).toBe(false);
    expect(await getBankBalance(user.id, user.bankAccountId)).toBe("9750.00");

    const [row] = await db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(
        and(eq(transactions.id, result.id), eq(transactions.userId, user.id)),
      )
      .limit(1);
    expect(row?.amount).toBe("250.00");
  });

  it("rejects another user's category (ownership)", async () => {
    const alice = await createFixtureUser("Alice");
    const bob = await createFixtureUser("Bob");

    await expect(
      insertTransactionForUser(alice.id, {
        date: "2026-11-06",
        description: "Should fail",
        categoryId: bob.categoryId,
        type: "expense",
        amount: 10,
        bankAccountId: alice.bankAccountId,
        activitySource: "api",
      }),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof UserFacingError && err.message === "Invalid category",
    );
  });

  it("rejects another user's bank account (ownership)", async () => {
    const alice = await createFixtureUser("Alice");
    const bob = await createFixtureUser("Bob");

    await expect(
      insertTransactionForUser(alice.id, {
        date: "2026-11-06",
        description: "Should fail",
        categoryId: alice.categoryId,
        type: "expense",
        amount: 10,
        bankAccountId: bob.bankAccountId,
        activitySource: "api",
      }),
    ).rejects.toThrow("Invalid bank account");

    expect(await getBankBalance(bob.id, bob.bankAccountId)).toBe("10000.00");
  });

  it("is idempotent for the same clientId", async () => {
    const user = await createFixtureUser("Alice", {
      startingBalance: "5000.00",
    });
    const clientId = "client-idem-1";

    const first = await insertTransactionForUser(user.id, {
      date: "2026-11-06",
      description: "Coffee",
      categoryId: user.categoryId,
      type: "expense",
      amount: 100,
      bankAccountId: user.bankAccountId,
      clientId,
      activitySource: "offline_sync",
    });
    const second = await insertTransactionForUser(user.id, {
      date: "2026-11-06",
      description: "Coffee again",
      categoryId: user.categoryId,
      type: "expense",
      amount: 100,
      bankAccountId: user.bankAccountId,
      clientId,
      activitySource: "offline_sync",
    });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    expect(await getBankBalance(user.id, user.bankAccountId)).toBe("4900.00");
  });
});
