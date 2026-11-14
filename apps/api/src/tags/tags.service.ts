import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { extractPlainText, validateEditorDocument } from "../common/editor-document";

export function normalizeTagName(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "-");
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(normalized)) throw new BadRequestException("Tag names use letters, numbers, and hyphens");
  return normalized;
}

@Injectable()
export class TagsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.tag.findMany({
      orderBy: { position: "asc" },
      include: { _count: { select: { posts: true, entries: true } } },
    });
  }

  async create(actorUserId: string, nameInput: string) {
    const name = normalizeTagName(nameInput);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const last = await tx.tag.aggregate({ _max: { position: true } });
        const tag = await tx.tag.create({ data: { name, position: (last._max.position ?? 0) + 1 } });
        await tx.auditEvent.create({ data: { actorUserId, action: "TAG_CREATED", entityType: "Tag", entityId: tag.id, after: tag } });
        return tag;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Tag name already exists");
      throw error;
    }
  }

  async update(actorUserId: string, id: string, input: { name?: string; archived?: boolean }) {
    const current = await this.prisma.tag.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Tag not found");
    const updated = await this.prisma.tag.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: normalizeTagName(input.name) } : {}),
        ...(input.archived !== undefined ? { status: input.archived ? "ARCHIVED" : "ACTIVE" } : {}),
      },
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Tag name already exists");
      throw error;
    });
    await this.prisma.auditEvent.create({ data: { actorUserId, action: "TAG_UPDATED", entityType: "Tag", entityId: id, before: current, after: updated } });
    return updated;
  }

  async reorder(actorUserId: string, tagIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const tags = await tx.tag.findMany({ orderBy: { position: "asc" } });
      if (tagIds.length !== tags.length || new Set(tagIds).size !== tags.length || tags.some((tag) => !tagIds.includes(tag.id))) {
        throw new BadRequestException("Reorder must contain every Tag exactly once");
      }
      for (const [index, id] of tagIds.entries()) await tx.tag.update({ where: { id }, data: { position: 10_000 + index } });
      for (const [index, id] of tagIds.entries()) await tx.tag.update({ where: { id }, data: { position: index + 1 } });
      await tx.auditEvent.create({ data: { actorUserId, action: "TAGS_REORDERED", entityType: "Tag", entityId: "tags", after: { tagIds } } });
      return tx.tag.findMany({ orderBy: { position: "asc" } });
    });
  }

  async delete(actorUserId: string, id: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id }, include: { _count: { select: { posts: true, entries: true } } } });
    if (!tag) throw new NotFoundException("Tag not found");
    if (tag._count.posts || tag._count.entries) throw new ConflictException("Tag is in use; archive it instead");
    await this.prisma.tag.delete({ where: { id } });
    await this.prisma.auditEvent.create({ data: { actorUserId, action: "TAG_DELETED", entityType: "Tag", entityId: id, before: { name: tag.name } } });
  }

  async posts(tagId: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag) throw new NotFoundException("Tag not found");
    const posts = await this.prisma.tagPost.findMany({
      where: { tagId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { author: { select: { id: true, displayName: true } }, attachments: true },
    });
    return posts.map((post) => ({
      ...post,
      attachments: post.attachments.map((attachment) => ({
        ...attachment,
        byteSize: Number(attachment.byteSize),
        downloadUrl: `/api/attachments/${attachment.id}/download`,
      })),
    }));
  }

  async createPost(tagId: string, authorId: string, documentInput: unknown) {
    const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag) throw new NotFoundException("Tag not found");
    if (tag.status === "ARCHIVED") throw new ConflictException("Archived Tags are read-only");
    const editorDocument = validateEditorDocument(documentInput) as Prisma.InputJsonValue;
    const plainText = extractPlainText(editorDocument);
    const post = await this.prisma.tagPost.create({ data: { tagId, authorId, editorDocument, plainText }, include: { attachments: true } });
    await this.prisma.auditEvent.create({ data: { actorUserId: authorId, action: "TAG_POST_CREATED", entityType: "TagPost", entityId: post.id, after: { tagId, plainText } } });
    return post;
  }
}
