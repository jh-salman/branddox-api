-- AlterTable
ALTER TABLE "Portfolio" ADD COLUMN "youtubeVideoId" TEXT;

CREATE UNIQUE INDEX "Portfolio_youtubeVideoId_key" ON "Portfolio"("youtubeVideoId");
