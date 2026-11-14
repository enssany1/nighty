import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import type { SaveShiftDefinitionRequestDto } from "../common/dto/contracts";
import { validateCoverage } from "./shift-coverage";

type ShiftShape = { id: string; name: string; startMinute: number; endMinute: number; position: number; active: boolean };

function validateSchedule(shifts: ShiftShape[]): void {
  const active = shifts.filter((shift) => shift.active);
  const names = new Set<string>();
  for (const shift of active) {
    const name = shift.name.trim().toLowerCase();
    if (!name) throw new BadRequestException("Active shift names cannot be empty");
    if (names.has(name)) throw new BadRequestException("Active shift names must be unique");
    names.add(name);
    if (shift.startMinute === shift.endMinute) throw new BadRequestException("Active shifts must have a non-zero duration");
  }
  const coverage = validateCoverage(active);
  if (!coverage.valid) throw new BadRequestException({ message: "Active shifts must cover all 24 hours", uncovered: coverage.uncovered });
}

@Injectable()
export class ShiftsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list() { return this.prisma.shiftDefinition.findMany({ orderBy: { position: "asc" } }); }

  async create(actorUserId: string, input: SaveShiftDefinitionRequestDto) {
    return this.prisma.$transaction(async (tx) => {
      const shifts = await tx.shiftDefinition.findMany({ orderBy: { position: "asc" } });
      const candidate: ShiftShape = {
        id: "candidate", name: input.name.trim(), startMinute: input.startMinute,
        endMinute: input.endMinute, active: input.active, position: shifts.length + 1,
      };
      validateSchedule([...shifts, candidate]);
      const created = await tx.shiftDefinition.create({ data: { ...input, name: input.name.trim(), position: candidate.position } });
      await tx.auditEvent.create({ data: { actorUserId, action: "SHIFT_CREATED", entityType: "ShiftDefinition", entityId: created.id, after: created } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async update(actorUserId: string, id: string, input: SaveShiftDefinitionRequestDto) {
    return this.prisma.$transaction(async (tx) => {
      const shifts = await tx.shiftDefinition.findMany({ orderBy: { position: "asc" } });
      const current = shifts.find((shift) => shift.id === id);
      if (!current) throw new NotFoundException("Shift not found");
      const candidate = { ...current, ...input, name: input.name.trim() };
      validateSchedule(shifts.map((shift) => shift.id === id ? candidate : shift));
      const updated = await tx.shiftDefinition.update({ where: { id }, data: { ...input, name: input.name.trim() } });
      await tx.auditEvent.create({ data: { actorUserId, action: "SHIFT_UPDATED", entityType: "ShiftDefinition", entityId: id, before: current, after: updated } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async reorder(actorUserId: string, shiftIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const shifts = await tx.shiftDefinition.findMany({ orderBy: { position: "asc" } });
      if (shiftIds.length !== shifts.length || new Set(shiftIds).size !== shifts.length || shifts.some((shift) => !shiftIds.includes(shift.id))) {
        throw new BadRequestException("Reorder must contain every shift exactly once");
      }
      for (const [index, id] of shiftIds.entries()) {
        await tx.shiftDefinition.update({ where: { id }, data: { position: 10_000 + index } });
      }
      for (const [index, id] of shiftIds.entries()) {
        await tx.shiftDefinition.update({ where: { id }, data: { position: index + 1 } });
      }
      await tx.auditEvent.create({ data: { actorUserId, action: "SHIFTS_REORDERED", entityType: "ShiftDefinition", entityId: "schedule", after: { shiftIds } } });
      return tx.shiftDefinition.findMany({ orderBy: { position: "asc" } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
