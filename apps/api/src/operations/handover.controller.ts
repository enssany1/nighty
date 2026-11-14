import { Body, Controller, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { UpdateFollowStatusRequestDto } from "../common/dto/contracts";
import { HandoverService } from "./handover.service";

@ApiTags("handover")
@ApiCookieAuth("nighty_session")
@Controller()
export class HandoverController {
  constructor(@Inject(HandoverService) private readonly handovers: HandoverService) {}

  @Post("shift-instances/:id/handover")
  handover(@Req() request: Request, @Param("id") id: string) {
    return this.handovers.handover(id, request.auth!.user.id, request.auth!.user.role);
  }

  @Patch("follows/:id/status")
  updateFollow(@Req() request: Request, @Param("id") id: string, @Body() body: UpdateFollowStatusRequestDto) {
    return this.handovers.updateFollowStatus(id, request.auth!.user.id, request.auth!.user.role, body.status);
  }
}
