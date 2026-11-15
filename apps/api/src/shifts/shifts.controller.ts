import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ReorderShiftsRequestDto, SaveShiftDefinitionRequestDto } from "../common/dto/contracts";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../generated/prisma/enums";
import { OperationalDayService } from "../operations/operational-day.service";
import { ShiftsService } from "./shifts.service";

@ApiTags("shifts")
@ApiCookieAuth("nighty_session")
@Controller("shifts")
export class ShiftsController {
  constructor(@Inject(ShiftsService) private readonly shifts: ShiftsService) {}

  @Get()
  list() { return this.shifts.list(); }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Req() request: Request, @Body() body: SaveShiftDefinitionRequestDto) {
    return this.shifts.create(request.auth!.user.id, body);
  }

  @Roles(UserRole.ADMIN)
  @Patch(":id")
  update(@Req() request: Request, @Param("id") id: string, @Body() body: SaveShiftDefinitionRequestDto) {
    return this.shifts.update(request.auth!.user.id, id, body);
  }

  @Roles(UserRole.ADMIN)
  @Post("reorder")
  reorder(@Req() request: Request, @Body() body: ReorderShiftsRequestDto) {
    return this.shifts.reorder(request.auth!.user.id, body.shiftIds);
  }

  @Roles(UserRole.ADMIN)
  @Delete(":id")
  delete(@Req() request: Request, @Param("id") id: string) {
    return this.shifts.delete(request.auth!.user.id, id);
  }
}

@ApiTags("operations")
@ApiCookieAuth("nighty_session")
@Controller("operational-days")
export class OperationalDaysController {
  constructor(@Inject(OperationalDayService) private readonly days: OperationalDayService) {}

  @Get("current")
  current() { return this.days.current(); }

  @Roles(UserRole.ADMIN)
  @Post(":date/materialize")
  materialize(@Param("date") date: string) { return this.days.materialize(date); }
}
