CREATE TABLE "complaints" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"contact" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "complaints_user" ON "complaints" USING btree ("workspace","user_id");