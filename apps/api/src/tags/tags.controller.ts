import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CreateTagPostRequestDto, ReorderTagsRequestDto, SaveTagRequestDto, UpdateTagRequestDto } from "../common/dto/contracts";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../generated/prisma/enums";
import { TagsService } from "./tags.service";

@ApiTags("tags")
@ApiCookieAuth("nighty_session")
@Controller("tags")
export class TagsController {
  constructor(@Inject(TagsService) private readonly tags: TagsService) {}

  @Get()
  list() { return this.tags.list(); }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Req() request: Request, @Body() body: SaveTagRequestDto) { return this.tags.create(request.auth!.user.id, body.name); }

  @Roles(UserRole.ADMIN)
  @Patch(":id")
  update(@Req() request: Request, @Param("id") id: string, @Body() body: UpdateTagRequestDto) {
    return this.tags.update(request.auth!.user.id, id, body);
  }

  @Roles(UserRole.ADMIN)
  @Post("reorder")
  reorder(@Req() request: Request, @Body() body: ReorderTagsRequestDto) { return this.tags.reorder(request.auth!.user.id, body.tagIds); }

  @Roles(UserRole.ADMIN)
  @Delete(":id")
  @HttpCode(204)
  delete(@Req() request: Request, @Param("id") id: string) { return this.tags.delete(request.auth!.user.id, id); }

  @Get(":id/posts")
  posts(@Param("id") id: string) { return this.tags.posts(id); }

  @Post(":id/posts")
  createPost(@Req() request: Request, @Param("id") id: string, @Body() body: CreateTagPostRequestDto) {
    return this.tags.createPost(id, request.auth!.user.id, body.editorDocument);
  }
}
