import { Module } from "@nestjs/common";
import { AnalysisController } from "./analysis.controller";
import { AnalysisService } from "./analysis.service";
import { AnalysisWorker } from "./analysis.worker";

@Module({
  controllers: [AnalysisController],
  providers: [AnalysisService, AnalysisWorker],
  exports: [AnalysisService],
})
export class AnalysisModule {}