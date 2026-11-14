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
});
