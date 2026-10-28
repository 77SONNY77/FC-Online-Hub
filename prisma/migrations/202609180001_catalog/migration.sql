-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('OFFICIAL_API', 'OFFICIAL_WEB', 'REFERENCE', 'MOCK');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'NEEDS_VERIFICATION', 'REJECTED');

-- CreateEnum
CREATE TYPE "DataType" AS ENUM ('OFFICIAL', 'REFERENCE', 'MOCK');

-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('PLAYER_PACK', 'BOX', 'BP_CARD', 'EVENT_ITEM');

-- CreateEnum
CREATE TYPE "CompositionStatus" AS ENUM ('DOCUMENTED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "url" TEXT,
    "notes" TEXT NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sourceId" TEXT NOT NULL,
    "dataType" "DataType" NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "DatasetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVersion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "datasetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imagePath" TEXT,
    "price" DECIMAL(30,0),
    "currency" TEXT,
    "salePeriod" TEXT,
    "purchaseLimit" TEXT,
    "compositionStatus" "CompositionStatus" NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemVersion" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "datasetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ItemKind" NOT NULL,
    "description" TEXT NOT NULL,
    "compositionStatus" "CompositionStatus" NOT NULL,

    CONSTRAINT "ItemVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductComponent" (
    "id" TEXT NOT NULL,
    "productVersionId" TEXT NOT NULL,
    "itemVersionId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ProductComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemComponent" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ItemComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DatasetVersion_sourceId_version_key" ON "DatasetVersion"("sourceId", "version");

-- CreateIndex
CREATE INDEX "ProductVersion_datasetId_published_idx" ON "ProductVersion"("datasetId", "published");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVersion_productId_version_key" ON "ProductVersion"("productId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ItemVersion_itemId_version_key" ON "ItemVersion"("itemId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProductComponent_productVersionId_position_key" ON "ProductComponent"("productVersionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ItemComponent_parentId_position_key" ON "ItemComponent"("parentId", "position");

-- AddForeignKey
ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVersion" ADD CONSTRAINT "ProductVersion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVersion" ADD CONSTRAINT "ProductVersion_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVersion" ADD CONSTRAINT "ItemVersion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVersion" ADD CONSTRAINT "ItemVersion_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_productVersionId_fkey" FOREIGN KEY ("productVersionId") REFERENCES "ProductVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_itemVersionId_fkey" FOREIGN KEY ("itemVersionId") REFERENCES "ItemVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemComponent" ADD CONSTRAINT "ItemComponent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ItemVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemComponent" ADD CONSTRAINT "ItemComponent_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ItemVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Domain invariants also enforced for writes made outside the application.
ALTER TABLE "ProductComponent" ADD CONSTRAINT "product_component_positive_quantity" CHECK ("quantity" > 0 AND "quantity" <= 100000);
ALTER TABLE "ItemComponent" ADD CONSTRAINT "item_component_positive_quantity" CHECK ("quantity" > 0 AND "quantity" <= 100000);
ALTER TABLE "ItemComponent" ADD CONSTRAINT "item_component_not_self" CHECK ("parentId" <> "childId");
ALTER TABLE "ProductVersion" ADD CONSTRAINT "product_price_currency_pair" CHECK (("price" IS NULL AND "currency" IS NULL) OR ("price" >= 0 AND "currency" IS NOT NULL));
ALTER TABLE "ProductVersion" ADD CONSTRAINT "product_version_positive" CHECK ("version" > 0);
ALTER TABLE "ItemVersion" ADD CONSTRAINT "item_version_positive" CHECK ("version" > 0);
ALTER TABLE "DatasetVersion" ADD CONSTRAINT "dataset_verification_consistent" CHECK (("verificationStatus" = 'VERIFIED' AND "verifiedAt" IS NOT NULL AND "dataType" = 'OFFICIAL') OR ("verificationStatus" <> 'VERIFIED' AND "verifiedAt" IS NULL));
