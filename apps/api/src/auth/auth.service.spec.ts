import * as argon2 from "argon2";
import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";

const now = new Date("2026-11-14T12:00:00.000Z");

function repository(user: Record<string, unknown> | null) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn(),
    },
    session: {
      create: jest.fn(async ({ data }) => ({ id: "session-id", ...data })),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (operations) => Promise.all(operations)),
  };
}

describe("AuthService", () => {
  it("verifies Argon2id, rotates sessions, and persists only digests", async () => {
    const passwordHash = await argon2.hash("CorrectHorse!2026", { type: argon2.argon2id });
    const prisma = repository({
      id: "user-id", username: "aisha", displayName: "Aisha", passwordHash,
      role: "ADMIN", status: "ACTIVE", mustChangePassword: false,
    });
    const service = new AuthService(prisma as never, () => now);

    const result = await service.login("Aisha", "CorrectHorse!2026");

    expect(prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-id", revokedAt: null },
    }));
    const data = prisma.session.create.mock.calls[0]![0].data;
    expect(data.tokenDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(data.csrfDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(data)).not.toContain(result.sessionToken);
    expect(JSON.stringify(data)).not.toContain(result.csrfToken);
    expect(data.expiresAt.toISOString()).toBe("2026-11-14T12:30:00.000Z");
  });

  it("uses one generic error for unknown, wrong-password, and disabled users", async () => {
    const cases = [
      repository(null),
      repository({ id: "u", passwordHash: await argon2.hash("Different!2026"), status: "ACTIVE" }),
      repository({ id: "u", passwordHash: await argon2.hash("CorrectHorse!2026"), status: "DISABLED" }),
    ];
    for (const prisma of cases) {
      const service = new AuthService(prisma as never, () => now);
      await expect(service.login("someone", "CorrectHorse!2026")).rejects.toEqual(
        new UnauthorizedException("Invalid username or password"),
      );
    }
  });

  it("revokes an expired session without extending it", async () => {
    const prisma = repository(null);
    prisma.session.findUnique.mockResolvedValue({
      id: "session-id", tokenDigest: "a".repeat(64), csrfDigest: "b".repeat(64),
      lastActivityAt: new Date("2026-11-14T11:29:59.999Z"),
      expiresAt: new Date("2026-11-14T12:00:00.000Z"), revokedAt: null,
      user: { id: "u", displayName: "A", role: "OPERATOR", status: "ACTIVE", mustChangePassword: false },
    });
    const service = new AuthService(prisma as never, () => now);

    await expect(service.authenticate("raw-token")).rejects.toThrow(UnauthorizedException);
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: "session-id" }, data: { revokedAt: now },
    });
    expect(prisma.session.update).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ expiresAt: expect.any(Date) }),
    }));
  });

  it("slides an active session and validates its CSRF digest", async () => {
    const prisma = repository(null);
    const { createHash } = await import("node:crypto");
    prisma.session.findUnique.mockResolvedValue({
      id: "session-id", tokenDigest: "a".repeat(64),
      csrfDigest: createHash("sha256").update("csrf-value").digest("hex"),
      lastActivityAt: new Date("2026-11-14T11:59:00.000Z"),
      expiresAt: new Date("2026-11-14T12:29:00.000Z"), revokedAt: null,
      user: { id: "u", displayName: "A", role: "OPERATOR", status: "ACTIVE", mustChangePassword: false },
    });
    const service = new AuthService(prisma as never, () => now);

    const session = await service.authenticate("raw-token");
    expect(session.expiresAt.toISOString()).toBe("2026-11-14T12:30:00.000Z");
    expect(prisma.session.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { lastActivityAt: now, expiresAt: new Date("2026-11-14T12:30:00.000Z") },
    }));
    expect(service.verifyCsrf(session, "csrf-value")).toBe(true);
    expect(service.verifyCsrf(session, "wrong")).toBe(false);
  });
});
