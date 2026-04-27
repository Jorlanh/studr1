-- AlterTable
ALTER TABLE "User" ADD COLUMN     "trialQuestionsDate" TEXT,
ADD COLUMN     "trialQuestionsUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AffiliateProduct" (
    "id" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "checkoutUrl" TEXT NOT NULL,
    "kiwifyInviteLink" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "discountTypeMonthly" TEXT,
    "discountValueMonthly" DOUBLE PRECISION,
    "discountTypeAnnual" TEXT,
    "discountValueAnnual" DOUBLE PRECISION,
    "discountTypeSimulado" TEXT,
    "discountValueSimulado" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateProduct_productType_key" ON "AffiliateProduct"("productType");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateLink_userId_key" ON "AffiliateLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateLink_slug_key" ON "AffiliateLink"("slug");

-- AddForeignKey
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
