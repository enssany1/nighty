import { Body, Controller, Get, Inject, Patch, Req } from "@nestjs/common";
import type { Request } from "express";
import { GeneralSettingsRequestDto, RetentionSettingsRequestDto, SecuritySettingsRequestDto } from "../common/dto/contracts";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../generated/prisma/enums";
import type { AuditMetadata } from "../audit/audit.service";
import { SettingsService } from "./settings.service";

function metadata(request: Request): AuditMetadata {
  const requestId = request.header("x-request-id")?.slice(0, 128);
  const userAgent = request.header("user-agent")?.slice(0, 500);
  return {
    ...(requestId ? { requestId } : {}),
    ...(request.auth?.sessionId ? { sessionId: request.auth.sessionId } : {}),
    ...(request.ip ? { ipAddress: request.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}

@Roles(UserRole.ADMIN)
@Controller("settings")
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  @Get()
  getAll() { return this.settings.getAll(); }

  @Patch("general")
  updateGeneral(@Req() request: Request, @Body() body: GeneralSettingsRequestDto) {
    return this.settings.updateGeneral(request.auth!.user.id, body, metadata(request));
  }

  @Patch("security")
  updateSecurity(@Req() request: Request, @Body() body: SecuritySettingsRequestDto) {
    return this.settings.updateSecurity(request.auth!.user.id, body, metadata(request));
  }

  @Patch("retention")
  updateRetention(@Req() request: Request, @Body() body: RetentionSettingsRequestDto) {
    return this.settings.updateRetention(request.auth!.user.id, body, metadata(request));
  }
}
