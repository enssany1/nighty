-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('UPDATE', 'TODO', 'FOLLOW');

-- CreateEnum
CREATE TYPE "FollowStatus" AS ENUM ('OPEN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AttachmentDisposition" AS ENUM ('INLINE', 'ATTACHMENT');

-- CreateEnum
CREATE TYPE "TagStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "username" VARCHAR(80) NOT NULL,
    "displayName" VARCHAR(160) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenDigest" CHAR(64) NOT NULL,
    "csrfDigest" CHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "lastActivityAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftDefinition" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShiftDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "userId" UUID NOT NULL,
    "shiftDefinitionId" UUID NOT NULL,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("userId","shiftDefinitionId")
);

-- CreateTable
CREATE TABLE "OperationalDay" (
    "id" UUID NOT NULL,
    "operationalDate" DATE NOT NULL,
    "boundaryMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftInstance" (
    "id" UUID NOT NULL,
    "operationalDayId" UUID NOT NULL,
    "definitionId" UUID NOT NULL,
    "nameSnapshot" VARCHAR(80) NOT NULL,
    "startMinuteSnapshot" INTEGER NOT NULL,
    "endMinuteSnapshot" INTEGER NOT NULL,
    "positionSnapshot" INTEGER NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'UPCOMING',
    "openedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShiftInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" UUID NOT NULL,
    "shiftInstanceId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "type" "EntryType" NOT NULL,
    "editorDocument" JSONB NOT NULL,
    "plainText" TEXT NOT NULL,
    "followStatus" "FollowStatus",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TodoItem" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TodoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowTransfer" (
    "id" UUID NOT NULL,
    "sourceEntryId" UUID NOT NULL,
    "fromShiftInstanceId" UUID NOT NULL,
    "toShiftInstanceId" UUID NOT NULL,
    "status" "FollowStatus" NOT NULL DEFAULT 'OPEN',
    "completedById" UUID,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryRevision" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "editorDocument" JSONB NOT NULL,
    "plainText" TEXT NOT NULL,
    "editedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "TagStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryTag" (
    "entryId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "EntryTag_pkey" PRIMARY KEY ("entryId","tagId")
);

-- CreateTable
CREATE TABLE "TagPost" (
    "id" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "editorDocument" JSONB NOT NULL,
    "plainText" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TagPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(160) NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "disposition" "AttachmentDisposition" NOT NULL,
    "entryId" UUID,
    "tagPostId" UUID,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "action" VARCHAR(120) NOT NULL,
    "entityType" VARCHAR(120) NOT NULL,
    "entityId" VARCHAR(160) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" VARCHAR(120) NOT NULL,
    "value" JSONB NOT NULL,
    "updatedByUserId" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenDigest_key" ON "Session"("tokenDigest");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftDefinition_name_key" ON "ShiftDefinition"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftDefinition_position_key" ON "ShiftDefinition"("position");

-- CreateIndex
CREATE INDEX "ShiftAssignment_shiftDefinitionId_idx" ON "ShiftAssignment"("shiftDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalDay_operationalDate_key" ON "OperationalDay"("operationalDate");

-- CreateIndex
CREATE INDEX "ShiftInstance_status_idx" ON "ShiftInstance"("status");

-- CreateIndex
CREATE INDEX "ShiftInstance_definitionId_idx" ON "ShiftInstance"("definitionId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftInstance_operationalDayId_positionSnapshot_key" ON "ShiftInstance"("operationalDayId", "positionSnapshot");

-- CreateIndex
CREATE INDEX "Entry_shiftInstanceId_createdAt_idx" ON "Entry"("shiftInstanceId", "createdAt");

-- CreateIndex
CREATE INDEX "Entry_authorId_idx" ON "Entry"("authorId");

-- CreateIndex
CREATE INDEX "Entry_type_idx" ON "Entry"("type");

-- CreateIndex
CREATE UNIQUE INDEX "TodoItem_entryId_position_key" ON "TodoItem"("entryId", "position");

-- CreateIndex
CREATE INDEX "FollowTransfer_toShiftInstanceId_status_idx" ON "FollowTransfer"("toShiftInstanceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FollowTransfer_sourceEntryId_toShiftInstanceId_key" ON "FollowTransfer"("sourceEntryId", "toShiftInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "EntryRevision_entryId_revisionNumber_key" ON "EntryRevision"("entryId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_position_key" ON "Tag"("position");

-- CreateIndex
CREATE INDEX "EntryTag_tagId_idx" ON "EntryTag"("tagId");

-- CreateIndex
CREATE INDEX "TagPost_tagId_createdAt_idx" ON "TagPost"("tagId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_entryId_idx" ON "Attachment"("entryId");

-- CreateIndex
CREATE INDEX "Attachment_tagPostId_idx" ON "Attachment"("tagPostId");

-- CreateIndex
CREATE INDEX "Attachment_uploadedById_idx" ON "Attachment"("uploadedById");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftDefinitionId_fkey" FOREIGN KEY ("shiftDefinitionId") REFERENCES "ShiftDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftInstance" ADD CONSTRAINT "ShiftInstance_operationalDayId_fkey" FOREIGN KEY ("operationalDayId") REFERENCES "OperationalDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftInstance" ADD CONSTRAINT "ShiftInstance_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ShiftDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_shiftInstanceId_fkey" FOREIGN KEY ("shiftInstanceId") REFERENCES "ShiftInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoItem" ADD CONSTRAINT "TodoItem_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowTransfer" ADD CONSTRAINT "FollowTransfer_sourceEntryId_fkey" FOREIGN KEY ("sourceEntryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowTransfer" ADD CONSTRAINT "FollowTransfer_fromShiftInstanceId_fkey" FOREIGN KEY ("fromShiftInstanceId") REFERENCES "ShiftInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowTransfer" ADD CONSTRAINT "FollowTransfer_toShiftInstanceId_fkey" FOREIGN KEY ("toShiftInstanceId") REFERENCES "ShiftInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowTransfer" ADD CONSTRAINT "FollowTransfer_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryRevision" ADD CONSTRAINT "EntryRevision_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryRevision" ADD CONSTRAINT "EntryRevision_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryTag" ADD CONSTRAINT "EntryTag_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryTag" ADD CONSTRAINT "EntryTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagPost" ADD CONSTRAINT "TagPost_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagPost" ADD CONSTRAINT "TagPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_tagPostId_fkey" FOREIGN KEY ("tagPostId") REFERENCES "TagPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain checks not expressible in the Prisma schema.
ALTER TABLE "User"
  ADD CONSTRAINT "User_username_normalized_check"
  CHECK ("username" = lower("username") AND "username" ~ '^[a-z0-9][a-z0-9._-]{2,79}$');

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_token_digest_check" CHECK ("tokenDigest" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "Session_csrf_digest_check" CHECK ("csrfDigest" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "Session_expiry_check" CHECK ("expiresAt" > "lastActivityAt");

ALTER TABLE "ShiftDefinition"
  ADD CONSTRAINT "ShiftDefinition_start_minute_check" CHECK ("startMinute" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "ShiftDefinition_end_minute_check" CHECK ("endMinute" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "ShiftDefinition_nonzero_duration_check" CHECK ("startMinute" <> "endMinute"),
  ADD CONSTRAINT "ShiftDefinition_position_check" CHECK ("position" > 0);

ALTER TABLE "OperationalDay"
  ADD CONSTRAINT "OperationalDay_boundary_minute_check" CHECK ("boundaryMinute" BETWEEN 0 AND 1439);

ALTER TABLE "ShiftInstance"
  ADD CONSTRAINT "ShiftInstance_start_minute_check" CHECK ("startMinuteSnapshot" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "ShiftInstance_end_minute_check" CHECK ("endMinuteSnapshot" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "ShiftInstance_nonzero_duration_check" CHECK ("startMinuteSnapshot" <> "endMinuteSnapshot"),
  ADD CONSTRAINT "ShiftInstance_position_check" CHECK ("positionSnapshot" > 0),
  ADD CONSTRAINT "ShiftInstance_version_check" CHECK ("version" >= 0),
  ADD CONSTRAINT "ShiftInstance_lifecycle_check" CHECK (
    ("status" = 'UPCOMING' AND "closedAt" IS NULL)
    OR ("status" = 'ACTIVE' AND "openedAt" IS NOT NULL AND "closedAt" IS NULL)
    OR ("status" = 'CLOSED' AND "openedAt" IS NOT NULL AND "closedAt" IS NOT NULL AND "closedAt" >= "openedAt")
  );

CREATE UNIQUE INDEX "ShiftInstance_single_active_key"
  ON "ShiftInstance" (("status"))
  WHERE "status" = 'ACTIVE';

ALTER TABLE "Entry"
  ADD CONSTRAINT "Entry_type_payload_check" CHECK (
    ("type" = 'FOLLOW' AND "followStatus" IS NOT NULL)
    OR ("type" <> 'FOLLOW' AND "followStatus" IS NULL)
  ),
  ADD CONSTRAINT "Entry_plain_text_check" CHECK (length(trim("plainText")) > 0);

ALTER TABLE "TodoItem"
  ADD CONSTRAINT "TodoItem_position_check" CHECK ("position" > 0),
  ADD CONSTRAINT "TodoItem_text_check" CHECK (length(trim("text")) > 0);

ALTER TABLE "FollowTransfer"
  ADD CONSTRAINT "FollowTransfer_distinct_shifts_check" CHECK ("fromShiftInstanceId" <> "toShiftInstanceId"),
  ADD CONSTRAINT "FollowTransfer_completion_check" CHECK (
    ("status" = 'OPEN' AND "completedById" IS NULL AND "completedAt" IS NULL)
    OR ("status" = 'COMPLETED' AND "completedById" IS NOT NULL AND "completedAt" IS NOT NULL)
  );

ALTER TABLE "EntryRevision"
  ADD CONSTRAINT "EntryRevision_number_check" CHECK ("revisionNumber" > 0),
  ADD CONSTRAINT "EntryRevision_plain_text_check" CHECK (length(trim("plainText")) > 0);

ALTER TABLE "Tag"
  ADD CONSTRAINT "Tag_name_check" CHECK ("name" = lower("name") AND "name" ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  ADD CONSTRAINT "Tag_position_check" CHECK ("position" > 0);

ALTER TABLE "TagPost"
  ADD CONSTRAINT "TagPost_plain_text_check" CHECK (length(trim("plainText")) > 0);

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_exactly_one_parent_check"
    CHECK (num_nonnulls("entryId", "tagPostId") = 1),
  ADD CONSTRAINT "Attachment_byte_size_check" CHECK ("byteSize" > 0),
  ADD CONSTRAINT "Attachment_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$');

ALTER TABLE "AppSetting"
  ADD CONSTRAINT "AppSetting_key_check" CHECK (length(trim("key")) > 0);
