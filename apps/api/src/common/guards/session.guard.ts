import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AuthService } from "../../auth/auth.service";
import { PUBLIC_ROUTE } from "../decorators/public.decorator";

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) {
      try { return decodeURIComponent(valueParts.join("=")); } catch { return undefined; }
    }
  }
  return undefined;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector, @Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const token = readCookie(request.headers.cookie, "nighty_session");
    if (!token) throw new UnauthorizedException("Authentication required");
    request.auth = await this.auth.authenticate(token);
    return true;
  }
}
