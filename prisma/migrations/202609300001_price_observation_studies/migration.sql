CREATE TABLE "PriceObservationStudy" (
 "id" TEXT PRIMARY KEY, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "plan" JSONB NOT NULL, "cohort" JSONB NOT NULL, "maxCycles" INTEGER NOT NULL DEFAULT 4,
 "intervalHours" INTEGER NOT NULL DEFAULT 2, "nextEligibleAt" TIMESTAMP(3) NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE "PriceObservationCycle" (
 "id" TEXT PRIMARY KEY, "studyId" TEXT NOT NULL REFERENCES "PriceObservationStudy"("id"),
 "runId" TEXT NOT NULL UNIQUE, "startedAt" TIMESTAMP(3) NOT NULL,
 "completedAt" TIMESTAMP(3), "prices" JSONB, "metrics" JSONB
);
CREATE INDEX "PriceObservationCycle_studyId_startedAt_idx" ON "PriceObservationCycle"("studyId","startedAt");
