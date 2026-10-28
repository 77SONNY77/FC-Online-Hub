ALTER TABLE "Player" ADD CONSTRAINT "player_spid_format" CHECK ("spid" ~ '^[1-9][0-9]{8}$' AND "pid" = substring("spid" from 4) AND "seasonId" = substring("spid" from 1 for 3)::integer);
ALTER TABLE "PlayerVariant" ADD CONSTRAINT "player_enhancement_range" CHECK ("enhancement" BETWEEN 1 AND 13);
ALTER TABLE "PlayerPriceSnapshot" ADD CONSTRAINT "player_price_positive" CHECK ("price" > 0);
ALTER TABLE "PlayerPriceSnapshot" ADD CONSTRAINT "player_price_time_order" CHECK ("referenceAt" IS NULL OR "referenceAt" <= "observedAt");
ALTER TABLE "PlayerPriceSnapshot" ADD CONSTRAINT "player_ovr_range" CHECK ("ovr" IS NULL OR "ovr" BETWEEN 1 AND 250);
ALTER TABLE "PlayerPriceRankSnapshot" ADD CONSTRAINT "rank_window_order" CHECK ("windowStart" < "windowEnd" AND "candidateCount" > 0);
ALTER TABLE "PlayerPriceRankEntry" ADD CONSTRAINT "rank_positive" CHECK ("rank" > 0);
