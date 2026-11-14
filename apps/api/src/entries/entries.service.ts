import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type UserRole } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import type { CreateEntryRequestDto, TodoItemDto } from "../common/dto/contracts";
import { extractPlainText, validateEditorDocument } from "../common/editor-document";

export function normalizeTodoItems(items: TodoItemDto[] | undefined) {
  const normalized = (items ?? [])
    .map((item) => ({ text: item.text.trim(), completed: item.completed ?? false }))
    .filter((item) => item.text.length > 0)
    .map((item, index) => ({ ...item, position: index + 1 }));
  if (normalized.length === 0) throw new BadRequestException("A To-do list requires at least one item");
  return normalized;
}

const entryInclude = { todoItems: { orderBy: { position: "asc" as const } }, author: { select: { id: true, displayName: true } } } as const;

async function assertWritable(tx: Prisma.TransactionClient, shiftInstanceId: string, userId: string, role: UserRole) {
  const shift = await tx.shiftInstance.findUnique({ where: { id: shiftInstanceId }, include: { assignmentSnapshots: true } });
  if (!shift) throw new NotFoundException("Shift instance not found");
  const assigned = shift.assignmentSnapshots.some((assignment) => assignment.userId === userId);
  if (shift.status !== "ACTIVE" || (role !== "ADMIN" && !assigned)) {
    throw new ForbiddenException("This shift is read-only");
  }
  return shift;
}

function normalizedPayload(input: CreateEntryRequestDto) {
  const editorDocument = validateEditorDocument(input.editorDocument) as Prisma.InputJsonValue;
  if (input.type === "TODO") {
    const todoItems = normalizeTodoItems(input.todoItems);
    return { editorDocument, plainText: todoItems.map((item) => item.text).join("\n"), todoItems, followStatus: null };
  }
  const plainText = extractPlainText(editorDocument);
  if (!plainText) throw new BadRequestException(`${input.type === "FOLLOW" ? "Follow" : "Update"} text cannot be blank`);
  return { editorDocument, plainText, todoItems: [], followStatus: input.type === "FOLLOW" ? "OPEN" as const : null };
}

@Injectable()
export class EntriesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(shiftInstanceId: string, userId: string, role: UserRole, input: CreateEntryRequestDto) {
    const payload = normalizedPayload(input);
    return this.prisma.$transaction(async (tx) => {
      await assertWritable(tx, shiftInstanceId, userId, role);
      const entry = await tx.entry.create({
        data: {
          shiftInstanceId, authorId: userId, type: input.type, editorDocument: payload.editorDocument,
          plainText: payload.plainText, followStatus: payload.followStatus,
          ...(payload.todoItems.length ? { todoItems: { create: payload.todoItems } } : {}),
          ...(input.tagIds?.length ? { tags: { create: [...new Set(input.tagIds)].map((tagId) => ({ tagId })) } } : {}),
        },
        include: entryInclude,
      });
      await tx.auditEvent.create({ data: { actorUserId: userId, action: "ENTRY_CREATED", entityType: "Entry", entityId: entry.id, after: { type: entry.type, plainText: entry.plainText } } });
      return entry;
    });
  }

  async edit(entryId: string, userId: string, role: UserRole, input: CreateEntryRequestDto) {
    const payload = normalizedPayload(input);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.entry.findUnique({ where: { id: entryId }, include: { todoItems: true } });
      if (!current) throw new NotFoundException("Entry not found");
      await assertWritable(tx, current.shiftInstanceId, userId, role);
      const latest = await tx.entryRevision.aggregate({ where: { entryId }, _max: { revisionNumber: true } });
      await tx.entryRevision.create({ data: {
        entryId, revisionNumber: (latest._max.revisionNumber ?? 0) + 1,
        editorDocument: current.editorDocument as Prisma.InputJsonValue, plainText: current.plainText, editedById: userId,
      } });
      await tx.todoItem.deleteMany({ where: { entryId } });
      const updated = await tx.entry.update({
        where: { id: entryId },
        data: {
          type: input.type, editorDocument: payload.editorDocument, plainText: payload.plainText,
          followStatus: payload.followStatus,
          ...(payload.todoItems.length ? { todoItems: { create: payload.todoItems } } : {}),
        },
        include: entryInclude,
      });
      await tx.auditEvent.create({ data: { actorUserId: userId, action: "ENTRY_EDITED", entityType: "Entry", entityId: entryId, before: { type: current.type, plainText: current.plainText }, after: { type: updated.type, plainText: updated.plainText } } });
      return updated;
    });
  }

  history(entryId: string) {
    return this.prisma.entryRevision.findMany({ where: { entryId }, orderBy: { revisionNumber: "desc" } });
  }

  async toggleTodo(todoItemId: string, userId: string, role: UserRole, completed: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.todoItem.findUnique({ where: { id: todoItemId }, include: { entry: true } });
      if (!item) throw new NotFoundException("To-do item not found");
      await assertWritable(tx, item.entry.shiftInstanceId, userId, role);
      const updated = await tx.todoItem.update({ where: { id: todoItemId }, data: { completed } });
      await tx.auditEvent.create({ data: { actorUserId: userId, action: "TODO_TOGGLED", entityType: "TodoItem", entityId: todoItemId, before: { completed: item.completed }, after: { completed } } });
      return updated;
    });
  }
}
