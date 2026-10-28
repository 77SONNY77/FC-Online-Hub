-- CreateEnum
CREATE TYPE "WalletEntryType" AS ENUM ('CHARGE', 'PURCHASE', 'RESET');

-- CreateTable
CREATE TABLE "PurchasePolicy" (
    "productVersionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxPerReset" INTEGER,

    CONSTRAINT "PurchasePolicy_pkey" PRIMARY KEY ("productVersionId")
);

-- CreateTable
CREATE TABLE "BrowserState" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "epoch" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BrowserState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletBalance" (
    "id" TEXT NOT NULL,
    "browserId" TEXT NOT NULL,
    "dataType" "DataType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'FC',
    "balance" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "WalletBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletEntry" (
    "id" TEXT NOT NULL,
    "browserId" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "dataType" "DataType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'FC',
    "type" "WalletEntryType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "balanceAfter" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "chargeOptionId" TEXT,
    "purchaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FCChargeOption" (
    "id" TEXT NOT NULL,
    "fcAmount" BIGINT NOT NULL,
    "bonusFc" BIGINT NOT NULL DEFAULT 0,
    "displayOrder" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "datasetId" TEXT NOT NULL,

    CONSTRAINT "FCChargeOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "browserId" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "productVersionId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" BIGINT NOT NULL,
    "total" BIGINT NOT NULL,
    "dataType" "DataType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryEntry" (
    "id" TEXT NOT NULL,
    "browserId" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "itemVersionId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemKind" "ItemKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "dataType" "DataType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "browserId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "receipt" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrowserState_tokenHash_key" ON "BrowserState"("tokenHash");

-- CreateIndex
CREATE INDEX "BrowserState_expiresAt_idx" ON "BrowserState"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletBalance_browserId_dataType_currency_key" ON "WalletBalance"("browserId", "dataType", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "WalletEntry_purchaseId_key" ON "WalletEntry"("purchaseId");

-- CreateIndex
CREATE INDEX "WalletEntry_browserId_epoch_createdAt_idx" ON "WalletEntry"("browserId", "epoch", "createdAt");

-- CreateIndex
CREATE INDEX "Purchase_browserId_epoch_productVersionId_idx" ON "Purchase"("browserId", "epoch", "productVersionId");

-- CreateIndex
CREATE INDEX "InventoryEntry_browserId_epoch_idx" ON "InventoryEntry"("browserId", "epoch");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_browserId_createdAt_idx" ON "IdempotencyRecord"("browserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_browserId_key_key" ON "IdempotencyRecord"("browserId", "key");

-- AddForeignKey
ALTER TABLE "PurchasePolicy" ADD CONSTRAINT "PurchasePolicy_productVersionId_fkey" FOREIGN KEY ("productVersionId") REFERENCES "ProductVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletBalance" ADD CONSTRAINT "WalletBalance_browserId_fkey" FOREIGN KEY ("browserId") REFERENCES "BrowserState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_browserId_fkey" FOREIGN KEY ("browserId") REFERENCES "BrowserState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_chargeOptionId_fkey" FOREIGN KEY ("chargeOptionId") REFERENCES "FCChargeOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FCChargeOption" ADD CONSTRAINT "FCChargeOption_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_browserId_fkey" FOREIGN KEY ("browserId") REFERENCES "BrowserState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_productVersionId_fkey" FOREIGN KEY ("productVersionId") REFERENCES "ProductVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryEntry" ADD CONSTRAINT "InventoryEntry_browserId_fkey" FOREIGN KEY ("browserId") REFERENCES "BrowserState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryEntry" ADD CONSTRAINT "InventoryEntry_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryEntry" ADD CONSTRAINT "InventoryEntry_itemVersionId_fkey" FOREIGN KEY ("itemVersionId") REFERENCES "ItemVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_browserId_fkey" FOREIGN KEY ("browserId") REFERENCES "BrowserState"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "WalletBalance" ADD CONSTRAINT "wallet_nonnegative" CHECK ("balance" >= 0 AND "balance" <= 1000000000000);
ALTER TABLE "FCChargeOption" ADD CONSTRAINT "valid_charge_amount" CHECK ("fcAmount" > 0 AND "bonusFc" >= 0 AND "fcAmount" + "bonusFc" <= 1000000000000);
ALTER TABLE "PurchasePolicy" ADD CONSTRAINT "positive_purchase_limit" CHECK ("maxPerReset" IS NULL OR "maxPerReset" > 0);
ALTER TABLE "Purchase" ADD CONSTRAINT "valid_purchase_amounts" CHECK ("quantity" > 0 AND "quantity" <= 100 AND "unitPrice" >= 0 AND "total" = "unitPrice" * "quantity");
ALTER TABLE "InventoryEntry" ADD CONSTRAINT "positive_inventory_quantity" CHECK ("quantity" > 0);
ALTER TABLE "WalletEntry" ADD CONSTRAINT "ledger_balance_nonnegative" CHECK ("balanceAfter" >= 0);
ALTER TABLE "WalletEntry" ADD CONSTRAINT "ledger_direction" CHECK (("type" = 'CHARGE' AND "amount" > 0 AND "chargeOptionId" IS NOT NULL AND "purchaseId" IS NULL) OR ("type" = 'PURCHASE' AND "amount" <= 0 AND "purchaseId" IS NOT NULL AND "chargeOptionId" IS NULL) OR ("type" = 'RESET' AND "amount" <= 0 AND "purchaseId" IS NULL AND "chargeOptionId" IS NULL));
