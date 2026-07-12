-- Make email optional (scraped channels may have no public email)
ALTER TABLE "Lead" ALTER COLUMN "email" DROP NOT NULL;

-- Channel/lead-source enrichment fields
ALTER TABLE "Lead" ADD COLUMN "channelId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "channelName" TEXT;
ALTER TABLE "Lead" ADD COLUMN "subscriberCount" TEXT;
ALTER TABLE "Lead" ADD COLUMN "country" TEXT;
ALTER TABLE "Lead" ADD COLUMN "thumbnailUrl" TEXT;

-- Dedupe scraped channels by YouTube channel id
CREATE UNIQUE INDEX "Lead_channelId_key" ON "Lead"("channelId");

-- Common lead filters
CREATE INDEX "Lead_leadSource_idx" ON "Lead"("leadSource");
CREATE INDEX "Lead_status_idx" ON "Lead"("status");
