CREATE TABLE "access_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"action" text NOT NULL,
	"patient_id" text,
	"outcome" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"n" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"facility_hfr" text NOT NULL,
	"purpose" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_verifications" (
	"patient_id" text NOT NULL,
	"fact_id" text NOT NULL,
	"by_user_id" text NOT NULL,
	"by_label" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fact_verifications_patient_id_fact_id_pk" PRIMARY KEY("patient_id","fact_id")
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" text PRIMARY KEY NOT NULL,
	"abha" text NOT NULL,
	CONSTRAINT "patients_abha_unique" UNIQUE("abha")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"line" text NOT NULL,
	"hpr_id" text,
	"hfr_id" text,
	"abha" text,
	"patient_id" text
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_log_patient" ON "access_log" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "auth_attempts_key_at" ON "auth_attempts" USING btree ("key","at");--> statement-breakpoint
CREATE INDEX "consents_patient" ON "consents" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_hpr_hfr" ON "users" USING btree ("hpr_id","hfr_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_abha" ON "users" USING btree ("abha");