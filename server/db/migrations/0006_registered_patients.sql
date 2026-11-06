CREATE TABLE "consent_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"workspace" text NOT NULL,
	"action" text NOT NULL,
	"purposes" text NOT NULL,
	"mode" text,
	"reason" text,
	"by_label" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registered_patients" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace" text NOT NULL,
	"hfr_id" text NOT NULL,
	"abha" text NOT NULL,
	"abha_source" text NOT NULL,
	"name" text NOT NULL,
	"age" integer NOT NULL,
	"sex" text NOT NULL,
	"phone" text NOT NULL,
	"place" text,
	"verified_at" timestamp with time zone NOT NULL,
	"verify_method" text NOT NULL,
	"consent_purposes" text NOT NULL,
	"consent_version" text NOT NULL,
	"consent_mode" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"by_user_id" text NOT NULL,
	"by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace" text NOT NULL,
	"hfr_id" text NOT NULL,
	"user_id" text NOT NULL,
	"details" text NOT NULL,
	"abha" text NOT NULL,
	"abha_source" text NOT NULL,
	"otp_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "consent_events_patient" ON "consent_events" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "registered_workspace_abha" ON "registered_patients" USING btree ("workspace","abha");--> statement-breakpoint
CREATE INDEX "registration_drafts_ws" ON "registration_drafts" USING btree ("workspace");