import { Controller, Get, Param } from "@nestjs/common";
import { ProjectsService } from "./projects.service";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.svc.findOne(id);
  }
}