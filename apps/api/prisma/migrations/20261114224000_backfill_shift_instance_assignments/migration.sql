INSERT INTO "ShiftInstanceAssignment" ("shiftInstanceId", "userId")
SELECT instance.id, assignment."userId"
FROM "ShiftInstance" AS instance
JOIN "ShiftAssignment" AS assignment
  ON assignment."shiftDefinitionId" = instance."definitionId"
ON CONFLICT ("shiftInstanceId", "userId") DO NOTHING;
