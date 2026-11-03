CREATE TABLE "exchange_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"hiu_hfr" text NOT NULL,
	"private_key" text NOT NULL,
	"public_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "received_records" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"consent_id" text NOT NULL,
	"hiu_hfr" text NOT NULL,
	"from_hfr" text NOT NULL,
	"bundle" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_annotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"received_id" text NOT NULL,
	"text" text NOT NULL,
	"by_user_id" text NOT NULL,
	"by_label" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sim_care_contexts" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"hip_hfr" text NOT NULL,
	"document_id" text NOT NULL,
	"display" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sim_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text,
	"abha" text NOT NULL,
	"hiu_hfr" text NOT NULL,
	"hiu_user_id" text NOT NULL,
	"hiu_name" text NOT NULL,
	"purpose" text NOT NULL,
	"validity_days" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sim_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"consent_id" text NOT NULL,
	"hip_hfr" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"salt" text NOT NULL,
	"hip_public_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "received_hiu" ON "received_records" USING btree ("hiu_hfr");--> statement-breakpoint
CREATE UNIQUE INDEX "sim_care_contexts_doc" ON "sim_care_contexts" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "sim_consents_patient" ON "sim_consents" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "sim_consents_hiu" ON "sim_consents" USING btree ("hiu_hfr");