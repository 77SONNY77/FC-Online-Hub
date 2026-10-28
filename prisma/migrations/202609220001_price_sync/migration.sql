ALTER TABLE "PlayerPriceSnapshot" ADD COLUMN reason TEXT NOT NULL DEFAULT 'LEGACY';
CREATE TABLE "PlayerCurrentState" ("variantId" TEXT PRIMARY KEY REFERENCES "PlayerVariant"(id) ON DELETE CASCADE,price DECIMAL(30,0) NOT NULL,"observedAt" TIMESTAMP(3) NOT NULL,"historyAt" TIMESTAMP(3) NOT NULL,"snapshotId" TEXT NOT NULL,"historyId" TEXT NOT NULL,ovr INTEGER,position TEXT);
CREATE INDEX "PlayerCurrentState_observedAt_idx" ON "PlayerCurrentState"("observedAt");
INSERT INTO "PlayerCurrentState" SELECT DISTINCT ON (p."variantId") p."variantId",p.price,p."observedAt",p."observedAt",p."snapshotId",p.id,p.ovr,p.position FROM "PlayerPriceSnapshot" p JOIN "PriceSourceSnapshot" s ON s.id=p."snapshotId" WHERE p."verificationStatus"<>'REJECTED' AND s.source IN ('OFFICIAL_WEB','OFFICIAL_API') ORDER BY p."variantId",p."observedAt" DESC,p.id ASC;
-- Rebuild only the derived projection; historical data remains untouched.
DROP MATERIALIZED VIEW "PlayerPriceCurrent";
CREATE MATERIALIZED VIEW "PlayerPriceCurrent" AS SELECT c."variantId",c."historyId" AS "observationId",v.spid,v.enhancement,p."seasonId",c.price,c."observedAt",NULL::timestamp AS "referenceAt" FROM "PlayerCurrentState" c JOIN "PlayerVariant" v ON v.id=c."variantId" JOIN "Player" p ON p.spid=v.spid;
CREATE UNIQUE INDEX "current_variant_unique" ON "PlayerPriceCurrent" ("variantId");
CREATE INDEX "current_enhancement_price" ON "PlayerPriceCurrent" (enhancement,price DESC,"variantId");
CREATE INDEX "current_class_enhancement_price" ON "PlayerPriceCurrent" ("seasonId",enhancement,price DESC,"variantId");
CREATE TABLE "PriceSyncState" (id TEXT PRIMARY KEY,"leaseToken" TEXT,"leaseExpiresAt" TIMESTAMP(3),"nextEligibleAt" TIMESTAMP(3),"pausedUntil" TIMESTAMP(3),"pauseReason" TEXT);
CREATE TABLE "PriceSyncJob" (id TEXT PRIMARY KEY,type TEXT NOT NULL,"runId" TEXT,status TEXT NOT NULL,"startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"finishedAt" TIMESTAMP(3),"nextEligibleAt" TIMESTAMP(3),metrics JSONB);
CREATE INDEX "PriceSyncJob_startedAt_idx" ON "PriceSyncJob"("startedAt");
