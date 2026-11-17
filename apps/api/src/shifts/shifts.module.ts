import { Module } from "@nestjs/common";
import { DayRolloverService } from "../operations/day-rollover.service";
import { OperationalDayService } from "../operations/operational-day.service";
import { OperationalDaysController, ShiftsController } from "./shifts.controller";
import { ShiftsService } from "./shifts.service";

@Module({
  controllers: [ShiftsController, OperationalDaysController],
  providers: [ShiftsService, OperationalDayService, DayRolloverService],
  exports: [ShiftsService, OperationalDayService, DayRolloverService],
})
export class ShiftsModule {}
