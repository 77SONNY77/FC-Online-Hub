-- CreateEnum
CREATE TYPE "PriceCollectionStatus" AS ENUM ('PLANNED', 'RUNNING', 'PAUSED', 'COMPLETE', 'PARTIAL', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PriceSegmentStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'SPLIT', 'FAILED', 'BLOCKED');

-- AlterTable
ALTER TABLE "PlayerPriceRankSnapshot" ADD COLUMN     "observedWindowEnd" TIMESTAMP(3),
ADD COLUMN     "observedWindowStart" TIMESTAMP(3),
ADD COLUMN     "pricedCount" INTEGER;

-- CreateTable
CREATE TABLE "PriceCollectionRun" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "targetPoolId" TEXT,
    "plan" JSONB NOT NULL,
    "planHash" TEXT NOT NULL,
    "status" "PriceCollectionStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "PriceCollectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceCollectionSegment" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "parentKey" TEXT,
    "expectedCount" INTEGER,
    "retrievedCount" INTEGER,
    "status" "PriceSegmentStatus" NOT NULL DEFAULT 'PENDING',
    "snapshotId" TEXT,
    "responseHash" TEXT,
    "responseHtml" TEXT,
    "observedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "PriceCollectionSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceCollectionRequest" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "statusCode" INTEGER,
    "errorCode" TEXT,

    CONSTRAINT "PriceCollectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceCollectionSegment_snapshotId_key" ON "PriceCollectionSegment"("snapshotId");

-- CreateIndex
CREATE INDEX "PriceCollectionSegment_runId_status_idx" ON "PriceCollectionSegment"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PriceCollectionSegment_runId_key_key" ON "PriceCollectionSegment"("runId", "key");

-- CreateIndex
CREATE INDEX "PriceCollectionRequest_segmentId_idx" ON "PriceCollectionRequest"("segmentId");

-- AddForeignKey
ALTER TABLE "PriceCollectionSegment" ADD CONSTRAINT "PriceCollectionSegment_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PriceCollectionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceCollectionSegment" ADD CONSTRAINT "PriceCollectionSegment_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PriceSourceSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceCollectionRequest" ADD CONSTRAINT "PriceCollectionRequest_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "PriceCollectionSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

