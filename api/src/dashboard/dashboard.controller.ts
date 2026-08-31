import { Controller, Get, Query } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get("summary")
  summary(@Query("periodDays") periodDays?: string) {
    const raw = Number(periodDays);
    const days = Number.isFinite(raw) ? Math.max(0, raw) : 7;
    return this.svc.summary(days);
  }
}