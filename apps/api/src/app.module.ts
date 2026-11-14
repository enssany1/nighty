import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { UsersModule } from "./users/users.module";
import { ShiftsModule } from "./shifts/shifts.module";
import { EntriesModule } from "./entries/entries.module";

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule, ShiftsModule, EntriesModule],
  controllers: [HealthController]
})
export class AppModule {}
