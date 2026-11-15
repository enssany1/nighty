import { ShiftsService } from "./shifts.service";

describe("ShiftsService deletion lifecycle", () => {
  const morning = { id: "morning", name: "Morning", startMinute: 0, endMinute: 720, position: 1, active: true };
  const night = { id: "night", name: "Night", startMinute: 720, endMinute: 0, position: 2, active: true };
  const redundant = { id: "redundant", name: "Redundant", startMinute: 0, endMinute: 720, position: 3, active: true };

  it("permanently deletes an unused shift and compacts order", async () => {
    const transaction = {
      shiftDefinition: { findMany: jest.fn().mockResolvedValue([morning, night, redundant]), count: jest.fn().mockResolvedValue(0), delete: jest.fn().mockResolvedValue(redundant), update: jest.fn().mockResolvedValue({}) },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new ShiftsService({ $transaction: jest.fn(async (callback) => callback(transaction)) } as never);
    await expect(service.delete("admin", "redundant")).resolves.toEqual({ outcome: "DELETED", id: "redundant" });
    expect(transaction.shiftDefinition.delete).toHaveBeenCalledWith({ where: { id: "redundant" } });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "SHIFT_DELETED" }) }));
  });

  it("deactivates a historically referenced shift and removes future assignments", async () => {
    const inactive = { ...redundant, active: false };
    const transaction = {
      shiftDefinition: { findMany: jest.fn().mockResolvedValue([morning, night, redundant]), count: jest.fn().mockResolvedValue(2), update: jest.fn().mockResolvedValue(inactive) },
      shiftAssignment: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) }, auditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new ShiftsService({ $transaction: jest.fn(async (callback) => callback(transaction)) } as never);
    await expect(service.delete("admin", "redundant")).resolves.toEqual({ outcome: "DEACTIVATED", shift: inactive });
    expect(transaction.shiftAssignment.deleteMany).toHaveBeenCalledWith({ where: { shiftDefinitionId: "redundant" } });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "SHIFT_DEACTIVATED" }) }));
  });
});
