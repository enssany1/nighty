import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Inject, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "../database/prisma.service";
import { UserStatus } from "../generated/prisma/enums";
import type { AuthenticatedSession } from "./auth.types";

export const AUTH_CLOCK = Symbol("AUTH_CLOCK");
export const SESSION_IDLE_MILLISECONDS = 30 * 60 * 1000;
const INVALID_CREDENTIALS = "Invalid username or password";
const DUMMY_PASSWORD = "Nighty timing equalization value";

type Clock = () => Date;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function randomSecret(): string {
  return randomBytes(32).toString("base64url");
}

function constantTimeDigestEquals(expectedHex: string, candidate: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(digest(candidate), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

@Injectable()
export class AuthService {
  private readonly dummyHash = argon2.hash(DUMMY_PASSWORD, { type: argon2.argon2id });

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(AUTH_CLOCK) private readonly clock: Clock = () => new Date(),
  ) {}

  async login(username: string, password: string) {
    const normalizedUsername = username.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { username: normalizedUsername } });
    const candidateHash = user?.passwordHash ?? await this.dummyHash;
    let passwordValid = false;
    try {
      passwordValid = await argon2.verify(candidateHash, password);
    } catch {
      passwordValid = false;
    }
    if (!user || !passwordValid || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const now = this.clock();
    const expiresAt = new Date(now.getTime() + SESSION_IDLE_MILLISECONDS);
    const sessionToken = randomSecret();
    const csrfToken = randomSecret();
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.session.create({
        data: {
          userId: user.id,
          tokenDigest: digest(sessionToken),
          csrfDigest: digest(csrfToken),
          lastActivityAt: now,
          expiresAt,
        },
      }),
    ]);

    return { sessionToken, csrfToken, expiresAt, user };
  }

  async authenticate(sessionToken: string): Promise<AuthenticatedSession> {
    const session = await this.prisma.session.findUnique({
      where: { tokenDigest: digest(sessionToken) },
      include: { user: true },
    });
    const now = this.clock();
    if (!session || session.revokedAt || session.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Authentication required");
    }
    const idleExpired = now.getTime() - session.lastActivityAt.getTime() >= SESSION_IDLE_MILLISECONDS;
    if (idleExpired || now.getTime() >= session.expiresAt.getTime()) {
      await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: now } });
      throw new UnauthorizedException("Authentication required");
    }

    const expiresAt = new Date(now.getTime() + SESSION_IDLE_MILLISECONDS);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastActivityAt: now, expiresAt },
    });
    return {
      sessionId: session.id,
      csrfDigest: session.csrfDigest,
      expiresAt,
      user: {
        id: session.user.id,
        displayName: session.user.displayName,
        role: session.user.role,
        mustChangePassword: session.user.mustChangePassword,
      },
    };
  }

  verifyCsrf(session: AuthenticatedSession, csrfToken: string): boolean {
    return constantTimeDigestEquals(session.csrfDigest, csrfToken);
  }

  async rotateCsrf(sessionId: string): Promise<string> {
    const csrfToken = randomSecret();
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { csrfDigest: digest(csrfToken) },
    });
    return csrfToken;
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: this.clock() },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !await argon2.verify(user.passwordHash, currentPassword)) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    const now = this.clock();
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } }),
      this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
  }
}
