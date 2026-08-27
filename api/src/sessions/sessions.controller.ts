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
    let items = page.items.map((i) => ({
      ...i,
      annotated: map[i.id] != null,
      featureId: map[i.id] ?? null,
    }));
    if (q.annotated === "yes") {
      items = items.filter((i) => i.annotated);
    } else if (q.annotated === "no") {
      items = items.filter((i) => !i.annotated);
    }
    return { ...page, total: items.length, items };
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