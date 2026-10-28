ALTER TABLE "PriceCollectionSegment" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
-- Preserve known historical request usage across policy rollout (old robots requests were not durably logged).
INSERT INTO "PriceCollectorState" (id) VALUES ('FC_ONLINE_DATA_CENTER') ON CONFLICT DO NOTHING;
INSERT INTO "PriceCollectorExecution" (id,"runId",reason,"startedAt","finishedAt","stopReason")
SELECT 'legacy-'||id,id,CASE WHEN mode='FULL' THEN 'FULL_BUILD' ELSE 'MANUAL' END,COALESCE("startedAt","createdAt"),COALESCE("finishedAt","createdAt"),'LEGACY_AUDIT_BACKFILL' FROM "PriceCollectionRun";
INSERT INTO "PriceCollectorRequest" (id,"sourceId","executionId","requestedAt","finishedAt",url,"statusCode","errorCode")
SELECT 'legacy-'||r.id,'FC_ONLINE_DATA_CENTER','legacy-'||s."runId",r."startedAt",r."finishedAt",'https://fconline.nexon.com/datacenter/PlayerList',r."statusCode",r."errorCode" FROM "PriceCollectionRequest" r JOIN "PriceCollectionSegment" s ON s.id=r."segmentId";
