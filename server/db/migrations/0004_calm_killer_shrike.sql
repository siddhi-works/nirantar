CREATE TABLE "translations" (
	"key" text PRIMARY KEY NOT NULL,
	"target" text NOT NULL,
	"source" text NOT NULL,
	"translated" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
