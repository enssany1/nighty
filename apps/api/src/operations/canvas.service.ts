import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { UserRole } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";

const canvasInclude = {
  shiftInstances: {
    orderBy: { positionSnapshot: "asc" as const },
    include: {
      assignmentSnapshots: true,
      entries: {
        orderBy: { createdAt: "asc" as const },
        include: {
          todoItems: { orderBy: { position: "asc" as const } },
          attachments: { orderBy: { createdAt: "asc" as const } },
          author: { select: { id: true, displayName: true } },
        },
      },
      incomingTransfers: {
        where: { status: "OPEN" as const },
        include: {
          sourceEntry: {
            include: {
              todoItems: { orderBy: { position: "asc" as const } },
              attachments: { orderBy: { createdAt: "asc" as const } },
              author: { select: { id: true, displayName: true } },
            },
          },
        },
      },
    },
  },
} as const;

@Injectable()
export class CanvasService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get(dateText: string, userId: string, role: UserRole) {
    const operationalDate = new Date(`${dateText}T00:00:00.000Z`);
    const day = await this.prisma.operationalDay.findUnique({ where: { operationalDate }, include: canvasInclude });
    if (!day) throw new NotFoundException("Operational day not found");
    return {
      operationalDayId: day.id,
      operationalDate: day.operationalDate.toISOString().slice(0, 10),
      shifts: day.shiftInstances.map((shift) => ({
        id: shift.id,
        definitionId: shift.definitionId,
        name: shift.nameSnapshot,
        startMinute: shift.startMinuteSnapshot,
        endMinute: shift.endMinuteSnapshot,
        position: shift.positionSnapshot,
        status: shift.status,
        writable: shift.status === "ACTIVE" && (role === "ADMIN" || shift.assignmentSnapshots.some((assignment) => assignment.userId === userId)),
        entries: shift.entries.map((entry) => ({
          ...entry,
          attachments: entry.attachments.map((attachment) => ({
            id: attachment.id,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            byteSize: Number(attachment.byteSize),
            disposition: attachment.disposition,
            downloadUrl: `/api/attachments/${attachment.id}/download`,
          })),
        })),
        incomingFollows: shift.incomingTransfers.map((transfer) => ({
          transferId: transfer.id,
          status: transfer.status,
          entry: {
            ...transfer.sourceEntry,
            attachments: transfer.sourceEntry.attachments.map((attachment) => ({
              id: attachment.id,
              originalName: attachment.originalName,
              mimeType: attachment.mimeType,
              byteSize: Number(attachment.byteSize),
              disposition: attachment.disposition,
              downloadUrl: `/api/attachments/${attachment.id}/download`,
            })),
          },
        })),
      })),
    };
  }
}
