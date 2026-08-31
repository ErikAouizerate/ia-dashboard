import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { AnalysisService } from "./analysis.service";

@Controller()
export class AnalysisController {
  constructor(private readonly svc: AnalysisService) {}

  @Post("analysis/run")
  run(@Body() body: { sessionId: string }) {
    return this.svc.analyzeSession(body.sessionId);
  }

  @Get("analysis/proposals")
  listProposals(@Query("projectId") projectId?: string) {
    return this.svc.listProposals(projectId);
  }
}