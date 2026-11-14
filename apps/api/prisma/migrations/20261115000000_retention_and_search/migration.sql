CREATE TYPE "RetentionState" AS ENUM ('ACTIVE', 'MARKED', 'FAILED');

ALTER TABLE "OperationalDay"
  ADD COLUMN "retentionState" "RetentionState" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "retentionMarkedAt" TIMESTAMPTZ(3),
  ADD COLUMN "retentionError" TEXT;

CREATE INDEX "OperationalDay_retentionState_operationalDate_idx"
  ON "OperationalDay"("retentionState", "operationalDate");

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Entry_plainText_trgm_idx" ON "Entry" USING GIN ("plainText" gin_trgm_ops);
CREATE INDEX "Entry_createdAt_id_idx" ON "Entry"("createdAt" DESC, "id" DESC);
