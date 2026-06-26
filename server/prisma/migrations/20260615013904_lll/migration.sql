-- AlterTable
ALTER TABLE "User" ADD COLUMN     "currentSessionId" TEXT;

-- CreateTable
CREATE TABLE "UserInfiniteTower" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentBuilding" INTEGER NOT NULL DEFAULT 1,
    "currentFloor" INTEGER NOT NULL DEFAULT 1,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "currentLives" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "UserInfiniteTower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TowerFloor" (
    "id" TEXT NOT NULL,
    "towerId" TEXT NOT NULL,
    "building" INTEGER NOT NULL,
    "floorNumber" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'QUIZ',
    "topic" TEXT,
    "area" TEXT,
    "targetScore" INTEGER NOT NULL,
    "isBoss" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT true,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "highScore" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TowerFloor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserInfiniteTower_userId_key" ON "UserInfiniteTower"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TowerFloor_towerId_building_floorNumber_key" ON "TowerFloor"("towerId", "building", "floorNumber");

-- AddForeignKey
ALTER TABLE "UserInfiniteTower" ADD CONSTRAINT "UserInfiniteTower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TowerFloor" ADD CONSTRAINT "TowerFloor_towerId_fkey" FOREIGN KEY ("towerId") REFERENCES "UserInfiniteTower"("id") ON DELETE CASCADE ON UPDATE CASCADE;
