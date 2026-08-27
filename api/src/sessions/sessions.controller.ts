import { Controller, Get, Param, Query } from "@nestjs/common";
import { SessionsService } from "./sessions.service";
import { SessionListFilters } from "../opencode/opencode.types";

@Controller("sessions")
export class SessionsController {
  constructor(private readonly svc: SessionsService) {}

  @Get()
  async index(@Query() q: Record<string, string>) {
    const filters: SessionListFilters = {
      project: q.project,
      model: q.model,
      from: q.from,
      to: q.to,
      annotated: q.annotated as SessionListFilters["annotated"],
      page: q.page ? Number(q.page) : undefined,
      pageSize: q.pageSize ? Number(q.pageSize) : undefined,
    };
    const page = this.svc.list(filters);
    const map = await this.svc.annotatedMap(page.items.map((i) => i.id));
    return {
      ...page,
      items: page.items.map((i) => ({
        ...i,
        annotated: map[i.id] != null,
        featureId: map[i.id] ?? null,
      })),
    };
  }

  @Get("meta")
  meta() {
    return this.svc.meta();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.svc.findOne(id);
  }
}