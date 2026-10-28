ALTER TABLE "PlayerPriceRankSnapshot"
 ADD COLUMN status TEXT NOT NULL DEFAULT 'UNRESOLVED',
 ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
 ADD COLUMN "referenceRule" TEXT NOT NULL DEFAULT 'OPEN_DATE_WINDOW',
 ADD COLUMN evidence JSONB,
 ADD COLUMN audit JSONB,
 ADD COLUMN "runId" TEXT,
 ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "verifiedAt" TIMESTAMP(3),
 ADD COLUMN "collectionStartedAt" TIMESTAMP(3),
 ADD COLUMN "collectionCompletedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "PlayerPriceRankSnapshot_runId_key" ON "PlayerPriceRankSnapshot"("runId");
CREATE INDEX "rank_snapshot_window_status" ON "PlayerPriceRankSnapshot"("windowStart",status);
-- Once published, protect the parent and child records even from accidental SQL updates.
CREATE FUNCTION protect_verified_rank() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='PlayerPriceRankSnapshot' THEN
  IF OLD."verificationStatus"='VERIFIED' THEN RAISE EXCEPTION 'VERIFIED_SNAPSHOT_IMMUTABLE'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM "PlayerPriceRankSnapshot" WHERE id=COALESCE(NEW."snapshotId",OLD."snapshotId") AND "verificationStatus"='VERIFIED')
   OR (TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM "PlayerPriceRankSnapshot" WHERE id=OLD."snapshotId" AND "verificationStatus"='VERIFIED'))
  THEN RAISE EXCEPTION 'VERIFIED_SNAPSHOT_IMMUTABLE'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER rank_parent_immutable BEFORE UPDATE OR DELETE ON "PlayerPriceRankSnapshot" FOR EACH ROW EXECUTE FUNCTION protect_verified_rank();
CREATE TRIGGER rank_entry_immutable BEFORE INSERT OR UPDATE OR DELETE ON "PlayerPriceRankEntry" FOR EACH ROW EXECUTE FUNCTION protect_verified_rank();
