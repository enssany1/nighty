import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { ChangePasswordRequestDto, LoginRequestDto, SessionResponseDto, UserRoleDto } from "../common/dto/contracts";
import { Public } from "../common/decorators/public.decorator";
import { AuthService, SESSION_IDLE_MILLISECONDS } from "./auth.service";

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_IDLE_MILLISECONDS,
  };
}

@ApiTags("authentication")
@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  async login(@Body() body: LoginRequestDto, @Res({ passthrough: true }) response: Response): Promise<SessionResponseDto> {
    const result = await this.auth.login(body.username, body.password);
    response.cookie("nighty_session", result.sessionToken, cookieOptions());
    return {
      userId: result.user.id,
      displayName: result.user.displayName,
      role: UserRoleDto[result.user.role],
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  @ApiCookieAuth("nighty_session")
  @Get("me")
  async me(@Req() request: Request): Promise<SessionResponseDto> {
    const session = request.auth!;
    return {
      userId: session.user.id,
      displayName: session.user.displayName,
      role: UserRoleDto[session.user.role],
      csrfToken: await this.auth.rotateCsrf(session.sessionId),
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  @ApiCookieAuth("nighty_session")
  @HttpCode(204)
  @Post("logout")
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.auth.logout(request.auth!.sessionId);
    response.clearCookie("nighty_session", { ...cookieOptions(), maxAge: undefined });
  }

  @ApiCookieAuth("nighty_session")
  @HttpCode(204)
  @Post("change-password")
  async changePassword(@Req() request: Request, @Body() body: ChangePasswordRequestDto, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.auth.changePassword(request.auth!.user.id, body.currentPassword, body.newPassword);
    response.clearCookie("nighty_session", { ...cookieOptions(), maxAge: undefined });
  }
}
