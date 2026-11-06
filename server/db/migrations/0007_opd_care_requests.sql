CREATE TABLE "edit_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace" text NOT NULL,
	"patient_id" text NOT NULL,
	"subject" text NOT NULL,
	"subject_ref" text,
	"proposed" text NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" text,
	"decision_note" text,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "education_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace" text NOT NULL,
	"patient_id" text NOT NULL,
	"topic" text NOT NULL,
	"by_label" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateway_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace" text NOT NULL,
	"request_id" text NOT NULL,
	"from_party" text NOT NULL,
	"to_party" text NOT NULL,
	"path" text NOT NULL,
	"status" text NOT NULL,
	"summary" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opd_settings" (
	"workspace" text NOT NULL,
	"hfr_id" text NOT NULL,
	"minutes_per_patient" integer NOT NULL,
	"by_label" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opd_settings_workspace_hfr_id_pk" PRIMARY KEY("workspace","hfr_id")
);
--> statement-breakpoint
CREATE TABLE "opd_visits" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace" text NOT NULL,
	"hfr_id" text NOT NULL,
	"day" text NOT NULL,
	"token" integer NOT NULL,
	"patient_id" text NOT NULL,
	"name" text NOT NULL,
	"abha" text,
	"source" text NOT NULL,
	"priority" text DEFAULT 'routine' NOT NULL,
	"status" text NOT NULL,
	"by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"called_at" timestamp with time zone,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "patient_advice" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace" text NOT NULL,
	"patient_id" text NOT NULL,
	"text" text NOT NULL,
	"by_label" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "edit_requests_patient" ON "edit_requests" USING btree ("workspace","patient_id");--> statement-breakpoint
CREATE INDEX "education_log_patient" ON "education_log" USING btree ("workspace","patient_id");--> statement-breakpoint
CREATE INDEX "gateway_messages_ws" ON "gateway_messages" USING btree ("workspace");--> statement-breakpoint
CREATE INDEX "opd_visits_day" ON "opd_visits" USING btree ("workspace","hfr_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "opd_visits_token" ON "opd_visits" USING btree ("workspace","hfr_id","day","token");--> statement-breakpoint
CREATE INDEX "patient_advice_patient" ON "patient_advice" USING btree ("workspace","patient_id");