import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CreateEntryRequestDto, ToggleTodoRequestDto } from "../common/dto/contracts";
import { CanvasService } from "../operations/canvas.service";
import { EntriesService } from "./entries.service";

@ApiTags("canvas")
@ApiCookieAuth("nighty_session")
@Controller()
export class EntriesController {
  constructor(
    @Inject(EntriesService) private readonly entries: EntriesService,
    @Inject(CanvasService) private readonly canvas: CanvasService,
  ) {}

  @Get("canvas/:date")
  getCanvas(@Req() request: Request, @Param("date") date: string) {
    return this.canvas.get(date, request.auth!.user.id, request.auth!.user.role);
  }

  @Post("shift-instances/:shiftId/entries")
  create(@Req() request: Request, @Param("shiftId") shiftId: string, @Body() body: CreateEntryRequestDto) {
    return this.entries.create(shiftId, request.auth!.user.id, request.auth!.user.role, body);
  }

  @Patch("entries/:id")
  edit(@Req() request: Request, @Param("id") id: string, @Body() body: CreateEntryRequestDto) {
    return this.entries.edit(id, request.auth!.user.id, request.auth!.user.role, body);
  }

  @Get("entries/:id/history")
  history(@Param("id") id: string) { return this.entries.history(id); }

  @Patch("todo-items/:id")
  toggle(@Req() request: Request, @Param("id") id: string, @Body() body: ToggleTodoRequestDto) {
    return this.entries.toggleTodo(id, request.auth!.user.id, request.auth!.user.role, body.completed);
  }
}
