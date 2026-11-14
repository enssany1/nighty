import { randomBytes } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { Prisma, type UserRole, type UserStatus } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import type { CreateUserRequestDto, UpdateUserRequestDto } from "../common/dto/contracts";

export function normalizeUsername(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(normalized)) {
    throw new BadRequestException("Username must use 3-80 letters, numbers, dots, underscores, or hyphens");
  }
  return normalized;
}

function temporaryPassword(): string {
  return `${randomBytes(12).toString("base64url")}A1!`;
}

const userInclude = { shiftAssignments: true } as const;
type UserWithAssignments = Prisma.UserGetPayload<{ include: typeof userInclude }>;

function publicUser(user: UserWithAssignments) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    shiftIds: user.shiftAssignments.map((assignment) => assignment.shiftDefinitionId),
    mustChangePassword: user.mustChangePassword,
  };
}

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listTeam() {
    return this.prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    });
  }

  async list() {
    const users = await this.prisma.user.findMany({ include: userInclude, orderBy: [{ status: "asc" }, { displayName: "asc" }] });
    return users.map(publicUser);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: userInclude });
    if (!user) throw new NotFoundException("User not found");
    return publicUser(user);
  }

  async createUser(actorUserId: string, input: CreateUserRequestDto) {
    const username = normalizeUsername(input.username);
    const password = temporaryPassword();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            username,
            displayName: input.displayName.trim(),
            role: input.role as UserRole,
            passwordHash,
            mustChangePassword: true,
            shiftAssignments: { create: [...new Set(input.shiftIds)].map((shiftDefinitionId) => ({ shiftDefinitionId })) },
          },
          include: userInclude,
        });
        const safe = publicUser(created);
        await tx.auditEvent.create({ data: { actorUserId, action: "USER_CREATED", entityType: "User", entityId: created.id, after: safe } });
        return safe;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return { user, temporaryPassword: password };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Username already exists");
      }
      throw error;
    }
  }

  async updateUser(actorUserId: string, targetUserId: string, input: UpdateUserRequestDto) {
    if (actorUserId === targetUserId && (input.status === "DISABLED" || input.role === "OPERATOR")) {
      throw new ForbiddenException("You cannot disable or demote your own administrator account");
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id: targetUserId }, include: userInclude });
      if (!current) throw new NotFoundException("User not found");
      const removesActiveAdmin = current.role === "ADMIN" && current.status === "ACTIVE" &&
        (input.role === "OPERATOR" || input.status === "DISABLED");
      if (removesActiveAdmin) {
        const activeAdmins = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "User" WHERE role = 'ADMIN' AND status = 'ACTIVE' FOR UPDATE
        `;
        if (activeAdmins.length <= 1) throw new BadRequestException("At least one active administrator is required");
      }
      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: {
          ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
          ...(input.role !== undefined ? { role: input.role as UserRole } : {}),
          ...(input.status !== undefined ? { status: input.status as UserStatus } : {}),
          ...(input.shiftIds !== undefined ? {
            shiftAssignments: {
              deleteMany: {},
              create: [...new Set(input.shiftIds)].map((shiftDefinitionId) => ({ shiftDefinitionId })),
            },
          } : {}),
        },
        include: userInclude,
      });
      const before = publicUser(current);
      const after = publicUser(updated);
      await tx.auditEvent.create({ data: { actorUserId, action: "USER_UPDATED", entityType: "User", entityId: updated.id, before, after } });
      return after;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateProfile(userId: string, displayName: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId }, data: { displayName: displayName.trim() }, include: userInclude,
    });
    await this.prisma.auditEvent.create({
      data: { actorUserId: userId, action: "PROFILE_UPDATED", entityType: "User", entityId: userId, after: publicUser(updated) },
    });
    return publicUser(updated);
  }

  async resetPassword(actorUserId: string, targetUserId: string) {
    const password = temporaryPassword();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: targetUserId } });
      if (!user) throw new NotFoundException("User not found");
      await tx.user.update({ where: { id: targetUserId }, data: { passwordHash, mustChangePassword: true } });
      await tx.session.updateMany({ where: { userId: targetUserId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditEvent.create({
        data: { actorUserId, action: "USER_PASSWORD_RESET", entityType: "User", entityId: targetUserId, after: { mustChangePassword: true } },
      });
    });
    return { temporaryPassword: password };
  }
}
