import { Module } from "@nestjs/common";
import { OperationalDayService } from "../operations/operational-day.service";
import { OperationalDaysController, ShiftsController } from "./shifts.controller";
import { ShiftsService } from "./shifts.service";

@Module({
  controllers: [ShiftsController, OperationalDaysController],
  providers: [ShiftsService, OperationalDayService],
  exports: [ShiftsService, OperationalDayService],
})
export class ShiftsModule {}
