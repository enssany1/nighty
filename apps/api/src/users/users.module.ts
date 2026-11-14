import { Module } from "@nestjs/common";
import { ProfileController, TeamController, UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  controllers: [UsersController, ProfileController, TeamController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
