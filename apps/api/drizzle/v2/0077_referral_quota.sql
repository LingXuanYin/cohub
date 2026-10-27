ALTER TABLE "v2"."referrals" ADD COLUMN "quota_cycle" integer;--> statement-breakpoint
ALTER TABLE "v2"."referrals" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "v2_idx_referrals_pending_expiry" ON "v2"."referrals" USING btree ("expires_at") WHERE "v2"."referrals"."status" = 'pending';