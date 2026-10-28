ALTER TABLE "PriceSourceSnapshot" ADD COLUMN "captureKey" TEXT NOT NULL DEFAULT 'GENERAL';
DROP INDEX "PriceSourceSnapshot_sourceUrl_observedAt_key";
CREATE UNIQUE INDEX "PriceSourceSnapshot_sourceUrl_observedAt_captureKey_key" ON "PriceSourceSnapshot"("sourceUrl","observedAt","captureKey");
