ALTER TABLE "PriceCollectionSegment" ADD COLUMN "result" JSONB;
-- History is authoritative. The materialized latest projection contains one row per variant.
CREATE MATERIALIZED VIEW "PlayerPriceCurrent" AS
SELECT DISTINCT ON (p."variantId") p."variantId", p.id AS "observationId", v.spid, v.enhancement,
  pl."seasonId", p.price, p."observedAt", p."referenceAt"
FROM "PlayerPriceSnapshot" p JOIN "PlayerVariant" v ON v.id=p."variantId"
JOIN "Player" pl ON pl.spid=v.spid JOIN "PriceSourceSnapshot" s ON s.id=p."snapshotId"
WHERE p."verificationStatus" <> 'REJECTED' AND s.source IN ('OFFICIAL_API','OFFICIAL_WEB')
ORDER BY p."variantId", p."observedAt" DESC, p.id ASC;
CREATE UNIQUE INDEX "current_variant_unique" ON "PlayerPriceCurrent" ("variantId");
CREATE INDEX "current_enhancement_price" ON "PlayerPriceCurrent" (enhancement, price DESC, "variantId");
CREATE INDEX "current_class_enhancement_price" ON "PlayerPriceCurrent" ("seasonId", enhancement, price DESC, "variantId");
