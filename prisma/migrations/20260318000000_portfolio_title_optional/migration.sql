-- AlterTable: make Portfolio.title optional (portfolio is image-only, no title required)
ALTER TABLE "Portfolio" ALTER COLUMN "title" DROP NOT NULL;
