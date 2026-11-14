import { Module } from "@nestjs/common";
import { CanvasService } from "../operations/canvas.service";
import { EntriesController } from "./entries.controller";
import { EntriesService } from "./entries.service";

@Module({
  controllers: [EntriesController],
  providers: [EntriesService, CanvasService],
  exports: [EntriesService, CanvasService],
})
export class EntriesModule {}
