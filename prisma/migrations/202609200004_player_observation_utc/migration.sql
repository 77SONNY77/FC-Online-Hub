-- PlayerDataset.observedAt is the canonical metadata observation instant.
-- Repair the initial bulk insert's session-timezone conversion of timestamptz.
UPDATE "Player" p SET "lastUpdatedAt" = d."observedAt"
FROM "PlayerDataset" d WHERE p."datasetId" = d.id AND p."lastUpdatedAt" IS DISTINCT FROM d."observedAt";
