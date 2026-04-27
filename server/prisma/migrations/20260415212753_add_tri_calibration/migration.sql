-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "band" TEXT,
ADD COLUMN     "finalizedAt" TIMESTAMP(3),
ADD COLUMN     "theta" DOUBLE PRECISION,
ALTER COLUMN "score" DROP NOT NULL;

-- CreateTable
CREATE TABLE "QuestionCalibration" (
    "id" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "a" DOUBLE PRECISION NOT NULL,
    "b" DOUBLE PRECISION NOT NULL,
    "c" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionCalibration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestionCalibration_difficulty_key" ON "QuestionCalibration"("difficulty");
