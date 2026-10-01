ALTER TABLE "skill_versions" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;