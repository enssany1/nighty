import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";

export interface AuditMetadata {
  requestId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditWrite {
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: AuditMetadata;
}

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  write(owner: Pick<Prisma.TransactionClient, "auditEvent">, input: AuditWrite) {
    return owner.auditEvent.create({ data: {
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ...(input.before !== undefined ? { before: input.before } : {}),
      ...(input.after !== undefined ? { after: input.after } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
    } });
  }

  async list(query: { actorUserId?: string; action?: string; area?: string; from?: string; to?: string; take?: string }) {
    const take = query.take === undefined ? 50 : Number(query.take);
    if (!Number.isInteger(take) || take < 1 || take > 100) throw new BadRequestException("take must be from 1 to 100");
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && Number.isNaN(from.getTime()) || to && Number.isNaN(to.getTime())) throw new BadRequestException("Invalid audit date filter");
    const items = await this.prisma.auditEvent.findMany({
      where: {
        ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.area ? { entityType: query.area } : {}),
        ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      include: { actor: { select: { id: true, displayName: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    });
    return { items };
  }
}
