import { Controller, Get, Query } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get("summary")
  summary(@Query("periodDays") periodDays?: string) {
    const days = periodDays ? Math.max(1, Number(periodDays)) : 7;
    return this.svc.summary(days);
  }
}