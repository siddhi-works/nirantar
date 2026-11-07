CREATE TABLE "asha_referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace" text NOT NULL,
	"patient_id" text NOT NULL,
	"worker" text NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"by_label" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "asha_referrals_patient" ON "asha_referrals" USING btree ("workspace","patient_id");