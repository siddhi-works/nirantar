CREATE TABLE "profile_photos" (
	"workspace" text NOT NULL,
	"user_id" text NOT NULL,
	"data" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_photos_workspace_user_id_pk" PRIMARY KEY("workspace","user_id")
);
