import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CreateUserRequestDto, UpdateProfileRequestDto, UpdateUserRequestDto } from "../common/dto/contracts";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../generated/prisma/enums";
import { UsersService } from "./users.service";

@ApiTags("users")
@ApiCookieAuth("nighty_session")
@Roles(UserRole.ADMIN)
@Controller("users")
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  list() { return this.users.list(); }

  @Post()
  create(@Req() request: Request, @Body() body: CreateUserRequestDto) {
    return this.users.createUser(request.auth!.user.id, body);
  }

  @Patch(":id")
  update(@Req() request: Request, @Param("id") id: string, @Body() body: UpdateUserRequestDto) {
    return this.users.updateUser(request.auth!.user.id, id, body);
  }

  @Post(":id/reset-password")
  resetPassword(@Req() request: Request, @Param("id") id: string) {
    return this.users.resetPassword(request.auth!.user.id, id);
  }
}

@ApiTags("profile")
@ApiCookieAuth("nighty_session")
@Controller("profile")
export class ProfileController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  get(@Req() request: Request) { return this.users.getProfile(request.auth!.user.id); }

  @Patch()
  update(@Req() request: Request, @Body() body: UpdateProfileRequestDto) {
    return this.users.updateProfile(request.auth!.user.id, body.displayName);
  }
}
