CREATE TABLE "abdm_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"consent_id" text NOT NULL,
	"hip_hfr" text NOT NULL,
	"encrypted_data" text NOT NULL,
	"hip_key_material" text NOT NULL,
	"checksum" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hip_consent_copies" (
	"consent_id" text PRIMARY KEY NOT NULL,
	"hip_hfr" text NOT NULL,
	"workspace" text NOT NULL,
	"artefact" text NOT NULL,
	"signature" text NOT NULL,
	"status" text NOT NULL,
	"stored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "exchange_keys" ADD COLUMN "nonce" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sim_consents" ADD COLUMN "purpose_code" text DEFAULT 'CAREMGT' NOT NULL;--> statement-breakpoint
ALTER TABLE "sim_consents" ADD COLUMN "hi_types" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sim_consents" ADD COLUMN "date_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sim_consents" ADD COLUMN "date_to" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sim_consents" ADD COLUMN "keep_days" integer;--> statement-breakpoint
ALTER TABLE "sim_consents" ADD COLUMN "data_erase_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sim_consents" ADD COLUMN "requester_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sim_consents" ADD COLUMN "requester_reg" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sim_consents" ADD COLUMN "artefact" text;--> statement-breakpoint
ALTER TABLE "sim_consents" ADD COLUMN "signature" text;