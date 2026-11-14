import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { SettingsModule } from "../settings/settings.module";
import { RetentionController } from "./retention.controller";
import { defaultRetentionFileDelete, RETENTION_FILE_DELETE, RetentionService } from "./retention.service";

@Module({
  imports: [AuditModule, SettingsModule],
  controllers: [RetentionController],
  providers: [RetentionService, { provide: RETENTION_FILE_DELETE, useValue: defaultRetentionFileDelete }],
})
export class RetentionModule {}
