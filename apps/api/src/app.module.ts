import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { UsersModule } from "./users/users.module";
import { ShiftsModule } from "./shifts/shifts.module";
import { EntriesModule } from "./entries/entries.module";
import { TagsModule } from "./tags/tags.module";
import { AttachmentsModule } from "./attachments/attachments.module";
import { AuditModule } from "./audit/audit.module";
import { SettingsModule } from "./settings/settings.module";

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule, ShiftsModule, EntriesModule, TagsModule, AttachmentsModule, AuditModule, SettingsModule],
  controllers: [HealthController]
})
export class AppModule {}
