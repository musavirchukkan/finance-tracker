ALTER TABLE "bank_accounts" ADD COLUMN "show_in_payment_picker" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "credit_cards" ADD COLUMN "show_in_payment_picker" boolean DEFAULT true NOT NULL;
