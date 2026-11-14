import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { attachmentPath } from "../common/storage/local-storage";
import { SettingsService } from "../settings/settings.service";
import { AuditService, type AuditMetadata } from "../audit/audit.service";

export const RETENTION_FILE_DELETE = Symbol("RETENTION_FILE_DELETE");
type DeleteFile = (path: string) => Promise<void>;

export function retentionCutoff(now: Date, retentionDays: number): Date {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return cutoff;
}

function failureText(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown cleanup failure";
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

@Injectable()
export class RetentionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(RETENTION_FILE_DELETE) private readonly deleteFile: DeleteFile,
  ) {}

  private async policy() {
    const settings = await this.settings.getAll();
    return { retentionDays: settings.retention.retentionDays, cutoff: retentionCutoff(new Date(), settings.retention.retentionDays) };
  }

  async preview() {
    const policy = await this.policy();
    const eligibleOperationalDays = await this.prisma.operationalDay.count({ where: { operationalDate: { lt: policy.cutoff } } });
    const eligibleEntries = await this.prisma.entry.count({ where: { shiftInstance: { operationalDay: { operationalDate: { lt: policy.cutoff } } } } });
    const eligibleAttachments = await this.prisma.attachment.count({ where: { entry: { shiftInstance: { operationalDay: { operationalDate: { lt: policy.cutoff } } } } } });
    return { ...policy, cutoff: policy.cutoff.toISOString().slice(0, 10), eligibleOperationalDays, eligibleEntries, eligibleAttachments, permanentDeletion: true };
  }

  async run(actorUserId: string, metadata: AuditMetadata) {
    const policy = await this.policy();
    const candidates = await this.prisma.operationalDay.findMany({
      where: { operationalDate: { lt: policy.cutoff } }, orderBy: { operationalDate: "asc" }, take: 100,
    });
    const result = { eligible: candidates.length, deleted: 0, failed: 0, failures: [] as Array<{ operationalDayId: string; reason: string }> };
    for (const day of candidates) {
      const outcome = await this.processDay(day.id);
      if (outcome.ok) result.deleted += 1;
      else {
        result.failed += 1;
        result.failures.push({ operationalDayId: day.id, reason: outcome.reason });
      }
    }
    await this.audit.write(this.prisma, {
      actorUserId, action: "RETENTION_RUN", entityType: "Retention", entityId: randomUUID(),
      after: { cutoff: policy.cutoff.toISOString(), ...result } as Prisma.InputJsonValue, metadata,
    });
    return result;
  }

  private async processDay(operationalDayId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      await this.prisma.operationalDay.update({
        where: { id: operationalDayId },
        data: { retentionState: "MARKED", retentionMarkedAt: new Date(), retentionError: null },
      });
      const attachments = await this.prisma.attachment.findMany({
        where: { entry: { shiftInstance: { operationalDayId } } }, select: { storageKey: true },
      });
      for (const attachment of attachments) {
        for (const temporary of [false, true]) {
          try { await this.deleteFile(attachmentPath(attachment.storageKey, temporary)); }
          catch (error) { if (!isMissing(error)) throw error; }
        }
      }
      await this.prisma.operationalDay.delete({ where: { id: operationalDayId } });
      return { ok: true };
    } catch (error) {
      const reason = failureText(error);
      await this.prisma.operationalDay.update({
        where: { id: operationalDayId }, data: { retentionState: "FAILED", retentionError: reason },
      }).catch(() => undefined);
      return { ok: false, reason };
    }
  }
}

export const defaultRetentionFileDelete: DeleteFile = (target) => unlink(target);
