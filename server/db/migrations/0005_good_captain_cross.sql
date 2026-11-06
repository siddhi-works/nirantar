CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "received_records" ADD COLUMN "workspace" text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "workspace" text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "sim_consents" ADD COLUMN "workspace" text DEFAULT 'main' NOT NULL;