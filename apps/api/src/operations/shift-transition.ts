import type { Prisma } from "../generated/prisma/client";

/**
 * Closes one shift instance, opens its successor and carries every still-open Follow
 * forward exactly once. Shared by manual Handover and the automatic day rollover.
 */
export async function transitionShift(tx: Prisma.TransactionClient, currentId: string, nextId: string, now: Date): Promise<number> {
  await tx.shiftInstance.update({
    where: { id: currentId },
    data: { status: "CLOSED", closedAt: now, version: { increment: 1 } },
  });
  await tx.shiftInstance.update({
    where: { id: nextId },
    data: { status: "ACTIVE", openedAt: now, closedAt: null, version: { increment: 1 } },
  });
  const ownOpenFollows = await tx.entry.findMany({
    where: { shiftInstanceId: currentId, type: "FOLLOW", followStatus: "OPEN" },
    select: { id: true },
  });
  const incomingOpenFollows = await tx.followTransfer.findMany({
    where: { toShiftInstanceId: currentId, status: "OPEN", sourceEntry: { followStatus: "OPEN" } },
    select: { sourceEntryId: true },
  });
  const openFollowIds = [...new Set([
    ...ownOpenFollows.map((entry) => entry.id),
    ...incomingOpenFollows.map((transfer) => transfer.sourceEntryId),
  ])];
  if (openFollowIds.length) {
    await tx.followTransfer.createMany({
      data: openFollowIds.map((sourceEntryId) => ({ sourceEntryId, fromShiftInstanceId: currentId, toShiftInstanceId: nextId })),
      skipDuplicates: true,
    });
  }
  return openFollowIds.length;
}

function containsSerializationConflict(value: unknown, seen = new Set<unknown>()): boolean {
  if (value === "40001" || value === "TransactionWriteConflict") return true;
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value as Record<string, unknown>).some((item) => containsSerializationConflict(item, seen));
}

export function isRetryableSerializationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const known = error as { code?: unknown; meta?: unknown };
  return known.code === "P2034" || (known.code === "P2010" && containsSerializationConflict(known.meta));
}
