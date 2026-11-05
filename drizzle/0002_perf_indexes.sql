CREATE INDEX IF NOT EXISTS "bank_accounts_user" ON "bank_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_cards_user" ON "credit_cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_date" ON "transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_occurred" ON "transactions" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_category" ON "transactions" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_bank" ON "transactions" USING btree ("user_id","bank_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_card" ON "transactions" USING btree ("user_id","credit_card_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_activities_user_card_date" ON "card_activities" USING btree ("user_id","card_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_activities_transaction" ON "card_activities" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debt_accounts_user" ON "debt_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debt_payments_user_due" ON "debt_payments" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debt_payments_account_due" ON "debt_payments" USING btree ("account_id","due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "savings_goals_user" ON "savings_goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "investments_user" ON "investments" USING btree ("user_id");
