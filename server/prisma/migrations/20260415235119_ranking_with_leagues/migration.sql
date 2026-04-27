-- AlterTable
ALTER TABLE "User" ADD COLUMN     "currentLeague" TEXT NOT NULL DEFAULT 'BRONZE';

-- CreateTable
CREATE TABLE "RankingSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "league" TEXT NOT NULL,
    "weeklyXp" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "RankingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RankingSnapshot_weekStart_league_idx" ON "RankingSnapshot"("weekStart", "league");

-- CreateIndex
CREATE UNIQUE INDEX "RankingSnapshot_userId_weekStart_key" ON "RankingSnapshot"("userId", "weekStart");

-- AddForeignKey
ALTER TABLE "RankingSnapshot" ADD CONSTRAINT "RankingSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
