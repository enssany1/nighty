import { createHash, randomBytes } from "node:crypto";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { UserRole } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function safeDisplayName(value: string): string {
  const name = path.posix.basename(value.replaceAll("\\", "/")).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (name || "attachment").slice(0, 255);
}

function starts(buffer: Buffer, signature: number[]): boolean {
  return signature.every((byte, index) => buffer[index] === byte);
}

export function sniffMime(buffer: Buffer): string {
  if (starts(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";
  const header = buffer.subarray(0, 12).toString("ascii");
  if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) return "image/gif";
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") return "image/webp";
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    if (!buffer.includes(0)) return "text/plain";
  } catch { /* binary */ }
  throw new BadRequestException("Unsupported attachment content");
}

function rootPath(): string {
  return path.resolve(process.env.ATTACHMENTS_PATH?.trim() || path.join(process.cwd(), "data", "attachments"));
}

function publicAttachment(attachment: { id: string; originalName: string; mimeType: string; byteSize: bigint; disposition: string }) {
  return {
    id: attachment.id,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    byteSize: Number(attachment.byteSize),
    disposition: attachment.disposition,
    downloadUrl: `/api/attachments/${attachment.id}/download`,
  };
}

@Injectable()
export class AttachmentsService {
  private readonly root = rootPath();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async upload(input: {
    file: Express.Multer.File;
    parentType: string;
    parentId: string;
    disposition: string;
    userId: string;
    role: UserRole;
  }) {
    if (!input.file.buffer.length) throw new BadRequestException("Attachment is empty");
    if (input.file.buffer.length > MAX_ATTACHMENT_BYTES) throw new BadRequestException("Attachment is too large");
    if (input.parentType !== "entry" && input.parentType !== "tagPost") throw new BadRequestException("Invalid attachment parent");
    if (input.disposition !== "INLINE" && input.disposition !== "ATTACHMENT") throw new BadRequestException("Invalid attachment disposition");
    const mimeType = sniffMime(input.file.buffer);
    const declared = input.file.mimetype.toLowerCase().split(";", 1)[0];
    if (declared !== mimeType) throw new BadRequestException("Declared MIME type does not match file content");
    if (input.disposition === "INLINE" && !mimeType.startsWith("image/")) throw new BadRequestException("Only images can be displayed inline");
    await this.assertParentAccess(input.parentType, input.parentId, input.userId, input.role);

    await mkdir(this.root, { recursive: true });
    const storageKey = randomBytes(32).toString("hex");
    const temporaryPath = path.join(this.root, `${storageKey}.tmp`);
    const finalPath = path.join(this.root, storageKey);
    await writeFile(temporaryPath, input.file.buffer, { flag: "wx" });
    let attachment;
    try {
      attachment = await this.prisma.attachment.create({
        data: {
          storageKey,
          originalName: safeDisplayName(input.file.originalname),
          mimeType,
          byteSize: BigInt(input.file.buffer.length),
          sha256: createHash("sha256").update(input.file.buffer).digest("hex"),
          disposition: input.disposition,
          uploadedById: input.userId,
          ...(input.parentType === "entry" ? { entryId: input.parentId } : { tagPostId: input.parentId }),
        },
      });
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
    await rename(temporaryPath, finalPath);
    await this.prisma.auditEvent.create({ data: { actorUserId: input.userId, action: "ATTACHMENT_UPLOADED", entityType: "Attachment", entityId: attachment.id, after: { mimeType, byteSize: input.file.buffer.length, disposition: input.disposition } } });
    return publicAttachment(attachment);
  }

  private async assertParentAccess(parentType: string, parentId: string, userId: string, role: UserRole): Promise<void> {
    if (parentType === "tagPost") {
      const post = await this.prisma.tagPost.findUnique({ where: { id: parentId } });
      if (!post) throw new NotFoundException("Tag post not found");
      if (role !== "ADMIN" && post.authorId !== userId) throw new ForbiddenException("Cannot attach to this Tag post");
      return;
    }
    const entry = await this.prisma.entry.findUnique({
      where: { id: parentId }, include: { shiftInstance: { include: { assignmentSnapshots: true } } },
    });
    if (!entry) throw new NotFoundException("Entry not found");
    const assigned = entry.shiftInstance.assignmentSnapshots.some((assignment) => assignment.userId === userId);
    if (entry.shiftInstance.status !== "ACTIVE" || (role !== "ADMIN" && !assigned)) throw new ForbiddenException("Cannot attach to this entry");
  }

  async download(id: string) {
    const attachment = await this.prisma.attachment.findUnique({ where: { id } });
    if (!attachment) throw new NotFoundException("Attachment not found");
    const finalPath = path.join(this.root, attachment.storageKey);
    try {
      await access(finalPath);
    } catch {
      await rename(path.join(this.root, `${attachment.storageKey}.tmp`), finalPath).catch(() => undefined);
    }
    const data = await readFile(finalPath).catch(() => { throw new NotFoundException("Attachment content is unavailable"); });
    if (createHash("sha256").update(data).digest("hex") !== attachment.sha256) throw new NotFoundException("Attachment content is unavailable");
    return { attachment, data };
  }
}
