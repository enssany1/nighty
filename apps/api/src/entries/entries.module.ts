import { Module } from "@nestjs/common";
import { CanvasService } from "../operations/canvas.service";
import { EntriesController } from "./entries.controller";
import { EntriesService } from "./entries.service";
import { HandoverController } from "../operations/handover.controller";
import { HandoverService } from "../operations/handover.service";

@Module({
  controllers: [EntriesController, HandoverController],
  providers: [EntriesService, CanvasService, HandoverService],
  exports: [EntriesService, CanvasService, HandoverService],
})
export class EntriesModule {}
