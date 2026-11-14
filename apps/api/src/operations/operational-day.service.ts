import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { validateCoverage } from "../shifts/shift-coverage";

const dayInclude = {
  shiftInstances: {
    include: { assignmentSnapshots: true },
    orderBy: { positionSnapshot: "asc" as const },
  },
} as const;

function response(day: Prisma.OperationalDayGetPayload<{ include: typeof dayInclude }>) {
  return {
    ...day,
    operationalDate: day.operationalDate.toISOString().slice(0, 10),
    shiftInstances: day.shiftInstances.map((shift) => ({
      ...shift,
      assignments: shift.assignmentSnapshots.map((assignment) => assignment.userId),
    })),
  };
}

@Injectable()
export class OperationalDayService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async materialize(dateText: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) throw new BadRequestException("Operational date must use YYYY-MM-DD");
    const operationalDate = new Date(`${dateText}T00:00:00.000Z`);
    if (Number.isNaN(operationalDate.getTime()) || operationalDate.toISOString().slice(0, 10) !== dateText) {
      throw new BadRequestException("Operational date is invalid");
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.operationalDay.findUnique({ where: { operationalDate }, include: dayInclude });
      if (existing) return response(existing);
      const definitions = await tx.shiftDefinition.findMany({
        where: { active: true }, orderBy: { position: "asc" }, include: { assignments: true },
      });
      const coverage = validateCoverage(definitions);
      if (definitions.length === 0 || !coverage.valid) throw new BadRequestException("Active shifts must cover all 24 hours");
      const created = await tx.operationalDay.create({
        data: {
          operationalDate,
          boundaryMinute: definitions[0]!.startMinute,
          shiftInstances: {
            create: definitions.map((definition) => ({
              definitionId: definition.id,
              nameSnapshot: definition.name,
              startMinuteSnapshot: definition.startMinute,
              endMinuteSnapshot: definition.endMinute,
              positionSnapshot: definition.position,
              status: "UPCOMING",
              assignmentSnapshots: { create: definition.assignments.map((assignment) => ({ userId: assignment.userId })) },
            })),
          },
        },
        include: dayInclude,
      });
      return response(created);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
