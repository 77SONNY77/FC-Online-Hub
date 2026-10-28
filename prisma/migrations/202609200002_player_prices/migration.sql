-- CreateEnum
CREATE TYPE "ResolutionStatus" AS ENUM ('RESOLVED', 'PARTIALLY_RESOLVED', 'UNRESOLVED', 'NEEDS_VERIFICATION');

-- CreateTable
CREATE TABLE "PlayerDataset" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "playersRaw" TEXT NOT NULL,
    "seasonsRaw" TEXT NOT NULL,

    CONSTRAINT "PlayerDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "spid" TEXT NOT NULL,
    "pid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("spid")
);

-- CreateTable
CREATE TABLE "PlayerVariant" (
    "id" TEXT NOT NULL,
    "spid" TEXT NOT NULL,
    "enhancement" INTEGER NOT NULL,

    CONSTRAINT "PlayerVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSourceSnapshot" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "source" "SourceKind" NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "notes" TEXT NOT NULL,

    CONSTRAINT "PriceSourceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerPriceSnapshot" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "price" DECIMAL(30,0) NOT NULL,
    "referenceAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3) NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL,
    "ovr" INTEGER,
    "position" TEXT,

    CONSTRAINT "PlayerPriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerPriceRankSnapshot" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "referenceDate" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "conditionHash" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "complete" BOOLEAN NOT NULL DEFAULT false,
    "candidateCount" INTEGER NOT NULL,
    "tiePolicy" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "datasetVersion" TEXT NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL,
    "resolutionStatus" "ResolutionStatus" NOT NULL DEFAULT 'UNRESOLVED',

    CONSTRAINT "PlayerPriceRankSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerPriceRankEntry" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "variantId" TEXT NOT NULL,
    "priceSnapshotId" TEXT NOT NULL,
    "available" BOOLEAN,

    CONSTRAINT "PlayerPriceRankEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerDataset_contentHash_key" ON "PlayerDataset"("contentHash");

-- CreateIndex
CREATE INDEX "Player_name_spid_idx" ON "Player"("name", "spid");

-- CreateIndex
CREATE INDEX "Player_seasonId_spid_idx" ON "Player"("seasonId", "spid");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerVariant_spid_enhancement_key" ON "PlayerVariant"("spid", "enhancement");

-- CreateIndex
CREATE UNIQUE INDEX "PriceSourceSnapshot_sourceUrl_observedAt_key" ON "PriceSourceSnapshot"("sourceUrl", "observedAt");

-- CreateIndex
CREATE INDEX "PlayerPriceSnapshot_variantId_observedAt_idx" ON "PlayerPriceSnapshot"("variantId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerPriceSnapshot_variantId_snapshotId_key" ON "PlayerPriceSnapshot"("variantId", "snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerPriceRankSnapshot_poolId_referenceDate_conditionHash__key" ON "PlayerPriceRankSnapshot"("poolId", "referenceDate", "conditionHash", "datasetVersion");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerPriceRankEntry_snapshotId_rank_key" ON "PlayerPriceRankEntry"("snapshotId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerPriceRankEntry_snapshotId_variantId_key" ON "PlayerPriceRankEntry"("snapshotId", "variantId");

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "PlayerDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "PlayerDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerVariant" ADD CONSTRAINT "PlayerVariant_spid_fkey" FOREIGN KEY ("spid") REFERENCES "Player"("spid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPriceSnapshot" ADD CONSTRAINT "PlayerPriceSnapshot_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "PlayerVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPriceSnapshot" ADD CONSTRAINT "PlayerPriceSnapshot_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PriceSourceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPriceRankSnapshot" ADD CONSTRAINT "PlayerPriceRankSnapshot_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "RewardPoolVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPriceRankEntry" ADD CONSTRAINT "PlayerPriceRankEntry_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PlayerPriceRankSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPriceRankEntry" ADD CONSTRAINT "PlayerPriceRankEntry_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "PlayerVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPriceRankEntry" ADD CONSTRAINT "PlayerPriceRankEntry_priceSnapshotId_fkey" FOREIGN KEY ("priceSnapshotId") REFERENCES "PlayerPriceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

