CREATE TABLE "observation_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"observation_id" text,
	"fact_id" text,
	"value" text NOT NULL,
	"reason" text NOT NULL,
	"by_user_id" text NOT NULL,
	"by_label" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"code" text NOT NULL,
	"value_num" double precision,
	"value_text" text,
	"obs_date" text NOT NULL,
	"origin" text NOT NULL,
	"document_id" text,
	"source_text" text,
	"flagged" text,
	"status" text NOT NULL,
	"group_id" text,
	"by_user_id" text NOT NULL,
	"by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "versions_patient" ON "observation_versions" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "observations_patient" ON "observations" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "observations_document" ON "observations" USING btree ("document_id");