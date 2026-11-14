import { retentionCutoff, RetentionService } from "./retention.service";

describe("retention boundary", () => {
  it("uses a strict one-year calendar-day cutoff", () => {
    expect(retentionCutoff(new Date("2026-11-14T12:00:00.000Z"), 365)).toEqual(new Date("2025-11-14T00:00:00.000Z"));
  });

  it("never touches files when marking ownership fails in the database", async () => {
    const prisma = {
      operationalDay: {
        findMany: jest.fn().mockResolvedValue([{ id: "day-id" }]),
        update: jest.fn().mockRejectedValue(new Error("database unavailable")),
      },
    };
    const settings = { getAll: jest.fn().mockResolvedValue({ retention: { retentionDays: 365 } }) };
    const audit = { write: jest.fn().mockResolvedValue({}) };
    const deleteFile = jest.fn();
    const service = new RetentionService(prisma as never, settings as never, audit as never, deleteFile);

    const result = await service.run("admin-id", {});

    expect(result.failed).toBe(1);
    expect(deleteFile).not.toHaveBeenCalled();
  });
});
