CREATE TABLE "ShiftInstanceAssignment" (
    "shiftInstanceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    CONSTRAINT "ShiftInstanceAssignment_pkey" PRIMARY KEY ("shiftInstanceId", "userId")
);

CREATE INDEX "ShiftInstanceAssignment_userId_idx" ON "ShiftInstanceAssignment"("userId");

ALTER TABLE "ShiftInstanceAssignment"
  ADD CONSTRAINT "ShiftInstanceAssignment_shiftInstanceId_fkey"
  FOREIGN KEY ("shiftInstanceId") REFERENCES "ShiftInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShiftInstanceAssignment"
  ADD CONSTRAINT "ShiftInstanceAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
