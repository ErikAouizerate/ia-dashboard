import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { AnalysisService } from "./analysis.service";

@Controller()
export class AnalysisController {
  constructor(private readonly svc: AnalysisService) {}

  @Post("analysis/run")
  run(@Body() body: { sessionId: string }) {
    return this.svc.analyzeSession(body.sessionId);
  }

  @Post("analysis/run-project")
  runProject(@Body() body: { projectId: string }) {
    return this.svc.clusterProject(body.projectId);
  }

  @Get("analysis/proposals")
  listProposals(@Query("projectId") projectId?: string) {
    return this.svc.listProposals(projectId);
  }

  @Post("proposals/:id/accept")
  accept(@Param("id") id: string, @Body() body: { name?: string; purpose?: string }) {
    return this.svc.acceptProposal(id, body);
  }

  @Post("proposals/:id/dismiss")
  dismiss(@Param("id") id: string) {
    return this.svc.dismissProposal(id);
  }
}