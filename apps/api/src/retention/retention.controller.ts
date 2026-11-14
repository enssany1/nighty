import { Controller, Get, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../generated/prisma/enums";
import type { AuditMetadata } from "../audit/audit.service";
import { RetentionService } from "./retention.service";

function metadata(request: Request): AuditMetadata {
  const requestId = request.header("x-request-id")?.slice(0, 128);
  return {
    ...(requestId ? { requestId } : {}),
    ...(request.auth?.sessionId ? { sessionId: request.auth.sessionId } : {}),
    ...(request.ip ? { ipAddress: request.ip } : {}),
  };
}

@Roles(UserRole.ADMIN)
@Controller("retention")
export class RetentionController {
  constructor(@Inject(RetentionService) private readonly retention: RetentionService) {}

  @Get("preview")
  preview() { return this.retention.preview(); }

  @Post("run")
  run(@Req() request: Request) { return this.retention.run(request.auth!.user.id, metadata(request)); }
}
