import { Controller, Get, Inject, Query } from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../generated/prisma/enums";
import { AuditService } from "./audit.service";

@Roles(UserRole.ADMIN)
@Controller("audit")
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  list(
    @Query("user") actorUserId?: string,
    @Query("action") action?: string,
    @Query("area") area?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("take") take?: string,
  ) {
    return this.audit.list({
      ...(actorUserId ? { actorUserId } : {}), ...(action ? { action } : {}), ...(area ? { area } : {}),
      ...(from ? { from } : {}), ...(to ? { to } : {}), ...(take ? { take } : {}),
    });
  }
}
