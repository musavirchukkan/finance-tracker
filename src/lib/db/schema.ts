import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("expense"), // expense | income
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("categories_user_name").on(t.userId, t.name)],
);

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    yearMonth: text("year_month").notNull(), // YYYY-MM
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  },
  (t) => [
    uniqueIndex("budgets_user_cat_month").on(
      t.userId,
      t.categoryId,
      t.yearMonth,
    ),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    /** Actual moment of the transaction (for timeline ordering). */
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    description: text("description").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    type: text("type").notNull().default("expense"), // expense | income
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    /** Client-generated id for offline sync idempotency. */
    clientId: text("client_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("transactions_user_client").on(t.userId, t.clientId)],
);

export const debtAccounts = pgTable("debt_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  startingBalance: numeric("starting_balance", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  status: text("status").notNull().default("Active Paydown"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const debtPayments = pgTable("debt_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => debtAccounts.id, { onDelete: "cascade" }),
  dueDate: date("due_date").notNull(),
  paymentType: text("payment_type").notNull().default("EMI"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  isPaid: boolean("is_paid").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const debtSettings = pgTable("debt_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  goalPayoffDate: date("goal_payoff_date").notNull(),
});

export const usersRelations = relations(users, ({ many, one }) => ({
  categories: many(categories),
  budgets: many(budgets),
  transactions: many(transactions),
  debtAccounts: many(debtAccounts),
  debtPayments: many(debtPayments),
  debtSettings: one(debtSettings),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, { fields: [categories.userId], references: [users.id] }),
  budgets: many(budgets),
  transactions: many(transactions),
}));

export const debtAccountsRelations = relations(debtAccounts, ({ one, many }) => ({
  user: one(users, { fields: [debtAccounts.userId], references: [users.id] }),
  payments: many(debtPayments),
}));

export const debtPaymentsRelations = relations(debtPayments, ({ one }) => ({
  account: one(debtAccounts, {
    fields: [debtPayments.accountId],
    references: [debtAccounts.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type DebtAccount = typeof debtAccounts.$inferSelect;
export type DebtPayment = typeof debtPayments.$inferSelect;
