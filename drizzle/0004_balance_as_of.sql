ALTER TABLE "bank_accounts" ADD COLUMN "balance_as_of" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "bank_accounts" SET "balance_as_of" = "created_at";
