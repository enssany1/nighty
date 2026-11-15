import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { UsersService, normalizeUsername } from "./users.service";

describe("UsersService invariants", () => {
  it("normalizes usernames once at the owning boundary", () => {
    expect(normalizeUsername("  Night.Operator  ")).toBe("night.operator");
    expect(() => normalizeUsername("not valid!" )).toThrow(BadRequestException);
  });

  it("prevents an administrator from disabling or demoting themselves", async () => {
    const prisma = { $transaction: jest.fn() };
    const service = new UsersService(prisma as never);
    await expect(service.updateUser("admin-id", "admin-id", { status: "DISABLED" as never }))
      .rejects.toThrow(ForbiddenException);
    await expect(service.updateUser("admin-id", "admin-id", { role: "OPERATOR" as never }))
      .rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns only the generated temporary password while persisting a hash", async () => {
    const transaction = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "user-id", username: "operator", displayName: "Operator" }),
        update: jest.fn().mockResolvedValue({}),
      },
      session: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn(async (callback) => callback(transaction)) };
    const service = new UsersService(prisma as never);

    const response = await service.resetPassword("admin-id", "user-id");

    expect(response.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{16}A1!$/);
    const data = transaction.user.update.mock.calls[0][0].data;
    expect(data.passwordHash).not.toBe(response.temporaryPassword);
    expect(data.passwordHash).toMatch(/^\$argon2id\$/);
    expect(data.mustChangePassword).toBe(true);
    expect(JSON.stringify(transaction.auditEvent.create.mock.calls)).not.toContain(response.temporaryPassword);
  });

  it("prevents removal of the last active administrator under a row lock", async () => {
    const transaction = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "last-admin", username: "last", displayName: "Last", role: "ADMIN", status: "ACTIVE",
          mustChangePassword: false, shiftAssignments: [],
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: "last-admin" }]),
    };
    const prisma = { $transaction: jest.fn(async (callback) => callback(transaction)) };
    const service = new UsersService(prisma as never);

    await expect(service.updateUser("other-admin", "last-admin", { status: "DISABLED" as never }))
      .rejects.toThrow(BadRequestException);
  });

  it("permanently deletes an unused user and audits the outcome", async () => {
    const user = { id: "unused", username: "unused", displayName: "Unused", role: "OPERATOR", status: "ACTIVE", mustChangePassword: false, shiftAssignments: [], _count: { instanceAssignments: 0, entries: 0, revisions: 0, tagPosts: 0, attachments: 0, completedFollows: 0, auditEvents: 0, settingsUpdated: 0 } };
    const transaction = { user: { findUnique: jest.fn().mockResolvedValue(user), delete: jest.fn().mockResolvedValue(user) }, auditEvent: { create: jest.fn().mockResolvedValue({}) } };
    const prisma = { $transaction: jest.fn(async (callback) => callback(transaction)) };
    const service = new UsersService(prisma as never);
    await expect(service.deleteUser("admin", "unused")).resolves.toEqual({ outcome: "DELETED", id: "unused" });
    expect(transaction.user.delete).toHaveBeenCalledWith({ where: { id: "unused" } });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "USER_DELETED" }) }));
  });

  it("deactivates a historically referenced user, removes future assignments, and audits the outcome", async () => {
    const user = { id: "historic", username: "historic", displayName: "Historic", role: "OPERATOR", status: "ACTIVE", mustChangePassword: false, shiftAssignments: [{ shiftDefinitionId: "shift" }], _count: { instanceAssignments: 1, entries: 1, revisions: 0, tagPosts: 0, attachments: 0, completedFollows: 0, auditEvents: 1, settingsUpdated: 0 } };
    const updated = { ...user, status: "DISABLED", shiftAssignments: [] };
    const transaction = {
      user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue(updated) },
      shiftAssignment: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) }, session: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }, auditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn(async (callback) => callback(transaction)) };
    const service = new UsersService(prisma as never);
    await expect(service.deleteUser("admin", "historic")).resolves.toMatchObject({ outcome: "DEACTIVATED", user: { id: "historic", status: "DISABLED", shiftIds: [] } });
    expect(transaction.shiftAssignment.deleteMany).toHaveBeenCalledWith({ where: { userId: "historic" } });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "USER_DEACTIVATED" }) }));
  });
});
