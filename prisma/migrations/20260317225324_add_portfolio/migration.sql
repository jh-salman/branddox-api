-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "aspectClass" TEXT NOT NULL DEFAULT 'square',
    "width" INTEGER,
    "height" INTEGER,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);
