ALTER TABLE "onboarding" ALTER COLUMN "json" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "last_error" jsonb;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "prompt_version" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "index_sha" text;