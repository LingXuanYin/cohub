CREATE TABLE "v2"."space_invitation_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invitation_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"previous_role" varchar(20),
	"role" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "v2"."space_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"token" varchar(64) NOT NULL,
	"role" varchar(20) NOT NULL,
	"max_uses" integer DEFAULT 0 NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" varchar(255),
	"created_by" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "v2_chk_space_invitations_role" CHECK ("v2"."space_invitations"."role" in ('host', 'builder', 'guest')),
	CONSTRAINT "v2_chk_space_invitations_uses" CHECK ("v2"."space_invitations"."max_uses" >= 0 and "v2"."space_invitations"."use_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "v2"."access_policies" ADD COLUMN "guest_app_id" uuid;--> statement-breakpoint
CREATE INDEX "v2_idx_space_invitation_redemptions_invitation" ON "v2"."space_invitation_redemptions" USING btree ("invitation_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "v2_idx_space_invitation_redemptions_space_user" ON "v2"."space_invitation_redemptions" USING btree ("space_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "v2_uq_space_invitations_token" ON "v2"."space_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "v2_idx_space_invitations_space_created" ON "v2"."space_invitations" USING btree ("space_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);