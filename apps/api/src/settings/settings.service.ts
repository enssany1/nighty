import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { AuditService, type AuditMetadata } from "../audit/audit.service";
import type { GeneralSettingsRequestDto, RetentionSettingsRequestDto, SecuritySettingsRequestDto } from "../common/dto/contracts";

export const SETTING_DEFAULTS = {
  applicationName: "Nighty",
  subtitle: "Shift Operations Handover",
  timezone: "Asia/Muscat",
  dateFormat: "DD MMM YYYY",
  timeFormat: "24-hour" as "12-hour" | "24-hour",
  defaultLanding: "current-operational-day" as const,
  sessionIdleMinutes: 30 as const,
  passwordMinLength: 12,
  retentionDays: 365,
};

const KEY_BY_NAME = {
  applicationName: "productName",
  subtitle: "subtitle",
  timezone: "timezone",
  dateFormat: "dateFormat",
  timeFormat: "timeFormat",
  defaultLanding: "defaultLanding",
  sessionIdleMinutes: "sessionIdleMinutes",
  passwordMinLength: "passwordMinLength",
  retentionDays: "retentionDays",
} as const;

export type SettingName = keyof typeof SETTING_DEFAULTS;

export function parseSetting(name: SettingName, value: unknown) {
  switch (name) {
    case "sessionIdleMinutes":
      if (value !== 30) throw new Error("Invalid persisted sessionIdleMinutes");
      return value;
    case "retentionDays":
      if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 3650) throw new Error("Invalid persisted retentionDays");
      return value as number;
    case "passwordMinLength":
      if (!Number.isInteger(value) || (value as number) < 8 || (value as number) > 128) throw new Error("Invalid persisted passwordMinLength");
      return value as number;
    case "timeFormat":
      if (value !== "12-hour" && value !== "24-hour") throw new Error("Invalid persisted timeFormat");
      return value;
    case "defaultLanding":
      if (value !== "current-operational-day") throw new Error("Invalid persisted defaultLanding");
      return value;
    default:
      if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid persisted ${name}`);
      return value;
  }
}

type SettingsOwner = Pick<Prisma.TransactionClient, "appSetting">;

@Injectable()
export class SettingsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async values(owner: SettingsOwner = this.prisma) {
    const rows = await owner.appSetting.findMany({ where: { key: { in: Object.values(KEY_BY_NAME) } } });
    const byKey = new Map(rows.map((row) => [row.key, row.value]));
    const values = { ...SETTING_DEFAULTS };
    for (const name of Object.keys(KEY_BY_NAME) as SettingName[]) {
      const raw = byKey.get(KEY_BY_NAME[name]);
      if (raw !== undefined) (values as Record<string, unknown>)[name] = parseSetting(name, raw);
    }
    return values;
  }

  async getAll() {
    const values = await this.values();
    return {
      general: {
        applicationName: values.applicationName, subtitle: values.subtitle, timezone: values.timezone,
        dateFormat: values.dateFormat, timeFormat: values.timeFormat, defaultLanding: values.defaultLanding,
      },
      security: { sessionIdleMinutes: values.sessionIdleMinutes, passwordMinLength: values.passwordMinLength },
      retention: { retentionDays: values.retentionDays, attachmentRetention: "follows-parent" },
    };
  }

  updateGeneral(actorUserId: string, input: GeneralSettingsRequestDto, metadata: AuditMetadata) {
    return this.updateSection(actorUserId, "GENERAL", input, metadata);
  }

  updateSecurity(actorUserId: string, input: SecuritySettingsRequestDto, metadata: AuditMetadata) {
    return this.updateSection(actorUserId, "SECURITY", input, metadata);
  }

  updateRetention(actorUserId: string, input: RetentionSettingsRequestDto, metadata: AuditMetadata) {
    return this.updateSection(actorUserId, "RETENTION", input, metadata);
  }

  private async updateSection(actorUserId: string, section: "GENERAL" | "SECURITY" | "RETENTION", input: object, metadata: AuditMetadata) {
    return this.prisma.$transaction(async (tx) => {
      const beforeAll = await this.values(tx);
      for (const [name, value] of Object.entries(input) as Array<[SettingName, unknown]>) {
        const parsed = parseSetting(name, value);
        await tx.appSetting.upsert({
          where: { key: KEY_BY_NAME[name] },
          create: { key: KEY_BY_NAME[name], value: parsed as Prisma.InputJsonValue, updatedByUserId: actorUserId },
          update: { value: parsed as Prisma.InputJsonValue, updatedByUserId: actorUserId },
        });
      }
      const afterAll = await this.values(tx);
      const names = Object.keys(input) as SettingName[];
      const before = Object.fromEntries(names.map((name) => [name, beforeAll[name]]));
      const after = Object.fromEntries(names.map((name) => [name, afterAll[name]]));
      await this.audit.write(tx, {
        actorUserId, action: `SETTING_${section}_UPDATED`, entityType: "AppSetting", entityId: section.toLowerCase(),
        before: before as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue, metadata,
      });
      return this.getSection(section, afterAll);
    });
  }

  private getSection(section: "GENERAL" | "SECURITY" | "RETENTION", values: typeof SETTING_DEFAULTS) {
    if (section === "GENERAL") return {
      applicationName: values.applicationName, subtitle: values.subtitle, timezone: values.timezone,
      dateFormat: values.dateFormat, timeFormat: values.timeFormat, defaultLanding: values.defaultLanding,
    };
    if (section === "SECURITY") return { sessionIdleMinutes: values.sessionIdleMinutes, passwordMinLength: values.passwordMinLength };
    return { retentionDays: values.retentionDays, attachmentRetention: "follows-parent" };
  }
}
