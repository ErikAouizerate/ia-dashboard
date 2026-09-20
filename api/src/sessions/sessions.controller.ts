import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
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

  @Get("compare")
  async compare(@Query("a") a: string, @Query("b") b: string) {
    const result = await this.svc.compare(a, b);
    if (!result) throw new NotFoundException("session not found");
    return result;
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.svc.findOne(id);
  }
}