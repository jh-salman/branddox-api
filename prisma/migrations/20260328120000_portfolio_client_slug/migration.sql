-- AlterTable: Client.slug (backfill then NOT NULL)
ALTER TABLE "Client" ADD COLUMN "slug" TEXT;

UPDATE "Client" SET "slug" = 'ch' || replace(id, '-', '');

ALTER TABLE "Client" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Client_slug_key" ON "Client"("slug");

-- AlterTable: Portfolio.clientId
ALTER TABLE "Portfolio" ADD COLUMN "clientId" TEXT;

ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Portfolio_clientId_idx" ON "Portfolio"("clientId");
