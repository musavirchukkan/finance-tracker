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
    icon: text("icon"),
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

/** Cash / savings bank accounts. */
export const bankAccounts = pgTable("bank_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  currentBalance: numeric("current_balance", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  /** e.g. Savings, Current, Wallet */
  accountType: text("account_type").notNull().default("Savings"),
  status: text("status").notNull().default("Active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Rolling credit cards (not EMI loans). */
export const creditCards = pgTable("credit_cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  currentOutstanding: numeric("current_outstanding", {
    precision: 14,
    scale: 2,
  })
    .notNull()
    .default("0"),
  creditLimit: numeric("credit_limit", { precision: 14, scale: 2 }),
  /** Day of month statement closes (1–28). */
  billingDay: integer("billing_day"),
  /** Day of month payment is due (1–28). */
  paymentDueDay: integer("payment_due_day"),
  /** Last 4 digits of the card number (for identification). */
  lastFour: text("last_four"),
  /** RuPay cards can be used for UPI. */
  isRupay: boolean("is_rupay").notNull().default(false),
  status: text("status").notNull().default("Active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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
    /** When set on an expense, this spend was paid with the card. */
    creditCardId: uuid("credit_card_id").references(() => creditCards.id, {
      onDelete: "set null",
    }),
    /** Bank account used: expense decreases balance, income increases it. */
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
    /** Client-generated id for offline sync idempotency. */
    clientId: text("client_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("transactions_user_client").on(t.userId, t.clientId)],
);

/**
 * Card ledger events: spends, wallet recharge/cashout, fees, bill payments.
 * outstanding_delta is applied to credit_cards.current_outstanding.
 */
export const cardActivities = pgTable("card_activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  cardId: uuid("card_id")
    .notNull()
    .references(() => creditCards.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  /** spend | wallet_recharge | wallet_cashout | fee | bill_payment */
  activityType: text("activity_type").notNull(),
  /** Primary display amount (wallet credit, cashout, fee, bill, spend). */
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  /** Signed change to card outstanding (+ charge, − payment). */
  outstandingDelta: numeric("outstanding_delta", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  /** Wallet recharge: amount credited to wallet. */
  walletCredit: numeric("wallet_credit", { precision: 12, scale: 2 }),
  /** Wallet recharge: full amount charged on the card. */
  cardCharged: numeric("card_charged", { precision: 12, scale: 2 }),
  /** Wallet cashout: bank fee portion. */
  bankFee: numeric("bank_fee", { precision: 12, scale: 2 }),
  description: text("description").notNull().default(""),
  transactionId: uuid("transaction_id").references(() => transactions.id, {
    onDelete: "set null",
  }),
  /** Secondary linked tx (e.g. bank fee expense on cashout). */
  relatedTransactionId: uuid("related_transaction_id").references(
    () => transactions.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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
  monthlyEmi: numeric("monthly_emi", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  /** Flat annual interest % used in the debt form (EMI remains source of cashflow). */
  interestPercent: numeric("interest_percent", { precision: 8, scale: 2 })
    .notNull()
    .default("0"),
  totalMonths: integer("total_months").notNull().default(0),
  monthsPaid: integer("months_paid").notNull().default(0),
  status: text("status").notNull().default("Active Paydown"),
  /** Linked rolling card when type is Credit Card EMI. */
  creditCardId: uuid("credit_card_id").references(() => creditCards.id, {
    onDelete: "set null",
  }),
  /** Income tx logged when borrowed money was received. */
  receivedTransactionId: uuid("received_transaction_id").references(
    () => transactions.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const debtPayments = pgTable(
  "debt_payments",
  {
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
    /** Linked expense transaction when this payment hits monthly cashflow. */
    transactionId: uuid("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("debt_payments_transaction").on(t.transactionId)],
);

export const debtSettings = pgTable("debt_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  goalPayoffDate: date("goal_payoff_date").notNull(),
});

export const savingsGoals = pgTable("savings_goals", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetAmount: numeric("target_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  currentAmount: numeric("current_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  targetDate: date("target_date"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const usersRelations = relations(users, ({ many, one }) => ({
  categories: many(categories),
  budgets: many(budgets),
  transactions: many(transactions),
  bankAccounts: many(bankAccounts),
  creditCards: many(creditCards),
  cardActivities: many(cardActivities),
  debtAccounts: many(debtAccounts),
  debtPayments: many(debtPayments),
  debtSettings: one(debtSettings),
  savingsGoals: many(savingsGoals),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, { fields: [categories.userId], references: [users.id] }),
  budgets: many(budgets),
  transactions: many(transactions),
}));

export const bankAccountsRelations = relations(bankAccounts, ({ one, many }) => ({
  user: one(users, { fields: [bankAccounts.userId], references: [users.id] }),
  transactions: many(transactions),
}));

export const creditCardsRelations = relations(creditCards, ({ one, many }) => ({
  user: one(users, { fields: [creditCards.userId], references: [users.id] }),
  activities: many(cardActivities),
  transactions: many(transactions),
  debtAccounts: many(debtAccounts),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  creditCard: one(creditCards, {
    fields: [transactions.creditCardId],
    references: [creditCards.id],
  }),
  bankAccount: one(bankAccounts, {
    fields: [transactions.bankAccountId],
    references: [bankAccounts.id],
  }),
}));

export const cardActivitiesRelations = relations(cardActivities, ({ one }) => ({
  user: one(users, { fields: [cardActivities.userId], references: [users.id] }),
  card: one(creditCards, {
    fields: [cardActivities.cardId],
    references: [creditCards.id],
  }),
  transaction: one(transactions, {
    fields: [cardActivities.transactionId],
    references: [transactions.id],
  }),
}));

export const debtAccountsRelations = relations(debtAccounts, ({ one, many }) => ({
  user: one(users, { fields: [debtAccounts.userId], references: [users.id] }),
  payments: many(debtPayments),
  creditCard: one(creditCards, {
    fields: [debtAccounts.creditCardId],
    references: [creditCards.id],
  }),
  receivedTransaction: one(transactions, {
    fields: [debtAccounts.receivedTransactionId],
    references: [transactions.id],
  }),
}));

export const debtPaymentsRelations = relations(debtPayments, ({ one }) => ({
  account: one(debtAccounts, {
    fields: [debtPayments.accountId],
    references: [debtAccounts.id],
  }),
  transaction: one(transactions, {
    fields: [debtPayments.transactionId],
    references: [transactions.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type BankAccount = typeof bankAccounts.$inferSelect;
export type CreditCard = typeof creditCards.$inferSelect;
export type CardActivity = typeof cardActivities.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type DebtAccount = typeof debtAccounts.$inferSelect;
export type DebtPayment = typeof debtPayments.$inferSelect;
export type SavingsGoal = typeof savingsGoals.$inferSelect;
