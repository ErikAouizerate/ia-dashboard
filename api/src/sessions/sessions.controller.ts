import { Controller, Get, Param, Query } from "@nestjs/common";
import { SessionsService } from "./sessions.service";
import { SessionListFilters } from "../opencode/opencode.types";

@Controller("sessions")
export class SessionsController {
  constructor(private readonly svc: SessionsService) {}

  @Get()
  async index(@Query() q: Record<string, string>) {
    const filters: SessionListFilters & { projectId?: string } = {
      project: q.project,
      projectId: q.projectId,
      directory: q.directory,
      model: q.model,
      from: q.from,
      to: q.to,
      annotated: q.annotated as SessionListFilters["annotated"],
      analysed: q.analysed,
      parentOnly: q.parentOnly === "true",
      page: q.page ? Number(q.page) : undefined,
      pageSize: q.pageSize ? Number(q.pageSize) : undefined,
    };
    return this.svc.list(filters);
  }

  @Get("meta")
  meta() {
    return this.svc.meta();
  }

  @Get(":id/analysis")
  analysis(@Param("id") id: string) {
    return this.svc.analysisFor(id);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.svc.findOne(id);
  }
}