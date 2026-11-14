import { Controller, Get, Inject } from "@nestjs/common";
import { Public } from "../common/decorators/public.decorator";
import { PrismaService } from "../database/prisma.service";

@Public()
@Controller("health")
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  getHealth(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("live")
  live(): { status: "ok" } { return { status: "ok" }; }

  @Get("ready")
  async ready(): Promise<{ status: "ready" }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ready" };
  }
}
