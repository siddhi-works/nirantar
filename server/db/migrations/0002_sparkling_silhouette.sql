CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"doc_type" text NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"origin" text NOT NULL,
	"status" text NOT NULL,
	"method" text,
	"pages" integer,
	"error" text,
	"by_user_id" text NOT NULL,
	"by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"sync_status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_blobs" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "page" integer;--> statement-breakpoint
CREATE INDEX "documents_patient" ON "documents" USING btree ("patient_id");