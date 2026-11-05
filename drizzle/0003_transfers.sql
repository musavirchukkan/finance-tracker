ALTER TABLE "transactions" ADD COLUMN "transfer_to_bank_account_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_to_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("transfer_to_bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_transfer_to" ON "transactions" USING btree ("transfer_to_bank_account_id");
