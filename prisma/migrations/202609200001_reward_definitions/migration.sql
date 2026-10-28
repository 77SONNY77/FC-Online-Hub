-- CreateEnum
CREATE TYPE "RewardBehavior" AS ENUM ('UNKNOWN', 'FIXED', 'ALL', 'WEIGHTED_RANDOM', 'PLAYER_POOL');

-- CreateEnum
CREATE TYPE "RewardTargetType" AS ENUM ('NESTED_ITEM', 'PRICE_RANK', 'BP_AMOUNT');

-- AlterTable
ALTER TABLE "DatasetVersion" ADD COLUMN     "importHash" TEXT;

-- AlterTable
ALTER TABLE "ItemVersion" ADD COLUMN     "conditionRaw" TEXT,
ADD COLUMN     "rewardBehavior" "RewardBehavior" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "ProductVersion" ADD COLUMN     "evidenceSnapshotId" TEXT,
ADD COLUMN     "fieldVerification" JSONB,
ADD COLUMN     "saleEndsAt" TIMESTAMP(3),
ADD COLUMN     "saleStartsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SourceSnapshot" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "acquisition" TEXT NOT NULL,
    "retrievalNote" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "SourceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardPoolVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "itemVersionId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "behavior" "RewardBehavior" NOT NULL,
    "conditionRaw" TEXT NOT NULL,
    "effectivePeriod" TEXT NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL,
    "denominator" DECIMAL(40,0) NOT NULL,
    "sumNumerator" DECIMAL(40,0) NOT NULL,
    "toleranceNumerator" DECIMAL(40,0) NOT NULL,

    CONSTRAINT "RewardPoolVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProbabilityEntry" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "targetType" "RewardTargetType" NOT NULL,
    "targetItemVersionId" TEXT,
    "rank" INTEGER,
    "bpAmount" DECIMAL(30,0),
    "rewardLabel" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "conditionRaw" TEXT NOT NULL,
    "probabilityRaw" TEXT NOT NULL,
    "numerator" DECIMAL(40,0) NOT NULL,

    CONSTRAINT "ProbabilityEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RewardPoolVersion_itemVersionId_key" ON "RewardPoolVersion"("itemVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProbabilityEntry_poolId_position_key" ON "ProbabilityEntry"("poolId", "position");

-- AddForeignKey
ALTER TABLE "ProductVersion" ADD CONSTRAINT "ProductVersion_evidenceSnapshotId_fkey" FOREIGN KEY ("evidenceSnapshotId") REFERENCES "SourceSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSnapshot" ADD CONSTRAINT "SourceSnapshot_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardPoolVersion" ADD CONSTRAINT "RewardPoolVersion_itemVersionId_fkey" FOREIGN KEY ("itemVersionId") REFERENCES "ItemVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardPoolVersion" ADD CONSTRAINT "RewardPoolVersion_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardPoolVersion" ADD CONSTRAINT "RewardPoolVersion_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SourceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProbabilityEntry" ADD CONSTRAINT "ProbabilityEntry_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "RewardPoolVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProbabilityEntry" ADD CONSTRAINT "ProbabilityEntry_targetItemVersionId_fkey" FOREIGN KEY ("targetItemVersionId") REFERENCES "ItemVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "ProbabilityEntry" ADD CONSTRAINT "valid_probability_entry" CHECK ("quantity" > 0 AND "numerator" >= 0 AND "numerator" <= 100000000000000000000);
ALTER TABLE "ProbabilityEntry" ADD CONSTRAINT "valid_reward_target" CHECK (
  ("targetType" = 'PRICE_RANK' AND "rank" > 0 AND "targetItemVersionId" IS NULL AND "bpAmount" IS NULL) OR
  ("targetType" = 'NESTED_ITEM' AND "targetItemVersionId" IS NOT NULL AND "rank" IS NULL AND "bpAmount" IS NULL) OR
  ("targetType" = 'BP_AMOUNT' AND "bpAmount" > 0 AND "rank" IS NULL AND "targetItemVersionId" IS NULL)
);
ALTER TABLE "RewardPoolVersion" ADD CONSTRAINT "valid_probability_scale" CHECK ("denominator" = 100000000000000000000 AND "sumNumerator" > 0 AND "toleranceNumerator" >= 0);
